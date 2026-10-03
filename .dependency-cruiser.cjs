module.exports = {
  forbidden: [
    {
      name: 'no-cycles',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolved-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'client-cannot-import-server',
      severity: 'error',
      from: { path: '^src/client/' },
      to: { path: '^src/server/' },
    },
    {
      name: 'client-cannot-import-node',
      severity: 'error',
      from: { path: '^src/client/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'client-cannot-import-database-drivers',
      severity: 'error',
      from: { path: '^src/(client|shared)/' },
      to: { path: '(^|node_modules/)(pg|postgres|pg-native)(/|$)' },
    },
    {
      name: 'server-cannot-import-client',
      severity: 'error',
      from: { path: '^src/server/' },
      to: { path: '^src/client/' },
    },
    {
      name: 'shared-cannot-import-private-environments',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(client|server)/' },
    },
    {
      name: 'shared-cannot-import-node',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'module-public-interfaces-only',
      severity: 'error',
      from: { path: '^src/(client|server)/([^/]+)/' },
      to: {
        path: '^src/$1/[^/]+/',
        pathNot: ['^src/$1/$2/', '^src/$1/[^/]+/index\\.ts$'],
      },
    },
  ],
  options: {
    // Resolve the public ESM subpaths used by the actual browser/Node build.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default'],
    },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
