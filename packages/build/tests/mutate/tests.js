import os from 'os'

import { Fixture, normalizeOutput } from '@netlify/testing'
import { test, expect } from 'vitest'

test('Pass netlifyConfig to plugins', async () => {
  const output = await new Fixture('./fixtures/valid').runWithBuild()
  expect(normalizeOutput(output)).toMatchSnapshot()
})

test('netlifyConfig properties are readonly (set) by default', async () => {
  const output = await new Fixture('./fixtures/readonly_set').runWithBuild()
  expect(output.includes(` Error: "netlifyConfig.build.ignore" is read-only.`)).toBe(true)
})

test('netlifyConfig properties are readonly (delete) by default', async () => {
  const output = await new Fixture('./fixtures/readonly_delete').runWithBuild()
  expect(output.includes(`Error: Setting "netlifyConfig.build.command" to undefined is not allowed.`)).toBe(true)
})

test('netlifyConfig properties are readonly (defineProperty) by default', async () => {
  const output = await new Fixture('./fixtures/readonly_define').runWithBuild()
  expect(output.includes(`Error: "netlifyConfig.build.ignore" is read-only.`)).toBe(true)
})

test('Some netlifyConfig properties can be mutated', async () => {
  const output = await new Fixture('./fixtures/general').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig properties cannot be deleted', async () => {
  const output = await new Fixture('./fixtures/delete').runWithBuild()
  expect(output.includes(`Error: Setting "netlifyConfig.build.command" to undefined is not allowed.`)).toBe(true)
})

test('netlifyConfig properties cannot be assigned to undefined', async () => {
  const output = await new Fixture('./fixtures/set_undefined').runWithBuild()
  expect(output.includes(`Error: Setting "netlifyConfig.build.command" to undefined is not allowed.`)).toBe(true)
})

test('netlifyConfig properties cannot be assigned to null', async () => {
  const output = await new Fixture('./fixtures/set_null').runWithBuild()
  expect(output.includes(`Error: Setting "netlifyConfig.build.command" to null is not allowed.`)).toBe(true)
})

test('netlifyConfig properties cannot be assigned to undefined with defineProperty', async () => {
  const output = await new Fixture('./fixtures/define_undefined').runWithBuild()
  expect(output.includes(`Error: Setting "netlifyConfig.build.command" to undefined is not allowed.`)).toBe(true)
})

test('netlifyConfig properties mutations is persisted', async () => {
  const output = await new Fixture('./fixtures/persist').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.command" value changed to 'node --version'.`)).toBe(
    true,
  )
})

test('netlifyConfig array properties can be mutated per index', async () => {
  const output = await new Fixture('./fixtures/array_index').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.*.included_files" value changed to [ 'one', 'two' ].`),
  ).toBe(true)
})

test('netlifyConfig array properties can be pushed', async () => {
  const output = await new Fixture('./fixtures/array_push').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.*.included_files" value changed to [ 'one', 'two' ].`),
  ).toBe(true)
})

test('netlifyConfig.functionsDirectory mutations are used during functions bundling', async () => {
  const output = await new Fixture('./fixtures/functions_directory_bundling').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functionsDirectory deletion skips functions bundling', async () => {
  const output = await new Fixture('./fixtures/functions_directory_skip').runWithBuild()
  expect(output.includes(`Netlify configuration property "functions.directory" value changed to ''.`)).toBe(true)
})

test('netlifyConfig.functionsDirectory mutations are used by utils.functions', async () => {
  const output = await new Fixture('./fixtures/functions_directory_utils').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functionsDirectory mutations are used by constants.FUNCTIONS_SRC', async () => {
  const output = await new Fixture('./fixtures/functions_directory_constants').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functionsDirectory mutations are taken into account by default constants.FUNCTIONS_SRC', async () => {
  const output = await new Fixture('./fixtures/functions_directory_default').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functions.star.directory mutations work', async () => {
  const output = await new Fixture('./fixtures/functions_directory_star').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.*.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functions.star.directory has priority over functions.directory', async () => {
  const output = await new Fixture('./fixtures/functions_directory_star_priority').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.*.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functions.directory mutations work', async () => {
  const output = await new Fixture('./fixtures/functions_directory_nested').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.functions.directory has priority over functions.star.directory', async () => {
  const output = await new Fixture('./fixtures/functions_directory_nested_priority').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.directory" value changed to 'test_functions'.`),
  ).toBe(true)
})

test('netlifyConfig.build.functions mutations work', async () => {
  const output = await new Fixture('./fixtures/functions_directory_build').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.functions" value changed to 'test_functions'.`)).toBe(
    true,
  )
})

