import { defineConfig } from 'vitest/config'
import { platform } from 'node:os'
import { env } from 'node:process'

export default defineConfig({
  test: {
    include: [
      'tests/**/tests.{js,cjs,mjs,ts}',
      'src/**/*.test.{js,cjs,mjs,ts}'
    ],
    testTimeout: 240000,
    environment: 'node',
    env: {
      FORCE_COLOR: '1',
    },
    // github action runners for osx have lower memory than windows/linux
    // https://docs.github.com/en/actions/using-github-hosted-runners/using-github-hosted-runners/about-github-hosted-runners#standard-github-hosted-runners-for-public-repositories
    ...(env.GITHUB_ACTIONS &&
      platform() === 'darwin' && {
      pool: 'forks',
      poolOptions: {
        forks: { singleFork: true },
      },
    }),
  },
})
