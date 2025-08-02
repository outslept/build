import { normalize } from 'path'
import { platform } from 'process'

import { Fixture, normalizeOutput, startTcpServer } from '@netlify/testing'
import { test, expect } from 'vitest'

test('Deploy plugin succeeds', async () => {
  const { address, requests, stopServer } = await startDeployServer()
  try {
    const output = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }

  expect(requests.every(isValidDeployReponse)).toBe(true)
})

test('Deploy plugin sends deployDir as a path relative to repositoryRoot', async () => {
  const { address, requests, stopServer } = await startDeployServer()
  try {
    await new Fixture('./fixtures/dir_path').withFlags({ buildbotServerSocket: address }).runWithBuild()
  } finally {
    await stopServer()
  }

  const [{ deployDir }] = requests
  expect(deployDir).toBe(normalize('base/publish'))
})

test('Deploy plugin is not run unless --buildbotServerSocket is passed', async () => {
  const { requests, stopServer } = await startDeployServer()
  try {
    await new Fixture('./fixtures/empty').runWithBuild()
  } finally {
    await stopServer()
  }

  expect(requests.length).toBe(0)
})

test('Deploy plugin connection error', async () => {
  const { address, stopServer } = await startDeployServer()
  await stopServer()
  const output = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
  expect(output.includes('Internal error during "Deploy site"')).toBe(true)
})

test('Deploy plugin response syntax error', async () => {
  const { address, stopServer } = await startDeployServer({ response: 'test' })
  try {
    const output = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
    // This shape of this error can change with different Node.js versions.
    expect(output.includes('Internal error during "Deploy site"')).toBe(true)
  } finally {
    await stopServer()
  }
})

test('Deploy plugin response system error', async () => {
  const { address, stopServer } = await startDeployServer({
    response: { succeeded: false, values: { error: 'test', error_type: 'system' } },
  })
  try {
    const output = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
})

test('Deploy plugin response user error', async () => {
  const { address, stopServer } = await startDeployServer({
    response: { succeeded: false, values: { error: 'test', error_type: 'user' } },
  })
  try {
    const output = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
    expect(normalizeOutput(output)).toMatchSnapshot()
  } finally {
    await stopServer()
  }
})

test('Deploy plugin does not wait for post-processing if not using onSuccess nor onEnd', async () => {
  const { address, requests, stopServer } = await startDeployServer()
  try {
    await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runWithBuild()
  } finally {
    await stopServer()
  }

  expect(requests.every(doesNotWaitForPostProcessing)).toBe(true)
})

test('Deploy plugin waits for post-processing if using onSuccess', async () => {
  const { address, requests, stopServer } = await startDeployServer()
  try {
    await new Fixture('./fixtures/success').withFlags({ buildbotServerSocket: address }).runWithBuild()
  } finally {
    await stopServer()
  }

  expect(requests.every(waitsForPostProcessing)).toBe(true)
})

test('Deploy plugin waits for post-processing if using onEnd', async () => {
  const { address, requests, stopServer } = await startDeployServer()
  try {
    await new Fixture('./fixtures/end').withFlags({ buildbotServerSocket: address }).runWithBuild()
  } finally {
    await stopServer()
  }

  expect(requests.every(waitsForPostProcessing)).toBe(true)
})

test('Deploy plugin returns an internal deploy error if the server responds with a 500', async () => {
  const { address, stopServer } = await startDeployServer({
    response: { succeeded: false, values: { error: 'test', error_type: 'user', code: '500' } },
  })
  try {
    const {
      success,
      severityCode,
      logs: { stdout },
    } = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runBuildProgrammatic()
    expect(success).toBe(false)
    // system-error code
    expect(severityCode).toBe(4)
    const output = stdout.join('\n')
    expect(output.includes('Internal error deploying')).toBe(true)
    expect(output.includes('Deploy did not succeed with HTTP Error 500')).toBe(true)
  } finally {
    await stopServer()
  }
})

test('Deploy plugin returns a  deploy error if the server responds with a 4xx', async () => {
  const { address, stopServer } = await startDeployServer({
    response: { succeeded: false, values: { error: 'test', error_type: 'user', code: '401' } },
  })
  try {
    const {
      success,
      severityCode,
      logs: { stdout },
    } = await new Fixture('./fixtures/empty').withFlags({ buildbotServerSocket: address }).runBuildProgrammatic()
    expect(success).toBe(false)
    // user-error code
    expect(severityCode).toBe(2)
    const output = stdout.join('\n')
    expect(output.includes('Error deploying')).toBe(true)
    expect(output.includes('Deploy did not succeed with HTTP Error 401')).toBe(true)
  } finally {
    await stopServer()
  }
})

const startDeployServer = function (opts = {}) {
  const useUnixSocket = platform !== 'win32'
  return startTcpServer({ useUnixSocket, response: { succeeded: true, ...opts.response }, ...opts })
}

const isValidDeployReponse = function ({ action, deployDir }) {
  return ['deploySite', 'deploySiteAndAwaitLive'].includes(action) && typeof deployDir === 'string' && deployDir !== ''
}

const doesNotWaitForPostProcessing = function (request) {
  return request.action === 'deploySite'
}

const waitsForPostProcessing = function (request) {
  return request.action === 'deploySiteAndAwaitLive'
}
