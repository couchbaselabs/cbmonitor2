import React, { ChangeEvent, useMemo, useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import {
  Alert,
  Badge,
  Button,
  Field,
  FieldSet,
  Input,
  SecretInput,
  Spinner,
  Switch,
  useStyles2,
} from '@grafana/ui';
import { testIds } from '../testIds';
import { dataSourceService } from '../../services/datasourceService';
import { DataSourceType } from '../../types/datasource';
import { API_BASE_URL, CB_DATASOURCE_REF, PROM_DATASOURCE_REF } from '../../constants';

// Mirror of the Go PluginSettings JSON shape, minus the password (which lives
// in secureJsonData and is never readable from the frontend).
type CouchbaseServerJsonData = {
  connectionString?: string;
  username?: string;
};

type SnapshotsJsonData = {
  enabled?: boolean;
  bucket?: string;
};

type CouchbaseDatasourceJsonData = {
  enabled?: boolean;
  bucket?: string;
};

type PrometheusDatasourceJsonData = {
  enabled?: boolean;
  isDefault?: boolean;
  url?: string;
};

type AppPluginSettings = {
  couchbaseServer?: CouchbaseServerJsonData;
  snapshots?: SnapshotsJsonData;
  couchbaseDatasource?: CouchbaseDatasourceJsonData;
  prometheusDatasource?: PrometheusDatasourceJsonData;
};

type SecureFields = {
  couchbasePassword?: boolean;
};

type State = {
  couchbaseServer: { connectionString: string; username: string };
  snapshots: { enabled: boolean; bucket: string };
  couchbaseDatasource: { enabled: boolean; bucket: string };
  prometheusDatasource: { enabled: boolean; isDefault: boolean; url: string };
  password: string;
  isPasswordSet: boolean;
};

type ProbeResult = { ok: boolean; message: string; latencyMs?: number };

export interface AppConfigProps extends PluginConfigPageProps<AppPluginMeta<AppPluginSettings>> {}

const AppConfig = ({ plugin }: AppConfigProps) => {
  const s = useStyles2(getStyles);
  const { enabled, pinned, jsonData, secureJsonFields } = plugin.meta;
  const secure = (secureJsonFields ?? {}) as SecureFields;

  const [state, setState] = useState<State>({
    couchbaseServer: {
      connectionString: jsonData?.couchbaseServer?.connectionString ?? '',
      username: jsonData?.couchbaseServer?.username ?? '',
    },
    snapshots: {
      enabled: jsonData?.snapshots?.enabled ?? false,
      bucket: jsonData?.snapshots?.bucket ?? '',
    },
    couchbaseDatasource: {
      enabled: jsonData?.couchbaseDatasource?.enabled ?? false,
      bucket: jsonData?.couchbaseDatasource?.bucket ?? '',
    },
    prometheusDatasource: {
      enabled: jsonData?.prometheusDatasource?.enabled ?? true,
      isDefault: jsonData?.prometheusDatasource?.isDefault ?? true,
      url: jsonData?.prometheusDatasource?.url ?? '',
    },
    password: '',
    isPasswordSet: Boolean(secure.couchbasePassword),
  });

  const [isTesting, setIsTesting] = useState(false);
  const [cbResult, setCbResult] = useState<ProbeResult | null>(null);
  const [dsResult, setDsResult] = useState<ProbeResult | null>(null);
  const [dsUid, setDsUid] = useState<string>(PROM_DATASOURCE_REF.uid);

  const needsCouchbaseServer = state.snapshots.enabled || state.couchbaseDatasource.enabled;
  const validationError = useMemo(() => validate(state), [state]);
  const isSubmitDisabled = Boolean(validationError);

  const runProbe = async () => {
    setIsTesting(true);
    setCbResult(null);
    setDsResult(null);

    const cfg = await dataSourceService.getDataSourceConfig();
    const uid =
      cfg.defaultDataSource === DataSourceType.Couchbase
        ? CB_DATASOURCE_REF.uid
        : PROM_DATASOURCE_REF.uid;
    setDsUid(uid);

    const probes: Array<Promise<unknown>> = [];

    if (state.snapshots.enabled) {
      probes.push(
        getBackendSrv()
          .get(`${API_BASE_URL}/healthcheck/connection`)
          .then((r: any) =>
            setCbResult({
              ok: Boolean(r?.couchbase?.ok),
              message: r?.couchbase?.ok
                ? `Bucket "${r.couchbase.bucket}" reachable at ${r.couchbase.connectionString}`
                : r?.couchbase?.error ?? 'unknown error',
              latencyMs: r?.couchbase?.latencyMs,
            })
          )
          .catch((e: any) =>
            setCbResult({
              ok: false,
              message: e?.data?.message ?? e?.message ?? 'request failed',
            })
          )
      );
    }

    probes.push(
      getBackendSrv()
        .get(`/api/datasources/uid/${uid}/health`)
        .then((r: any) =>
          setDsResult({
            ok: typeof r?.status === 'string' && r.status.toLowerCase() === 'ok',
            message: r?.message ?? `Datasource ${uid} healthy`,
          })
        )
        .catch((e: any) =>
          setDsResult({
            ok: false,
            message: e?.data?.message ?? e?.message ?? 'unknown error',
          })
        )
    );

    await Promise.allSettled(probes);
    setIsTesting(false);
  };

  const onChangeCouchbaseServer = (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      couchbaseServer: { ...state.couchbaseServer, [event.target.name]: event.target.value.trim() },
    });
  };

  const onChangePassword = (event: ChangeEvent<HTMLInputElement>) => {
    setState({ ...state, password: event.target.value });
  };

  const onResetPassword = () => {
    setState({ ...state, password: '', isPasswordSet: false });
  };

  const onChangeBucket = (group: 'snapshots' | 'couchbaseDatasource') => (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [group]: { ...state[group], bucket: event.target.value.trim() },
    });
  };

  const toggleSnapshots = (e: React.FormEvent<HTMLInputElement>) => {
    setState({ ...state, snapshots: { ...state.snapshots, enabled: e.currentTarget.checked } });
  };
  const toggleCouchbaseDs = (e: React.FormEvent<HTMLInputElement>) => {
    setState({ ...state, couchbaseDatasource: { ...state.couchbaseDatasource, enabled: e.currentTarget.checked } });
  };
  const togglePromDs = (e: React.FormEvent<HTMLInputElement>) => {
    setState({ ...state, prometheusDatasource: { ...state.prometheusDatasource, enabled: e.currentTarget.checked } });
  };
  const togglePromDefault = (e: React.FormEvent<HTMLInputElement>) => {
    setState({ ...state, prometheusDatasource: { ...state.prometheusDatasource, isDefault: e.currentTarget.checked } });
  };
  const onChangePromUrl = (event: ChangeEvent<HTMLInputElement>) => {
    setState({ ...state, prometheusDatasource: { ...state.prometheusDatasource, url: event.target.value.trim() } });
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled) {
      return;
    }

    const nextJsonData: AppPluginSettings = {
      couchbaseServer: {
        connectionString: state.couchbaseServer.connectionString,
        username: state.couchbaseServer.username,
      },
      snapshots: {
        enabled: state.snapshots.enabled,
        bucket: state.snapshots.bucket,
      },
      couchbaseDatasource: {
        enabled: state.couchbaseDatasource.enabled,
        bucket: state.couchbaseDatasource.bucket,
      },
      prometheusDatasource: {
        enabled: state.prometheusDatasource.enabled,
        isDefault: state.prometheusDatasource.isDefault,
        url: state.prometheusDatasource.url,
      },
    };

    updatePluginAndReload(plugin.meta.id, {
      enabled,
      pinned,
      jsonData: nextJsonData,
      // Only send password if the user typed a new one; an empty secureJsonData
      // would clear the existing value on Grafana's side.
      secureJsonData: state.isPasswordSet
        ? undefined
        : {
          couchbasePassword: state.password,
          },
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <FieldSet label="Snapshots">
        <Field label="Enable snapshots" description="Read snapshot metadata from a Couchbase bucket.">
          <Switch
            value={state.snapshots.enabled}
            onChange={toggleSnapshots}
            data-testid={testIds.appConfig.snapshotsEnabled}
          />
        </Field>
        {state.snapshots.enabled && (
          <Field label="Metadata bucket name">
            <Input
              width={60}
              value={state.snapshots.bucket}
              placeholder="cbmonitor"
              onChange={onChangeBucket('snapshots')}
              data-testid={testIds.appConfig.snapshotsBucket}
            />
          </Field>
        )}
      </FieldSet>

      <FieldSet label="Couchbase data source" className={s.marginTop}>
        <Field
          label="Enable Couchbase data source"
          description="Use Couchbase as a metric source for the snapshots/compare timeseries data"
        >
          <Switch
            value={state.couchbaseDatasource.enabled}
            onChange={toggleCouchbaseDs}
            data-testid={testIds.appConfig.couchbaseDsEnabled}
          />
        </Field>
        {state.couchbaseDatasource.enabled && (
          <Field label="Metrics bucket name">
            <Input
              width={60}
              value={state.couchbaseDatasource.bucket}
              placeholder="cbmonitor"
              onChange={onChangeBucket('couchbaseDatasource')}
              data-testid={testIds.appConfig.couchbaseDsBucket}
            />
          </Field>
        )}
      </FieldSet>

      <FieldSet label="Couchbase server" className={s.marginTop}>
        <p className={s.colorWeak}>
          Connection details shared by Snapshots and the Couchbase metric data source.
          {!needsCouchbaseServer && ' Currently unused — no Couchbase-backed feature is enabled.'}
        </p>
        <Field label="Connection string" description="e.g. couchbase://host">
          <Input
            width={60}
            name="connectionString"
            value={state.couchbaseServer.connectionString}
            placeholder="couchbase://localhost"
            disabled={!needsCouchbaseServer}
            onChange={onChangeCouchbaseServer}
            data-testid={testIds.appConfig.couchbaseConnectionString}
          />
        </Field>
        <Field label="Username">
          <Input
            width={60}
            name="username"
            value={state.couchbaseServer.username}
            placeholder="Administrator"
            disabled={!needsCouchbaseServer}
            onChange={onChangeCouchbaseServer}
            data-testid={testIds.appConfig.couchbaseUsername}
          />
        </Field>
        <Field label="Password">
          <SecretInput
            width={60}
            name="couchbasePassword"
            value={state.password}
            isConfigured={state.isPasswordSet}
            placeholder="Couchbase server password"
            disabled={!needsCouchbaseServer}
            onChange={onChangePassword}
            onReset={onResetPassword}
            data-testid={testIds.appConfig.couchbasePassword}
          />
        </Field>
      </FieldSet>

      <FieldSet label="Prometheus data source" className={s.marginTop}>
        <Field label="Enable Prometheus data source">
          <Switch
            value={state.prometheusDatasource.enabled}
            onChange={togglePromDs}
            data-testid={testIds.appConfig.prometheusDsEnabled}
          />
        </Field>
        {state.prometheusDatasource.enabled && (
          <>
            <Field label="URL" description="Base URL of the Prometheus / Mimir endpoint, e.g. http://prometheus:9090">
              <Input
                width={60}
                value={state.prometheusDatasource.url}
                placeholder="http://prometheus:9090"
                onChange={onChangePromUrl}
                data-testid={testIds.appConfig.prometheusDsUrl}
              />
            </Field>
            <Field label="Use as default" description="When both data sources are enabled, prefer Prometheus.">
              <Switch
                value={state.prometheusDatasource.isDefault}
                onChange={togglePromDefault}
                data-testid={testIds.appConfig.prometheusDsDefault}
              />
            </Field>
          </>
        )}
      </FieldSet>

      {validationError && (
        <Alert severity="warning" title="Configuration incomplete" className={s.marginTop}>
          {validationError}
        </Alert>
      )}

      <div className={s.marginTop}>
        <Button type="submit" data-testid={testIds.appConfig.submit} disabled={isSubmitDisabled}>
          Save settings
        </Button>
      </div>

      <FieldSet label="Connection test" className={s.marginTop}>
        <p className={s.colorWeak}>Probes any enabled Couchbase-backed feature plus the default Grafana datasource.</p>
        <div className={s.marginTop}>
          <Button
            variant="secondary"
            icon="sync"
            onClick={runProbe}
            disabled={isTesting}
            type="button"
            data-testid={testIds.appConfig.testConnection}
          >
            {isTesting ? (
              <>
                <Spinner inline /> Testing&hellip;
              </>
            ) : (
              'Test connection'
            )}
          </Button>
        </div>

        {cbResult && (
          <div className={s.resultRow} data-testid={testIds.appConfig.testCbResult}>
            <Badge
              text={cbResult.ok ? 'OK' : 'Fail'}
              color={cbResult.ok ? 'green' : 'red'}
              icon={cbResult.ok ? 'check' : 'times'}
            />
            <span className={s.resultLabel}>
              Snapshots bucket
              {typeof cbResult.latencyMs === 'number' ? ` (${cbResult.latencyMs} ms)` : ''}
            </span>
            {!cbResult.ok && (
              <Alert severity="error" title="Connection failed" className={s.resultAlert}>
                {cbResult.message}
              </Alert>
            )}
            {cbResult.ok && <span className={s.resultMessage}>{cbResult.message}</span>}
          </div>
        )}

        {dsResult && (
          <div className={s.resultRow} data-testid={testIds.appConfig.testDsResult}>
            <Badge
              text={dsResult.ok ? 'OK' : 'Fail'}
              color={dsResult.ok ? 'green' : 'red'}
              icon={dsResult.ok ? 'check' : 'times'}
            />
            <span className={s.resultLabel}>Default datasource (uid={dsUid})</span>
            {!dsResult.ok && (
              <Alert severity="error" title="Connection failed" className={s.resultAlert}>
                {dsResult.message}
              </Alert>
            )}
            {dsResult.ok && <span className={s.resultMessage}>{dsResult.message}</span>}
          </div>
        )}
      </FieldSet>
    </form>
  );
};

