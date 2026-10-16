import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRootProps, PluginType } from '@grafana/data';
import { config } from '@grafana/runtime';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { PROM_DATASOURCE_REF } from '../../constants';
import { reloadForDatasource } from '../../services/datasourceBootstrap';

const backendSrv = { get: jest.fn() };
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => backendSrv,
}));
jest.mock('../../services/datasourceBootstrap', () => ({
  ...jest.requireActual('../../services/datasourceBootstrap'),
  reloadForDatasource: jest.fn(),
}));

const reconcile = (status: string, lastError?: string) => ({ reconciliation: { status, lastError } });
const withProm = () => {
  config.datasources = {
    Prometheus: { uid: PROM_DATASOURCE_REF.uid, name: 'Prometheus', type: 'prometheus' },
  } as unknown as typeof config.datasources;
};
const withoutProm = () => {
  config.datasources = {
    Other: { uid: 'something-else', name: 'Other', type: 'prometheus' },
  } as unknown as typeof config.datasources;
};

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

  beforeEach(() => {
    backendSrv.get.mockReset();
    (reloadForDatasource as jest.Mock).mockReset().mockReturnValue(true);
    sessionStorage.clear();
  });

  afterEach(() => {
    config.datasources = originalDatasources;
  });

  test('renders without an error', async () => {
    withProm();
    backendSrv.get.mockResolvedValue(reconcile('ok'));

    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /compare/i })).toBeInTheDocument());
  });

  // The landing page makes no backend call of its own, and the first backend
  // call after a Grafana start is what repoints the datasource, so every load
  // makes one even when the datasource exists.
  test('calls the plugin backend on load when the datasource is present', async () => {
    withProm();
    backendSrv.get.mockResolvedValue(reconcile('ok'));

    renderApp();

    await waitFor(() => expect(backendSrv.get).toHaveBeenCalled());
    expect(backendSrv.get.mock.calls[0][0]).toMatch(/\/config\/datasources$/);
    expect(screen.queryByText(/missing required datasource/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/setting up/i)).not.toBeInTheDocument();
  });

  test('waits for a fresh install to create the datasource, then reloads', async () => {
    withoutProm();
    backendSrv.get.mockResolvedValueOnce(reconcile('pending')).mockResolvedValue(reconcile('ok'));

    renderApp();

    expect(await screen.findByText(/setting up the prometheus datasource/i)).toBeInTheDocument();
    expect(screen.queryByText(/missing required datasource/i)).not.toBeInTheDocument();
    await waitFor(() => expect(reloadForDatasource).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  // Without session storage there is no guard against a reload loop, so the
  // page asks for a refresh instead of reloading itself.
  test('asks for a refresh when it cannot reload itself', async () => {
    withoutProm();
    (reloadForDatasource as jest.Mock).mockReturnValue(false);
    backendSrv.get.mockResolvedValue(reconcile('ok'));

    renderApp();

    expect(await screen.findByText(/refresh the page/i, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/setting up/i)).not.toBeInTheDocument();
  });

  // Every panel queries the single Prometheus datasource by this UID, so its
  // absence is called out rather than left to fail per-panel.
  test('explains a failed setup instead of reloading', async () => {
    withoutProm();
    backendSrv.get.mockResolvedValue(reconcile('error', 'refusing to reconcile prometheus with empty URL'));

    renderApp();

    await waitFor(() => expect(screen.getByText(/missing required datasource/i)).toBeInTheDocument());
    expect(screen.getByText(/refusing to reconcile prometheus with empty URL/)).toBeInTheDocument();
    // The available datasources are listed so the mismatch is diagnosable.
    expect(screen.getByText(/Other \(something-else\)/)).toBeInTheDocument();
    expect(reloadForDatasource).not.toHaveBeenCalled();
  });

  test('does not reload again when a reload just failed to bring the datasource', async () => {
    withoutProm();
    sessionStorage.setItem('cbmonitor:datasource-reload', String(Date.now()));
    backendSrv.get.mockResolvedValue(reconcile('ok'));

    renderApp();

    await waitFor(() => expect(screen.getByText(/missing required datasource/i)).toBeInTheDocument());
    expect(screen.queryByText(/setting up/i)).not.toBeInTheDocument();
    await waitFor(() => expect(backendSrv.get).toHaveBeenCalled());
    expect(reloadForDatasource).not.toHaveBeenCalled();
  });
});
