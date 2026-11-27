package api

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/couchbase/config-manager/internal/logger"
	"github.com/couchbase/config-manager/internal/metrics"
	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/products"
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
// later and are handed to record, which merges them into the document.
type metadataCollector struct {
	record      func(id string, collected *models.SnapshotMetadata)
	hostTimeout time.Duration

	sem    chan struct{}
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

func newMetadataCollector(record func(id string, collected *models.SnapshotMetadata)) *metadataCollector {
	ctx, cancel := context.WithCancel(context.Background())
	return &metadataCollector{
		record:      record,
		hostTimeout: defaultHostTimeout,
		sem:         make(chan struct{}, maxConcurrentCollections),
		ctx:         ctx,
		cancel:      cancel,
	}
}

// collect starts background collection for snapshot id from the hosts in req.
// It returns immediately.
func (c *metadataCollector) collect(id string, req *models.SnapshotRequest) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		select {
		case c.sem <- struct{}{}:
			defer func() { <-c.sem }()
		case <-c.ctx.Done():
			return
		}
		c.run(id, req)
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

func (c *metadataCollector) run(id string, req *models.SnapshotRequest) {
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
				logger.Warn("Failed to collect product metadata", "snapshot", id,
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

	c.record(id, collected)
}

// mergeHostMetadata combines per-host results into the services, clusters,
// server version and extras to merge into the snapshot's document, or returns
// nil when no host reported anything.
func mergeHostMetadata(results []hostResult) *models.SnapshotMetadata {
	out := &models.SnapshotMetadata{}
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
				out.Services = append(out.Services, s)
			}
		}
		for _, cluster := range md.Clusters {
			key := cluster.UID
			if key == "" {
				key = "name|" + cluster.Name
			}
			if i, ok := clusterIndex[key]; ok {
				existing := &out.Clusters[i]
				if existing.Name == "" && cluster.Name != "" {
					existing.Name = cluster.Name
				}
				if len(existing.Targets) == 0 && len(cluster.Targets) > 0 {
					existing.Targets = append([]string(nil), cluster.Targets...)
				}
				continue
			}
			clusterIndex[key] = len(out.Clusters)
			out.Clusters = append(out.Clusters, cluster)
		}
		if out.Server == "" {
			out.Server = md.Server
		}
		// Free-form per-product blob. Last-write-wins per key; the convention
		// is to namespace keys (e.g. `couchbase_version`, `sgw_version`) so
		// distinct products don't collide.
		for k, v := range md.Extras {
			if out.Extras == nil {
				out.Extras = map[string]interface{}{}
			}
			out.Extras[k] = v
		}
	}
	if !any {
		return nil
	}
	for i := range out.Clusters {
		if out.Clusters[i].Name == "" {
			out.Clusters[i].Name = fmt.Sprintf("cluster%d", i+1)
		}
	}
	return out
}
