import { SceneDataLayerBase } from '@grafana/scenes';
import { DataFrame, DataTopic, FieldType, LoadingState, toDataFrame, dateTime } from '@grafana/data';
import { snapshotService } from '../services/snapshotService';
import { layoutService } from '../services/layoutService';
import { Phase } from '../types/snapshot';

interface SnapshotPhaseRegionsLayerState {
  isEnabled: boolean;
  snapshotId: string;
  name: string;
  data?: any;
}

export class SnapshotPhaseRegionsLayer extends SceneDataLayerBase<SnapshotPhaseRegionsLayerState> {
  constructor(initialState: SnapshotPhaseRegionsLayerState) {
    super(initialState);

    // Re-render when the user flips the zones/lines preference so the change
    // takes effect without rebuilding the whole scene.
    this.addActivationHandler(() =>
      layoutService.subscribePhaseStyle(() => {
        if (this.state.isEnabled) {
          this.runLayer();
        }
      })
    );
  }

  onEnable() {
    this.runLayer();
  }

  onDisable() {
    // Clear annotations when disabled
    const snapshot = snapshotService.getStoredSnapshotData(this.state.snapshotId);
    const tr: any = snapshot?.metadata
      ? {
          from: dateTime(snapshot.metadata.ts_start),
          to: dateTime(snapshot.metadata.ts_end),
          raw: { from: snapshot.metadata.ts_start, to: snapshot.metadata.ts_end },
        }
      : undefined;
    const stateUpdate: any = {
      state: LoadingState.Done,
      timeRange: tr,
      series: []
    };
    this.publishResults(stateUpdate);
  }

  runLayer() {
    const { snapshotId } = this.state;
    const snapshot = snapshotService.getStoredSnapshotData(snapshotId);
    const phases: Phase[] | undefined = snapshot?.metadata?.phases;

    if (!phases || phases.length === 0) {
      // No phases to render; publish empty annotations frame
      const tr: any = snapshot?.metadata
        ? {
            from: dateTime(snapshot.metadata.ts_start),
            to: dateTime(snapshot.metadata.ts_end),
            raw: { from: snapshot.metadata.ts_start, to: snapshot.metadata.ts_end },
          }
        : undefined;
      const stateUpdate: any = {
        state: LoadingState.Done,
        timeRange: tr,
        series: []
      };
      this.publishResults(stateUpdate);
      return;
    }

    // Shaded zones by default
    const asZones = layoutService.getPhasesAsZones();

    // Define up to 6 distinct colors for phases
    const palette = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    // If end markers sit at the snapshot end, nudge left a bit to avoid label clipping
    const epsilonMs = 5000;
    const snapshotEnd = snapshot?.metadata ? dateTime(snapshot.metadata.ts_end).valueOf() : undefined;

    // Region annotations (start->end). The `isRegion` field is what makes the
    // timeseries AnnotationsPlugin draw a shaded zone rather than a single line;
    const regionStarts: Date[] = [];
    const regionEnds: Date[] = [];
    const regionTexts: string[] = [];
    const regionColors: string[] = [];

    // A Map groups annotations that are very close in time (within 1 second).
    const pointAnnotations = new Map<number, { labels: string[]; color: string }>();
    const timeThresholdMs = 1000;
    const findNearbyTimestamp = (targetTime: number): number | undefined => {
      for (const existingTime of pointAnnotations.keys()) {
        if (Math.abs(existingTime - targetTime) <= timeThresholdMs) {
          return existingTime;
        }
      }
      return undefined;
    };

    let phaseIndex = 0;
    for (const p of phases) {
      const color = palette[phaseIndex % palette.length];
      phaseIndex++;
      const hasEnd = Boolean(p.ts_end);
      const start = dateTime(p.ts_start).toDate();

      if (hasEnd) {
        let end = dateTime(p.ts_end).toDate();
        if (snapshotEnd !== undefined && end.getTime() >= snapshotEnd - epsilonMs) {
          end = new Date(snapshotEnd - epsilonMs);
        }
        regionStarts.push(start);
        regionEnds.push(end);
        regionTexts.push(`Phase: ${p.label}`);
        regionColors.push(color);
      }

      if (!asZones) {
        // Vertical lines at each phase start (and end when present).
        const startTime = start.getTime();
        const effectiveStartTime = findNearbyTimestamp(startTime) ?? startTime;
        if (!pointAnnotations.has(effectiveStartTime)) {
          pointAnnotations.set(effectiveStartTime, { labels: [], color });
        }
        pointAnnotations.get(effectiveStartTime)!.labels.push(`{Phase Start: ${p.label}}`);

        if (hasEnd) {
          let end = dateTime(p.ts_end).toDate();
          if (snapshotEnd !== undefined && end.getTime() >= snapshotEnd - epsilonMs) {
            end = new Date(snapshotEnd - epsilonMs);
          }
          const endTime = end.getTime();
          const effectiveEndTime = findNearbyTimestamp(endTime) ?? endTime;
          if (!pointAnnotations.has(effectiveEndTime)) {
            pointAnnotations.set(effectiveEndTime, { labels: [], color });
          }
          pointAnnotations.get(effectiveEndTime)!.labels.push(`{Phase End: ${p.label}}`);
        }
      }
    }

    const regionFrame: DataFrame = toDataFrame({
      name: 'snapshot_phase_regions',
      fields: [
        { name: 'time', type: FieldType.time, values: regionStarts },
        { name: 'timeEnd', type: FieldType.time, values: regionEnds },
        { name: 'isRegion', type: FieldType.boolean, values: regionStarts.map(() => asZones) },
        { name: 'text', type: FieldType.string, values: regionTexts },
        { name: 'color', type: FieldType.string, values: regionColors },
      ],
    });
    regionFrame.meta = { ...(regionFrame.meta || {}), dataTopic: DataTopic.Annotations };

    const frames: DataFrame[] = [regionFrame];

    if (!asZones && pointAnnotations.size > 0) {
      const pointTimes: Date[] = [];
      const pointTexts: string[] = [];
      const pointColors: string[] = [];
      for (const [timestamp, data] of pointAnnotations.entries()) {
        pointTimes.push(new Date(timestamp));
        pointTexts.push(data.labels.join('\n'));
        pointColors.push(data.color);
      }
      const pointFrame: DataFrame = toDataFrame({
        name: 'snapshot_phase_transitions',
        fields: [
          { name: 'time', type: FieldType.time, values: pointTimes },
          { name: 'text', type: FieldType.string, values: pointTexts },
          { name: 'color', type: FieldType.string, values: pointColors },
        ],
      });
      pointFrame.meta = { ...(pointFrame.meta || {}), dataTopic: DataTopic.Annotations };
      frames.push(pointFrame);
    }

    const tr: any = snapshot?.metadata
      ? {
          from: dateTime(snapshot.metadata.ts_start),
          to: dateTime(snapshot.metadata.ts_end),
          raw: { from: snapshot.metadata.ts_start, to: snapshot.metadata.ts_end },
        }
      : undefined;
    const stateUpdate: any = {
      state: LoadingState.Done,
      timeRange: tr,
      series: frames
    };
    this.publishResults(stateUpdate);
  }
}
