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
    if (host.startsWith(`errorreportingtest.`)) {
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

test('Does send tracking on edge functions bundling error', async () => {
  expect(await getTrackingRequestsString('./fixtures/edge_functions')).toMatchSnapshot()
})

test('Does send tracking on functions bundling error', async () => {
  expect(await getTrackingRequestsString('./fixtures/functions_zisi')).toMatchSnapshot()
})

test('Does send tracking on internal plugin error', async () => {
  expect(await getTrackingRequestsString('./fixtures/system_plugin')).toMatchSnapshot()
})

test('Does send tracking on user plugin error', async () => {
  await getTrackingRequestsString('./fixtures/user_plugin', false)
})

// Retrieve statsd packets sent to --statsd.host|port, and get their snapshot
const getTrackingRequestsString = async function (fixtureName, used = true) {
  const testTitle = expect.getState().currentTestName
  const timerRequests = await getAllTrackingRequests(testTitle, fixtureName, used)
  const timerRequestsString = serializeTimerRequests(timerRequests)
  return timerRequestsString
}

const getAllTrackingRequests = async function (testTitle, fixtureName, used) {
  // Ensure there's no conflict between each test scope
  const host = `errorreportingtest.${encodeURI(testTitle)}`
  const port = '1234'
  const scope = intercept(`${host}:${port}`, { persist: true, allowUnknown: true })

  // Since we're overriding globals via `nock-udp` our `Fixture` needs to run programmatically.
  // `runBuildBinary` here won't work
  await new Fixture(fixtureName).withFlags({ statsd: { host, port } }).runWithBuild()

  const timerRequests = scope.buffers.flatMap(flattenRequest)
  expect(scope.used).toBe(used)
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
