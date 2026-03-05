import React, { useState } from "react";
import { Icon } from "@grafana/ui";
import { SnapshotMetadata } from "types/snapshot";

interface FormatMetadataSummaryProps {
    metadata: SnapshotMetadata;
}

// Helper function to check if a string is a valid URL
function isValidURL(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Helper function to render label - as link if URL, otherwise as text
function renderLabel(label: string | undefined): React.ReactNode {
    if (!label) {
        return null;
    }

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

export function FormatMetadataSummary(props: FormatMetadataSummaryProps) {
    const { metadata } = props;
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const copySnapshotId = () => {
        navigator.clipboard.writeText(metadata.snapshotId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <b>Snapshot ID:</b>{' '}
                    <span
                        onClick={copySnapshotId}
                        style={{ cursor: 'pointer' }}
                        title="Click to copy"
                    >
                        {metadata.snapshotId}
                        <Icon name={copied ? "check" : "copy"} style={{ marginLeft: '4px' }} />
                    </span>
                    <br /> <b>Server Version:</b> {metadata.version}
                    {metadata.phases && metadata.phases.length > 0 && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#888' }}>
                            ({metadata.phases.length} phases available in time picker)
                        </span>
                    )}
                    <span
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{ marginLeft: '10px', cursor: 'pointer' }}
                        title={isExpanded ? "Show less" : "Show more"}
                    >
                        <Icon name={isExpanded ? "angle-up" : "angle-down"} />
                    </span>
                </div>
            </div>
            {isExpanded && (
                <div style={{ marginTop: '8px' }}>
                    <div>
                        <b>Services:</b> {metadata.services.join(', ')}
                    </div>
                    {metadata.label && (
                        <div style={{ marginTop: '4px' }}>
                            <b>Label:</b> {renderLabel(metadata.label)}
                        </div>
                    )}
                    {metadata.phases && metadata.phases.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                            <b>Phases:</b> {metadata.phases.map((p) =>
                                `📍 ${p.label}: ${formatPhaseTime(p.ts_start)} - ${formatPhaseTime(p.ts_end)}`
                            ).join(' , ')}
                        </div>
                    )}
                    {metadata.clusters && metadata.clusters.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                            <b>Clusters:</b> {metadata.clusters.map((c) =>
                                `🖥️ ${c.name || 'unnamed'} (${c.uid})${c.targets ? ` - ${c.targets.length} nodes` : ''}`
                            ).join(' , ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatPhaseTime(timestamp: string): string {
    if (!timestamp || timestamp.startsWith("now")) {
        return timestamp;
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
