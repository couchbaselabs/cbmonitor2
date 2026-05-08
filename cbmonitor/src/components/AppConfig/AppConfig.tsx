import React, { ChangeEvent, useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Alert, Badge, Button, Field, FieldSet, Input, SecretInput, Spinner, useStyles2 } from '@grafana/ui';
import { testIds } from '../testIds';
import { dataSourceService } from '../../services/datasourceService';
import { DataSourceType } from '../../types/datasource';
import { API_BASE_URL, CB_DATASOURCE_REF, PROM_DATASOURCE_REF } from '../../constants';

type AppPluginSettings = {
  apiUrl?: string;
};

type State = {
  // The URL to reach our custom API.
  apiUrl: string;
  // Tells us if the API key secret is set.
  isApiKeySet: boolean;
  // A secret key for our custom API.
  apiKey: string;
};

type ProbeResult = { ok: boolean; message: string; latencyMs?: number };

export interface AppConfigProps extends PluginConfigPageProps<AppPluginMeta<AppPluginSettings>> {}

const AppConfig = ({ plugin }: AppConfigProps) => {
  const s = useStyles2(getStyles);
  const { enabled, pinned, jsonData, secureJsonFields } = plugin.meta;
  const [state, setState] = useState<State>({
    apiUrl: jsonData?.apiUrl || '',
    apiKey: '',
    isApiKeySet: Boolean(secureJsonFields?.apiKey),
  });

  const [isTesting, setIsTesting] = useState(false);
  const [cbResult, setCbResult] = useState<ProbeResult | null>(null);
  const [dsResult, setDsResult] = useState<ProbeResult | null>(null);
  const [dsUid, setDsUid] = useState<string>(PROM_DATASOURCE_REF.uid);

  const isSubmitDisabled = Boolean(!state.apiUrl || (!state.isApiKeySet && !state.apiKey));

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

    const cbProbe = getBackendSrv()
      .get(`${API_BASE_URL}/healthcheck/connection`)
      .then((r: any) => ({
        ok: Boolean(r?.couchbase?.ok),
        message: r?.couchbase?.ok
          ? `Bucket "${r.couchbase.bucket}" reachable at ${r.couchbase.connectionString}`
          : r?.couchbase?.error ?? 'unknown error',
        latencyMs: r?.couchbase?.latencyMs,
      }))
      .catch((e: any) => ({
        ok: false,
        message: e?.data?.message ?? e?.message ?? 'request failed',
      }));

    const dsProbe = getBackendSrv()
      .get(`/api/datasources/uid/${uid}/health`)
      .then((r: any) => ({
        ok: typeof r?.status === 'string' && r.status.toLowerCase() === 'ok',
        message: r?.message ?? `Datasource ${uid} healthy`,
      }))
      .catch((e: any) => ({
        ok: false,
        message: e?.data?.message ?? e?.message ?? 'unknown error',
      }));

    const [cb, ds] = await Promise.allSettled([cbProbe, dsProbe]);
    setCbResult(
      cb.status === 'fulfilled' ? cb.value : { ok: false, message: String((cb as any).reason) }
    );
    setDsResult(
      ds.status === 'fulfilled' ? ds.value : { ok: false, message: String((ds as any).reason) }
    );
    setIsTesting(false);
  };

  const onResetApiKey = () =>
    setState({
      ...state,
      apiKey: '',
      isApiKeySet: false,
    });

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [event.target.name]: event.target.value.trim(),
    });
  };

  const onSubmit = () => {
    if (isSubmitDisabled) {
      return;
    }

    updatePluginAndReload(plugin.meta.id, {
      enabled,
      pinned,
      jsonData: {
        apiUrl: state.apiUrl,
      },
      // This cannot be queried later by the frontend.
      // We don't want to override it in case it was set previously and left untouched now.
      secureJsonData: state.isApiKeySet
        ? undefined
        : {
            apiKey: state.apiKey,
          },
    });
  };

  return (
    <>
      <form onSubmit={onSubmit}>
        <FieldSet label="API Settings">
          <Field label="API Key" description="A secret key for authenticating to our custom API">
            <SecretInput
              width={60}
              id="config-api-key"
              data-testid={testIds.appConfig.apiKey}
              name="apiKey"
              value={state.apiKey}
              isConfigured={state.isApiKeySet}
              placeholder={'Your secret API key'}
              onChange={onChange}
              onReset={onResetApiKey}
            />
          </Field>

          <Field label="API Url" description="" className={s.marginTop}>
            <Input
              width={60}
              name="apiUrl"
              id="config-api-url"
              data-testid={testIds.appConfig.apiUrl}
              value={state.apiUrl}
              placeholder={`E.g.: http://mywebsite.com/api/v1`}
              onChange={onChange}
            />
          </Field>

          <div className={s.marginTop}>
            <Button type="submit" data-testid={testIds.appConfig.submit} disabled={isSubmitDisabled}>
              Save API settings
            </Button>
          </div>
        </FieldSet>
      </form>

      <FieldSet label="Connection Test" className={s.marginTop}>
        <p className={s.colorWeak}>
          Probes the Couchbase snapshot bucket and the default Grafana datasource using the
          plugin&apos;s current environment.
        </p>

        <div className={s.marginTop}>
          <Button
            variant="secondary"
            icon="sync"
            onClick={runProbe}
            disabled={isTesting}
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
              Couchbase snapshot bucket
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
    </>
  );
};

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

    // Reloading the page as the changes made here wouldn't be propagated to the actual plugin otherwise.
    // This is not ideal, however unfortunately currently there is no supported way for updating the plugin state.
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
