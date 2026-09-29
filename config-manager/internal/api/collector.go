package api

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/products"
	"github.com/couchbase/config-manager/internal/storage"
)

const (
	// maxConcurrentCollections bounds how many snapshots collect metadata at
	// once, so a burst of registrations against unreachable clusters cannot
	// pile up goroutines and connections.
	maxConcurrentCollections = 8
	// defaultHostTimeout bounds collection from one host, covering both of the
	// calls a Couchbase Server host needs.
	defaultHostTimeout = 10 * time.Second
)

// metadataCollector gathers cluster metadata for new snapshots after create
// has responded. Create only needs the scrape file and the base metadata
// document; services, clusters and the server version arrive a few seconds
// later and are merged into the document.
type metadataCollector struct {
	storage     storage.MetadataStorage
	hostTimeout time.Duration

	sem    chan struct{}
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

func newMetadataCollector(md storage.MetadataStorage) *metadataCollector {
	ctx, cancel := context.WithCancel(context.Background())
	return &metadataCollector{
		storage:     md,
		hostTimeout: defaultHostTimeout,
		sem:         make(chan struct{}, maxConcurrentCollections),
		ctx:         ctx,
		cancel:      cancel,
	}
}

// collect starts background collection for a snapshot whose base document was
// built from base. It returns immediately.
func (c *metadataCollector) collect(base *models.SnapshotMetadata, req *models.SnapshotRequest) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		select {
		case c.sem <- struct{}{}:
			defer func() { <-c.sem }()
		case <-c.ctx.Done():
			return
		}
		c.run(base, req)
	}()
}

// shutdown waits for in-flight collection until ctx ends, then cancels it.
func (c *metadataCollector) shutdown(ctx context.Context) {
	done := make(chan struct{})
	go func() {
		c.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		logger.Warn("Abandoning in-flight metadata collection at shutdown")
	}
	c.cancel()
}

// wait blocks until every started collection has finished.
func (c *metadataCollector) wait() { c.wg.Wait() }

// hostResult is one host's contribution, kept in request order so the merge
// is deterministic.
type hostResult struct {
	metadata *products.Metadata
}

func (c *metadataCollector) run(base *models.SnapshotMetadata, req *models.SnapshotRequest) {
	type job struct {
		product  *products.Product
		config   models.ConfigObject
		hostname string
	}
	var jobs []job
	for _, config := range req.Configs {
		product := products.Get(config.Product)
		if product == nil || product.GetMetadata == nil {
			continue
		}
		for _, hostname := range config.Hostnames {
			jobs = append(jobs, job{product: product, config: config, hostname: hostname})
		}
	}
	if len(jobs) == 0 {
		return
	}

	results := make([]hostResult, len(jobs))
	var wg sync.WaitGroup
	for i, j := range jobs {
		wg.Add(1)
		go func(i int, j job) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(c.ctx, c.hostTimeout)
			defer cancel()
			md, err := j.product.GetMetadata(ctx, j.config.Scheme, j.hostname, j.config.Port,
				req.Credentials.Username, req.Credentials.Password)
			if err != nil {
				metrics.MetadataCollectionFailures.Inc()
				logger.Warn("Failed to collect product metadata", "snapshot", base.SnapshotID,
					"product", j.config.Product, "host", j.hostname, "error", err)
				return
			}
			results[i] = hostResult{metadata: md}
		}(i, j)
	}
	wg.Wait()

	collected := mergeHostMetadata(results)
	if collected == nil {
		return
	}

	err := c.storage.Update(base.SnapshotID, func(doc *models.SnapshotMetadata) error {
		applyCollected(doc, collected)
		return nil
	})
	if errors.Is(err, storage.ErrMetadataNotFound) {
		// The base document write failed during create. Nothing can have
		// recorded a phase against a missing document, so writing it whole now
		// loses nothing and gives the snapshot its metadata after all.
		doc := *base
		applyCollected(&doc, collected)
		err = c.storage.SaveMetadata(&doc)
	}
	if err != nil {
		logger.Warn("Failed to store collected metadata", "snapshot", base.SnapshotID, "error", err)
		return
	}
	logger.Info("Stored collected metadata", "snapshot", base.SnapshotID,
		"clusters", len(collected.clusters), "services", len(collected.services))
}

// collectedMetadata is the merged result across a snapshot's hosts.
type collectedMetadata struct {
	services []string
	clusters []models.Cluster
	server   string
	extras   map[string]interface{}
}

// mergeHostMetadata combines per-host results, or returns nil when no host
// reported anything.
func mergeHostMetadata(results []hostResult) *collectedMetadata {
	out := &collectedMetadata{}
	seenService := map[string]bool{}
	clusterIndex := map[string]int{}
	any := false

	for _, r := range results {
		md := r.metadata
		if md == nil {
			continue
		}
		any = true
		for _, s := range md.Services {
			if !seenService[s] {
				seenService[s] = true
				out.services = append(out.services, s)
			}
		}
		for _, cluster := range md.Clusters {
			key := cluster.UID
			if key == "" {
				key = "name|" + cluster.Name
			}
			if i, ok := clusterIndex[key]; ok {
				existing := &out.clusters[i]
				if existing.Name == "" && cluster.Name != "" {
					existing.Name = cluster.Name
				}
				if len(existing.Targets) == 0 && len(cluster.Targets) > 0 {
					existing.Targets = append([]string(nil), cluster.Targets...)
				}
				continue
			}
			clusterIndex[key] = len(out.clusters)
			out.clusters = append(out.clusters, cluster)
		}
		if out.server == "" {
			out.server = md.Server
		}
		// Free-form per-product blob. Last-write-wins per key; the convention
		// is to namespace keys (e.g. `couchbase_version`, `sgw_version`) so
		// distinct products don't collide.
		for k, v := range md.Extras {
			if out.extras == nil {
				out.extras = map[string]interface{}{}
			}
			out.extras[k] = v
		}
	}
	if !any {
		return nil
	}
	for i := range out.clusters {
		if out.clusters[i].Name == "" {
			out.clusters[i].Name = fmt.Sprintf("cluster%d", i+1)
		}
	}
	return out
}

// applyCollected merges collected metadata into a document that may already
// carry services reported by a PATCH.
func applyCollected(doc *models.SnapshotMetadata, c *collectedMetadata) {
	seen := map[string]bool{}
	for _, s := range doc.Services {
		seen[s] = true
	}
	for _, s := range c.services {
		if !seen[s] {
			seen[s] = true
			doc.Services = append(doc.Services, s)
		}
	}
	if len(doc.Clusters) == 0 {
		doc.Clusters = c.clusters
	}
	if doc.Server == "" {
		doc.Server = c.server
	}
	for k, v := range c.extras {
		if doc.Extras == nil {
			doc.Extras = map[string]interface{}{}
		}
		doc.Extras[k] = v
	}
}
