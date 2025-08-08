import { access } from 'node:fs/promises'
import { version as nodeVersion } from 'node:process'
import { join } from 'path'

import { getDeployStore } from '@netlify/blobs'
import { BlobsServer } from '@netlify/blobs/server'
import { Fixture } from '@netlify/testing'
import getPort from 'get-port'
import semver from 'semver'
import tmp from 'tmp-promise'
import { test, expect, beforeEach, afterEach } from 'vitest'

const TOKEN = 'test'

let testContext = {}

beforeEach(async () => {
  const port = await getPort()
  testContext.blobRequests = {}

  const tmpDir = await tmp.dir()
  testContext.blobServer = new BlobsServer({
    port,
    token: TOKEN,
    directory: tmpDir.path,
    onRequest: ({ type, url }) => {
      testContext.blobRequests[type] = testContext.blobRequests[type] || []
      testContext.blobRequests[type].push(url)
    },
  })

  await testContext.blobServer.start()

  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
    JSON.stringify({
      apiURL: `http://localhost:${port}`,
    }),
  ).toString('base64')
})

afterEach(async () => {
  await testContext.blobServer.stop()
  delete process.env.NETLIFY_BLOBS_CONTEXT
  testContext = {}
})

test.sequential('Blobs upload step uploads files when deploy ID is provided and no files in directory', async () => {
  const {
    success,
    logs: { stdout },
  } = await new Fixture('./fixtures/src_empty')
    // Passing `offline: true` to avoid fetching the configuration from the API
    .withFlags({ deployId: 'abc123', token: TOKEN, offline: true })
    .runBuildProgrammatic()

  expect(success).toBe(true)
  expect(testContext.blobRequests.set).toBe(undefined)

  expect(stdout.join('\n').includes('Uploading blobs to deploy store')).toBe(false)
})

test.sequential(
  'Blobs upload step uploads files when there are files but deploy ID is not provided (legacy API)',
  async () => {
    const fixture = await new Fixture('./fixtures/src_with_blobs_legacy').withCopyRoot({ git: false })

    const {
      success,
      logs: { stdout },
    } = await fixture.withFlags({ token: TOKEN, offline: true, cwd: fixture.repositoryRoot }).runBuildProgrammatic()

    expect(success).toBe(true)

    const blobsDir = join(fixture.repositoryRoot, '.netlify', 'blobs', 'deploy')
    await expect(access(blobsDir)).resolves.not.toThrow()

    expect(testContext.blobRequests.set).toBe(undefined)

    expect(stdout.join('\n').includes('Uploading blobs to deploy store')).toBe(false)
  },
)

test.sequential('Blobs upload step uploads files to deploy store (legacy API)', async () => {
  const fixture = await new Fixture('./fixtures/src_with_blobs_legacy').withCopyRoot({ git: false })

  const { success } = await fixture
    .withFlags({ deployId: 'abc123', siteId: 'test', token: TOKEN, offline: true, cwd: fixture.repositoryRoot })
    .runBuildProgrammatic()

  expect(success).toBe(true)
  expect(testContext.blobRequests.set.length).toBe(6)

  const defaultRegionRequests = testContext.blobRequests.set.filter((urlPath) => {
    const url = new URL(urlPath, 'http://localhost')

    return url.searchParams.get('region') === 'us-east-2'
  })

  expect(defaultRegionRequests.length).toBe(3)

  const storeOpts = { deployID: 'abc123', siteID: 'test', token: TOKEN }
  const store = getDeployStore(storeOpts)

  const blob1 = await store.getWithMetadata('something.txt')
  expect(blob1.data).toBe('some value')
  expect(blob1.metadata).toEqual({})

  const blob2 = await store.getWithMetadata('with-metadata.txt')
  expect(blob2.data).toBe('another value')
  expect(blob2.metadata).toEqual({ meta: 'data', number: 1234 })

  const blob3 = await store.getWithMetadata('nested/file.txt')
  expect(blob3.data).toBe('file value')
  expect(blob3.metadata).toEqual({ some: 'metadata' })
})

