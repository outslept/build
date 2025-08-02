import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

import { pluginsList } from '@netlify/plugins-list'
import { Fixture, normalizeOutput, removeDir, startServer } from '@netlify/testing'
import cpy from 'cpy'
import { test, expect } from 'vitest'

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url))

const runWithApiMock = async function (
  fixtureName,
  { testPlugin, response = getPluginsList(testPlugin), ...flags } = {},
  status = 200,
) {
  const { scheme, host, stopServer } = await startServer({
    path: PLUGINS_LIST_URL,
    response,
    status,
  })
  try {
    const output = await new Fixture(`./fixtures/${fixtureName}`)
      .withFlags({
        testOpts: { pluginsListUrl: `${scheme}://${host}`, ...flags.testOpts },
        ...flags,
      })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
}

// We use a specific plugin in tests. We hardcode its version to keep the tests
// stable even when new versions of that plugin are published.
const getPluginsList = function (testPlugin = DEFAULT_TEST_PLUGIN) {
  return pluginsList.map((plugin) => getPlugin(plugin, testPlugin))
}

const getPlugin = function (plugin, testPlugin) {
  if (plugin.package !== TEST_PLUGIN_NAME) {
    return plugin
  }

  return { ...plugin, ...testPlugin }
}

const TEST_PLUGIN_NAME = 'netlify-plugin-contextual-env'
const TEST_PLUGIN_VERSION = '0.3.0'

const PLUGINS_LIST_URL = '/'
const DEFAULT_TEST_PLUGIN = { version: TEST_PLUGIN_VERSION }
const DEFAULT_TEST_PLUGIN_RUNS = [{ package: TEST_PLUGIN_NAME, version: TEST_PLUGIN_VERSION }]

test('Install plugins in .netlify/plugins/ when not cached', async () => {
  await removeDir(`${FIXTURES_DIR}/valid_package/.netlify`)
  try {
    await runWithApiMock('valid_package')
  } finally {
    await removeDir(`${FIXTURES_DIR}/valid_package/.netlify`)
  }
})

test('Use plugins cached in .netlify/plugins/', async () => {
  await runWithApiMock('plugins_cache')
})

test('Do not use plugins cached in .netlify/plugins/ if outdated', async () => {
  const pluginsDir = `${FIXTURES_DIR}/plugins_cache_outdated/.netlify/plugins`
  await removeDir(pluginsDir)
  await cpy('**', '../plugins', { cwd: `${pluginsDir}-old` })
  try {
    await runWithApiMock('plugins_cache_outdated')
  } finally {
    await removeDir(pluginsDir)
  }
})

test('Fetches the list of plugin versions', async () => {
  await runWithApiMock('plugins_cache')
})

test('Only prints the list of plugin versions in verbose mode', async () => {
  await runWithApiMock('plugins_cache', { debug: false })
})

test('Uses fallback when the plugins fetch fails', async () => {
  await runWithApiMock('plugins_cache', {}, 500)
})

test('Uses fallback when the plugins fetch succeeds with an invalid response', async () => {
  await runWithApiMock('plugins_cache', { response: { error: 'test' } })
})

test('Can execute local binaries when using .netlify/plugins/', async () => {
  await runWithApiMock('plugins_cache_bin')
})

test('Can require site dependencies when using .netlify/plugins/', async () => {
  await runWithApiMock('plugins_cache_site_deps')
})

test('Works with .netlify being a regular file', async () => {
  const dotNetlifyFile = `${FIXTURES_DIR}/plugins_cache_regular_file/.netlify`
  await fs.writeFile(dotNetlifyFile, '')
  try {
    await runWithApiMock('plugins_cache_regular_file')
  } finally {
    await removeDir(dotNetlifyFile)
  }
})

test('Print a warning when using plugins not in plugins.json nor package.json', async () => {
  await runWithApiMock('invalid_package')
})

test('Can use local plugins even when some plugins are cached', async () => {
  await runWithApiMock('plugins_cache_local')
})

// Note: the `version` field is normalized to `1.0.0` in the test snapshots
test('Prints outdated plugins installed in package.json', async () => {
  await runWithApiMock('plugins_outdated_package_json')
})

test('Prints incompatible plugins installed in package.json', async () => {
  await runWithApiMock('plugins_incompatible_package_json', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', nodeVersion: '<100' }],
    },
  })
})

test('Does not print incompatible plugins installed in package.json if major version is same', async () => {
  await runWithApiMock('plugins_incompatible_package_json_same_major', {
    testPlugin: {
      compatibility: [{ version: '0.4.0' }, { version: '0.4.1', nodeVersion: '<100' }],
    },
  })
})

test('Does not print incompatible plugins installed in package.json if not using the compatibility field', async () => {
  await runWithApiMock('plugins_incompatible_package_json')
})

