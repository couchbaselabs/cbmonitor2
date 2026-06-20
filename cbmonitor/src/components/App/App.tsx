import React, { useEffect } from 'react';
import { AppRootProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import { CB_DATASOURCE_REF, PROM_DATASOURCE_REF } from '../../constants';
import { SceneApp, useSceneApp } from '@grafana/scenes';
import { Alert } from '@grafana/ui';
import { PluginPropsContext } from 'utils/utils.plugin';
import { AppNavHeader } from '../AppNavHeader/AppNavHeader';
import { snapshotSearchPage, snapshotViewPage } from '../../pages/snapshotViewPage';
import { preferencesPage } from '../../pages/preferencesPage';
import { comparisonPage } from '../../components/SnapshotDisplay/comparisonInstance';
import { dataSourceService } from '../../services/datasourceService';

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

// The main app component that renders the app and its pages
function CBMonitorHome() {
  const scene = useSceneApp(getCBMonitorApp);

  // Initialize datasource configuration from backend when app mounts
  useEffect(() => {
    dataSourceService.initializeConfig().catch((error) => {
      console.error('[App] Failed to initialize datasource config:', error);
    });
  }, []);

  const datasources = Object.values(config.datasources);
  const haveCb = datasources.some((d) => d.uid === CB_DATASOURCE_REF.uid);
  const haveProm = datasources.some((d) => d.uid === PROM_DATASOURCE_REF.uid);

  return (
    <>
      {!haveCb && !haveProm && (
        <Alert title="Missing required datasource">
          <code>{JSON.stringify(CB_DATASOURCE_REF)}</code> or <code>{JSON.stringify(PROM_DATASOURCE_REF)}</code> datasource is required to use this app.
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
