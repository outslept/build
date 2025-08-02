import { Fixture, normalizeOutput } from '@netlify/testing'
import * as colors from 'ansis'
import hasAnsi from 'has-ansi'
import { test, expect } from 'vitest'

test('Colors in parent process', async () => {
  const { output } = await new Fixture('./fixtures/parent')
    .withFlags({ dry: true })
    .withEnv({ FORCE_COLOR: '1' })
    .runBuildBinary()
  expect(hasAnsi(output)).toBe(true)
})

test('Colors in child process', async () => {
  const { output } = await new Fixture('./fixtures/child').withEnv({ FORCE_COLOR: '1' }).runBuildBinary()
  expect(output.includes(colors.red('onPreBuild'))).toBe(true)
})

test('Netlify CI', async () => {
  const { output } = await new Fixture('./fixtures/parent')
    .withFlags({ dry: true, mode: 'buildbot' })
    .withEnv({ FORCE_COLOR: '1' })
    .runBuildBinary()
  expect(hasAnsi(output)).toBe(true)
})

test('No TTY', async () => {
  const { output } = await new Fixture('./fixtures/parent')
    .withFlags({ dry: true })
    .withEnv({ FORCE_COLOR: '0' })
    .runBuildBinary()
  expect(hasAnsi(output)).toBe(false)
})

test('Logs whether the build commands came from the UI', async () => {
  const output = await new Fixture('./fixtures/empty')
    .withFlags({ defaultConfig: { build: { command: 'node --invalid' } } })
    .runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('The verbose flag enables verbosity', async () => {
  const output = await new Fixture('./fixtures/verbose').withFlags({ verbose: true }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Verbosity works with plugin errors', async () => {
  const output = await new Fixture('./fixtures/verbose_error').withFlags({ verbose: true }).runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Does not truncate long headers in logs', async () => {
  const output = await new Fixture('./fixtures/truncate_headers').runWithBuild()
  expect(output.includes('999')).toBe(false)
})

test('Does not truncate long redirects in logs', async () => {
  const output = await new Fixture('./fixtures/truncate_redirects').runWithBuild()
  expect(output.includes('999')).toBe(false)
})