// `sequential()` is needed due to the potential of re-installing the dependency
test.sequential('Plugins can specify non-matching compatibility.nodeVersion', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', nodeVersion: '100 - 120' },
        { version: '0.1.0', nodeVersion: '<100' },
      ],
    },
  })
})

test.sequential('Plugins ignore compatibility entries without conditions unless pinned', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0' }, { version: '0.1.0', nodeVersion: '<100' }],
    },
  })
})

test.sequential('Plugins does not ignore compatibility entries without conditions if pinned', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0' }, { version: '0.1.0' }],
    },
    defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0.2.0' }] },
  })
})

test.sequential('Plugins ignore compatibility conditions if pinned', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', nodeVersion: '100 - 200' }, { version: '0.1.0' }],
    },
    defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0.2.0' }] },
  })
})

test.sequential('Plugins can specify matching compatibility.nodeVersion', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', nodeVersion: '6 - 120' },
        { version: '0.1.0', nodeVersion: '<6' },
      ],
    },
  })
})

test.sequential('Plugins compatibility defaults to version field', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', nodeVersion: '4 - 6' },
        { version: '0.1.0', nodeVersion: '<4' },
      ],
    },
  })
})

test.sequential('Plugins can specify compatibility.migrationGuide', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0', migrationGuide: 'http://test.com' },
        { version: '0.2.0', nodeVersion: '100 - 120' },
        { version: '0.1.0', nodeVersion: '<100' },
      ],
    },
  })
})

test.sequential('Plugins can specify matching compatibility.siteDependencies', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', siteDependencies: { 'ansi-styles': '<3' } }],
    },
  })
})

test.sequential('Plugins can specify non-matching compatibility.siteDependencies', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', siteDependencies: { 'ansi-styles': '<2' } }],
    },
  })
})

test.sequential('Plugins can specify non-existing compatibility.siteDependencies', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies', {
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', siteDependencies: { 'does-not-exist': '<3' } }],
    },
  })
})

test.sequential('Plugins can specify multiple non-matching compatibility conditions', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', siteDependencies: { 'ansi-styles': '<3' }, nodeVersion: '100 - 120' },
      ],
    },
  })
})

test.sequential('Plugins can specify multiple matching compatibility conditions', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', siteDependencies: { 'ansi-styles': '<3' }, nodeVersion: '<100' },
      ],
    },
  })
})

test.sequential('Plugins can specify non-matching compatibility.siteDependencies range', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_site_dependencies_range/.netlify`)
  await runWithApiMock('plugins_compat_site_dependencies_range', {
    testPlugin: {
      compatibility: [
        { version: '0.3.0' },
        { version: '0.2.0', siteDependencies: { '@netlify/dependency-with-range': '<10' } },
      ],
    },
  })
})

test.sequential('Plugin versions can be feature flagged', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    featureFlags: { some_feature_flag: true },
    testPlugin: {
      compatibility: [{ version: '0.3.0', featureFlag: 'some_feature_flag' }, { version: '0.2.0' }],
    },
  })
})

test.sequential('Plugin versions that are feature flagged are ignored if no matching feature flag', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    testPlugin: {
      compatibility: [{ version: '0.3.0', featureFlag: 'some_feature_flag' }, { version: '0.2.0' }],
    },
  })
})

test.sequential(
  'Plugin pinned versions that are feature flagged are not ignored if pinned but no matching feature flag',
  async () => {
    await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
    await runWithApiMock('plugins_compat_node_version', {
      testPlugin: {
        compatibility: [{ version: '0.3.0', featureFlag: 'some_feature_flag' }, { version: '0.2.0' }],
      },
      defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0.3.0' }] },
    })
  },
)

test.sequential('Compatibility order take precedence over the `featureFlag` property', async () => {
  await removeDir(`${FIXTURES_DIR}/plugins_compat_node_version/.netlify`)
  await runWithApiMock('plugins_compat_node_version', {
    featureFlags: { some_feature_flag: true },
    testPlugin: {
      compatibility: [{ version: '0.3.0' }, { version: '0.2.0', featureFlag: 'some_feature_flag' }],
    },
  })
})

const runWithUpdatePluginMock = async function (fixture, { flags, status, sendStatus = true, testPlugin } = {}) {
  const { scheme, host, stopServer } = await startServer([
    { path: UPDATE_PLUGIN_PATH, status },
    { path: PLUGINS_LIST_URL, response: getPluginsList(testPlugin), status: 200 },
    { path: '/site/test/integrations/safe', response: [] },
  ])
  try {
    const output = await new Fixture(`./fixtures/${fixture}`)
      .withFlags({
        siteId: 'test',
        token: 'test',
        sendStatus,
        testOpts: { scheme, host, pluginsListUrl: `${scheme}://${host}` },
        defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME }] },
        ...flags,
      })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
}

const UPDATE_PLUGIN_PATH = `/api/v1/sites/test/plugins/${TEST_PLUGIN_NAME}`

