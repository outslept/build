import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { arch, kill, platform } from 'process'
import { fileURLToPath } from 'url'

import { Fixture, normalizeOutput, startServer, removeDir } from '@netlify/testing'
import getNode from 'get-node'
import moize from 'moize'
import { pathExists } from 'path-exists'
import semver from 'semver'
import { spy, spyOn } from 'tinyspy'
import { tmpName } from 'tmp-promise'
import { test, expect } from 'vitest'

import { zipItAndShipIt } from '../../lib/plugins_core/functions/index.js'
import { importJsonFile } from '../../lib/utils/json.js'

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url))

const CHILD_NODE_VERSION = '12.19.0'
const VERY_OLD_NODE_VERSION = '4.0.0'

// Try `get-node` several times because it sometimes fails due to network failures
const getNodeBinary = async function (nodeVersion, retries = 1) {
  try {
    return await getNode(nodeVersion, {
      // there is no old node version for arm64 and MacOSX
      // just override it to always use x64 as it does not actually uses it.
      arch: platform === 'darwin' && arch === 'arm64' ? 'x64' : arch,
    })
  } catch (error) {
    if (retries < 10) {
      return getNodeBinary(nodeVersion, retries + 1)
    }

    throw error
  }
}

const mGetNode = moize(getNodeBinary, { isPromise: true, maxSize: 1e3 })

test('--help', async () => {
  const { output } = await new Fixture().withFlags({ help: true }).runBuildBinary()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--version', async () => {
  const { output } = await new Fixture().withFlags({ version: true }).runBuildBinary(FIXTURES_DIR)
  expect(output).not.toBe('0.0.0')
  expect(output).toMatch(/^\d+\.\d+\.\d+/)
})

test('Exit code is 0 on success', async () => {
  const { exitCode } = await new Fixture('./fixtures/empty').runBuildBinary()
  expect(exitCode).toBe(0)
})

test('Event handlers are called', async () => {
  let flag = false
  let handlerArgs = undefined
  const { success } = await new Fixture('./fixtures/empty')
    .withFlags({
      eventHandlers: {
        onPostBuild: (args) => {
          flag = true
          handlerArgs = args

          return {}
        },
      },
    })
    .runBuildProgrammatic()

  expect(success).toBe(true)
  expect(flag).toBe(true)
  expect(handlerArgs?.constants !== undefined).toBe(true)
  expect(handlerArgs?.utils !== undefined).toBe(true)
})

test('Event handlers with description are called', async () => {
  let flag = false
  const { success } = await new Fixture('./fixtures/empty')
    .withFlags({
      eventHandlers: {
        onPostBuild: {
          handler: () => {
            flag = true

            return {}
          },
          description: 'Test onPostBuild',
        },
      },
    })
    .runBuildProgrammatic()

  expect(success).toBe(true)
  expect(flag).toBe(true)
})

test('Event handlers do not displace plugin methods', async () => {
  let flag = false
  const { success, configMutations } = await new Fixture('./fixtures/plugin_mutations')
    .withFlags({
      eventHandlers: {
        onPreBuild: {
          handler: () => {
            flag = true

            return {}
          },
          description: 'Test onPreBuild',
        },
      },
    })
    .runBuildProgrammatic()

  expect(configMutations).toEqual([
    {
      keys: ['redirects'],
      keysString: 'redirects',
      value: [{ from: 'api/*', to: '.netlify/functions/:splat', status: 200 }],
      event: 'onPreBuild',
    },
  ])
  expect(flag).toBe(true)
  expect(success).toBe(true)
})

test('Exit code is 1 on build cancellation', async () => {
  const { exitCode } = await new Fixture('./fixtures/cancel').runBuildBinary()
  expect(exitCode).toBe(1)
})

test('Exit code is 2 on user error', async () => {
  const { exitCode } = await new Fixture().withFlags({ config: '/invalid' }).runBuildBinary()
  expect(exitCode).toBe(2)
})

test('Exit code is 3 on plugin error', async () => {
  const { exitCode } = await new Fixture('./fixtures/plugin_error').runBuildBinary()
  expect(exitCode).toBe(3)
})

test('Success is true on success', async () => {
  const { success } = await new Fixture('./fixtures/empty').runBuildProgrammatic()
  expect(success).toBe(true)
})

