/**
 * Coverage threshold verification for pre-commit hooks
 *
 * Ensures vitest coverage thresholds in vitest.config.ts remain at 100%.
 */

import { z } from 'zod'

const ThresholdsSchema = z.object({
  test: z.object({
    coverage: z.object({
      thresholds: z
        .object({
          statements: z.literal(100),
          branches: z.literal(100),
          functions: z.literal(100),
          lines: z.literal(100),
        })
        .catchall(
          // Allow per-file thresholds
          z.object({
            statements: z.number(),
            branches: z.number(),
            functions: z.number(),
            lines: z.number(),
          }),
        ),
    }),
  }),
})

export async function main(testConfig?: { default: unknown }): Promise<void> {
  let exitCode = 0

  try {
    const config = testConfig ?? (await import('../vitest.config'))
    ThresholdsSchema.parse(config.default)
    console.info('Coverage thresholds verified (all at 100%)')
  } catch (error) {
    exitCode = 1
    if (error instanceof z.ZodError) {
      console.error(
        [
          '',
          '==========================================',
          '  COMMIT BLOCKED: Coverage Thresholds Modified',
          '==========================================',
          '',
          'All coverage thresholds must be 100%.',
          'Please restore the thresholds in vitest.config.ts.',
          '',
        ].join('\n'),
      )
    } else {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        error,
      )
    }
  }

  process.exit(exitCode)
}

import { fileURLToPath } from 'node:url'

/* istanbul ignore next -- entrypoint with unreliable async timing in tests */
if (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.env.COVERAGE_THRESHOLDS_RUN_MAIN === 'true'
) {
  main()
    .catch(
      /* istanbul ignore next */ (err) => {
        console.error('Failed to check coverage thresholds', err)
        process.exit(1)
      },
    )
    .catch(
      /* istanbul ignore next */ () => {
        // Handle errors thrown by process.exit mock in test environment
      },
    )
}
