// npm run lint — the game source, the scripts and the tests. The senado/
// sub-project has its own tooling and the generated data files are skipped.

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none' }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-redeclare': 'error',
  'no-const-assign': 'error',
};

const browser = {
  window: 'readonly',
  document: 'readonly',
  performance: 'readonly',
  localStorage: 'readonly',
  requestAnimationFrame: 'readonly',
  addEventListener: 'readonly',
  innerWidth: 'readonly',
  innerHeight: 'readonly',
  devicePixelRatio: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  console: 'readonly',
  Image: 'readonly',
  URLSearchParams: 'readonly',
  location: 'readonly',
  globalThis: 'readonly',
};

const node = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  globalThis: 'readonly',
};

export default [
  { ignores: ['node_modules/**', 'vendor/**', 'senado/**', 'dist/**', 'src/senado/data.js', 'src/senado/assets.js', 'src/models-index.js'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browser },
    rules,
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.mjs'],
    // the tests run code inside the page too, so they see both sets of globals
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...node, ...browser } },
    rules,
  },
];
