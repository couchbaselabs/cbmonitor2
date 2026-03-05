import React, { useState } from 'react';
import { SceneObjectBase, SceneComponentProps, SceneObjectState } from '@grafana/scenes';
import { Combobox, ComboboxOption } from '@grafana/ui';
import { Cluster } from 'types/snapshot';

const ALL_CLUSTERS = '__all__';

interface ClusterToggleState extends SceneObjectState {
    clusters: Cluster[];
    onClusterChange?: (clusterId: string | null) => void;
}

export class ClusterToggle extends SceneObjectBase<ClusterToggleState> {
    static Component = ClusterToggleRenderer;

    constructor(state: ClusterToggleState) {
        super(state);
    }
}

function ClusterToggleRenderer({ model }: SceneComponentProps<ClusterToggle>) {
    const { clusters, onClusterChange } = model.useState();
    const [selectedCluster, setSelectedCluster] = useState<string>(ALL_CLUSTERS);

    // Build options with "All clusters" as default
    const options: Array<ComboboxOption<string>> = [
        {
            label: 'All clusters',
            value: ALL_CLUSTERS,
            description: 'Show metrics from all clusters',
        },
        ...clusters.map((cluster) => ({
            label: cluster.name || cluster.uid,
            value: cluster.uid,
            description: cluster.name ? `UUID: ${cluster.uid}` : undefined,
        })),
    ];

    const handleChange = (option: ComboboxOption<string> | null) => {
        const newValue = option?.value ?? ALL_CLUSTERS;
        setSelectedCluster(newValue);
        if (onClusterChange) {
            // Convert ALL_CLUSTERS back to null for the callback
            onClusterChange(newValue === ALL_CLUSTERS ? null : newValue);
        }
    };

    // Always render for debugging - show "No clusters" if empty
    const displayClusters = clusters || [];

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#8e8e8e' }}>Cluster:</span>
            {displayClusters.length === 0 ? (
                <span style={{ fontSize: '12px', color: '#666' }}>No clusters in metadata</span>
            ) : (
                <Combobox
                    options={options}
                    value={selectedCluster}
                    onChange={handleChange}
                    placeholder="All clusters"
                    width={25}
                />
            )}
        </div>
    );
}
