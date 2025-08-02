import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/*.{cjs,mjs,js}', 'tests/**/tests.{cjs,mjs,js}'],
    testTimeout: 10000,
    environment: 'node',
  },
})
