import { ROOT_CONTEXT, context, trace, SpanStatusCode } from '@opentelemetry/api'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

import { addErrorInfo } from '../../lib/error/info.js'
import { addBuildErrorToActiveSpan } from '../../lib/tracing/main.js'

function createContextManager(activeContext) {
  return {
    with: (_, fn, thisArg, ...args) => fn.call(thisArg, ...args),
    active: () => activeContext,
    enable: () => activeContext,
    disable: () => activeContext,
  }
}

beforeAll(() => {
  const tracerProvider = new BasicTracerProvider()
  const success = trace.setGlobalTracerProvider(tracerProvider)
  expect(success).toBe(true)
})

afterAll(() => {
  trace.disable()
})

beforeEach(() => {
  const tracer = trace.getTracer('test')
  const span = tracer.startSpan('my-span')
  const ctx = trace.setSpan(ROOT_CONTEXT, span)
  const success = context.setGlobalContextManager(createContextManager(ctx))
  expect(success).toBe(true)
})

afterEach(() => {
  context.disable()
})

test.sequential('addBuildErrorToActiveSpan - when error severity info', async () => {
  const myError = new Error()
  addErrorInfo(myError, { type: 'failPlugin' })

  addBuildErrorToActiveSpan(myError)
  const span = trace.getActiveSpan()
  expect(span.status.code).toBe(SpanStatusCode.ERROR)
  // Severities are infered from the Error Type
  expect(span.attributes).toEqual({
    'build.error.location.type': 'buildFail',
    'build.error.severity': 'info',
    'build.error.type': 'failPlugin',
  })
})

test.sequential('addBuildErrorToActiveSpan - when error has no info', async () => {
  const myError = new Error()
  addBuildErrorToActiveSpan(myError)

  const span = trace.getActiveSpan()
  expect(span.status.code).toBe(SpanStatusCode.ERROR)
  // If we have no custom build error Info nothing is added to the span attributes
  expect(span.attributes).toEqual({})
})

test.sequential('addBuildErrorToActiveSpan - noop when error severity none', async () => {
  const myError = new Error()
  addErrorInfo(myError, { type: 'cancelBuild' })

  const span = trace.getActiveSpan()
  addBuildErrorToActiveSpan(myError)

  expect(span.attributes).toEqual({})
  expect(span.status.code).toBe(SpanStatusCode.UNSET)
})