function validate(state: State): string | null {
  const needsServer = state.snapshots.enabled || state.couchbaseDatasource.enabled;
  if (needsServer) {
    if (!state.couchbaseServer.connectionString) {
      return 'Couchbase connection string is required when Snapshots or the Couchbase data source is enabled.';
    }
    if (!state.couchbaseServer.username) {
      return 'Couchbase username is required when Snapshots or the Couchbase data source is enabled.';
    }
    if (!state.isPasswordSet && !state.password) {
      return 'Couchbase password is required when Snapshots or the Couchbase data source is enabled.';
    }
  }
  if (state.snapshots.enabled && !state.snapshots.bucket) {
    return 'Snapshots bucket name is required.';
  }
  if (state.couchbaseDatasource.enabled && !state.couchbaseDatasource.bucket) {
    return 'Couchbase data source bucket name is required.';
  }
  if (state.prometheusDatasource.url) {
    try {
      const u = new URL(state.prometheusDatasource.url);
      if (!u.protocol || !u.host) {
        return 'Prometheus URL must be absolute (e.g. http://prometheus:9090).';
      }
    } catch {
      return 'Prometheus URL must be a valid URL (e.g. http://prometheus:9090).';
    }
  }
  return null;
}

export default AppConfig;

const getStyles = (theme: GrafanaTheme2) => ({
  colorWeak: css`
    color: ${theme.colors.text.secondary};
  `,
  marginTop: css`
    margin-top: ${theme.spacing(3)};
  `,
  resultRow: css`
    margin-top: ${theme.spacing(2)};
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${theme.spacing(1)};
  `,
  resultLabel: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  resultMessage: css`
    color: ${theme.colors.text.secondary};
  `,
  resultAlert: css`
    flex-basis: 100%;
    margin-top: ${theme.spacing(1)};
    margin-bottom: 0;
  `,
});

const updatePluginAndReload = async (pluginId: string, data: Partial<PluginMeta<AppPluginSettings>>) => {
  try {
    await updatePlugin(pluginId, data);
    // Trigger datasource reconciliation synchronously so the page reload
    // sees up-to-date datasources. Failure here is non-fatal — the UI
    // surfaces reconciliation status on the next /config/datasources read.
    try {
      await getBackendSrv().post(`${API_BASE_URL}/admin/reconcile-datasources`);
    } catch (e) {
      console.warn('Datasource reconciliation request failed; status will appear in the next page load', e);
    }
    window.location.reload();
  } catch (e) {
    console.error('Error while updating the plugin', e);
  }
};

const updatePlugin = async (pluginId: string, data: Partial<PluginMeta>) => {
  const response = await getBackendSrv().fetch({
    url: `/api/plugins/${pluginId}/settings`,
    method: 'POST',
    data,
  });

  return lastValueFrom(response);
};
