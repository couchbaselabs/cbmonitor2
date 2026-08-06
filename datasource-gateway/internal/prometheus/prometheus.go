package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
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
	proxy   http.Handler
}

// New builds a client for the given upstream base URL with a keep-alive
// transport and a reverse proxy to the upstream's Prometheus API.
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
	trimmed := strings.TrimRight(baseURL, "/")
	c := &Client{
		baseURL: trimmed,
		http:    &http.Client{Transport: transport, Timeout: 30 * time.Second},
	}
	if u, err := url.Parse(trimmed); err == nil && u.Scheme != "" && u.Host != "" {
		c.proxy = newReverseProxy(u, transport)
	}
	return c
}

// URL returns the upstream base URL with any embedded credentials redacted.
// Embedding basic-auth userinfo is the only way to reach a protected upstream,
// and this value is both logged at startup and echoed by /healthz.
func (c *Client) URL() string { return RedactURL(c.baseURL) }

// RedactURL replaces any userinfo in a URL with "xxxxx", leaving a value that
// is safe to log or serve. A value that doesn't parse is returned unchanged
// unless it looks like it carries userinfo, in which case it is withheld.
func RedactURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		if strings.Contains(raw, "@") {
			return "[unparseable url withheld]"
		}
		return raw
	}
	if u.User == nil {
		return raw
	}
	u.User = url.User("xxxxx")
	return u.String()
}

// HTTPClient exposes the keep-alive client for callers that need to issue
// their own upstream requests.
func (c *Client) HTTPClient() *http.Client { return c.http }

// ReverseProxy returns a streaming reverse-proxy handler to the upstream
// Prometheus API. Requests (e.g. /api/v1/*) are forwarded as-is over the
// keep-alive transport; the api handlers do any snapshot routing and window
// rewriting before delegating here.
func (c *Client) ReverseProxy() http.Handler {
	if c.proxy == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writePromError(w, http.StatusBadGateway, "bad_gateway", "upstream Prometheus URL is not configured")
		})
	}
	return c.proxy
}

// QueryRange issues a /api/v1/query_range against the upstream and returns
// the raw response body and status code. Used by the overlap fan-out, which
// needs the decoded matrices rather than a streamed passthrough. step is
// forwarded verbatim (Prometheus accepts both duration and float forms).
func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step string) ([]byte, int, error) {
	if c.baseURL == "" {
		return nil, 0, fmt.Errorf("upstream Prometheus URL is not configured")
	}
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.Unix(), 10))
	params.Set("end", strconv.FormatInt(end.Unix(), 10))
	params.Set("step", step)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/api/v1/query_range", strings.NewReader(params.Encode()))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

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

// newReverseProxy builds a single-host reverse proxy to target over the given
// transport. The request path is joined onto the target's path (so an upstream
// behind a prefix like /prometheus works), and upstream failures are rendered
// as a Prometheus error envelope rather than plain text.
func newReverseProxy(target *url.URL, transport http.RoundTripper) *httputil.ReverseProxy {
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Transport = transport
	defaultDirector := rp.Director
	rp.Director = func(req *http.Request) {
		defaultDirector(req)
		req.Host = target.Host
	}
	rp.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		writePromError(w, http.StatusBadGateway, "bad_gateway", fmt.Sprintf("upstream request failed: %v", err))
	}
	return rp
}

// writePromError writes a Prometheus-API error envelope so clients (including
// Grafana's Prometheus datasource) get a parseable response on failure.
func writePromError(w http.ResponseWriter, code int, errorType, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":    "error",
		"errorType": errorType,
		"error":     msg,
	})
}