test('Success is false on build cancellation', async () => {
  const { success } = await new Fixture('./fixtures/cancel').runBuildProgrammatic()
  expect(success).toBe(false)
})

test('Success is false on failure', async () => {
  const { success } = await new Fixture('./fixtures/plugin_error').runBuildProgrammatic()
  expect(success).toBe(false)
})

test('severityCode is 0 on success', async () => {
  const { severityCode } = await new Fixture('./fixtures/empty').runBuildProgrammatic()
  expect(severityCode).toBe(0)
})

test('severityCode is 1 on build cancellation', async () => {
  const { severityCode } = await new Fixture('./fixtures/cancel').runBuildProgrammatic()
  expect(severityCode).toBe(1)
})

test('severityCode is 2 on user error', async () => {
  const { severityCode } = await new Fixture().withFlags({ config: '/invalid' }).runBuildProgrammatic()
  expect(severityCode).toBe(2)
})

test('severityCode is 3 on plugin error', async () => {
  const { severityCode } = await new Fixture('./fixtures/plugin_error').runBuildProgrammatic()
  expect(severityCode).toBe(3)
})

test('returns config mutations', async () => {
  const { configMutations } = await new Fixture('./fixtures/plugin_mutations').runBuildProgrammatic()

  expect(configMutations).toEqual([
    {
      keys: ['redirects'],
      keysString: 'redirects',
      value: [{ from: 'api/*', to: '.netlify/functions/:splat', status: 200 }],
      event: 'onPreBuild',
    },
  ])
})

