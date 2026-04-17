import React from 'react';
import { Icon } from '@grafana/ui';
import { SnapshotMetadata } from 'types/snapshot';

interface FormatMetadataSummaryProps {
    metadata: SnapshotMetadata;
    onSelectPhase?: (phaseLabel: string) => void;
    onSelectFullRange?: () => void;
    initialActivePhase?: string | null;
}

function isValidURL(str?: string): boolean {
    if (!str) {
        return false;
    }
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function renderLabel(label?: string): React.ReactNode {
    if (!label) {
        return null;
    }

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

export function FormatMetadataSummary(props: FormatMetadataSummaryProps) {
    const { metadata, onSelectPhase, onSelectFullRange, initialActivePhase } = props;
    const [copied, setCopied] = React.useState(false);
    const [activePhase, setActivePhase] = React.useState<string | null>(null);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        setActivePhase(initialActivePhase ?? null);
    }, [metadata.snapshotId, initialActivePhase]);

    React.useEffect(() => {
        // Cleanup: clear timeout on unmount to prevent state updates on unmounted component
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(metadata.snapshotId);
            // Clear any pending timeout before starting a new one
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            setCopied(true);
            timeoutRef.current = setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    return (
        <div style={{
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 8
        }}>
            <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 14 }}>Snapshot</div>
            <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <b>ID:</b>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{metadata.snapshotId}</span>
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
            </div>
            <div style={{ fontSize: 12 }}>
                <b>Server Version:</b> {metadata.version}
            </div>
            {metadata.label && (
                <div style={{ fontSize: 12 }}>
                    <b>Label:</b> {renderLabel(metadata.label)}
                </div>
            )}
            <div style={{ marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 12 }}>Phases:</b>
                </div>
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {!metadata.phases || metadata.phases.length === 0 ? (
                        <span style={{ color: '#888', fontSize: 12 }}>No phases</span>
                    ) : (
                        metadata.phases.map((p) => {
                            const isActive = activePhase === p.label;
                            return (
                                <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => {
                                        setActivePhase((prev) => {
                                            if (prev === p.label) {
                                                onSelectFullRange?.();
                                                return null;
                                            }
                                            onSelectPhase?.(p.label);
                                            return p.label;
                                        });
                                    }}
                                    title={`${p.label}: ${formatPhaseTime(p.ts_start)} - ${formatPhaseTime(p.ts_end)}`}
                                    style={{
                                        fontSize: 12,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: isActive ? '#065f46' : '#92400e',
                                        border: isActive ? '1px solid #10b981' : '1px solid #b45309',
                                        color: isActive ? '#ecfdf5' : '#ffedd5',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {p.label}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

function formatPhaseTime(timestamp?: string): string {
    if (!timestamp || timestamp.startsWith('now')) {
        return timestamp ?? '';
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
