module.exports = {
  forbidden: [
    {
      name: 'useful-startup-coordinates-without-domain-io',
      severity: 'error',
      from: { path: '^src/client/messages/useful-startup\\.ts$' },
      to: {
        path: '^src/client/',
        pathNot:
          '^src/client/(?:messages/useful-startup\\.ts$|chat-sync-diagnostics/)',
      },
    },
    {
      name: 'encrypted-reopen-caches-use-persistence-only',
      severity: 'error',
      from: { path: '^src/client/(?:reopen-cache|media-preview)/' },
      to: {
        path: '^src/client/',
        pathNot:
          '^src/client/(?:reopen-cache|media-preview|message-storage|vault-authority)/',
      },
    },
    {
      name: 'connectivity-cannot-import-domain-operations',
      severity: 'error',
      from: { path: '^src/client/connectivity/' },
      to: {
        path: '^src/client/',
        pathNot:
          '^src/client/(?:connectivity|api-transport|application-origin)/',
      },
    },
    {
      name: 'view-once-preparation-has-no-authority-or-io',
      severity: 'error',
      from: { path: '^src/client/view-once-preparation/' },
      to: {
        path: '^src/(client|server)/',
        pathNot:
          '^src/client/(?:view-once-preparation|attachment-images|view-once-media)/',
      },
    },
    {
      name: 'native-browser-fixtures-cannot-import-server-admission',
      severity: 'error',
      from: {
        path: '^tests/fixtures/native-(?:ios-direct-.*|product-.*|wallet)\\.ts$',
      },
      to: { path: '^tests/fixtures/native-physical-admission\\.ts$' },
    },
    {
      name: 'native-direct-driver-observes-public-ui-only',
      severity: 'error',
      from: {
        path: '^tests/fixtures/native-(?:ios-direct-.*|product-output)\\.ts$',
      },
      to: { path: '^src/' },
    },
    {
      name: 'native-api-through-transport-only',
      severity: 'error',
      from: {
        path: '^src/client/',
        pathNot:
          '^src/client/(?:native-api|api-transport|installed-runtime|mobile-feasibility)/',
      },
      to: { path: '^src/client/native-api/' },
    },
    {
      name: 'installed-runtime-only-at-entry-points',
      severity: 'error',
      from: {
        path: '^src/client/',
        pathNot: [
          '^src/client/installed-runtime/',
          '^src/client/mobile-entry/index\\.ts$',
          '^src/client/recovery-return/mobile-entry\\.ts$',
        ],
      },
      to: { path: '^src/client/installed-runtime/' },
    },
    {
      name: 'native-sdk-only-in-native-entry',
      severity: 'error',
      from: {
        path: '^src/(client|shared)/',
        pathNot: '^src/client/mobile-feasibility/',
      },
      to: { path: '(^|node_modules/)@capacitor/' },
    },
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
      from: {
        path: '^(src/client/|tests/fixtures/native-(?:ios-direct-.*|product-output)\\.ts$)',
      },
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
