import { ComponentMetrics, MetricsApiResponse, Metric, MetricValue, METRIC_DEFINITIONS } from '../types/metrics';

// Base API configuration - Grafana plugin resources are served at /api/plugins/{plugin-id}/resources
const API_BASE_URL = '/api/plugins/cbmonitor/resources';

class MetricsService {
  /**
   * Fetch metrics data for a specific component
   */
  async getComponentMetrics(componentId: string, category?: string, subCategory?: string): Promise<ComponentMetrics> {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (category) {
        params.append('category', category);
      }
      if (subCategory) {
        params.append('subCategory', subCategory);
      }
      
      const queryString = params.toString();
      const url = `${API_BASE_URL}/metrics/${componentId}${queryString ? `?${queryString}` : ''}`;
      
      console.log(`Fetching metrics from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics for ${componentId}: ${response.statusText}`);
      }

      const apiResponse: MetricsApiResponse = await response.json();
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Unknown API error');
      }

      console.log(`Successfully fetched ${apiResponse.data.metrics.length} metrics for ${componentId}`);
      return apiResponse.data;
    } catch (error) {
      console.error(`Error fetching metrics for ${componentId}:`, error);
      console.log('Falling back to mock data...');
      
      // Return mock data for development/fallback
      return this.getMockComponentMetrics(componentId);
    }
  }

  /**
   * Fetch metrics for multiple components
   */
  async getMultipleComponentMetrics(componentIds: string[]): Promise<ComponentMetrics[]> {
    try {
      const promises = componentIds.map(id => this.getComponentMetrics(id));
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error fetching multiple component metrics:', error);
      throw error;
    }
  }

  /**
   * Fetch specific metric with historical data
   */
  async getMetricHistory(componentId: string, metricId: string, limit = 50): Promise<Metric> {
    try {
      console.log(`Fetching metric history for ${componentId}/${metricId}`);
      
      const response = await fetch(
        `${API_BASE_URL}/metrics/${componentId}/${metricId}?limit=${limit}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metric history: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Successfully fetched history for metric ${metricId}`);
      return data;
    } catch (error) {
      console.error(`Error fetching metric history for ${componentId}/${metricId}:`, error);
      console.log('Falling back to mock data...');
      
      // Fallback to mock data
      const mockMetrics = this.getMockComponentMetrics(componentId);
      const mockMetric = mockMetrics.metrics.find(m => m.id === metricId);
      if (mockMetric) {
        return mockMetric;
      }
      throw error;
    }
  }

  /**
   * Generate mock data for development/testing
   */
  private getMockComponentMetrics(componentId: string): ComponentMetrics {
    const metricNames = METRIC_DEFINITIONS[componentId] || [];
    const versions = ['7.2.0', '7.2.1', '7.2.2', '7.3.0', '7.3.1'];
    
    const metrics: Metric[] = metricNames.map((metricName, index) => {
      const values: MetricValue[] = versions.map(version => ({
        version,
        value: Math.random() * 1000 + (index * 100), // Varied base values
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        buildNumber: `${version}-${Math.floor(Math.random() * 9999)}`
      }));

      const description = metricName === 'draft-1' 
        ? 'Key-Value throughput performance metric showing operations per second across versions'
        : `${this.formatMetricName(metricName)} performance metric`;

      return {
        id: metricName,
        name: this.formatMetricName(metricName),
        description,
        unit: this.getMetricUnit(metricName),
        category: this.getMetricCategory(metricName),
        values: values.sort((a, b) => a.version.localeCompare(b.version))
      };
    });

    return {
      componentId,
      componentName: this.formatComponentName(componentId),
      metrics,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Helper methods for formatting and categorization
   */
  private formatMetricName(metricId: string): string {
    // Special handling for draft-1
    if (metricId === 'draft-1') {
      return 'KV Throughput';
    }
    
    return metricId
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatComponentName(componentId: string): string {
    const nameMap: Record<string, string> = {
      'kv': 'Key-Value',
      'hidd': 'HiDD',
      'rebalance': 'Rebalance',
      'xdcr': 'XDCR',
      'query': 'Query',
      'search': 'Search',
      'analytics': 'Analytics',
      'eventing': 'Eventing',
      'tools': 'Tools',
      'sync-gateway': 'Sync Gateway',
      'mobile': 'Mobile',
      'sdks': 'SDKs',
      'fio': 'FIO'
    };
    return nameMap[componentId] || componentId;
  }

  private getMetricUnit(metricId: string): string {
    // Special handling for draft-1
    if (metricId === 'draft-1') {
      return 'ops/sec';
    }
    
    if (metricId.includes('latency') || metricId.includes('time') || metricId.includes('duration')) {
      return 'ms';
    }
    if (metricId.includes('throughput') || metricId.includes('ops') || metricId.includes('rate')) {
      return 'ops/sec';
    }
    if (metricId.includes('size') || metricId.includes('memory')) {
      return 'MB';
    }
    if (metricId.includes('percentage') || metricId.includes('hit_rate')) {
      return '%';
    }
    if (metricId.includes('iops')) {
      return 'IOPS';
    }
    if (metricId.includes('bandwidth')) {
      return 'MB/s';
    }
    return 'value';
  }

  private getMetricCategory(metricId: string): string {
    // Special handling for draft-1
    if (metricId === 'draft-1') {
      return 'throughput';
    }
    
    if (metricId.includes('latency') || metricId.includes('time') || metricId.includes('duration')) {
      return 'latency';
    }
    if (metricId.includes('throughput') || metricId.includes('ops') || metricId.includes('rate')) {
      return 'throughput';
    }
    if (metricId.includes('memory') || metricId.includes('size')) {
      return 'memory';
    }
    if (metricId.includes('error') || metricId.includes('conflict')) {
      return 'errors';
    }
    return 'general';
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
export default metricsService;
