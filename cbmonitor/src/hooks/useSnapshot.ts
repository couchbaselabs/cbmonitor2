import { useState, useEffect } from 'react';
import { SnapshotData } from '../types/snapshot';
import { snapshotService } from '../services/snapshotService';

interface UseSnapshotResult {
  snapshot: SnapshotData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSnapshot(snapshotId: string | null): UseSnapshotResult {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = async () => {
    if (!snapshotId) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, check if we have the metadata cached in a local session
      const storedSnapshot = snapshotService.getStoredSnapshotData(snapshotId);
      if (storedSnapshot) {
        console.log(`Using stored snapshot data for ${snapshotId}`);
        setSnapshot(storedSnapshot);
        setLoading(false);
        return;
      }

      // If not stored, fetch from API
      console.log(`Fetching snapshot ${snapshotId} from API`);
      const data = await snapshotService.getSnapshot(snapshotId);

      // Store the fetched data
      snapshotService.storeSnapshotData(snapshotId, data);

      setSnapshot(data);
      setError(null);
    } catch (err) {
      console.error('Error in useSnapshot:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch snapshot');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, [snapshotId]);

  const refetch = () => {
    fetchSnapshot();
  };

  return {
    snapshot,
    loading,
    error,
    refetch,
  };
}

