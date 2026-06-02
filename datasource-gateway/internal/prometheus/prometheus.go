package prometheus

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

// Client is a thin HTTP client for an upstream Prometheus-compatible store.
// It backs the passthrough path; the connection-pooling (keep-alive)
// transport keeps the added gateway hop's overhead negligible versus
// querying the upstream directly.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a client for the given upstream base URL with a keep-alive
// transport.
func New(baseURL string) *Client {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Transport: transport, Timeout: 30 * time.Second},
	}
}

// URL returns the upstream base URL.
func (c *Client) URL() string { return c.baseURL }

// HTTPClient exposes the keep-alive client for the passthrough path (added in
// a later task).
func (c *Client) HTTPClient() *http.Client { return c.http }

// Reachable probes the upstream with a trivial instant query. Used by the
// health endpoint; returns false on any error or non-200 response.
func (c *Client) Reachable(ctx context.Context) bool {
	if c.baseURL == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/query?query=1", nil)
	if err != nil {
		return false
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// Close releases idle connections.
func (c *Client) Close() error {
	c.http.CloseIdleConnections()
	return nil
}
