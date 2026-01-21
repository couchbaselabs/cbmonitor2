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

    for (const p of phases) {
      const start = dateTime(p.ts_start).toDate();
      let end = dateTime(p.ts_end).toDate();
      if (snapshotEnd !== undefined && end.getTime() >= snapshotEnd - epsilonMs) {
        end = new Date(snapshotEnd - epsilonMs);
      }
      regionStarts.push(start);
      regionEnds.push(end);
      regionTexts.push(`Phase: ${p.label}`);
      regionColors.push(palette[(regionStarts.length - 1) % palette.length]);

      endTimes.push(end);
      endTexts.push(`Phase End: ${p.label}`);
      endColors.push(regionColors[regionColors.length - 1]);
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
      series: [regionFrame, endFrame]
    };
    this.publishResults(stateUpdate);
  }
}
