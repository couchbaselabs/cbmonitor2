import { SnapshotData, SnapshotApiResponse } from '../types/snapshot';

// Base API configuration - Grafana plugin resources are served at /api/plugins/{plugin-id}/resources
const API_BASE_URL = '/api/plugins/cbmonitor/resources';

class SnapshotService {
  /**
   * Fetch snapshot metadata by snapshot ID
   */
  async getSnapshot(snapshotId: string): Promise<SnapshotData> {
    try {
      const url = `${API_BASE_URL}/snapshots/${snapshotId}`;
      console.log(`Fetching snapshot from: ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch snapshot ${snapshotId}: ${response.statusText}`);
      }

      const apiResponse: SnapshotApiResponse = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Unknown API error');
      }

      console.log(`Successfully fetched snapshot: ${snapshotId}`);
      return apiResponse.data;
    } catch (error) {
      console.error(`Error fetching snapshot ${snapshotId}:`, error);
      throw error;
    }
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
      console.log(`Stored snapshot ${snapshotId} in session storage`);
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
      console.log('Cleared snapshot data from storage');
    } catch (error) {
      console.error('Error clearing snapshot data:', error);
    }
  }
}

// Export a singleton instance
export const snapshotService = new SnapshotService();
export default snapshotService;
