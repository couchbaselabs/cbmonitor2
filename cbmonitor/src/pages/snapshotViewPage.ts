import { SceneAppPage, SceneTimePicker, SceneRefreshPicker, EmbeddedScene, SceneFlexLayout, SceneFlexItem } from '@grafana/scenes';
import { ROUTES, prefixRoute } from '../utils/utils.routing';
import { getDashboardsForServices } from '../pages';
import { locationService } from '@grafana/runtime';
import { SnapshotSearchScene } from './SnapshotSearch';
import { FormatMetadataSummary } from '../components/SnapshotDisplay/metadataSummary';
import { Phase } from '../types/snapshot';
import { LayoutToggle } from '../components/LayoutToggle/LayoutToggle';
import { createNoUrlSyncTimeRange, buildQuickRanges, initializeTimeRange } from '../utils/timeRange';
import { loadSnapshot } from '../services/snapshotLoader';
import { sceneCacheService } from '../services/sceneCache';

// Create time range without URL sync, with basic default time range
const timeRange = createNoUrlSyncTimeRange();

/**
 * Combined search and snapshot viewer page
 * Route: /cbmonitor (shows search when no snapshotId, shows snapshot data when snapshotId present)
 */
export const snapshotViewPage = new SceneAppPage({
  title: '',
  url: prefixRoute(`${ROUTES.CBMonitor}`),
  routePath: `${ROUTES.CBMonitor}/*`,
    hideFromBreadcrumbs: true,
});

// Add activation handler to fetch and configure snapshot
snapshotViewPage.addActivationHandler(() => {
  // Variable to track time range subscription for cleanup
  let timeRangeSubscription: { unsubscribe: () => void } | null = null;
  // Track currently loaded snapshot to avoid reloading on tab switches
  let currentLoadedSnapshotId: string | null = null;

  // Function to load snapshot based on current URL
  const loadSnapshotFromUrl = () => {
    const params = locationService.getSearchObject();
    const snapshotId = params.snapshotId as string;

    if (!snapshotId) {
      // No snapshotId - show search interface
      showSearchInterface();
      currentLoadedSnapshotId = null;
      return;
    }

    // Skip if this snapshot is already loaded (happens during tab switches)
    if (currentLoadedSnapshotId === snapshotId) {
      return;
    }

    // Fetch snapshot data
    const fetchSnapshot = async () => {
      try {
        // Clear scene cache when loading a different snapshot
        if (currentLoadedSnapshotId !== null && currentLoadedSnapshotId !== snapshotId) {
          sceneCacheService.clearAll();
        }

        // Update the currently loaded snapshot
        currentLoadedSnapshotId = snapshotId;

        // Load snapshot using unified loader
        const loaded = await loadSnapshot(snapshotId);
        const { metadata } = loaded;

        // Initialize time range from snapshot metadata or phase
        const urlPhase = params.phase as string;
        initializeTimeRange(timeRange, metadata, urlPhase);

        // Handler for when time range changes - update URL with phase if applicable
        const handleTimeRangeChange = () => {
          const currentTimeRange = timeRange.state;
          const currentFrom = currentTimeRange.value.raw.from?.toString();
          const currentTo = currentTimeRange.value.raw.to?.toString();

          // Check if current time range matches a phase
          if (metadata.phases) {
            const matchingPhase = metadata.phases.find((p: Phase) => {
              const phaseMatches = p.ts_start === currentFrom && p.ts_end === currentTo;
              return phaseMatches;
            });

            if (matchingPhase) {
              // Update URL with phase parameter
              locationService.partial({ phase: matchingPhase.label }, true);
            } else if (metadata.ts_start === currentFrom &&
              metadata.ts_end === currentTo) {
              // Full range selected - remove phase parameter
              locationService.partial({ phase: null }, true);
            }
          }
        };

        // Clean up previous subscription if it exists
        if (timeRangeSubscription) {
          timeRangeSubscription.unsubscribe();
        }

        // Subscribe to time range changes
        timeRangeSubscription = timeRange.subscribeToState((state) => {
          handleTimeRangeChange();
        });

        // Build quick ranges using utility function
        const quickRanges = buildQuickRanges(metadata);

        // Handler for layout change - regenerate tabs with new layout
        const handleLayoutChange = () => {
          // Clear scene cache so scenes are recreated with new layout
          sceneCacheService.clearAll();
          // Regenerate tabs with current services and snapshotId
          snapshotViewPage.setState({
            tabs: getDashboardsForServices(metadata.services, snapshotId),
          });
        };

        // Create controls array with time picker (with quick ranges) and layout toggle
        const controls: any[] = [
          new SceneTimePicker({
            isOnCanvas: true,
            quickRanges: quickRanges,
          })
        ];

        // If we have active snapshot, display the refresh picker before the layout toggle
        if (metadata.ts_end && metadata.ts_end.startsWith("now")) {
          controls.push(new SceneRefreshPicker({
            intervals: ['5s', '10s', '30s', '1m', '2m', '5m', '10m'],
            isOnCanvas: true
          }));
        }

        // Add the layout toggle to the controls
        controls.push(new LayoutToggle({
          onLayoutChange: handleLayoutChange,
        }));

        // Update page with snapshot data
        snapshotViewPage.setState({
          title: "",
          tabs: getDashboardsForServices(metadata.services, snapshotId),
          $timeRange: timeRange,
          controls: controls,
          renderTitle: () => {
            return FormatMetadataSummary({
              metadata
            });
          },
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load snapshot';
        console.error('Error loading snapshot:', errorMessage);
        // Show search interface with error message
        showSearchInterface(errorMessage);
        currentLoadedSnapshotId = null;
      }
    };

    fetchSnapshot();
  };

  // Load snapshot immediately on mount
  loadSnapshotFromUrl();

  // Subscribe to URL changes to reload snapshot when snapshotId changes
  const urlSubscription = locationService.getHistory().listen(() => {
    loadSnapshotFromUrl();
  });

  // Return deactivation handler
  return () => {
    console.log('SnapshotViewPage deactivation handler triggered');
    // Unsubscribe from URL changes
    urlSubscription();
    // Unsubscribe from time range changes
    if (timeRangeSubscription) {
      timeRangeSubscription.unsubscribe();
    }
  };
});

// Helper function to show search interface
function showSearchInterface(errorMessage?: string) {
    snapshotViewPage.setState({
        title: '',
        subTitle: errorMessage ? `Unable to load snapshot - ${errorMessage}` : '',
        tabs: undefined,
        controls: undefined,
        renderTitle: undefined,
        $timeRange: undefined,
        getScene: () => new EmbeddedScene({
            body: new SceneFlexLayout({
                direction: 'column',
                children: [
                    new SceneFlexItem({
                        body: new SnapshotSearchScene({ errorMessage }),
                    }),
                ],
            }),
        })
    });
}