test.sequential('Blobs upload step uploads files to deploy store (legacy deploy config API)', async () => {
  const fixture = await new Fixture('./fixtures/src_with_blobs_legacy_deploy_config').withCopyRoot({ git: false })

  const { success } = await fixture
    .withFlags({ deployId: 'abc123', siteId: 'test', token: TOKEN, offline: true, cwd: fixture.repositoryRoot })
    .runBuildProgrammatic()
  expect(success).toBe(true)
  expect(testContext.blobRequests.set.length).toBe(6)

  const regionAutoRequests = testContext.blobRequests.set.filter((urlPath) => {
    const url = new URL(urlPath, 'http://localhost')

    return url.searchParams.get('region') === 'auto'
  })

  expect(regionAutoRequests.length).toBe(3)

  const storeOpts = { deployID: 'abc123', siteID: 'test', token: TOKEN }
  const store = getDeployStore(storeOpts)

  const blob1 = await store.getWithMetadata('something.txt')
  expect(blob1.data).toBe('some value')
  expect(blob1.metadata).toEqual({})

  const blob2 = await store.getWithMetadata('with-metadata.txt')
  expect(blob2.data).toBe('another value')
  expect(blob2.metadata).toEqual({ meta: 'data', number: 1234 })

  const blob3 = await store.getWithMetadata('nested/file.txt')
  expect(blob3.data).toBe('file value')
  expect(blob3.metadata).toEqual({ some: 'metadata' })
})

test.sequential('Blobs upload step uploads files to deploy store', async () => {
  const fixture = await new Fixture('./fixtures/src_with_blobs').withCopyRoot({ git: false })

  const { success } = await fixture
    .withFlags({ deployId: 'abc123', siteId: 'test', token: TOKEN, offline: true, cwd: fixture.repositoryRoot })
    .runBuildProgrammatic()

  expect(success).toBe(true)

  // 3 requests for getting pre-signed URLs + 3 requests for hitting them.
  expect(testContext.blobRequests.set.length).toBe(6)

  const regionAutoRequests = testContext.blobRequests.set.filter((urlPath) => {
    const url = new URL(urlPath, 'http://localhost')

    return url.searchParams.get('region') === 'auto'
  })

  expect(regionAutoRequests.length).toBe(3)

  const storeOpts = { deployID: 'abc123', siteID: 'test', token: TOKEN }
  const store = getDeployStore(storeOpts)

  const blob1 = await store.getWithMetadata('something.txt')
  expect(blob1.data).toBe('some value')
  expect(blob1.metadata).toEqual({})

  const blob2 = await store.getWithMetadata('with-metadata.txt')
  expect(blob2.data).toBe('another value')
  expect(blob2.metadata).toEqual({ meta: 'data', number: 1234 })

  const blob3 = await store.getWithMetadata('nested/blob')
  expect(blob3.data).toBe('file value')
  expect(blob3.metadata).toEqual({ some: 'metadata' })
})

test.sequential('Blobs upload step cancels deploy if blob metadata is malformed', async () => {
  const fixture = await new Fixture('./fixtures/src_with_malformed_blobs_metadata').withCopyRoot({ git: false })
  const { success, severityCode } = await fixture
    .withFlags({ deployId: 'abc123', siteId: 'test', token: TOKEN, offline: true, debug: false })
    .runBuildProgrammatic()

  const blobsDir = join(fixture.repositoryRoot, '.netlify', 'v1', 'blobs', 'deploy')
  await expect(access(blobsDir)).resolves.not.toThrow()

  expect(testContext.blobRequests.set).toBeUndefined()

  expect(success).toBe(false)
  expect(severityCode).toBe(4)
})

// the monorepo works with pnpm which is not always available
if (semver.gte(nodeVersion, '18.19.0')) {
  test.sequential('monorepo > blobs upload, uploads files to deploy store', async () => {
    const fixture = await new Fixture('./fixtures/monorepo').withCopyRoot({ git: false })
    const { success } = await fixture
      .withFlags({ deployId: 'abc123', siteId: 'test', token: TOKEN, offline: true, packagePath: 'apps/app-1' })
      .runBuildProgrammatic()

    expect(success).toBe(true)
    expect(testContext.blobRequests.set.length).toBe(6)

    const storeOpts = { deployID: 'abc123', siteID: 'test', token: TOKEN }
    const store = getDeployStore(storeOpts)

    const blob1 = await store.getWithMetadata('something.txt')
    expect(blob1.data).toBe('some value')
    expect(blob1.metadata).toEqual({})

    const blob2 = await store.getWithMetadata('with-metadata.txt')
    expect(blob2.data).toBe('another value')
    expect(blob2.metadata).toEqual({ meta: 'data', number: 1234 })

    const blob3 = await store.getWithMetadata('nested/file.txt')
    expect(blob3.data).toBe('file value')
    expect(blob3.metadata).toEqual({ some: 'metadata' })
  })
}
