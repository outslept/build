import { readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { version as nodeVersion } from 'process'
import { fileURLToPath } from 'url'

import { Fixture, normalizeOutput, removeDir, getTempName, unzipFile } from '@netlify/testing'
import { pathExists } from 'path-exists'
import semver from 'semver'
import { test, expect } from 'vitest'

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url))

test('Functions: missing source directory', async () => {
  const output = await new Fixture('./fixtures/missing').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: must not be a regular file', async () => {
  const output = await new Fixture('./fixtures/regular_file').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: can be a symbolic link', async () => {
  const output = await new Fixture('./fixtures/symlink').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: default directory', async () => {
  const output = await new Fixture('./fixtures/default').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: simple setup', async () => {
  await removeDir(`${FIXTURES_DIR}/simple/.netlify/functions/`)
  const output = await new Fixture('./fixtures/simple').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: no functions', async () => {
  const output = await new Fixture('./fixtures/none').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: invalid package.json', async () => {
  const packageJsonPath = `${FIXTURES_DIR}/functions_package_json_invalid/package.json`
  // We need to create that file during tests. Otherwise, ESLint fails when
  // detecting an invalid *.json file.
  await writeFile(packageJsonPath, '{{}')
  try {
    const output = await new Fixture('./fixtures/functions_package_json_invalid').runWithBuild()
    // This shape of this error can change with different Node.js versions.
    expect(output.includes('in JSON at position 1')).toBe(true)
  } finally {
    await rm(packageJsonPath, { force: true, recursive: true, maxRetries: 10 })
  }
})

test('Functions: --functionsDistDir', async () => {
  const functionsDistDir = await getTempName()
  try {
    const output = await new Fixture('./fixtures/simple')
      .withFlags({ mode: 'buildbot', functionsDistDir })
      .runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
    expect(await pathExists(functionsDistDir)).toBe(true)
    const files = await readdir(functionsDistDir)
    // We're expecting two files: the function ZIP and the manifest.
    expect(files.length).toBe(2)
  } finally {
    await removeDir(functionsDistDir)
  }
})

test('Functions: custom path on scheduled function', async () => {
  const output = await new Fixture('./fixtures/custom_path_scheduled').runWithBuild()
  expect(output.includes('Scheduled functions must not specify a custom path.')).toBe(true)
})

test('Functions: custom path on event-triggered function', async () => {
  const output = await new Fixture('./fixtures/custom_path_event_triggered').runWithBuild()
  expect(output.includes('Event-triggered functions must not specify a custom path.')).toBe(true)
})

test('Functions: internal functions are cleared on the dev timeline', async () => {
  const fixture = await new Fixture('./fixtures/functions_leftover')
    .withFlags({ debug: false, timeline: 'dev' })
    .withCopyRoot()

  // Before starting Netlify Build, the leftover files should exist and the
  // generated files should not.
  await stat(`${fixture.repositoryRoot}/.netlify/functions-internal/leftover.mjs`)
  await stat(`${fixture.repositoryRoot}/.netlify/edge-functions/leftover.mjs`)
  await expect(() => stat(`${fixture.repositoryRoot}/.netlify/functions-internal/from-plugin.mjs`)).rejects.toThrow()
  await expect(() => stat(`${fixture.repositoryRoot}/.netlify/edge-functions/from-plugin.mjs`)).rejects.toThrow()

  await fixture.runDev(() => {})

  // After running Netlify Build, the leftover files should have been removed
  // but the generated files should have been preserved.
  await expect(() => stat(`${fixture.repositoryRoot}/.netlify/functions-internal/leftover.mjs`)).rejects.toThrow()
  await expect(() => stat(`${fixture.repositoryRoot}/.netlify/edge-functions/leftover.mjs`)).rejects.toThrow()
  await stat(`${fixture.repositoryRoot}/.netlify/functions-internal/from-plugin.mjs`)
  await stat(`${fixture.repositoryRoot}/.netlify/edge-functions/from-plugin.mjs`)
})

test('Functions: cleanup is only triggered when there are internal functions', async () => {
  const fixture = await new Fixture('./fixtures/internal_functions')
    .withFlags({ debug: false, timeline: 'dev' })
    .withCopyRoot()

  await rm(`${fixture.repositoryRoot}/.netlify/functions-internal/`, { force: true, recursive: true })
  await rm(`${fixture.repositoryRoot}/.netlify/edge-functions/`, { force: true, recursive: true })

  const output = await fixture.runDev(() => {})
  expect(output.includes('Cleaning up leftover files from previous builds')).toBe(false)
})

