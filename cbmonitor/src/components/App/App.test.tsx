import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRootProps, PluginType } from '@grafana/data';
import { config } from '@grafana/runtime';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { PROM_DATASOURCE_REF } from '../../constants';

const renderApp = () => {
  const props = {
    basename: 'a/cbmonitor',
    meta: {
      id: 'cbmonitor',
      name: 'cbmonitor',
      type: PluginType.app,
      enabled: true,
      jsonData: {},
    },
    query: {},
    path: '',
    onNavChanged: jest.fn(),
  } as unknown as AppRootProps;

  return render(
    <MemoryRouter>
      <App {...props} />
    </MemoryRouter>
  );
};

describe('Components/App', () => {
  const originalDatasources = config.datasources;

  afterEach(() => {
    config.datasources = originalDatasources;
  });

  test('renders without an error', async () => {
    config.datasources = {
      Prometheus: { uid: PROM_DATASOURCE_REF.uid, name: 'Prometheus', type: 'prometheus' },
    } as unknown as typeof config.datasources;

    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /compare/i })).toBeInTheDocument());
  });

  // Every panel queries the single Prometheus datasource by this UID, so its
  // absence is called out rather than left to fail per-panel.
  test('warns when the Prometheus datasource is missing', async () => {
    config.datasources = {
      Other: { uid: 'something-else', name: 'Other', type: 'prometheus' },
    } as unknown as typeof config.datasources;

    renderApp();

    await waitFor(() => expect(screen.getByText(/missing required datasource/i)).toBeInTheDocument());
    // The available datasources are listed so the mismatch is diagnosable.
    expect(screen.getByText(/Other \(something-else\)/)).toBeInTheDocument();
  });

  test('no warning when the Prometheus datasource is present', async () => {
    config.datasources = {
      Prometheus: { uid: PROM_DATASOURCE_REF.uid, name: 'Prometheus', type: 'prometheus' },
    } as unknown as typeof config.datasources;

    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /compare/i })).toBeInTheDocument());
    expect(screen.queryByText(/missing required datasource/i)).not.toBeInTheDocument();
  });
});