test('--cwd', async () => {
  const output = await new Fixture().withFlags({ cwd: `${FIXTURES_DIR}/publish` }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--repository-root', async () => {
  const output = await new Fixture().withFlags({ repositoryRoot: `${FIXTURES_DIR}/empty` }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--config', async () => {
  const output = await new Fixture().withFlags({ config: `${FIXTURES_DIR}/empty/netlify.toml` }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('nested --config', async () => {
  const output = await new Fixture('./fixtures/toml')
    .withFlags({ config: `${FIXTURES_DIR}/toml/apps/nested/netlify.toml` })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('empty --config', async () => {
  const output = await new Fixture('./fixtures/toml')
    .withFlags({ config: '', cwd: `${FIXTURES_DIR}/toml/apps/nested` })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--defaultConfig CLI flag', async () => {
  const { output } = await new Fixture('./fixtures/empty')
    .withFlags({
      defaultConfig: JSON.stringify({ build: { command: 'echo commandDefault' } }),
    })
    .runBuildBinary()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--defaultConfig', async () => {
  const output = await new Fixture('./fixtures/empty')
    .withFlags({
      defaultConfig: { build: { command: 'echo commandDefault' } },
    })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--cachedConfig CLI flag', async () => {
  const cachedConfig = await new Fixture('./fixtures/cached_config').runWithConfig()
  const { output } = await new Fixture('./fixtures/cached_config').withFlags({ cachedConfig }).runBuildBinary()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--cachedConfigPath CLI flag', async () => {
  const cachedConfigPath = await tmpName()
  try {
    await new Fixture('./fixtures/cached_config').withFlags({ output: cachedConfigPath }).runConfigBinary()
    const { output } = await new Fixture('./fixtures/cached_config')
      .withFlags({ cachedConfigPath, context: 'test' })
      .runBuildBinary()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await fs.unlink(cachedConfigPath)
  }
})

test('--cachedConfig', async () => {
  const cachedConfig = await new Fixture('./fixtures/cached_config').runWithConfigAsObject()
  const output = await new Fixture('./fixtures/cached_config').withFlags({ cachedConfig }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--cachedConfigPath', async () => {
  const cachedConfigPath = await tmpName()
  try {
    const cachedConfig = await new Fixture('./fixtures/cached_config').runWithConfig()
    await fs.writeFile(cachedConfigPath, cachedConfig)
    const output = await new Fixture('./fixtures/cached_config')
      .withFlags({ cachedConfigPath, context: 'test' })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await fs.unlink(cachedConfigPath)
  }
})

test('--context', async () => {
  const output = await new Fixture('./fixtures/context').withFlags({ context: 'testContext' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--branch', async () => {
  const output = await new Fixture('./fixtures/context').withFlags({ branch: 'testContext' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--baseRelDir', async () => {
  const output = await new Fixture('./fixtures/basereldir').withFlags({ baseRelDir: false }).runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('User error', async () => {
  const output = await new Fixture().withFlags({ config: '/invalid' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('No configuration file', async () => {
  const output = await new Fixture('./fixtures/none').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--dry with one event', async () => {
  const output = await new Fixture('./fixtures/single').withFlags({ dry: true }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--dry with several events', async () => {
  const output = await new Fixture('./fixtures/several').withFlags({ dry: true }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--dry-run', async () => {
  const { output } = await new Fixture('./fixtures/single').withFlags({ dryRun: true }).runBuildBinary()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--dry with build.command but no netlify.toml', async () => {
  const output = await new Fixture('./fixtures/none')
    .withFlags({ dry: true, defaultConfig: { build: { command: 'echo' } } })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--node-path is used by build.command', async () => {
  const { path } = await mGetNode(CHILD_NODE_VERSION)
  const output = await new Fixture('./fixtures/build_command')
    .withFlags({ nodePath: path })
    .withEnv({ TEST_NODE_PATH: path })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--node-path is not used by local plugins', async () => {
  const { path } = await mGetNode(CHILD_NODE_VERSION)
  const output = await new Fixture('./fixtures/local_node_path_unused')
    .withFlags({ nodePath: path })
    .withEnv({ TEST_NODE_PATH: path })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--node-path is not used by plugins added to package.json', async () => {
  const { path } = await mGetNode(CHILD_NODE_VERSION)
  const output = await new Fixture('./fixtures/package_node_path_unused')
    .withFlags({ nodePath: path })
    .withEnv({ TEST_NODE_PATH: path })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('--node-path is not used by core plugins', async () => {
  const { path } = await mGetNode(VERY_OLD_NODE_VERSION)
  const output = await new Fixture('./fixtures/core').withFlags({ nodePath: path }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('featureFlags can be used programmatically', async () => {
  const output = await new Fixture('./fixtures/empty')
    .withFlags({ featureFlags: { test: true, testTwo: false } })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('featureFlags can be used in the CLI', async () => {
  const { output } = await new Fixture('./fixtures/empty')
    .withFlags({ featureFlags: { test: true, testTwo: false } })
    .runBuildBinary()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('featureFlags can be not used', async () => {
  const output = await new Fixture('./fixtures/empty').withFlags({ featureFlags: undefined }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

const runWithApiMock = async function (flags = {}) {
  const { scheme, host, requests, stopServer } = await startServer({ path: '/api/v1/deploys/test/cancel' })
  try {
    const output = await new Fixture('./fixtures/cancel')
      .withFlags({ apiHost: host, testOpts: { scheme }, ...flags })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
  return requests
}

test('--apiHost is used to set Netlify API host', async () => {
  const requests = await runWithApiMock({ token: 'test', deployId: 'test' })
  expect(requests.length).toBe(1)
  expect(requests).toMatchSnapshot()
})

test('Print warning when redirects file is missing from publish directory', async () => {
  const output = await new Fixture('./fixtures/missing_redirects_warning').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not print warning when redirects file is not missing from publish directory', async () => {
  const output = await new Fixture('./fixtures/missing_redirects_present').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not print warning when redirects file is missing from the build directory', async () => {
  const output = await new Fixture('./fixtures/missing_redirects_absent').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not print warning when redirects file is missing both from the build directory and the publish directory', async () => {
  const output = await new Fixture('./fixtures/missing_redirects_none').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Print warning for missing redirects file even with a base directory', async () => {
  const output = await new Fixture('./fixtures/missing_redirects_base').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Print warning when headers file is missing from publish directory', async () => {
  const output = await new Fixture('./fixtures/missing_headers_warning').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test.sequential('Passes the right properties to zip-it-and-ship-it', async () => {
  const mockZipFunctions = spy(() => Promise.resolve())
  const stub = spyOn(zipItAndShipIt, 'zipFunctions', mockZipFunctions)
  const fixtureDir = join(FIXTURES_DIR, 'core')

  await new Fixture('./fixtures/core').runWithBuild()
  await new Fixture('./fixtures/core')
    .withFlags({ mode: 'buildbot' })
    .withEnv({ AWS_LAMBDA_JS_RUNTIME: 'nodejs00.x' })
    .runWithBuild()

  stub.restore()

  expect(mockZipFunctions.callCount).toBe(2)

  const params1 = mockZipFunctions.calls[0][2]

  expect(params1.basePath).toBe(fixtureDir)
  expect(params1.config['*'].zipGo).toBe(true)
  expect(params1.config['*'].includedFilesBasePath).toBe(fixtureDir)
  expect(params1.repositoryRoot).toBe(fixtureDir)

  const testNodeVersion = process.versions.node
  if (semver.gte(testNodeVersion, '16.0.0')) {
    expect(params1.config['*'].nodeVersion).toBe(testNodeVersion)
  } else {
    expect(params1.config['*'].nodeVersion).toBe(undefined)
  }

  const params2 = mockZipFunctions.calls[1][2]

  expect(params2.config['*'].nodeVersion).toBe('nodejs00.x')
  expect(params2.config['*'].zipGo).toBe(undefined)
})

test.sequential('Passes functions generated by build plugins to zip-it-and-ship-it', async () => {
  const mockZipFunctions = spy(() => Promise.resolve([]))
  const stub = spyOn(zipItAndShipIt, 'zipFunctions', mockZipFunctions)
  const fixtureName = 'functions_generated_from_steps'
  const fixtureDir = join(FIXTURES_DIR, fixtureName)

  const { success, generatedFunctions } = await new Fixture(`./fixtures/${fixtureName}`)
    .withFlags({ mode: 'buildbot' })
    .runWithBuildAndIntrospect()

  stub.restore()

  expect(success).toBe(true)
  expect(mockZipFunctions.callCount).toBe(1)

  const { generated, user } = mockZipFunctions.calls[0][0]

  expect(generated.directories.length).toBe(2)
  expect(generated.directories.includes(resolve(fixtureDir, '.netlify/functions-internal'))).toBe(true)
  expect(generated.directories.includes(resolve(fixtureDir, '.netlify/v1/functions'))).toBe(true)

  expect(generated.functions.length).toBe(1)
  expect(
    generated.functions.includes(
      resolve(fixtureDir, '.netlify/plugins/node_modules/plugin/functions/plugin-func1.mjs'),
    ),
  ).toBe(true)

  expect(user.directories.length).toBe(1)
  expect(user.directories.includes(resolve(fixtureDir, 'netlify/functions'))).toBe(true)
  expect(user.functions).toBe(undefined)

  expect(generatedFunctions.length).toBe(1)
  expect(generatedFunctions[0].generator).toEqual({
    displayName: './.netlify/plugins/node_modules/plugin/plugin.mjs',
    name: './.netlify/plugins/node_modules/plugin/plugin.mjs',
    type: 'build plugin',
  })
  expect(generatedFunctions[0].path).toBe(
    join(fixtureDir, '.netlify/plugins/node_modules/plugin/functions/plugin-func1.mjs'),
  )
})

test.sequential('Passes the right feature flags to zip-it-and-ship-it', async () => {
  const mockZipFunctions = spy(() => Promise.resolve())
  const stub = spyOn(zipItAndShipIt, 'zipFunctions', mockZipFunctions)

  await new Fixture('./fixtures/schedule').runWithBuild()
  await new Fixture('./fixtures/schedule').withFlags({ featureFlags: { buildbot_zisi_trace_nft: true } }).runWithBuild()
  await new Fixture('./fixtures/schedule')
    .withFlags({ featureFlags: { buildbot_zisi_esbuild_parser: true } })
    .runWithBuild()
  await new Fixture('./fixtures/schedule')
    .withFlags({ featureFlags: { this_is_a_mock_flag: true, and_another_one: true } })
    .runWithBuild()

  stub.restore()

  expect(mockZipFunctions.callCount).toBe(4)

  expect(mockZipFunctions.calls[0][2].featureFlags.traceWithNft).toBe(false)
  expect(mockZipFunctions.calls[0][2].featureFlags.parseWithEsbuild).toBe(false)
  expect(mockZipFunctions.calls[0][2].config.test.schedule).toBe('@daily')
  expect(mockZipFunctions.calls[0][2].featureFlags.this_is_a_mock_flag).toBe(undefined)
  expect(mockZipFunctions.calls[0][2].featureFlags.and_another_one).toBe(undefined)

  expect(mockZipFunctions.calls[1][2].featureFlags.traceWithNft).toBe(true)
  expect(mockZipFunctions.calls[2][2].featureFlags.parseWithEsbuild).toBe(true)
  expect(mockZipFunctions.calls[3][2].featureFlags.this_is_a_mock_flag).toBe(true)
  expect(mockZipFunctions.calls[3][2].featureFlags.and_another_one).toBe(true)
})

test('Print warning on lingering processes', async () => {
  const output = await new Fixture('./fixtures/lingering')
    .withFlags({ testOpts: { silentLingeringProcesses: false }, mode: 'buildbot' })
    .runWithBuild()

  // Cleanup the lingering process
  const [, pid] = PID_LINE_REGEXP.exec(output)
  kill(pid)

  expect(output.includes('the following processes were still running')).toBe(true)
  expect(output.includes(platform === 'win32' ? 'node.exe' : 'forever.js')).toBe(true)
})

const PID_LINE_REGEXP = /^PID: (\d+)$/m

test('Functions config is passed to zip-it-and-ship-it (1)', async () => {
  const output = await new Fixture('./fixtures/functions_config_1').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions config is passed to zip-it-and-ship-it (2)', async () => {
  const output = await new Fixture('./fixtures/functions_config_2').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions config is passed to zip-it-and-ship-it (3)', async () => {
  const output = await new Fixture('./fixtures/functions_config_3').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Shows notice about bundling errors and warnings coming from esbuild', async () => {
  const output = await new Fixture('./fixtures/esbuild_errors_1').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Shows notice about bundling errors and falls back to ZISI', async () => {
  const output = await new Fixture('./fixtures/esbuild_errors_2').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Bundles functions from the `.netlify/functions-internal` directory', async () => {
  const output = await new Fixture('./fixtures/functions_internal').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not require the `.netlify/functions-internal` directory to exist', async () => {
  const output = await new Fixture('./fixtures/functions_internal_missing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not require the `.netlify/functions-internal` or the user functions directory to exist', async () => {
  const output = await new Fixture('./fixtures/functions_internal_user_missing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Bundles functions from the `.netlify/functions-internal` directory even if the configured user functions directory is missing', async () => {
  const output = await new Fixture('./fixtures/functions_user_missing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Removes duplicate function names from the list of processed functions', async () => {
  const output = await new Fixture('./fixtures/functions_duplicate_names').runWithBuild()
  expect(normalizeOutput(output).includes(`- function_one.js`)).toBe(true)
  expect(normalizeOutput(output).includes(`- function_one.ts`)).toBe(false)
})

test.sequential('`rustTargetDirectory` is passed to zip-it-and-ship-it only when running in buildbot', async () => {
  const runCount = 4
  const mockZipFunctions = spy(() => Promise.resolve())
  const stub = spyOn(zipItAndShipIt, 'zipFunctions', mockZipFunctions)

  await new Fixture('./fixtures/functions_config_1').withFlags({ mode: 'buildbot' }).runWithBuild()
  await new Fixture('./fixtures/functions_config_1').runWithBuild()
  await new Fixture('./fixtures/functions_internal_missing').withFlags({ mode: 'buildbot' }).runWithBuild()
  await new Fixture('./fixtures/functions_internal_missing').runWithBuild()

  stub.restore()

  expect(mockZipFunctions.callCount).toBe(runCount)

  const [call1Args, call2Args, call3Args, call4Args] = mockZipFunctions.calls

  expect(call1Args[2].config['*'].rustTargetDirectory).toBe(
    join(FIXTURES_DIR, 'functions_config_1', '.netlify', 'rust-functions-cache', '[name]'),
  )
  expect(call2Args[2].config['*'].rustTargetDirectory).toBeUndefined()
  expect(call3Args[2].config['*'].rustTargetDirectory).toBe(
    join(FIXTURES_DIR, 'functions_internal_missing', '.netlify', 'rust-functions-cache', '[name]'),
  )
  expect(call4Args[2].config['*'].rustTargetDirectory).toBeUndefined()
})

test.sequential('configFileDirectories is passed to zip-it-and-ship-it', async () => {
  const runCount = 1
  const mockZipFunctions = spy(() => Promise.resolve())
  const stub = spyOn(zipItAndShipIt, 'zipFunctions', mockZipFunctions)

  await new Fixture('./fixtures/functions_config_json').withFlags({ mode: 'buildbot' }).runWithBuild()
  stub.restore()

  expect(mockZipFunctions.callCount).toBe(runCount)

  const call1Args = mockZipFunctions.calls[0]

  expect(call1Args[2].configFileDirectories).toEqual([
    join(FIXTURES_DIR, 'functions_config_json/.netlify/functions-internal'),
  ])
})

test.sequential('functions can have a config with different parameters passed to zip-it-and-ship-it', async () => {
  const zipItAndShipItSpy = spyOn(zipItAndShipIt, 'zipFunctions')
  const output = await new Fixture('./fixtures/functions_config_json')
    .withFlags({
      mode: 'buildbot',
    })
    .runWithBuild()

  zipItAndShipItSpy.restore()

  const call1Args = zipItAndShipItSpy.calls[0]
  const { functions: functions } = await importJsonFile(call1Args[2].manifest)

  expect(functions[0].displayName).toBe('Function One')
  expect(functions[0].generator).toBe('@netlify/mock-plugin@1.0.0')
  expect(functions[1].displayName).toBe(undefined)

  expect(normalizeOutput(output)).toMatchSnapshot()
})

test.sequential('internalSrcFolder is passed to zip-it-and-ship-it and helps prefill the generator field', async () => {
  const zipItAndShipItSpy = spyOn(zipItAndShipIt, 'zipFunctions')

  await new Fixture('./fixtures/functions_internal_src_folder').withFlags({ mode: 'buildbot' }).runWithBuild()
  zipItAndShipItSpy.restore()
  const call1Args = zipItAndShipItSpy.calls[0]

  const [paths, , options] = call1Args

  expect(paths).toEqual({
    generated: {
      directories: [
        join(FIXTURES_DIR, 'functions_internal_src_folder/.netlify/functions-internal'),
        join(FIXTURES_DIR, 'functions_internal_src_folder/.netlify/v1/functions'),
      ],
      functions: [],
    },
    user: {
      directories: [join(FIXTURES_DIR, 'functions_internal_src_folder/netlify/functions')],
    },
  })

  const { manifest } = options
  const { functions } = await importJsonFile(manifest)

  expect(functions[0].generator).toBe('internalFunc')
  expect(functions[1].generator).toBe(undefined)
})

test('Generates a `manifest.json` file when running outside of buildbot', async () => {
  await removeDir(`${FIXTURES_DIR}/functions_internal_manifest/.netlify/functions`)
  await new Fixture('./fixtures/functions_internal_manifest').withFlags({ mode: 'cli' }).runWithBuild()
  const manifestPath = `${FIXTURES_DIR}/functions_internal_manifest/.netlify/functions/manifest.json`

  expect(await pathExists(manifestPath)).toBe(true)

  const { functions, timestamp, version: manifestVersion } = await importJsonFile(manifestPath)

  expect(functions.length).toBe(3)
  expect(typeof timestamp).toBe('number')
  expect(manifestVersion).toBe(1)
})

test('Generates a `manifest.json` file when the `buildbot_create_functions_manifest` feature flag is set', async () => {
  await removeDir(`${FIXTURES_DIR}/functions_internal_manifest/.netlify/functions`)

  await new Fixture('./fixtures/functions_internal_manifest')
    .withFlags({ featureFlags: { buildbot_create_functions_manifest: true } })
    .runWithBuild()

  const manifestPath = `${FIXTURES_DIR}/functions_internal_manifest/.netlify/functions/manifest.json`

  expect(await pathExists(manifestPath)).toBe(true)

  const { functions, timestamp, version: manifestVersion } = await importJsonFile(manifestPath)

  expect(functions.length).toBe(3)
  expect(typeof timestamp).toBe('number')
  expect(manifestVersion).toBe(1)
})
