import dns from 'dns'

import { intercept, cleanAll } from '@netlify/nock-udp'
import { Fixture } from '@netlify/testing'
import { spyOn } from 'tinyspy'
import { test, expect, beforeAll, afterAll } from 'vitest'

let dnsLookupSpy

beforeAll(() => {
  const origLookup = dns.lookup
  // we have to stub dns lookup as hot-shots is caching dns and therefore calling dns.lookup directly
  dnsLookupSpy = spyOn(dns, 'lookup', (host, options, cb = options) => {
    if (options === cb) {
      options = {}
    }
    if (host.startsWith(`timetest.`)) {
      cb(undefined, host, 4)
    } else {
      origLookup(host, options, cb)
    }
  })
})

afterAll(() => {
  dnsLookupSpy.restore()
  cleanAll()
})

test('Does not send plugin timings if no plugins', async () => {
  expect(
    await getTimerRequestsString('Does not send plugin timings if no plugins', './fixtures/simple'),
  ).toMatchSnapshot()
})

test('Sends timings of Netlify maintained plugins', async () => {
  expect(
    await getTimerRequestsString('Sends timings of Netlify maintained plugins', './fixtures/system_plugin'),
  ).toMatchSnapshot()
})

test('Does not send timings of community plugins', async () => {
  expect(
    await getTimerRequestsString('Does not send timings of community plugins', './fixtures/community_plugin'),
  ).toMatchSnapshot()
})

test('Sends timing for functions bundling', async () => {
  expect(
    await getTimerRequestsString('Sends timing for functions bundling', './fixtures/functions_zisi'),
  ).toMatchSnapshot()
})

test('Sends timing for edge functions bundling', async () => {
  expect(
    await getTimerRequestsString('Sends timing for edge functions bundling', './fixtures/edge_functions'),
  ).toMatchSnapshot()
})

test('Sends distribution metrics', async () => {
  const timerRequests = await getAllTimerRequests('Sends distribution metrics', './fixtures/simple')
  const includesDistributionRequests = timerRequests.some((timerRequest) => timerRequest.includes('|d|'))

  expect(includesDistributionRequests).toBe(true)
})

test('Allow passing --framework CLI flag', async () => {
  const timerRequests = await getAllTimerRequests('Allow passing --framework CLI flag', './fixtures/simple', {
    framework: 'test',
  })
  expect(timerRequests.every((timerRequest) => timerRequest.includes('framework:test'))).toBe(true)
})

test('Default --framework CLI flag to nothing', async () => {
  const timerRequests = await getAllTimerRequests('Default --framework CLI flag to nothing', './fixtures/simple')
  expect(timerRequests.every((timerRequest) => !timerRequest.includes('framework:'))).toBe(true)
})

test('Sends a `bundler: "zisi"` tag when bundler set to zisi', async () => {
  const timerRequests = await getAllTimerRequests(
    'Sends a `bundler: "zisi"` tag when bundler set to zisi',
    './fixtures/functions_zisi',
  )
  const functionsBundlingRequest = timerRequests.find((timerRequest) =>
    timerRequest.includes('stage:functions_bundling'),
  )

  expect(functionsBundlingRequest.includes('bundler:zisi')).toBe(true)
  expect(functionsBundlingRequest.includes('bundler:zisi,bundler:zisi')).toBe(false)
})

test('Sends a `bundler: "nft"` tag when bundler set to nft', async () => {
  const timerRequests = await getAllTimerRequests(
    'Sends a `bundler: "nft"` tag when bundler set to nft',
    './fixtures/functions_nft',
  )
  const functionsBundlingRequest = timerRequests.find((timerRequest) =>
    timerRequest.includes('stage:functions_bundling'),
  )

  expect(functionsBundlingRequest.includes('bundler:nft')).toBe(true)
  expect(functionsBundlingRequest.includes('bundler:nft,bundler:nft')).toBe(false)
})

test('Sends a `bundler: "esbuild"` tag when at least one function uses the esbuild bundler', async () => {
  const timerRequests = await getAllTimerRequests(
    'Sends a `bundler: "esbuild"` tag when at least one function uses the esbuild bundler',
    './fixtures/functions_esbuild',
  )
  const functionsBundlingRequest = timerRequests.find((timerRequest) =>
    timerRequest.includes('stage:functions_bundling'),
  )

  expect(functionsBundlingRequest.includes('bundler:nft,bundler:esbuild')).toBe(true)
})

// Retrieve statsd packets sent to --statsd.host|port, and get their snapshot
const getTimerRequestsString = async function (testTitle, fixtureName, flags) {
  const timerRequests = await getAllTimerRequests(testTitle, fixtureName, flags)
  const timerRequestsString = serializeTimerRequests(timerRequests)
  return timerRequestsString
}

const getAllTimerRequests = async function (testTitle, fixtureName, flags = {}) {
  // Ensure there's no conflict between each test scope
  const host = `timetest.${encodeURI(testTitle)}`
  const port = '1234'
  const scope = intercept(`${host}:${port}`, { persist: true, allowUnknown: true })

  // Since we're overriding globals via `nock-udp` our `Fixture` needs to run programmatically. `runBuildBinary` here
  // won't work
  await new Fixture(fixtureName).withFlags({ statsd: { host, port }, ...flags }).runWithBuild()

  const timerRequests = scope.buffers.flatMap(flattenRequest)
  expect(scope.used).toBe(true)
  scope.clean()
  return timerRequests
}

const flattenRequest = function (request) {
  return request.toString().trim().split('\n')
}

const serializeTimerRequests = function (timerRequests) {
  return timerRequests.map(normalizeRequest).sort().join('\n').trim()
}

const normalizeRequest = function (request) {
  return request.replace(NUMBERS_REGEXP, 0)
}

const NUMBERS_REGEXP = /\d+/g
