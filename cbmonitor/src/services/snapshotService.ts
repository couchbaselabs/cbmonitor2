import { SnapshotData, SnapshotApiResponse } from '../types/snapshot';
import { API_BASE_URL } from '../constants';

class SnapshotService {
  private readonly maxSnapshotFetchAttempts = 3;

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch snapshot metadata by snapshot ID
   */
  async getSnapshot(snapshotId: string): Promise<SnapshotData> {
    const url = `${API_BASE_URL}/snapshots/${snapshotId}`;

    for (let attempt = 1; attempt <= this.maxSnapshotFetchAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const canRetry = response.status >= 500 && response.status < 600 && attempt < this.maxSnapshotFetchAttempts;

          if (canRetry) {
            const retryDelayMs = attempt * 300;
            console.warn(
              `Snapshot fetch failed with ${response.status}. Retrying in ${retryDelayMs}ms...`
            );
            await this.wait(retryDelayMs);
            continue;
          }

          const rawError = await response.text();
          const suffix = rawError ? ` - ${rawError}` : '';
          throw new Error(
            `Failed to fetch snapshot ${snapshotId}: HTTP ${response.status} ${response.statusText}${suffix}`
          );
        }

        const apiResponse: SnapshotApiResponse = await response.json();

        if (!apiResponse.success) {
          throw new Error(apiResponse.error || 'Unknown API error');
        }

        return apiResponse.data;
      } catch (error) {
        const isLastAttempt = attempt === this.maxSnapshotFetchAttempts;
        const isRetryableNetworkError = error instanceof TypeError;

        if (isRetryableNetworkError && !isLastAttempt) {
          const retryDelayMs = attempt * 300;
          console.warn(
            `Snapshot fetch encountered a network error. Retrying in ${retryDelayMs}ms...`,
            error
          );
          await this.wait(retryDelayMs);
          continue;
        }
        console.error(`Error fetching snapshot ${snapshotId}:`, error);
        throw error;
      }
    }

    throw new Error(`Failed to fetch snapshot ${snapshotId}: exhausted retry attempts`);
  }

  /**
   * Store snapshot data in browser storage for access by dashboards
   */
  storeSnapshotData(snapshotId: string, data: SnapshotData): void {
    try {
      // Store in sessionStorage so it's available across dashboard navigation
      sessionStorage.setItem(`cbmonitor_snapshot_${snapshotId}`, JSON.stringify(data));
      // Also store the current snapshot ID
      sessionStorage.setItem('cbmonitor_current_snapshot', snapshotId);
    } catch (error) {
      console.error('Error storing snapshot data:', error);
    }
  }

  /**
   * Retrieve snapshot data from browser storage
   */
  getStoredSnapshotData(snapshotId: string): SnapshotData | null {
    try {
      const data = sessionStorage.getItem(`cbmonitor_snapshot_${snapshotId}`);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Error retrieving stored snapshot data:', error);
      return null;
    }
  }

  /**
   * Get the current active snapshot ID
   */
  getCurrentSnapshotId(): string | null {
    return sessionStorage.getItem('cbmonitor_current_snapshot');
  }

  /**
   * Clear stored snapshot data
   */
  clearSnapshotData(snapshotId?: string): void {
    try {
      if (snapshotId) {
        sessionStorage.removeItem(`cbmonitor_snapshot_${snapshotId}`);
      } else {
        // Clear all snapshot data
        const currentId = this.getCurrentSnapshotId();
        if (currentId) {
          sessionStorage.removeItem(`cbmonitor_snapshot_${currentId}`);
        }
        sessionStorage.removeItem('cbmonitor_current_snapshot');
      }
    } catch (error) {
      console.error('Error clearing snapshot data:', error);
    }
  }
}

// Export a singleton instance
export const snapshotService = new SnapshotService();
export default snapshotService;
