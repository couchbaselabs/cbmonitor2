import React from 'react';
import { render, screen } from '@testing-library/react';
import { PluginType } from '@grafana/data';
import AppConfig, { AppConfigProps } from './AppConfig';
import { testIds } from 'components/testIds';

describe('Components/AppConfig', () => {
  let props: AppConfigProps;

  beforeEach(() => {
    jest.resetAllMocks();

    props = {
      plugin: {
        meta: {
          id: 'cbmonitor',
          name: 'cbmonitor',
          type: PluginType.app,
          enabled: true,
          jsonData: {},
        },
      },
      query: {},
    } as unknown as AppConfigProps;
  });

  test('renders the four settings groups', () => {
    const plugin = { meta: { ...props.plugin.meta, enabled: false } };

    // @ts-ignore - We don't need to provide `addConfigPage()` and `setChannelSupport()` for these tests
    render(<AppConfig plugin={plugin} query={props.query} />);

    expect(screen.queryByRole('group', { name: /couchbase server/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /snapshots/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /couchbase data source/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /prometheus data source/i })).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.submit)).toBeInTheDocument();
  });

  test('snapshots bucket field hidden when snapshots toggle is off (default)', () => {
    const plugin = { meta: { ...props.plugin.meta, enabled: false } };
    // @ts-ignore
    render(<AppConfig plugin={plugin} query={props.query} />);

    expect(screen.queryByTestId(testIds.appConfig.snapshotsEnabled)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.snapshotsBucket)).not.toBeInTheDocument();
  });

  test('couchbase datasource bucket field hidden when toggle is off (default)', () => {
    const plugin = { meta: { ...props.plugin.meta, enabled: false } };
    // @ts-ignore
    render(<AppConfig plugin={plugin} query={props.query} />);

    expect(screen.queryByTestId(testIds.appConfig.couchbaseDsEnabled)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.couchbaseDsBucket)).not.toBeInTheDocument();
  });
});
