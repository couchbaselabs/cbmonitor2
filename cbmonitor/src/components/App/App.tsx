import React from 'react';
import { AppRootProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import { PROM_DATASOURCE_REF } from '../../constants';
import { SceneApp, useSceneApp } from '@grafana/scenes';
import { Alert } from '@grafana/ui';
import { PluginPropsContext } from 'utils/utils.plugin';
import { snapshotSearchPage, snapshotViewPage } from '../../pages/snapshotViewPage';
import { preferencesPage } from '../../pages/preferencesPage';
import { comparisonPage } from '../../components/SnapshotDisplay/comparisonInstance';

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

  const datasources = Object.values(config.datasources);
  const haveProm = datasources.some((d) => d.uid === PROM_DATASOURCE_REF.uid);

  return (
    <>
      {!haveProm && (
        <Alert title="Missing required datasource">
          The <code>{JSON.stringify(PROM_DATASOURCE_REF)}</code> datasource is required to use this app.
          Available datasources:
          <ul>
            {datasources.map((datasource) => (
              <li key={datasource.uid}>{datasource.name} ({datasource.uid})</li>
            ))}
          </ul>
        </Alert>
      )}

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
