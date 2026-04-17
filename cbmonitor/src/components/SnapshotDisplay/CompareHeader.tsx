import React, { useMemo } from 'react';
import { Icon } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';

export interface CompareHeaderItem {
  id: string;
  meta: SnapshotMetadata;
  title?: string;
}

export interface CompareHeaderProps {
  items: CompareHeaderItem[];
  commonPhases?: string[];
  onSelectCommonPhase?: (label: string) => void;
  onSelectFullRange?: () => void;
  overlapEnabled?: boolean;
}

const inactivePhasePillStyle = {
  background: '#334155',
  border: '1px solid #64748b',
  color: '#e2e8f0',
};

const inactiveCommonPhasePillStyle = {
  background: '#92400e',
  border: '1px solid #b45309',
  color: '#ffedd5',
};

// Helper: detect if a string is a valid http(s) URL
function isValidURL(str?: string): boolean {
  if (!str) {return false;}
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper: render label as clickable link if URL, otherwise plain text
function renderLabel(label?: string): React.ReactNode {
  if (!label) {return null;}
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

function PhasesRow({
  meta,
  commonPhaseSet,
  activeCommonPhase,
  onPillClick,
  overlapEnabled,
}: {
  meta: SnapshotMetadata;
  commonPhaseSet: Set<string>;
  activeCommonPhase: string | null;
  onPillClick: (phaseLabel: string) => void;
  overlapEnabled: boolean;
}) {
  // Normalize labels for consistent case-insensitive comparison
  const normalizeLabel = (label: string) => label.trim().toLowerCase();

  if (!meta.phases || meta.phases.length === 0) {
    return <span style={{ color: '#888' }}>No phases</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {meta.phases.map((p) => {
        const normalizedLabel = normalizeLabel(p.label);
        const isCommon = commonPhaseSet.has(normalizedLabel);
        if (isCommon) {
          const isActive = activeCommonPhase === normalizedLabel;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onPillClick(normalizedLabel)}
              title={overlapEnabled ? 'Phase selection disabled in overlap mode' : 'Common phase'}
              disabled={overlapEnabled}
              style={{
                fontSize: 12,
                padding: '2px 6px',
                borderRadius: 4,
                background: isActive ? '#065f46' : inactiveCommonPhasePillStyle.background,
                border: isActive ? '1px solid #10b981' : inactiveCommonPhasePillStyle.border,
                color: isActive ? '#ecfdf5' : inactiveCommonPhasePillStyle.color,
                cursor: overlapEnabled ? 'not-allowed' : 'pointer',
                opacity: overlapEnabled ? 0.7 : 1,
              }}
            >
              {p.label}
            </button>
          );
        }

        return (
          <span key={p.label} style={{
            fontSize: 12,
            padding: '2px 6px',
            borderRadius: 4,
            background: inactivePhasePillStyle.background,
            border: inactivePhasePillStyle.border,
            color: inactivePhasePillStyle.color,
          }}>
            {p.label}
          </span>
        );
      })}
    </div>
  );
}

export function CompareHeader({ items, commonPhases = [], onSelectCommonPhase, onSelectFullRange, overlapEnabled = false }: CompareHeaderProps) {
  const [activeCommonPhase, setActiveCommonPhase] = React.useState<string | null>(null);

  // Normalize labels for consistent case-insensitive comparison
  const normalizeLabel = (label: string) => label.trim().toLowerCase();

  React.useEffect(() => {
    onSelectFullRange?.();
  }, [onSelectFullRange]);

  React.useEffect(() => {
    if (overlapEnabled) {
      setActiveCommonPhase(null);
    }
  }, [overlapEnabled]);

  const commonPhaseSet = useMemo(() => new Set(commonPhases.map(normalizeLabel)), [commonPhases]);

  const cols = Math.min(Math.max(items.length, 1), 6);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '12px 0'
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16, overflowX: 'auto', overflowY: 'visible' }}>
        {items.map((item, idx) => {
          const label = item.meta.label;
          const letter = String.fromCharCode(65 + idx);
          const title = item.title ?? `Snapshot ${letter}`;
          return (
            <div key={item.id} style={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{title}</div>
              <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <b>ID:</b>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{item.id}</span>
                <CopyButton text={item.id} />
              </div>
              <div style={{ fontSize: 12 }}>
                <b>Server Version:</b> {item.meta.version}
              </div>
              {label && (
                <div style={{ fontSize: 12 }}>
                  <b>Label:</b> {renderLabel(label)}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <b style={{ fontSize: 12 }}>Phases:</b>
                <div style={{ marginTop: 4 }}>
                  <PhasesRow
                    meta={item.meta}
                    commonPhaseSet={commonPhaseSet}
                    activeCommonPhase={activeCommonPhase}
                    overlapEnabled={overlapEnabled}
                    onPillClick={(phaseLabel) => {
                      if (overlapEnabled) {
                        return;
                      }

                      setActiveCommonPhase((prev) => {
                        if (prev === phaseLabel) {
                          onSelectFullRange?.();
                          return null;
                        }

                        onSelectCommonPhase?.(phaseLabel);
                        return phaseLabel;
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CompareHeader;

// Small copy-to-clipboard button used near the ID
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={onCopy}
      title={copied ? 'Copied' : 'Copy ID'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #374151',
        background: copied ? '#064e3b' : '#1f2937',
        color: '#E5E7EB',
        borderRadius: 4,
        padding: '4px 6px',
        cursor: 'pointer'
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={'md'} />
    </button>
  );
}
