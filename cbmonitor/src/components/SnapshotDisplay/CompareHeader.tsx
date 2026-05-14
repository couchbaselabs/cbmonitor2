import React, { useMemo } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
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

function isValidURL(str?: string): boolean {
  if (!str) {return false;}
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderLabel(label: string | undefined, linkClass: string): React.ReactNode {
  if (!label) {return null;}
  if (isValidURL(label)) {
    return (
      <a
        href={label}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
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
  const styles = useStyles2(getStyles);
  const normalizeLabel = (label: string) => label.trim().toLowerCase();

  if (!meta.phases || meta.phases.length === 0) {
    return <span className={styles.empty}>No phases</span>;
  }
  return (
    <div className={styles.pills}>
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
              className={cx(
                styles.pill,
                styles.pillCommon,
                isActive && styles.pillActive,
                overlapEnabled && styles.pillDisabled,
              )}
            >
              {p.label}
            </button>
          );
        }

        return (
          <span key={p.label} className={cx(styles.pill, styles.pillNeutral)}>
            {p.label}
          </span>
        );
      })}
    </div>
  );
}

export function CompareHeader({ items, commonPhases = [], onSelectCommonPhase, onSelectFullRange, overlapEnabled = false }: CompareHeaderProps) {
  const styles = useStyles2(getStyles);
  const [activeCommonPhase, setActiveCommonPhase] = React.useState<string | null>(null);

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
    <div className={styles.root}>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item, idx) => {
          const label = item.meta.label;
          const letter = String.fromCharCode(65 + idx);
          const title = item.title ?? `Snapshot ${letter}`;
          return (
            <div key={item.id} className={styles.card}>
              <div className={styles.title}>{title}</div>
              <div className={styles.idRow}>
                <b>ID:</b>
                <span className={styles.idText}>{item.id}</span>
                <CopyButton text={item.id} />
              </div>
              <div className={styles.metaRow}>
                <b>Server Version:</b> {item.meta.version}
              </div>
              {label && (
                <div className={styles.metaRow}>
                  <b>Label:</b> {renderLabel(label, styles.labelLink)}
                </div>
              )}
              <div className={styles.phasesWrap}>
                <b className={styles.phasesHeading}>Phases:</b>
                <div className={styles.phasesInner}>
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
    <IconButton
      name={copied ? 'check' : 'copy'}
      tooltip={copied ? 'Copied' : 'Copy ID'}
      aria-label="Copy snapshot ID"
      onClick={onCopy}
      size="md"
    />
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
    padding: ${theme.spacing(1.5, 0)};
  `,
  grid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    overflow-x: auto;
    overflow-y: visible;
  `,
  card: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1.25, 1.5)};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
    min-width: 0;
    color: ${theme.colors.text.primary};
  `,
  title: css`
    font-weight: ${theme.typography.fontWeightMedium};
    font-size: ${theme.typography.body.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  idRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.75)};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  idText: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    word-break: break-all;
  `,
  metaRow: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.primary};
  `,
  labelLink: css`
    color: ${theme.colors.text.link};
    text-decoration: none;
    word-break: break-word;
    &:hover {
      text-decoration: underline;
    }
  `,
  phasesWrap: css`
    margin-top: ${theme.spacing(0.5)};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  phasesHeading: css`
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  phasesInner: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(0.5)};
  `,
  pills: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(0.5)};
  `,
  pill: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    padding: ${theme.spacing(0.25, 1)};
    border-radius: ${theme.shape.radius.pill};
    line-height: 1.4;
  `,
  pillNeutral: css`
    background: ${theme.colors.background.canvas};
    border: 1px solid ${theme.colors.border.weak};
    color: ${theme.colors.text.secondary};
  `,
  pillCommon: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.medium};
    color: ${theme.colors.text.primary};
    cursor: pointer;
    &:hover {
      background: ${theme.colors.action.hover};
    }
  `,
  pillActive: css`
    background: ${theme.colors.primary.main};
    border-color: ${theme.colors.primary.border};
    color: ${theme.colors.primary.contrastText};
    &:hover {
      background: ${theme.colors.primary.shade};
    }
  `,
  pillDisabled: css`
    cursor: not-allowed;
    opacity: 0.7;
  `,
  empty: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    font-style: italic;
  `,
});
