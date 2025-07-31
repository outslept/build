import { Fixture, normalizeOutput } from '@netlify/testing'
import { test, expect } from 'vitest'

test('Context with context CLI flag', async () => {
  const output = await new Fixture('./fixtures/context_flag').withFlags({ context: 'testContext' }).runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context environment variable', async () => {
  const output = await new Fixture('./fixtures/context_flag').withEnv({ CONTEXT: 'testContext' }).runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context default value', async () => {
  const output = await new Fixture('./fixtures/context_default').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context with branch CLI flag', async () => {
  const output = await new Fixture('./fixtures/branch').withFlags({ branch: 'testBranch' }).runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context with branch environment variable', async () => {
  const output = await new Fixture('./fixtures/branch')
    .withFlags({ branch: '' })
    .withEnv({ BRANCH: 'testBranch' })
    .runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context with branch git', async () => {
  const output = await new Fixture('./fixtures/branch')
    .withFlags({ branch: '' })
    .withCopyRoot({ branch: 'testBranch' })
    .then((fixture) => fixture.runWithConfig())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context with branch fallback', async () => {
  const output = await new Fixture('./fixtures/branch_fallback')
    .withFlags({ branch: '' })
    .withCopyRoot({ git: false })
    .then((fixture) => fixture.runWithConfig())
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context deep merge', async () => {
  const output = await new Fixture('./fixtures/deep_merge').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context array merge', async () => {
  const output = await new Fixture('./fixtures/array_merge').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Context merge priority', async () => {
  const output = await new Fixture('./fixtures/priority_merge').withFlags({ branch: 'testBranch' }).runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Using context does not reset plugins', async () => {
  const output = await new Fixture('./fixtures/context_reset').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can use context properties for build.edge_functions', async () => {
  const output = await new Fixture('./fixtures/context_edge_functions_build').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('Can use context properties for edge_functions', async () => {
  const output = await new Fixture('./fixtures/context_edge_functions_top').runWithConfig()
  expect(normalizeOutput(output)).toMatchSnapshot()
})
