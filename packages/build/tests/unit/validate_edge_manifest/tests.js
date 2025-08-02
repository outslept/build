import { test, expect } from 'vitest'

import { validateEdgeFunctionsManifest } from '../../../lib/plugins_core/edge_functions/validate_manifest/validate_edge_functions_manifest.js'
import { removeErrorColors } from '../../../src/error/colors.js'

test('should validate valid manifest', async () => {
  const manifest = {
    bundles: [
      {
        asset: 'f35baff44129a8f6be7db68590b2efd86ed4ba29000e2edbcaddc5d620d7d043.js',
        format: 'js',
      },
    ],
    routes: [
      {
        function: 'hello',
        pattern: '^/hello/?$',
      },
      {
        function: 'geolocation',
        pattern: '^/geolocation/?$',
      },
      {
        function: 'json',
        pattern: '^/json/?$',
      },
    ],
    bundler_version: '1.6.0',
  }

  await expect(validateEdgeFunctionsManifest(manifest)).resolves.not.toThrow()
})

test('should print error on invalid manifest', async () => {
  const manifest = 'json'

  let error
  try {
    await validateEdgeFunctionsManifest(manifest)
  } catch (e) {
    error = e
  }

  expect(error).toBeDefined()
  removeErrorColors(error)
  expect(error.message).toMatchSnapshot()
})

test('should print error on empty manifest', async () => {
  let error
  try {
    await validateEdgeFunctionsManifest({})
  } catch (e) {
    error = e
  }

  expect(error).toBeDefined()
  removeErrorColors(error)
  expect(error.message).toMatchSnapshot()
})
