import { getBackendSrv } from '@grafana/runtime';
import { API_BASE_URL } from '../constants';

/**
 * Optional gateway-provided capabilities, sourced from the plugin's
 * `/config/datasources` resource endpoint. These reflect deployment-time
 * plugin settings, not per-request state, so they are fetched once and cached.
 *
 * `overlapEnabled` gates the multi-snapshot overlap path (`job=~"a|b"` routed
 * to the gateway's overlap seam). It is false in pure-Prometheus deployments
 * (no gateway) and in gateway deployments with overlap turned off — in both
 * cases the overlap affordance must stay hidden.
 */
export interface DatasourceCapabilities {
    gatewayEnabled: boolean;
    overlapEnabled: boolean;
}

// Degrade closed: until proven otherwise, assume no gateway features so the
// UI never offers an affordance the backend can't serve.
const DEFAULT_CAPABILITIES: DatasourceCapabilities = {
    gatewayEnabled: false,
    overlapEnabled: false,
};

class DatasourceCapabilitiesService {
    private capabilities: DatasourceCapabilities = DEFAULT_CAPABILITIES;
    private loaded = false;
    private inflight: Promise<DatasourceCapabilities> | null = null;
    private listeners = new Set<(caps: DatasourceCapabilities) => void>();

    /** Synchronous snapshot of the last-known capabilities. */
    get(): DatasourceCapabilities {
        return this.capabilities;
    }

    isOverlapEnabled(): boolean {
        return this.capabilities.overlapEnabled;
    }

    /**
     * Fetch capabilities once and cache them. Safe to call repeatedly — a
     * second call while a fetch is in flight reuses the same promise, and
     * calls after a successful load resolve immediately.
     */
    load(): Promise<DatasourceCapabilities> {
        if (this.loaded) {
            return Promise.resolve(this.capabilities);
        }
        if (this.inflight) {
            return this.inflight;
        }
        this.inflight = getBackendSrv()
            .get(`${API_BASE_URL}/config/datasources`)
            .then((response: any) => {
                this.capabilities = {
                    gatewayEnabled: Boolean(response?.gatewayEnabled),
                    overlapEnabled: Boolean(response?.overlapEnabled),
                };
                this.finishLoad();
                return this.capabilities;
            })
            .catch(() => {
                // Endpoint unavailable: keep the closed defaults so no
                // gateway-only affordance is offered.
                this.capabilities = DEFAULT_CAPABILITIES;
                this.finishLoad();
                return this.capabilities;
            });
        return this.inflight;
    }

    subscribe(listener: (caps: DatasourceCapabilities) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private finishLoad() {
        this.loaded = true;
        this.inflight = null;
        for (const listener of this.listeners) {
            listener(this.capabilities);
        }
    }
}

export const datasourceCapabilitiesService = new DatasourceCapabilitiesService();
