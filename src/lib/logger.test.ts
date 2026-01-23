import { describe, expect, it } from 'vitest'
import { createChildLogger, logger } from './logger'

describe('logger', () => {
  it('exports a logger instance', () => {
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('creates child loggers with bindings', () => {
    const child = createChildLogger({ module: 'test' })
    expect(child).toBeDefined()
    expect(typeof child.info).toBe('function')
  })
})
