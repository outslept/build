import { join } from 'path'
import { fileURLToPath } from 'url'

import { Fixture, normalizeOutput, removeDir } from '@netlify/testing'
import { pathExists } from 'path-exists'
import { test, expect } from 'vitest'

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url))

// Run fixture and ensure:
//  - specific directories exist after run
//  - specific directories are removed before/after test
// TODO: once we have a test runner that supports before and after this would be way nicer to read to remove dirs there

const runInstallFixture = async (fixtureName, dirs = [], flags = {}, binary = false, useSnapshot = true) => {
  await removeDir(dirs)
  try {
    const fixture = new Fixture(`./fixtures/${fixtureName}`).withFlags(flags)
    const result = binary ? await fixture.runBuildBinary().then(({ output }) => output) : await fixture.runWithBuild()

    if (useSnapshot) {
      expect(normalizeOutput(result)).toMatchSnapshot()
    }

    await Promise.all(
      dirs.map(async (dir) => {
        expect(await pathExists(dir)).toBe(true)
      }),
    )

    return { fixture, result }
  } finally {
    await removeDir(dirs)
  }
}

test('Functions: install dependencies nested', async () => {
  await runInstallFixture('dir', [
    `${FIXTURES_DIR}/dir/.netlify/functions/`,
    `${FIXTURES_DIR}/dir/functions/function/node_modules/`,
  ])
})

test('Functions: ignore package.json inside node_modules', async () => {
  await runInstallFixture('modules', [`${FIXTURES_DIR}/modules/.netlify/functions/`])
})

test('Functions: install dependencies with npm', async () => {
  await runInstallFixture('functions_npm', [
    `${FIXTURES_DIR}/functions_npm/.netlify/functions/`,
    `${FIXTURES_DIR}/functions_npm/functions/node_modules/`,
  ])
})

test('Functions: install dependencies with Yarn locally', async () => {
  await runInstallFixture(
    'functions_yarn',
    [`${FIXTURES_DIR}/functions_yarn/.netlify/functions/`, `${FIXTURES_DIR}/functions_yarn/functions/node_modules/`],
    {},
    true,
  )
})

test('Functions: install dependencies with Yarn in CI', async () => {
  await runInstallFixture(
    'functions_yarn_ci',
    [`${FIXTURES_DIR}/functions_yarn_ci/functions/node_modules/`],
    {
      mode: 'buildbot',
      deployId: 'functions_yarn_ci',
    },
    true,
  )
})

test('Functions: does not install dependencies unless opting in', async () => {
  await runInstallFixture('optional')
  expect(await pathExists(`${FIXTURES_DIR}/optional/functions/node_modules/`)).toBe(false)
})

test('Functions: does not install dependencies unless opting in (with esbuild)', async () => {
  await runInstallFixture('optional-esbuild')
  expect(await pathExists(`${FIXTURES_DIR}/optional-esbuild/functions/node_modules/`)).toBe(false)
})

test('Functions: does not install dependencies unless opting in (with esbuild, many dependencies)', async () => {
  await runInstallFixture('optional-many-esbuild')
  expect(await pathExists(`${FIXTURES_DIR}/optional-many-esbuild/functions/node_modules/`)).toBe(false)
})

test('Functions: does not print warnings when dependency was mispelled', async () => {
  await runInstallFixture('mispelled_dep')
  expect(await pathExists(`${FIXTURES_DIR}/mispelled_dep/functions/node_modules/`)).toBe(false)
})

test('Functions: does not print warnings when dependency was local', async () => {
  await runInstallFixture('local_dep')
  expect(await pathExists(`${FIXTURES_DIR}/local_dep/functions/node_modules/`)).toBe(false)
})

test('Functions: install dependencies handles errors', async () => {
  const { fixture, result } = await runInstallFixture('functions_error', [], {}, false, false)
  const functionsPath = join(fixture.repositoryRoot, 'functions')

  expect(result.includes(`Error while installing dependencies in ${functionsPath}`)).toBe(true)
})

test('Install local plugin dependencies: with npm', async () => {
  await runInstallFixture('npm', [`${FIXTURES_DIR}/npm/plugin/node_modules/`])
})

test('Install local plugin dependencies: with yarn locally', async () => {
  await runInstallFixture('yarn', [`${FIXTURES_DIR}/yarn/plugin/node_modules/`], {}, true, true)
})

test('Install local plugin dependencies: with yarn in CI', async () => {
  await runInstallFixture('yarn_ci', [`${FIXTURES_DIR}/yarn_ci/plugin/node_modules/`], { mode: 'buildbot' }, true, true)
})

test('Install local plugin dependencies: propagate errors', async () => {
  const fixture = new Fixture('./fixtures/error')
  const { success, output } = await fixture.runWithBuildAndIntrospect()
  const pluginPath = join(fixture.repositoryRoot, 'plugin')

  expect(success).toBe(false)
  expect(output.includes(`Error while installing dependencies in ${pluginPath}`)).toBe(true)
})

test('Install local plugin dependencies: already installed', async () => {
  const output = await new Fixture('./fixtures/already').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Install local plugin dependencies: no package.json', async () => {
  const output = await new Fixture('./fixtures/no_package').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Install local plugin dependencies: no root package.json', async () => {
  const output = await new Fixture('./fixtures/no_root_package')
    .withCopyRoot()
    .then((fixture) => fixture.runWithBuild())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Install local plugin dependencies: missing plugin in netlify.toml', async () => {
  const output = await new Fixture('./fixtures/local_missing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('when --context=dev, install local integration from a directory defined via netlify.toml', async () => {
  const output = await new Fixture('./fixtures/local_missing_integration_directory_path')
    .withFlags({ context: 'dev' })
    .runWithBuild()

  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('when --context=dev, install local integration from a tarball defined via netlify.toml', async () => {
  const output = await new Fixture('./fixtures/local_missing_integration_tarball_path')
    .withFlags({ context: 'dev' })
    .runWithBuild()

  expect(normalizeOutput(output)).toMatchSnapshot()
})
