import React, { useEffect, useState } from 'react';
import { AppRootProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import { PROM_DATASOURCE_REF } from '../../constants';
import { SceneApp, useSceneApp } from '@grafana/scenes';
import { Alert } from '@grafana/ui';
import { PluginPropsContext } from 'utils/utils.plugin';
import { AppNavHeader } from '../AppNavHeader/AppNavHeader';
import { snapshotSearchPage, snapshotViewPage } from '../../pages/snapshotViewPage';
import { preferencesPage } from '../../pages/preferencesPage';
import { comparisonPage } from '../../components/SnapshotDisplay/comparisonInstance';
import {
  ReconcileState,
  awaitReconcile,
  clearReloadMarker,
  recentlyReloaded,
  reloadForDatasource,
  triggerReconcile,
} from '../../services/datasourceBootstrap';

// Defines the app and its pages
function getCBMonitorApp(){
  return new SceneApp({
    pages: [
      snapshotSearchPage, // /snapshots (search landing)
      snapshotViewPage,   // /snapshots/:snapshotId/* (viewer + future drilldowns)
      comparisonPage,     // /compare
      preferencesPage,    // /preferences
    ],
    urlSyncOptions: {
      updateUrlOnInit: false,
      createBrowserHistorySteps: true,
    },
  });
}

type DatasourceSetup = { phase: 'ready' } | { phase: 'waiting' } | { phase: 'missing'; state?: ReconcileState };

// The main app component that renders the app and its pages
function CBMonitorHome() {
  const scene = useSceneApp(getCBMonitorApp);

  const datasources = Object.values(config.datasources);
  const haveProm = datasources.some((d) => d.uid === PROM_DATASOURCE_REF.uid);
  const [setup, setSetup] = useState<DatasourceSetup>(() =>
    haveProm ? { phase: 'ready' } : recentlyReloaded() ? { phase: 'missing' } : { phase: 'waiting' }
  );

  useEffect(() => {
    if (haveProm) {
      clearReloadMarker();
      triggerReconcile();
      return;
    }
    let cancelled = false;
    const alreadyReloaded = recentlyReloaded();
    awaitReconcile().then((state) => {
      if (cancelled) {
        return;
      }
      if (state.status === 'ok' && !alreadyReloaded) {
        reloadForDatasource();
        return;
      }
      setSetup({ phase: 'missing', state });
    });
    return () => {
      cancelled = true;
    };
  }, [haveProm]);

  return (
    <>
      {setup.phase === 'waiting' && (
        <Alert title="Setting up the Prometheus datasource" severity="info">
          The plugin creates its datasource on first use after Grafana starts. This page reloads when it is ready.
        </Alert>
      )}
      {setup.phase === 'missing' && (
        <Alert title="Missing required datasource">
          The <code>{JSON.stringify(PROM_DATASOURCE_REF)}</code> datasource is required to use this app.
          {setup.state && (
            <p>
              Datasource setup reported <code>{setup.state.status}</code>
              {setup.state.lastError ? `: ${setup.state.lastError}` : '.'} Check the app configuration page.
            </p>
          )}
          Available datasources:
          <ul>
            {datasources.map((datasource) => (
              <li key={datasource.uid}>{datasource.name} ({datasource.uid})</li>
            ))}
          </ul>
        </Alert>
      )}

      <AppNavHeader />
      {/* Render the app and its pages */}
      <scene.Component model={scene} />
    </>
  );
}

function App(props: AppRootProps) {
  return (
    <PluginPropsContext.Provider value={props}>
      <CBMonitorHome />
    </PluginPropsContext.Provider>
  );
}

export default App;
