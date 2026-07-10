import type { Configuration, ExternalItemFunctionData } from 'webpack';

type ExternalsType = Configuration['externals'];

export const externals: ExternalsType = [
  // Required for dynamic publicPath resolution
  { 'amd-module': 'module' },
  'lodash',
  'jquery',
  'moment',
  'slate',
  'emotion',
  '@emotion/react',
  '@emotion/css',
  'prismjs',
  'slate-plain-serializer',
  '@grafana/slate-react',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-redux',
  'redux',
  'rxjs',
  'i18next',
  'react-router',
  // @grafana/scenes needs real react-router-dom v6 APIs (e.g. `Routes`), but
  // Grafana core's own 'react-router-dom' external is a v5-compat shim.
  // Core's 'react-router' external is the real v6 build, so alias to that
  // instead of bundling our own copy (which would create a second,
  // context-incompatible Router instance).
  { 'react-router-dom': 'react-router' },
  'd3',
  'angular',
  /^@grafana\/ui/i,
  /^@grafana\/runtime/i,
  /^@grafana\/data/i,

  // Mark legacy SDK imports as external if their name starts with the "grafana/" prefix
  ({ request }: ExternalItemFunctionData, callback: (error?: Error, result?: string) => void) => {
    const prefix = 'grafana/';
    const hasPrefix = (request: string) => request.indexOf(prefix) === 0;
    const stripPrefix = (request: string) => request.slice(prefix.length);

    if (request && hasPrefix(request)) {
      return callback(undefined, stripPrefix(request));
    }

    callback();
  },
];
