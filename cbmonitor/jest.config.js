// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...baseConfig,
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Recent d3 releases (d3-color 3.1.1, d3-interpolate 3.0.2) point their
    // entry at an .mjs file, which Jest refuses to require from the CommonJS
    // build of @grafana/data; load the UMD build every d3 package ships.
    '^(d3-[a-z-]+)$': '<rootDir>/node_modules/$1/dist/$1.js',
  },
};