test('Pin plugin versions', async () => {
  await runWithUpdatePluginMock('pin_success')
})

test('Report updatePlugin API error without failing the build', async () => {
  await runWithUpdatePluginMock('pin_success', { status: 400 })
})

test('Does not report 404 updatePlugin API error', async () => {
  await runWithUpdatePluginMock('pin_success', { status: 404 })
})

test('Only pin plugin versions in production', async () => {
  await runWithUpdatePluginMock('pin_success', { sendStatus: false })
})

test('Do not pin plugin versions without an API token', async () => {
  await runWithUpdatePluginMock('pin_success', { flags: { token: '' } })
})

test('Do not pin plugin versions without a siteId', async () => {
  await runWithUpdatePluginMock('pin_success', { flags: { siteId: '' } })
})

test('Do not pin plugin versions if the build failed', async () => {
  await runWithUpdatePluginMock('pin_build_failed')
})

test('Do not pin plugin versions if the plugin failed', async () => {
  await runWithUpdatePluginMock('pin_plugin_failed')
})

test('Do not pin plugin versions if the build was installed in package.json', async () => {
  await runWithUpdatePluginMock('pin_module', { flags: { defaultConfig: {} } })
})

test('Do not pin plugin versions if already pinned', async () => {
  await runWithUpdatePluginMock('pin_success', {
    flags: { defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0' }] } },
    testPlugin: { version: '1.0.0' },
  })
})

test('Pinning plugin versions takes into account the compatibility field', async () => {
  await runWithUpdatePluginMock('pin_success', {
    flags: { defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0' }] } },
    testPlugin: {
      compatibility: [
        { version: '1.0.0' },
        { version: '100.0.0', nodeVersion: '<100' },
        { version: '0.3.0', nodeVersion: '<100' },
      ],
    },
  })
})

test('Do not pin plugin with prerelease versions', async () => {
  // By setting the status to 500 we ensure that the endpoint for pinning is
  // not being called, otherwise an error would be thrown.
  await runWithUpdatePluginMock('pin_prerelease', { status: 500, testPlugin: { version: '1.2.3-rc' } })
})

const runWithPluginRunsMock = async function (
  fixtureName,
  { flags, status, sendStatus = true, testPlugin, pluginRuns = DEFAULT_TEST_PLUGIN_RUNS } = {},
) {
  const { scheme, host, stopServer } = await startServer([
    { path: PLUGIN_RUNS_PATH, response: pluginRuns, status },
    { path: PLUGINS_LIST_URL, response: getPluginsList(testPlugin), status: 200 },
    { path: '/site/test/integrations/safe', response: [] },
  ])
  try {
    const output = await new Fixture(`./fixtures/${fixtureName}`)
      .withFlags({
        siteId: 'test',
        token: 'test',
        sendStatus,
        testOpts: { scheme, host, pluginsListUrl: `${scheme}://${host}` },
        ...flags,
      })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
}

const PLUGIN_RUNS_PATH = `/api/v1/sites/test/plugin_runs/latest`

test('Pin netlify.toml-only plugin versions', async () => {
  await runWithPluginRunsMock('pin_config_success')
})

test('Does not pin netlify.toml-only plugin versions if there are no matching plugin runs', async () => {
  await runWithPluginRunsMock('pin_config_success', { pluginRuns: [{ package: `${TEST_PLUGIN_NAME}-test` }] })
})

test('Does not pin netlify.toml-only plugin versions if there are no plugin runs', async () => {
  await runWithPluginRunsMock('pin_config_success', { pluginRuns: [] })
})

test('Does not pin netlify.toml-only plugin versions if there are no matching plugin runs version', async () => {
  await runWithPluginRunsMock('pin_config_success', { pluginRuns: [{ package: TEST_PLUGIN_NAME }] })
})

test('Fails the build when pinning netlify.toml-only plugin versions and the API request fails', async () => {
  await runWithPluginRunsMock('pin_config_success', { status: 400 })
})

test('Does not pin netlify.toml-only plugin versions if already pinned', async () => {
  await runWithPluginRunsMock('pin_config_success', {
    flags: { defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME, pinned_version: '0' }] } },
  })
})

test('Does not pin netlify.toml-only plugin versions if installed in UI', async () => {
  await runWithPluginRunsMock('pin_config_ui', {
    flags: { defaultConfig: { plugins: [{ package: TEST_PLUGIN_NAME }] } },
  })
})

test('Does not pin netlify.toml-only plugin versions if installed in package.json', async () => {
  await runWithPluginRunsMock('pin_config_module')
})

test('Does not pin netlify.toml-only plugin versions if there are no API token', async () => {
  await runWithPluginRunsMock('pin_config_success', { flags: { token: '' } })
})

test('Does not pin netlify.toml-only plugin versions if there are no site ID', async () => {
  await runWithPluginRunsMock('pin_config_success', { flags: { siteId: '' } })
})
