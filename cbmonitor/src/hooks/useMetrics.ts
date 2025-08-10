import { useState, useEffect, useCallback } from 'react';
import { ComponentMetrics, Metric } from '../types/metrics';
import { metricsService } from '../services/metricsService';

interface UseMetricsResult {
  metrics: ComponentMetrics | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseMetricHistoryResult {
  metric: Metric | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook for fetching component metrics
 */
export const useMetrics = (componentId: string): UseMetricsResult => {
  const [metrics, setMetrics] = useState<ComponentMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!componentId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await metricsService.getComponentMetrics(componentId);
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [componentId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    refetch: fetchMetrics
  };
};

/**
 * Hook for fetching specific metric history
 */
export const useMetricHistory = (componentId: string, metricId: string, limit?: number): UseMetricHistoryResult => {
  const [metric, setMetric] = useState<Metric | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetricHistory = useCallback(async () => {
    if (!componentId || !metricId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await metricsService.getMetricHistory(componentId, metricId, limit);
      setMetric(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metric history');
      console.error('Error fetching metric history:', err);
    } finally {
      setLoading(false);
    }
  }, [componentId, metricId, limit]);

  useEffect(() => {
    fetchMetricHistory();
  }, [fetchMetricHistory]);

  return {
    metric,
    loading,
    error,
    refetch: fetchMetricHistory
  };
};

/**
 * Hook for fetching multiple components metrics
 */
export const useMultipleMetrics = (componentIds: string[]) => {
  const [metricsData, setMetricsData] = useState<ComponentMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMultipleMetrics = useCallback(async () => {
    if (!componentIds.length) return;

    setLoading(true);
    setError(null);

    try {
      const data = await metricsService.getMultipleComponentMetrics(componentIds);
      setMetricsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
      console.error('Error fetching multiple metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [componentIds]);

  useEffect(() => {
    fetchMultipleMetrics();
  }, [fetchMultipleMetrics]);

  return {
    metricsData,
    loading,
    error,
    refetch: fetchMultipleMetrics
  };
};