test('Functions: loads functions generated with the Frameworks API', async () => {
  const fixture = await new Fixture('./fixtures/functions_user_and_frameworks')
    .withFlags({ debug: false })
    .withCopyRoot()

  const output = await fixture.runWithBuild()
  const functionsDist = await readdir(resolve(fixture.repositoryRoot, '.netlify/functions'))

  expect(functionsDist.includes('manifest.json')).toBe(true)
  expect(functionsDist.includes('server.zip')).toBe(true)
  expect(functionsDist.includes('user.zip')).toBe(true)

  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Functions: loads functions from the `.netlify/functions-internal` directory and the Frameworks API', async () => {
  const fixture = await new Fixture('./fixtures/functions_user_internal_and_frameworks')
    .withFlags({ debug: false })
    .withCopyRoot()

  const output = await fixture.runWithBuild()
  const functionsDist = await readdir(resolve(fixture.repositoryRoot, '.netlify/functions'))

  expect(functionsDist.includes('manifest.json')).toBe(true)
  expect(functionsDist.includes('server.zip')).toBe(true)
  expect(functionsDist.includes('user.zip')).toBe(true)
  expect(functionsDist.includes('server-internal.zip')).toBe(true)

  const manifest = await readFile(resolve(fixture.repositoryRoot, '.netlify/functions/manifest.json'), 'utf8')
  const { functions } = JSON.parse(manifest)

  expect(functions.length).toBe(5)

  // The Frameworks API takes precedence over the legacy internal directory.
  const frameworksInternalConflict = functions.find(({ name }) => name === 'frameworks-internal-conflict')
  expect(frameworksInternalConflict.routes[0].pattern).toBe('/frameworks-internal-conflict/frameworks')

  // User code takes precedence over the Frameworks API.
  const frameworksUserConflict = functions.find(({ name }) => name === 'frameworks-user-conflict')
  expect(frameworksUserConflict.routes[0].pattern).toBe('/frameworks-user-conflict/user')

  expect(normalizeOutput(output)).toMatchSnapshot()
})

// the monorepo works with pnpm which is not always available
if (semver.gte(nodeVersion, '18.19.0')) {
  test('Functions: loads functions generated with the Frameworks API in a monorepo setup', async () => {
    const fixture = await new Fixture('./fixtures/functions_monorepo').withCopyRoot({ git: false })
    const app1 = await fixture
      .withFlags({
        cwd: fixture.repositoryRoot,
        packagePath: 'apps/app-1',
      })
      .runWithBuildAndIntrospect()

    expect(app1.success).toBe(true)

    const app2 = await fixture
      .withFlags({
        cwd: fixture.repositoryRoot,
        packagePath: 'apps/app-2',
      })
      .runWithBuildAndIntrospect()

    expect(app2.success).toBe(true)

    const app1FunctionsDist = await readdir(resolve(fixture.repositoryRoot, 'apps/app-1/.netlify/functions'))
    expect(app1FunctionsDist.length).toBe(2)
    expect(app1FunctionsDist.includes('manifest.json')).toBe(true)
    expect(app1FunctionsDist.includes('server.zip')).toBe(true)

    const app2FunctionsDist = await readdir(resolve(fixture.repositoryRoot, 'apps/app-2/.netlify/functions'))
    expect(app2FunctionsDist.length).toBe(3)
    expect(app2FunctionsDist.includes('manifest.json')).toBe(true)
    expect(app2FunctionsDist.includes('server.zip')).toBe(true)
    expect(app2FunctionsDist.includes('worker.zip')).toBe(true)
  })
}

test('Functions: creates metadata file', async () => {
  const fixture = await new Fixture('./fixtures/v2').withCopyRoot({ git: false })
  const build = await fixture
    .withFlags({
      branch: 'my-branch',
      cwd: fixture.repositoryRoot,
    })
    .runWithBuildAndIntrospect()

  expect(build.success).toBe(true)

  const functionsDistPath = resolve(fixture.repositoryRoot, '.netlify/functions')
  const functionsDistFiles = await readdir(functionsDistPath)

  expect(functionsDistFiles.includes('manifest.json')).toBe(true)
  expect(functionsDistFiles.includes('test.zip')).toBe(true)

  const unzipPath = join(functionsDistPath, `.netlify-test-${Date.now()}`)

  await unzipFile(join(functionsDistPath, 'test.zip'), unzipPath)

  const functionFiles = await readdir(unzipPath)

  expect(functionFiles.includes('___netlify-bootstrap.mjs')).toBe(true)
  expect(functionFiles.includes('___netlify-entry-point.mjs')).toBe(true)
  expect(functionFiles.includes('___netlify-metadata.json')).toBe(true)
  expect(functionFiles.includes('test.mjs')).toBe(true)

  const metadata = JSON.parse(await readFile(join(unzipPath, '___netlify-metadata.json'), 'utf8'))

  expect(semver.valid(metadata.bootstrap_version)).toBe(metadata.bootstrap_version)
  expect(metadata.branch).toBe('my-branch')
  expect(metadata.version).toBe(1)
})
