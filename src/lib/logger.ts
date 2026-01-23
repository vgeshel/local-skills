import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label }
    },
  },
})

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings)
}
