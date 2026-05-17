import React, { useCallback, useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2 } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { SceneObjectBase, SceneObjectState, SceneComponentProps } from '@grafana/scenes';
import {
    Alert,
    Button,
    ConfirmModal,
    Field,
    IconButton,
    Input,
    RadioButtonGroup,
    Stack,
    Switch,
    useStyles2,
} from '@grafana/ui';
import {
    getKioskPref,
    setKioskPref,
    getThemePref,
    setThemePref,
    type ThemePref,
    getMaxCachedSnapshotsPref,
    setMaxCachedSnapshotsPref,
    MAX_CACHED_SNAPSHOTS_MIN,
    MAX_CACHED_SNAPSHOTS_MAX,
} from '../../userPrefs';
import { snapshotService } from '../../services/snapshotService';
import { snapshotCacheStore, SnapshotCacheEntry } from '../../services/snapshotCache';
import { prefixRoute, ROUTES } from '../../utils/utils.routing';

export class PreferencesScene extends SceneObjectBase<SceneObjectState> {
    public static Component = PreferencesRenderer;
}

const themeOptions: Array<{ label: string; value: ThemePref; description?: string }> = [
    { label: 'System', value: 'system', description: 'Follow your OS light/dark setting' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
];

function PreferencesRenderer(_props: SceneComponentProps<PreferencesScene>) {
    const styles = useStyles2(getStyles);
    const [kiosk, setKiosk] = useState<boolean>(getKioskPref());
    const [theme, setTheme] = useState<ThemePref>(getThemePref());

    const onToggleKiosk = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.currentTarget.checked;
        setKiosk(next);
        setKioskPref(next);
    };

    const onChangeTheme = (next: ThemePref) => {
        setTheme(next);
        setThemePref(next);
        // Reload so Grafana picks up the new ?theme= URL param immediately.
        // The userPrefs preload hook runs before React mounts, so a full
        // reload is the simplest way to apply the theme everywhere.
        window.location.reload();
    };

    return (
        <div className={styles.container}>
            <Stack direction="column" gap={2}>
                <h2 className={styles.heading}>User Preferences</h2>

                <Alert severity="info" title="Browser-only preferences">
                    These settings are stored in this browser only. They apply to anyone using
                    this browser (including anonymous sessions) and do not sync across devices.
                </Alert>

                <Field
                    label="Kiosk mode by default"
                    description="Hide Grafana navigation by default when using the app. You can still toggle kiosk per-page with the keyboard shortcut 'd k' or by clicking `Esc`."
                >
                    <Switch value={kiosk} onChange={onToggleKiosk} />
                </Field>

                <Field
                    label="Theme"
                    description="Override the Grafana theme for this browser. System follows your OS light/dark preference. More theme selection is available in Grafana settings for logged in users."
                >
                    <RadioButtonGroup<ThemePref>
                        options={themeOptions}
                        value={theme}
                        onChange={onChangeTheme}
                    />
                </Field>

                <CachedSnapshotsSection />
            </Stack>
        </div>
    );
}

function CachedSnapshotsSection() {
    const styles = useStyles2(getStyles);
    const [maxEntries, setMaxEntries] = useState<number>(getMaxCachedSnapshotsPref());
    const [entries, setEntries] = useState<SnapshotCacheEntry[]>([]);
    const [totalSize, setTotalSize] = useState<number>(0);
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);

    const reload = useCallback(async () => {
        const [list, total] = await Promise.all([
            snapshotCacheStore.list(),
            snapshotCacheStore.totalSizeBytes(),
        ]);
        setEntries(list);
        setTotalSize(total);
    }, []);

    useEffect(() => {
        void reload();
        const unsubscribe = snapshotService.onSnapshotRefreshed(() => {
            void reload();
        });
        return unsubscribe;
    }, [reload]);

    const onChangeMaxEntries = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.currentTarget.value;
        if (raw === '') {
            return;
        }
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) {
            return;
        }
        const clamped = setMaxCachedSnapshotsPref(parsed);
        setMaxEntries(clamped);
        await snapshotCacheStore.enforceMaxEntries();
        await reload();
    };

    const onTogglePin = async (entry: SnapshotCacheEntry) => {
        await snapshotCacheStore.setPinned(entry.snapshotId, !entry.pinned);
        await reload();
    };

    const onDelete = async (entry: SnapshotCacheEntry) => {
        await snapshotCacheStore.delete(entry.snapshotId);
        await reload();
    };

    const onClearAll = async () => {
        await snapshotCacheStore.clearAll();
        setConfirmClearOpen(false);
        await reload();
    };

    const onOpen = (entry: SnapshotCacheEntry) => {
        locationService.push(`${prefixRoute(ROUTES.CBMonitor)}/${entry.snapshotId}`);
    };

    return (
        <div className={styles.cacheSection}>
            <h3 className={styles.subheading}>Cached snapshots</h3>

            <Stack direction="row" gap={2} alignItems="flex-start">
                <Field
                    label="Keep last N cached snapshots"
                    description="Set to 0 to disable caching. Pinned snapshots are kept regardless."
                >
                    <Input
                        type="number"
                        min={MAX_CACHED_SNAPSHOTS_MIN}
                        max={MAX_CACHED_SNAPSHOTS_MAX}
                        step={1}
                        value={maxEntries}
                        onChange={onChangeMaxEntries}
                        width={12}
                    />
                </Field>
                <Field label="Total storage used">
                    <div className={styles.totalSize}>{formatBytes(totalSize)}</div>
                </Field>
            </Stack>

            {entries.length === 0 ? (
                <div className={styles.empty}>No cached snapshots.</div>
            ) : (
                <div className={styles.list}>
                    {entries.map((entry) => (
                        <CacheRow
                            key={entry.snapshotId}
                            entry={entry}
                            onOpen={() => onOpen(entry)}
                            onTogglePin={() => onTogglePin(entry)}
                            onDelete={() => onDelete(entry)}
                        />
                    ))}
                </div>
            )}

            <div>
                <Button
                    variant="destructive"
                    fill="outline"
                    size="sm"
                    icon="trash-alt"
                    disabled={entries.length === 0}
                    onClick={() => setConfirmClearOpen(true)}
                >
                    Clear all cached snapshots
                </Button>
            </div>

            <ConfirmModal
                isOpen={confirmClearOpen}
                title="Clear all cached snapshots"
                body="This removes every cached snapshot from this browser, including pinned ones. Continue?"
                confirmText="Clear all"
                onConfirm={onClearAll}
                onDismiss={() => setConfirmClearOpen(false)}
            />
        </div>
    );
}

