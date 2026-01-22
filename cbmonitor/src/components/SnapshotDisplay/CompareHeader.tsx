import React, { useMemo } from 'react';
import { SnapshotMetadata } from 'types/snapshot';

export interface CompareHeaderProps {
  leftId: string;
  rightId: string;
  leftMeta: SnapshotMetadata;
  rightMeta: SnapshotMetadata;
  commonServices: string[];
  renderLeftPickerScene?: () => React.ReactNode;
  renderRightPickerScene?: () => React.ReactNode;
}

function formatRange(meta: SnapshotMetadata) {
  return `${meta.ts_start} → ${meta.ts_end}`;
}

// Helper: detect if a string is a valid http(s) URL
function isValidURL(str?: string): boolean {
  if (!str) return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper: render label as clickable link if URL, otherwise plain text
function renderLabel(label?: string): React.ReactNode {
  if (!label) return null;
  if (isValidURL(label)) {
    return (
      <a
        href={label}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#5794F2', textDecoration: 'none' }}
      >
        {label}
      </a>
    );
  }
  return <span>{label}</span>;
}

function PhasesRow({ meta }: { meta: SnapshotMetadata }) {
  if (!meta.phases || meta.phases.length === 0) {
    return <span style={{ color: '#888' }}>No phases</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {meta.phases.map((p) => (
        <span key={p.label} style={{
          fontSize: 12,
          padding: '2px 6px',
          borderRadius: 4,
          background: '#1f2937',
          border: '1px solid #374151'
        }}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

export function CompareHeader({ leftId, rightId, leftMeta, rightMeta, commonServices, renderLeftPickerScene, renderRightPickerScene }: CompareHeaderProps) {
  const leftLabel = leftMeta.label;
  const rightLabel = rightMeta.label;

  const commonServicesText = useMemo(() => {
    if (commonServices.length === 0) return 'None';
    return commonServices.join(', ');
  }, [commonServices]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: '12px 0'
    }}>
      <div style={{
        fontSize: 12,
        color: '#E5E7EB',
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: '6px 10px'
      }}>
        <span style={{ color: '#9CA3AF', marginRight: 6 }}>Services (common):</span>
        <span style={{ color: '#E5E7EB' }}>{commonServicesText}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '10px 12px'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Snapshot A</div>
          <div style={{ fontSize: 12 }}>
            <b>ID:</b> {leftId}
          </div>
          <div style={{ fontSize: 12 }}>
            <b>Server Version:</b> {leftMeta.version}
          </div>
          {leftLabel && (
            <div style={{ fontSize: 12 }}>
              <b>Label:</b> {renderLabel(leftLabel)}
            </div>
          )}
          <div style={{ fontSize: 12 }}>
            <b>Range:</b> {formatRange(leftMeta)}
          </div>
          <div style={{ marginTop: 4 }}>
            <b style={{ fontSize: 12 }}>Phases:</b>
            <div style={{ marginTop: 4 }}>
              <PhasesRow meta={leftMeta} />
            </div>
          </div>
          {renderLeftPickerScene && (
            <div style={{ marginTop: 10 }}>
              {renderLeftPickerScene()}
            </div>
          )}
        </div>
        <div style={{
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '10px 12px'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Snapshot B</div>
          <div style={{ fontSize: 12 }}>
            <b>ID:</b> {rightId}
          </div>
          <div style={{ fontSize: 12 }}>
            <b>Server Version:</b> {rightMeta.version}
          </div>
          {rightLabel && (
            <div style={{ fontSize: 12 }}>
              <b>Label:</b> {renderLabel(rightLabel)}
            </div>
          )}
          <div style={{ fontSize: 12 }}>
            <b>Range:</b> {formatRange(rightMeta)}
          </div>
          <div style={{ marginTop: 4 }}>
            <b style={{ fontSize: 12 }}>Phases:</b>
            <div style={{ marginTop: 4 }}>
              <PhasesRow meta={rightMeta} />
            </div>
          </div>
          {renderRightPickerScene && (
            <div style={{ marginTop: 10 }}>
              {renderRightPickerScene()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompareHeader;
