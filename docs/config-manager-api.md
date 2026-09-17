# Config Manager API Reference

The Config Manager service provides an API for creating and managing configuration snapshots for monitoring agents. All endpoints are accessible via `/cm/api/v1/` prefix through the Nginx reverse proxy.

## Table of Contents

- [Create Snapshot](#create-snapshot)
- [Get Snapshot](#get-snapshot)
- [Update Snapshot](#update-snapshot)
- [Delete Snapshot](#delete-snapshot)
- [Error Responses](#error-responses)

---

## Create Snapshot

### POST /cm/api/v1/snapshot

Creates a configuration snapshot for one or more Couchbase clusters and saves it as a YAML file for the monitoring agent.

**Request Body:**
```json
{
  "configs": [
    {
      "hostnames": ["localhost"],
      "port": 8091
    },
    {
      "hostnames": ["example-sgw-1", "example-sgw-2"],
      "port": 4986,
      "type": "static"
    }
  ],
  "credentials": {
    "username": "admin",
    "password": "password"
  },
  "scheme": "http",
  "label": "My Snapshot Label"
}
```

**Request Fields:**
- `configs` (required): Array of configuration objects
  - `hostnames` (required): Array of hostnames or IP addresses for the cluster/service
  - `port` (required): Port number for the cluster/service
  - `type` (optional): Service discovery type. Defaults to `"sd"` if not specified. Use `"static"` for static targets.
  - `product` (optional): What is at the target, so config-manager knows how to scrape it and what to record on the snapshot. See [Products](#products). Defaults to `"couchbase"` on `type: "sd"` configs; blank on static ones.
  - `sd_path` (optional): Discovery endpoint path appended to `{scheme}://{host}:{port}` on `type: "sd"` configs. Must start with `/`. Required when the product has no default SD path.
  - `scheme` (optional): Per-config override of the top-level `scheme`.
  - `use_alt_addresses` (optional): Request alternate (external) node addresses from service discovery.
- `credentials` (required): Authentication credentials
  - `username` (required): Username for cluster authentication
  - `password` (required): Password for cluster authentication
- `scheme` (optional): Protocol scheme (`"http"` or `"https"`). Defaults to `"http"`.
- `label` (optional): Human-readable label for the snapshot
- `timestamp` (optional): Timestamp for the snapshot (automatically set if not provided)

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Status Codes:**
- `201 Created` - Snapshot created successfully
- `400 Bad Request` - Invalid request data or validation error
- `500 Internal Server Error` - Server error during snapshot creation

<details>
<summary><strong>Example Request:</strong></summary>

```bash
curl -X POST http://localhost:8085/api/v1/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "configs": [
      {
        "hostnames": ["localhost"],
        "port": 8091
      }
    ],
    "credentials": {
      "username": "admin",
      "password": "password"
    },
    "scheme": "http",
    "label": "Production Cluster"
  }'
```
</details>

**Notes:**
- The service automatically collects cluster metadata (version, services, time ranges) after creating the snapshot.
- Configuration files are saved with the naming convention: `{uuid}.yml` in the directory specified by the agent configuration.
- The provided credentilas are used for metrics scraping, services discovery and cluster metadata collection.
- Service discovery URLs include `clusterLabels=uuidOnly` so cluster UUID labels are emitted for cluster registration.

### Products

`product` names what is at a target. Known products carry their own defaults —
a service-discovery path, a metadata fetcher, scrape-time relabelling — so
callers only send the name. An unknown value is accepted and recorded, it just
gets none of those defaults.

| `product` | Notes |
|---|---|
| `couchbase` | Default for `type: "sd"`. Supplies the SD path and collects `/pools/nodes` metadata. |
| `syncgateway` | Self-managed Sync Gateway, scraped per node as static targets. |
| `appservice` | Capella App Services: managed Sync Gateway behind one metrics endpoint. |

Each snapshot's metadata records the distinct set of products it scrapes, in
`products`. cbmonitor uses that set to decide which builtin tabs apply and
which of the user-maintained dashboards in Grafana's `products/` folder to
offer.

**App Services.** Capella App Services fronts every Sync Gateway node behind a
single metrics endpoint, so a snapshot has one scrape target no matter how many
nodes are deployed — `instance` identifies the endpoint, not the node, and a
panel keyed on `instance` collapses the whole deployment into one series. The
endpoint labels every series with `couchbaseNode`, so `product: "appservice"`:

1. records both `appservice` and `syncgateway` in the snapshot's `products`, so
   Sync Gateway dashboards and tabs keep matching while App-Services-specific
   ones can select the narrower product;
2. scrapes the target in a job of its own carrying

   ```yaml
   metric_relabel_configs:
     - source_labels: [couchbaseNode]
       regex: (.+)
       target_label: instance
       replacement: $1
   ```

   which promotes the per-node identity into `instance`. The job is kept
   separate so the rewrite only ever sees App Services' series. `regex: (.+)`
   does not match an empty source label, so a target without `couchbaseNode`
   keeps its `instance` unchanged.

When a snapshot's configs need more than one job — mixed schemes, or a product
with its own relabelling — `job_name` is suffixed to stay unique and a
`relabel_configs` rule rewrites the scraped `job` label back to the snapshot id,
so `job="<id>"` keeps selecting everything in the snapshot.

---

## Get Snapshot

### GET /cm/api/v1/snapshot/{id}

Retrieves a configuration snapshot by its ID.

**Path Parameters:**
- `id` (required): Snapshot ID (UUID)

**Response:**
```json
{
    "name": "f8c26387-77f1-490f-b9d8-88df05618b60",
    "urls": [
    "http://localhost:8091/prometheus_sd_config?port=insecure&clusterLabels=uuidOnly"
    ],
    "timestamp": "2025-11-24T19:36:08.885173056Z"
}
```

**Response Fields:**
- `name`: Snapshot ID/name
- `urls`: Array of cluster URLs
- `targets`: Array of monitoring target URLs
- `timestamp`: Timestamp when the snapshot was created

**Status Codes:**
- `200 OK` - Snapshot retrieved successfully
- `400 Bad Request` - Missing or invalid snapshot ID
- `404 Not Found` - Snapshot not found
- `500 Internal Server Error` - Server error

**Example Request:**
```bash
curl http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000
```

---

## Update Snapshot

### PATCH /cm/api/v1/snapshot/{id}

Updates a snapshot's metadata, including phase information and services list.

**Path Parameters:**
- `id` (required): Snapshot ID (UUID)

**Request Body:**
```json
{
  "phase": "access",
  "mode": "start",
  "services": ["kv", "n1ql", "index"]
}
```

**Request Fields:**
- `phase` (optional): Phase name (e.g., `"access"`, `"warmup"`, `"load"`)
- `mode` (optional): Phase mode - must be either `"start"` or `"end"` when `phase` is specified
- `services` (optional): Array of service names to update

**Note:** At least one operation must be specified:
- Phase update: Both `phase` and `mode` must be provided
- Services update: `services` array must be provided
- Both can be updated in a single request

**Response:**
- `200 OK` - Snapshot updated successfully (no response body)

**Status Codes:**
- `200 OK` - Snapshot updated successfully
- `400 Bad Request` - Missing snapshot ID, invalid payload, or no operations specified
- `500 Internal Server Error` - Server error during update

**Example Requests:**

Update phase start:
```bash
curl -X PATCH http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "access",
    "mode": "start"
  }'
```

Update phase end:
```bash
curl -X PATCH http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "access",
    "mode": "end"
  }'
```

Update services:
```bash
curl -X PATCH http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "services": ["xdcr"]
  }'
```

Update both phase and services:
```bash
curl -X PATCH http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "warmup",
    "mode": "start",
    "services": ["xdcr"]
  }'
```

Updating services is intended for immaterial services that we can deduct from cluster details when registering a snapshot. For example, if a test is doing xdcr, it can intentionally amend the services list to include xdcr.
---

## Delete Snapshot

### DELETE /cm/api/v1/snapshot/{id}

Deletes a configuration snapshot and marks it as end-of-life in the metadata storage.

**Path Parameters:**
- `id` (required): Snapshot ID (UUID)

**Response:**
- `204 No Content` - Snapshot deleted successfully (no response body)

**Status Codes:**
- `204 No Content` - Snapshot deleted successfully
- `400 Bad Request` - Missing or invalid snapshot ID
- `500 Internal Server Error` - Server error during deletion

**Example Request:**
```bash
curl -X DELETE http://localhost:8085/api/v1/snapshot/550e8400-e29b-41d4-a716-446655440000
```

**Notes:**
- Deletion marks the snapshot as end-of-life in metadata storage
- The configuration file is removed from the collector agent directory

---

## Error Responses

All endpoints return errors in a consistent format. Error messages are returned as plain text in the response body.

**Example Error Response:**
```
Missing snapshot ID
```

**Common Error Scenarios:**

1. **Validation Errors (400 Bad Request):**
   - Missing required fields (hostnames, port, username, password)
   - Invalid scheme (must be "http" or "https")
   - Invalid phase mode (must be "start" or "end" when phase is specified)
   - No operations specified in PATCH request

2. **Not Found (404 Not Found):**
   - Snapshot ID does not exist

3. **Server Errors (500 Internal Server Error):**
   - Failed to save snapshot
   - Failed to update metadata
   - Failed to delete snapshot
   - Database connection errors

---

## Configuration

The service is configured via `configs/config-manager/config.yaml`:

```yaml
server:
  port: 8080
  host: "0.0.0.0"

agent:
  type: "vmagent"  # only vmagent is supported
  directory: "/agent/targets/path/"

logging:
  level: "info"
```

**Configuration Notes:**
- Currently only `vmagent` is supported as the agent type.
- Configuration files are saved in the directory specified by `agent.directory`
- Files are named using the snapshot UUID: `{uuid}.yml`

---

## CORS

All endpoints support CORS and can be accessed from web browsers. The following headers are set:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