interface CacheRowProps {
    entry: SnapshotCacheEntry;
    onOpen: () => void;
    onTogglePin: () => void;
    onDelete: () => void;
}

function CacheRow({ entry, onOpen, onTogglePin, onDelete }: CacheRowProps) {
    const styles = useStyles2(getStyles);
    const label = entry.metadata.label;
    return (
        <div className={styles.row}>
            <span className={entry.pinned ? styles.pinned : styles.unpinned}>
                <IconButton
                    name={entry.pinned ? 'favorite' : 'star'}
                    tooltip={entry.pinned ? 'Unpin (allow LRU to evict)' : 'Pin (exempt from LRU)'}
                    aria-label={entry.pinned ? 'Unpin snapshot' : 'Pin snapshot'}
                    onClick={onTogglePin}
                    size="md"
                />
            </span>
            <button type="button" className={styles.idButton} onClick={onOpen} title={`Open ${entry.snapshotId}`}>
                {entry.snapshotId}
            </button>
            <span className={styles.label}>{label || '—'}</span>
            <span className={styles.size}>{formatBytes(entry.sizeBytes)}</span>
            <span className={styles.lastAccessed} title={new Date(entry.lastAccessedAt).toISOString()}>
                {formatRelative(entry.lastAccessedAt)}
            </span>
            <IconButton
                name="trash-alt"
                tooltip="Remove from cache"
                aria-label="Remove from cache"
                onClick={onDelete}
                size="md"
            />
        </div>
    );
}

function formatBytes(n: number): string {
    if (n < 1024) {
        return `${n} B`;
    }
    if (n < 1024 * 1024) {
        return `${(n / 1024).toFixed(1)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelative(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 0) {
        return 'just now';
    }
    const seconds = Math.floor(delta / 1000);
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days}d ago`;
    }
    return dateTime(ts).format('YYYY-MM-DD');
}

const getStyles = (theme: GrafanaTheme2) => ({
    container: css`
        max-width: 720px;
        padding: ${theme.spacing(3)};
    `,
    heading: css`
        margin: 0 0 ${theme.spacing(1)} 0;
        color: ${theme.colors.text.primary};
    `,
    subheading: css`
        margin: ${theme.spacing(2)} 0 0 0;
        color: ${theme.colors.text.primary};
        font-size: ${theme.typography.h4.fontSize};
    `,
    cacheSection: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(2)};
    `,
    totalSize: css`
        padding: ${theme.spacing(0.75, 1)};
        font-family: ${theme.typography.fontFamilyMonospace};
        color: ${theme.colors.text.primary};
    `,
    empty: css`
        padding: ${theme.spacing(2)};
        color: ${theme.colors.text.secondary};
        background: ${theme.colors.background.secondary};
        border-radius: ${theme.shape.radius.default};
        text-align: center;
    `,
    list: css`
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing(0.5)};
    `,
    row: css`
        display: grid;
        grid-template-columns: auto minmax(140px, 1fr) minmax(80px, 1.5fr) 70px 90px auto;
        align-items: center;
        gap: ${theme.spacing(1)};
        padding: ${theme.spacing(0.5, 1)};
        background: ${theme.colors.background.secondary};
        border-radius: ${theme.shape.radius.default};
    `,
    pinned: css`
        color: ${theme.colors.warning.text};
    `,
    unpinned: css`
        color: ${theme.colors.text.secondary};
    `,
    idButton: css`
        background: none;
        border: none;
        padding: 0;
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.link};
        text-align: left;
        cursor: pointer;
        word-break: break-all;
        &:hover {
            text-decoration: underline;
        }
    `,
    label: css`
        color: ${theme.colors.text.secondary};
        font-size: ${theme.typography.bodySmall.fontSize};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `,
    size: css`
        font-family: ${theme.typography.fontFamilyMonospace};
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
        text-align: right;
    `,
    lastAccessed: css`
        font-size: ${theme.typography.bodySmall.fontSize};
        color: ${theme.colors.text.secondary};
    `,
});