test('netlifyConfig.functions mutations are used during functions bundling', async () => {
  const output = await new Fixture('./fixtures/functions_bundling').runWithBuild()
  expect(output.includes(`Netlify configuration property "functions.test.node_bundler" value changed to 'zisi'.`)).toBe(
    true,
  )
})

test('netlifyConfig.functions mutations on any property can be used', async () => {
  const output = await new Fixture('./fixtures/functions_any').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.test.external_node_modules" value changed to [].`),
  ).toBe(true)
})

test('netlifyConfig.functions mutations can add new functions configs', async () => {
  const output = await new Fixture('./fixtures/functions_new').runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.test" value changed to { included_files: [] }.`),
  ).toBe(true)
})

test('netlifyConfig.functions mutations are only logged in debug mode', async () => {
  const output = await new Fixture('./fixtures/functions_no_log_debug').withFlags({ debug: false }).runWithBuild()
  expect(
    output.includes(`Netlify configuration property "functions.test" value changed to { included_files: [] }.`),
  ).toBe(false)
})

test('netlifyConfig properties are deeply readonly by default', async () => {
  const output = await new Fixture('./fixtures/readonly_deep').runWithBuild()
  expect(output.includes(`Error: "netlifyConfig.plugins" is read-only.`)).toBe(true)
})

test('netlifyConfig.processing can be assigned all at once', async () => {
  const output = await new Fixture('./fixtures/processing_all').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.processing.css.bundle" value changed to true.`)).toBe(
    true,
  )
})

test('netlifyConfig.processing can be assigned individually', async () => {
  const output = await new Fixture('./fixtures/processing_prop').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.processing.css.bundle" value changed to true.`)).toBe(
    true,
  )
})

test('netlifyConfig.build.command can be changed', async () => {
  const output = await new Fixture('./fixtures/build_command_change').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.command" value changed to 'node --version'.`)).toBe(
    true,
  )
})

test('netlifyConfig.build.command can be added', async () => {
  const output = await new Fixture('./fixtures/build_command_add').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.command" value changed to 'node --version'.`)).toBe(
    true,
  )
})

test.skipIf(os.platform() === 'win32')('netlifyConfig.build.command can be removed', async () => {
  const output = await new Fixture('./fixtures/build_command_remove').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.command" value changed to ''.`)).toBe(true)
})

test('netlifyConfig.build.environment can be assigned all at once', async () => {
  const output = await new Fixture('./fixtures/env_all').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.environment.TEST_TWO" value changed.`)).toBe(true)
})

test('netlifyConfig.build.environment can be assigned individually', async () => {
  const output = await new Fixture('./fixtures/env_prop').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.environment.TEST_TWO" value changed.`)).toBe(true)
})

test.skipIf(os.platform() === 'win32')(
  'netlifyConfig.build.publish mutations are used by constants.PUBLISH_DIR',
  async () => {
    const output = await new Fixture('./fixtures/publish_constants').runWithBuild()
    expect(output.includes(`Netlify configuration property "build.publish" value changed to 'test'.`)).toBe(true)
  },
)

test('netlifyConfig.build.edge_functions mutations are used by constants.EDGE_FUNCTIONS_SRC', async () => {
  const output = await new Fixture('./fixtures/edge_functions_constants').withFlags({ debug: false }).runWithBuild()
  expect(output.includes(`Netlify configuration property "build.edge_functions" value changed to 'test'.`)).toBe(true)
})

test.skipIf(os.platform() === 'win32')('netlifyConfig.edge_functions can be assigned all at once', async () => {
  const output = await new Fixture('./fixtures/edge_functions_all').withFlags({ debug: false }).runWithBuild()
  expect(output.includes(`Netlify Build Complete`)).toBe(true)
})

test('netlifyConfig.services can be assigned all at once', async () => {
  const output = await new Fixture('./fixtures/services_all').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.services.identity" value changed to 'two'.`)).toBe(true)
})

test('netlifyConfig.services can be assigned individually', async () => {
  const output = await new Fixture('./fixtures/services_prop').runWithBuild()
  expect(output.includes(`Netlify configuration property "build.services.identity" value changed to 'two'.`)).toBe(true)
})

test('netlifyConfig mutations fail if done in an event that is too late', async () => {
  const output = await new Fixture('./fixtures/too_late').runWithBuild()
  expect(output.includes(`Error: "netlifyConfig.build.command" cannot be modified after "onPreBuild".`)).toBe(true)
})

test('netlifyConfig mutations fail correctly on symbols', async () => {
  const output = await new Fixture('./fixtures/symbol').runWithBuild()
  expect(output.includes(`Netlify Build completed`)).toBe(true)
})

test('netlifyConfig mutations fail if the syntax is invalid', async () => {
  const output = await new Fixture('./fixtures/invalid_syntax').runWithBuild()
  expect(output.includes(`Configuration property build.command must be a string`)).toBe(true)
})
