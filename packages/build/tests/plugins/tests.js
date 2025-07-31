import * as fs from 'fs/promises'
import { platform } from 'process'
import { fileURLToPath } from 'url'

import { Fixture, normalizeOutput, removeDir, startServer } from '@netlify/testing'
import getPort from 'get-port'
import tmp, { tmpName } from 'tmp-promise'
import { test, expect } from 'vitest'

import { DEFAULT_FEATURE_FLAGS } from '../../lib/core/feature_flags.js'

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url))

test('Pass packageJson to plugins', async () => {
  const output = await new Fixture('./fixtures/package_json_valid').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Pass empty packageJson to plugins if no package.json', async () => {
  const output = await new Fixture('./fixtures/package_json_none')
    .withCopyRoot({ git: false })
    .then((fixture) => fixture.runWithBuild())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Pass empty packageJson to plugins if package.json invalid', async () => {
  const output = await new Fixture('./fixtures/package_json_invalid').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can use pure ES modules with local plugins', async () => {
  const output = await new Fixture('./fixtures/es_modules_local').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can use pure ES modules with module plugins', async () => {
  const output = await new Fixture('./fixtures/es_modules_module').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can use CommonJS with local plugins', async () => {
  const output = await new Fixture('./fixtures/commonjs_local').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Local plugins', async () => {
  const output = await new Fixture('./fixtures/local').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Local plugins directory', async () => {
  const output = await new Fixture('./fixtures/local_dir').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Local plugins absolute path', async () => {
  const output = await new Fixture('./fixtures/local_absolute').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Local plugins invalid path', async () => {
  const output = await new Fixture('./fixtures/local_invalid').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Node module plugins', async () => {
  const output = await new Fixture('./fixtures/module').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('UI plugins', async () => {
  const output = await new Fixture('./fixtures/ui')
    .withFlags({
      defaultConfig: { plugins: [{ package: 'netlify-plugin-test' }] },
    })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Resolution is relative to the build directory', async () => {
  const output = await new Fixture('./fixtures/module_base')
    .withFlags({
      config: `${FIXTURES_DIR}/module_base/netlify.toml`,
    })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Resolution respects monorepo node module resolution rules', async () => {
  const fixture = await new Fixture('./fixtures/monorepo')
  const output = await fixture.withFlags({ packagePath: 'apps/unpinned' }).runWithBuild()
  // fixture has 2 versions of the same build plugin used by different workspaces
  // this ensures version used by apps/unpinned is used instead of version that
  // is hoisted in shared monorepo node_modules
  expect(output.indexOf('@8.5.3') > 0).toBeTruthy()
})

test('Non-existing plugins', async () => {
  const output = await new Fixture('./fixtures/non_existing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

const getNodePath = function (nodeVersion) {
  return `/home/user/.nvm/versions/node/v${nodeVersion}/bin/node`
}

test('Validate --node-path unsupported version does not fail when no plugins are used', async () => {
  const nodePath = getNodePath('8.2.0')
  const output = await new Fixture('./fixtures/empty').withFlags({ nodePath }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Validate --node-path version is supported by the plugin', async () => {
  const nodePath = getNodePath('16.14.0')
  const output = await new Fixture('./fixtures/engines')
    .withFlags({
      nodePath,
      debug: false,
    })
    .runWithBuild()
  expect(
    normalizeOutput(output).includes('The Node.js version is 1.0.0 but the plugin "./plugin.js" requires >=1.0.0'),
  ).toBe(true)
})

test('Validate --node-path exists', async () => {
  const output = await new Fixture('./fixtures/node_version_simple')
    .withFlags({ nodePath: '/doesNotExist' })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Provided --node-path version is unused in buildbot for local plugin executions if older than supported version', async () => {
  const nodePath = getNodePath('12.19.0')
  const output = await new Fixture('./fixtures/version_greater_than_minimum')
    .withFlags({ nodePath, mode: 'buildbot' })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('UI plugins dont use provided --node-path', async () => {
  const nodePath = getNodePath('12.19.0')
  const output = await new Fixture('./fixtures/ui_auto_install')
    .withFlags({
      nodePath,
      mode: 'buildbot',
      defaultConfig: { plugins: [{ package: 'netlify-plugin-test' }] },
      testOpts: { skipPluginList: true },
    })
    .runWithBuild()
  const systemNodeVersion = process.version
  expect(output.includes(`node.js version used to execute this plugin: ${systemNodeVersion}`)).toBe(true)
})

test('Plugins can execute local binaries', async () => {
  const output = await new Fixture('./fixtures/local_bin').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Plugin output can interleave stdout and stderr', async () => {
  const output = await new Fixture('./fixtures/interleave').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

// TODO: check output length once big outputs are actually fixed
test.sequential('Big plugin output is not truncated', async () => {
  await new Fixture('./fixtures/big').runWithBuild()
})

test('Plugins can have inputs', async () => {
  const output = await new Fixture('./fixtures/inputs').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Trusted plugins are passed featureflags and system log', async () => {
  const systemLogFile = await tmpName()
  const output = await new Fixture('./fixtures/feature_flags')
    .withFlags({
      featureFlags: { test_flag: true },
      debug: false,
      systemLogFile: await fs.open(systemLogFile, 'a'),
    })
    .runWithBuild()

  // windows doesn't support the `/dev/fd/` API we're relying on for system logging.
  if (platform !== 'win32') {
    const systemLog = (await fs.readFile(systemLogFile, { encoding: 'utf8' })).split('\n')

    const expectedSystemLogs = 'some system-facing logs'
    expect(output.includes(expectedSystemLogs)).toBe(false)
    expect(systemLog.includes(expectedSystemLogs)).toBe(true)
  }

  const expectedFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    test_flag: true,
  }

  expect(output.includes(JSON.stringify(expectedFlags))).toBe(true)

  const outputUntrusted = await new Fixture('./fixtures/feature_flags_untrusted')
    .withFlags({
      featureFlags: { test_flag: true },
      debug: false,
      systemLogFile: await fs.open(systemLogFile, 'a'),
    })
    .runWithBuild()

  expect(outputUntrusted.includes('typeof featureflags: undefined')).toBe(true)
})

test('process.env changes are propagated to other plugins', async () => {
  const output = await new Fixture('./fixtures/env_changes_plugin').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('process.env changes are propagated to onError and onEnd', async () => {
  const output = await new Fixture('./fixtures/env_changes_on_error').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('process.env changes are propagated to build.command', async () => {
  const output = await new Fixture('./fixtures/env_changes_command').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('build.environment changes are propagated to other plugins', async () => {
  const output = await new Fixture('./fixtures/env_changes_build_plugin').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('build.environment changes are propagated to onError and onEnd', async () => {
  const output = await new Fixture('./fixtures/env_changes_build_on_error').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('build.environment changes are propagated to build.command', async () => {
  const output = await new Fixture('./fixtures/env_changes_build_command').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('build.environment and process.env changes can be mixed', async () => {
  const output = await new Fixture('./fixtures/env_changes_build_mix').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Expose some utils', async () => {
  const output = await new Fixture('./fixtures/keys').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Utils are defined', async () => {
  const output = await new Fixture('./fixtures/defined').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can run utils', async () => {
  const functionsDir = `${FIXTURES_DIR}/functions_add/.netlify/functions-internal`
  await removeDir(functionsDir)
  try {
    const output = await new Fixture('./fixtures/functions_add').runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await removeDir(functionsDir)
  }
})

test('Cache utils are caching .dot directories as well', async () => {
  // cleanup cache first
  await removeDir([`${FIXTURES_DIR}/cache_utils/dist`, `${FIXTURES_DIR}/cache_utils/.netlify`])
  // generate cache
  await new Fixture('./fixtures/cache_utils').runWithBuild()
  // should have cached files in the output message
  const output = await new Fixture('./fixtures/cache_utils').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can run list util', async () => {
  const output = await new Fixture('./fixtures/functions_list').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Git utils fails if no root', async () => {
  const output = await new Fixture('./fixtures/git_no_root')
    .withCopyRoot({ git: false })
    .then((fixtures) => fixtures.runWithBuild())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Git utils does not fail if no root and not used', async () => {
  const output = await new Fixture('./fixtures/keys')
    .withCopyRoot({ git: false })
    .then((fixtures) => fixtures.runWithBuild())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Validate plugin is an object', async () => {
  const output = await new Fixture('./fixtures/object').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Validate plugin event handler names', async () => {
  const output = await new Fixture('./fixtures/handler_name').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Validate plugin event handler function', async () => {
  const output = await new Fixture('./fixtures/handler_function').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Transpile TypeScript local plugins', async () => {
  const output = await new Fixture('./fixtures/ts_transpile').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Type-checks TypeScript local plugins', async () => {
  const output = await new Fixture('./fixtures/ts_type_check').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Type-checks TypeScript local plugins using tsconfig.json', async () => {
  const output = await new Fixture('./fixtures/ts_type_check_tsconfig').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not transpile already transpiled local plugins', async () => {
  const output = await new Fixture('./fixtures/ts_transpile_already').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Plugins which export a factory function receive the inputs and a metadata object', async () => {
  const output = await new Fixture('./fixtures/dynamic_plugin').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Plugin events that do not emit to stderr/stdout are hidden from the logs', async () => {
  const output = await new Fixture('./fixtures/mixed_events').withFlags({ debug: false }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Plugin errors that occur during the loading phase are piped to system logs', async () => {
  const systemLogFile = await tmp.file()
  const output = await new Fixture('./fixtures/syntax_error')
    .withFlags({
      debug: false,
      featureFlags: { netlify_build_plugin_system_log: true },
      systemLogFile: systemLogFile.fd,
    })
    .runWithBuild()

  if (platform !== 'win32') {
    const systemLog = await fs.readFile(systemLogFile.path, { encoding: 'utf8' })

    expect(systemLog.trim()).toBe(
      `Plugin failed to initialize during the "load" phase: An error message thrown by Node.js`,
    )
  }

  expect(normalizeOutput(output)).toMatchSnapshot()
})

test.sequential('Plugins have a pre-populated Blobs context', async () => {
  const serverPort = await getPort()
  const deployId = 'deploy123'
  const siteId = 'site321'
  const token = 'some-token'
  const { scheme, host, stopServer } = await startServer(
    [
      {
        response: { url: `http://localhost:${serverPort}/some-signed-url` },
        path: `/api/v1/blobs/${siteId}/deploy:${deployId}/my-key`,
      },
      {
        response: 'Hello there',
        path: `/some-signed-url`,
      },
    ],
    serverPort,
  )

  const { netlifyConfig } = await new Fixture('./fixtures/blobs_read')
    .withFlags({
      apiHost: host,
      deployId,
      testOpts: { scheme },
      siteId,
      token,
    })
    .runWithBuildAndIntrospect()

  await stopServer()

  expect(netlifyConfig.build.command).toBe(`echo ""Hello there""`)
})

test('Plugins can respond anything to parent process', async () => {
  const build = await new Fixture('./fixtures/process_send_object').runBuildBinary()
  expect(build.exitCode === 0).toBe(true)
})
