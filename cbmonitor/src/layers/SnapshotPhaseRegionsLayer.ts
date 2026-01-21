import { SceneDataLayerBase } from '@grafana/scenes';
import { DataFrame, DataTopic, FieldType, LoadingState, toDataFrame, dateTime } from '@grafana/data';
import { snapshotService } from '../services/snapshotService';
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

    // Define up to 6 distinct colors for phases
    const palette = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    // If end markers sit at the snapshot end, nudge left a bit to avoid label clipping
    const epsilonMs = 5000;
    const snapshotEnd = snapshot?.metadata ? dateTime(snapshot.metadata.ts_end).valueOf() : undefined;

    // Region annotations (start->end)
    const regionStarts: Date[] = [];
    const regionEnds: Date[] = [];
    const regionTexts: string[] = [];
    const regionColors: string[] = [];

    // End-of-phase point annotations
    const endTimes: Date[] = [];
    const endTexts: string[] = [];
    const endColors: string[] = [];

    // Start-only point annotations for ongoing phases
    const startOnlyTimes: Date[] = [];
    const startOnlyTexts: string[] = [];
    const startOnlyColors: string[] = [];

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
        // Only add region and end markers when an explicit end exists in the JSON
        regionStarts.push(start);
        regionEnds.push(end);
        regionTexts.push(`Phase: ${p.label}`);
        regionColors.push(color);

        endTimes.push(end);
        endTexts.push(`Phase End: ${p.label}`);
        endColors.push(color);
      } else {
        // Ongoing phase: add a start-only point annotation
        startOnlyTimes.push(start);
        startOnlyTexts.push(`Phase Start: ${p.label}`);
        startOnlyColors.push(color);
      }
    }

    const regionFrame: DataFrame = toDataFrame({
      name: 'snapshot_phase_regions',
      fields: [
        { name: 'time', type: FieldType.time, values: regionStarts },
        { name: 'timeEnd', type: FieldType.time, values: regionEnds },
        { name: 'text', type: FieldType.string, values: regionTexts },
        { name: 'color', type: FieldType.string, values: regionColors },
      ],
    });
    regionFrame.meta = { ...(regionFrame.meta || {}), dataTopic: DataTopic.Annotations };

    const endFrame: DataFrame = toDataFrame({
      name: 'snapshot_phase_ends',
      fields: [
        { name: 'time', type: FieldType.time, values: endTimes },
        { name: 'text', type: FieldType.string, values: endTexts },
        { name: 'color', type: FieldType.string, values: endColors },
      ],
    });
    endFrame.meta = { ...(endFrame.meta || {}), dataTopic: DataTopic.Annotations };

    // Build starts-only frame (if any)
    const frames: DataFrame[] = [regionFrame, endFrame];
    if (startOnlyTimes.length > 0) {
      const startFrame: DataFrame = toDataFrame({
        name: 'snapshot_phase_starts',
        fields: [
          { name: 'time', type: FieldType.time, values: startOnlyTimes },
          { name: 'text', type: FieldType.string, values: startOnlyTexts },
          { name: 'color', type: FieldType.string, values: startOnlyColors },
        ],
      });
      startFrame.meta = { ...(startFrame.meta || {}), dataTopic: DataTopic.Annotations };
      frames.push(startFrame);
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
