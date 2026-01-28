import React from 'react';
import { AppRootProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import { CB_DATASOURCE_REF } from '../../constants';
import { SceneApp, useSceneApp } from '@grafana/scenes';
import { Alert } from '@grafana/ui';
import { PluginPropsContext } from 'utils/utils.plugin';
import { snapshotPage } from 'components/SnapshotDisplay/snapshotInstance';
import { comparisonPage } from '../SnapshotDisplay/comparisonInstance';

// Defines the app and its pages
function getCBMonitorApp(){
  return new SceneApp({
    pages: [snapshotPage, comparisonPage],
    urlSyncOptions: {
      updateUrlOnInit: false,
      createBrowserHistorySteps: true,
    },
  });
}

// The main app component that renders the app and its pages
function CBMonitorHome() {
  const scene = useSceneApp(getCBMonitorApp);

  return (
    <> {/* For debugging we list all installed datasources, as id mismatch could be the reason we cannot see the datasource */}
      {!config.datasources[CB_DATASOURCE_REF.uid] && (
        <Alert title={`${CB_DATASOURCE_REF.type} is missing`}>
          <code>{JSON.stringify(CB_DATASOURCE_REF)}</code> datasource is required to use this app.
          Available datasources:
          <ul>
            {Object.values(config.datasources).map((datasource) => (
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
