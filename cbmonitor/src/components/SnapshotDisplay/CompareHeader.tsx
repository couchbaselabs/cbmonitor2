import React, { useMemo } from 'react';
import { SnapshotMetadata } from 'types/snapshot';

export interface CompareHeaderItem {
  id: string;
  meta: SnapshotMetadata;
  title?: string;
  renderPickerScene?: () => React.ReactNode;
}

export interface CompareHeaderProps {
  items: CompareHeaderItem[];
  commonServices: string[];
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
        style={{ color: '#5794F2', textDecoration: 'none', wordBreak: 'break-word' }}
      >
        {label}
      </a>
    );
  }
  return <span style={{ wordBreak: 'break-word' }}>{label}</span>;
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

export function CompareHeader({ items, commonServices }: CompareHeaderProps) {
  const commonServicesText = useMemo(() => {
    if (commonServices.length === 0) return 'None';
    return commonServices.join(', ');
  }, [commonServices]);

  const cols = Math.min(Math.max(items.length, 1), 6);
  const isCompact = items.length >= 5;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: isCompact ? 8 : 10,
      padding: '12px 0'
    }}>
      <div style={{
        fontSize: 12,
        color: '#E5E7EB',
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: isCompact ? '4px 8px' : '6px 10px'
      }}>
        <span style={{ color: '#9CA3AF', marginRight: 6 }}>Services (common):</span>
        <span style={{ color: '#E5E7EB' }}>{commonServicesText}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: isCompact ? 8 : 16, overflowX: isCompact ? 'auto' : 'visible' }}>
        {items.map((item, idx) => {
          const label = item.meta.label;
          const letter = String.fromCharCode(65 + idx);
          const title = item.title ?? (isCompact ? letter : `Snapshot ${letter}`);
          return (
            <div key={item.id} style={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: isCompact ? '8px 10px' : '10px 12px'
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: isCompact ? 12 : 14 }}>{title}</div>
              <div style={{ fontSize: isCompact ? 11 : 12 }}>
                <b>ID:</b> {item.id}
              </div>
              <div style={{ fontSize: isCompact ? 11 : 12 }}>
                <b>Server Version:</b> {item.meta.version}
              </div>
              {label && (
                <div style={{ fontSize: isCompact ? 11 : 12 }}>
                  <b>Label:</b> {renderLabel(label)}
                </div>
              )}
              <div style={{ fontSize: isCompact ? 11 : 12 }}>
                <b>Range:</b> {formatRange(item.meta)}
              </div>
              <div style={{ marginTop: 4 }}>
                <b style={{ fontSize: isCompact ? 11 : 12 }}>Phases:</b>
                <div style={{ marginTop: 4 }}>
                  <PhasesRow meta={item.meta} />
                </div>
              </div>
              {item.renderPickerScene && (
                <div style={{ marginTop: isCompact ? 8 : 10 }}>
                  {item.renderPickerScene()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CompareHeader;
