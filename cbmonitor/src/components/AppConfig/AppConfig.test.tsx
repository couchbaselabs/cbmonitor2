import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { PluginType } from '@grafana/data';
import AppConfig, { AppConfigProps } from './AppConfig';
import { testIds } from 'components/testIds';

// The component talks to Grafana's backend on mount (reading /config/datasources)
// and on save (POSTing plugin settings), so the transport is stubbed and the
// captured requests are what the save-path assertions inspect.
const backendSrv = {
  get: jest.fn(),
  post: jest.fn(),
  fetch: jest.fn(),
};

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => backendSrv,
}));

type SavedSettings = {
  jsonData?: Record<string, any>;
  secureJsonData?: Record<string, any>;
};

/** settingsSaved returns the payload of the settings POST the form issued. */
const settingsSaved = (): SavedSettings => {
  const call = backendSrv.fetch.mock.calls.find(
    ([req]: [any]) => typeof req?.url === 'string' && req.url.includes('/settings')
  );
  if (!call) {
    throw new Error('the form did not POST plugin settings');
  }
  return call[0].data as SavedSettings;
};

const renderConfig = (jsonData: Record<string, any> = {}, secureJsonFields: Record<string, boolean> = {}) => {
  const plugin = {
    meta: {
      id: 'cbmonitor',
      name: 'cbmonitor',
      type: PluginType.app,
      enabled: false,
      jsonData,
      secureJsonFields,
    },
  };
  // @ts-ignore - addConfigPage()/setChannelSupport() aren't needed for these tests
  render(<AppConfig plugin={plugin} query={{} as AppConfigProps['query']} />);
};

describe('Components/AppConfig', () => {
  // A successful save reloads the page. jsdom can't navigate and won't let
  // location.reload be stubbed, so its one complaint is filtered out; every
  // other error still surfaces.
  const realConsoleError = console.error;
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (args.some((a) => String(a).includes('Not implemented: navigation'))) {
        return;
      }
      realConsoleError(...args);
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    backendSrv.get.mockResolvedValue({});
    backendSrv.post.mockResolvedValue({});
    backendSrv.fetch.mockReturnValue(of({ data: {} }));
  });

  test('renders the settings groups', () => {
    renderConfig();

    expect(screen.queryByRole('group', { name: /couchbase server/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /snapshots/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /couchbase metrics keyspace/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /prometheus data source/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /query gateway/i })).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.submit)).toBeInTheDocument();
  });

  test('snapshots bucket field hidden when snapshots toggle is off (default)', () => {
    renderConfig();

    expect(screen.queryByTestId(testIds.appConfig.snapshotsEnabled)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.snapshotsBucket)).not.toBeInTheDocument();
  });

  test('couchbase metrics bucket field hidden when toggle is off (default)', () => {
    renderConfig();

    expect(screen.queryByTestId(testIds.appConfig.couchbaseDsEnabled)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.couchbaseDsBucket)).not.toBeInTheDocument();
  });

  test('prometheus URL field visible when prometheus datasource is enabled (default)', () => {
    renderConfig();

    expect(screen.queryByTestId(testIds.appConfig.prometheusDsUrl)).toBeInTheDocument();
  });

  test('gateway URL and overlap fields appear only once the gateway is enabled', async () => {
    renderConfig();

    expect(screen.queryByTestId(testIds.appConfig.gatewayEnabled)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.gatewayUrl)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.gatewayOverlap)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(testIds.appConfig.gatewayEnabled));

    expect(screen.queryByTestId(testIds.appConfig.gatewayUrl)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.gatewayOverlap)).toBeInTheDocument();
  });

  test('gateway settings are shown from stored jsonData', () => {
    renderConfig({ gateway: { enabled: true, url: 'http://datasource-gateway:8090', overlap: true } });

    expect(screen.getByTestId(testIds.appConfig.gatewayUrl)).toHaveValue('http://datasource-gateway:8090');
  });

  // Grafana replaces jsonData wholesale on save, so a form that omits the
  // gateway block silently disables the gateway and the overlap comparison the
  // next time anyone presses Save.
  test('saving preserves the stored gateway settings', async () => {
    renderConfig({
      prometheusDatasource: { enabled: true, isDefault: true, url: 'http://mimir:9009/prometheus' },
      gateway: { enabled: true, url: 'http://datasource-gateway:8090', overlap: true },
    });

    await userEvent.click(screen.getByTestId(testIds.appConfig.submit));

    await waitFor(() => {
      expect(settingsSaved().jsonData?.gateway).toEqual({
        enabled: true,
        url: 'http://datasource-gateway:8090',
        overlap: true,
      });
    });
  });

  // Settings this form doesn't know about must survive a save too, so an older
  // plugin build can't strip a newer one's configuration.
  test('saving preserves jsonData keys the form does not own', async () => {
    renderConfig({ futureFeature: { enabled: true, tuning: 7 } });

    await userEvent.click(screen.getByTestId(testIds.appConfig.submit));

    await waitFor(() => {
      expect(settingsSaved().jsonData?.futureFeature).toEqual({ enabled: true, tuning: 7 });
    });
  });

  test('gateway edits are saved', async () => {
    renderConfig();

    await userEvent.click(screen.getByTestId(testIds.appConfig.gatewayEnabled));
    await userEvent.type(screen.getByTestId(testIds.appConfig.gatewayUrl), 'http://gw:8090');
    await userEvent.click(screen.getByTestId(testIds.appConfig.submit));

    await waitFor(() => {
      expect(settingsSaved().jsonData?.gateway).toEqual({
        enabled: true,
        url: 'http://gw:8090',
        overlap: true,
      });
    });
  });

  test('an enabled gateway with no URL blocks saving', async () => {
    renderConfig();

    await userEvent.click(screen.getByTestId(testIds.appConfig.gatewayEnabled));

    expect(screen.getByTestId(testIds.appConfig.submit)).toBeDisabled();
    expect(screen.getByText(/gateway url is required/i)).toBeInTheDocument();

    await userEvent.type(screen.getByTestId(testIds.appConfig.gatewayUrl), 'http://gw:8090');

    expect(screen.getByTestId(testIds.appConfig.submit)).toBeEnabled();
  });
});
