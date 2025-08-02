import { platform } from 'process'

import { Fixture, normalizeOutput } from '@netlify/testing'
import { test, expect } from 'vitest'

test('Environment variables are set in plugins', async () => {
  const output = await new Fixture('./fixtures/plugin').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

// Windows environment variables work differently
if (platform !== 'win32') {
  test('Environment variable in build.command', async () => {
    const output = await new Fixture('./fixtures/command').runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  })
}

test('build.environment are set in plugins', async () => {
  const output = await new Fixture('./fixtures/build').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not pass BUGSNAG_KEY to build command and plugins', async () => {
  const output = await new Fixture('./fixtures/bugsnag_key')
    .withEnv({ BUGSNAG_KEY: '00000000000000000000000000000000' })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('BRANCH environment variables is set with --branch', async () => {
  const output = await new Fixture('./fixtures/branch').withFlags({ branch: 'test' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('DEPLOY_ID environment variables is set with --deploy-id', async () => {
  const output = await new Fixture('./fixtures/deploy_id').withFlags({ deployId: 'test' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('BUILD_ID environment variables is set with --build-id', async () => {
  const output = await new Fixture('./fixtures/build_id').withFlags({ buildId: 'test-build' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('CONTEXT environment variables is set with --context', async () => {
  const output = await new Fixture('./fixtures/context').withFlags({ context: 'test' }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})
