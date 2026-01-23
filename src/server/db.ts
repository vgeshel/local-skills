import { logger } from '@/lib/logger'
import type { DB, Json } from '@/server/db-types'
import { randomUUID } from 'crypto'
import { Kysely, PostgresDialect, sql, Transaction } from 'kysely'
import { Pool } from 'pg'

// Initialize Kysely with Postgres dialect and connection pool
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString,
    // Increase pool size for better concurrency (configurable via env var)
    max: parseInt(process.env.DATABASE_POOL_SIZE || '30', 10),
    // Query timeout to prevent hanging connections (30 seconds)
    statement_timeout: 30000,
    // Idle timeout to release unused connections
    idleTimeoutMillis: 30000,
  }),
})

export const db = new Kysely<DB>({
  dialect,
})

/**
 * Helper for writing JSONB values to PostgreSQL.
 * Properly casts JSON-serialized values to the jsonb type.
 */
export const jsonb = (value: unknown) =>
  sql<Json>`CAST(${JSON.stringify(value)} AS jsonb)`

/**
 * Helper for reading JSONB values from PostgreSQL query results.
 *
 * This is the ONLY place where `as` type assertions are allowed in this codebase.
 * All other code must use Zod validation or type guards for type narrowing.
 *
 * @example
 * const row = await db.selectFrom('table').selectAll().executeTakeFirstOrThrow()
 * const data = parseJsonbRecord(row.jsonb_field)  // Record<string, unknown>
 * const items = parseJsonbArray(row.items_field)   // unknown[]
 */
export const parseJsonbRecord = (value: Json): Record<string, unknown> =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- JSONB read exception
  value as Record<string, unknown>

export const parseJsonbArray = (value: Json): unknown[] =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- JSONB read exception
  value as unknown[]

/**
 * Escape SQL LIKE/ILIKE wildcards in user input.
 * Prevents % and _ from being interpreted as wildcards.
 *
 * @example
 * const escaped = escapeLikePattern('100%_discount')  // '100\%\_discount'
 * db.where('name', 'ilike', `%${escaped}%`)
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

type TransactionControls = {
  rollbackToSavepoint: () => Promise<void>
  forceCommit: () => Promise<void>
}

type TransactionCallback<T, DB> = (
  trx: Transaction<DB>,
  controls: TransactionControls,
) => Promise<T>

/**
 * Safe nested transaction for Postgres using savepoints.
 *
 * Whenever any operation in a Postgres transaction fails, the connection is no longer usable.
 * To return the connection to a usable state, we must set a savepoint before any changes,
 * and rollback to that savepoint when an error occurs.
 */
export async function nestedTransaction<T, DB>(
  db: Kysely<DB> | Transaction<DB>,
  callback: TransactionCallback<T, DB>,
  rollbackOnly = false,
): Promise<T> {
  const body = async (nestedTrx: Transaction<DB>): Promise<T> => {
    if (!(nestedTrx instanceof Transaction)) {
      throw new Error(
        `nestedTransaction called on a non-transaction: ${JSON.stringify(
          nestedTrx,
        )}`,
      )
    }
    const savepoint = `sp_${randomUUID().replaceAll(/-/g, '')}`
    const rollbackToSavepoint = async () => {
      logger.debug('rollback() called, rolling back to savepoint')
      try {
        await nestedTrx.executeQuery(
          sql`ROLLBACK TO SAVEPOINT ${sql.id(savepoint)}`.compile(db),
        )
        await nestedTrx.executeQuery(
          sql`SAVEPOINT ${sql.id(savepoint)}`.compile(nestedTrx),
        )
      } catch (rollbackError) {
        logger.error(rollbackError, 'Error rolling back to savepoint')
      }
    }
    const forceCommit = async () => {
      if (rollbackOnly) {
        logger.debug(
          'commit() called, but not committing in a read-only transaction',
        )
        return
      }
      logger.debug('commit() called, committing top-level transaction')
      await nestedTrx.executeQuery(sql`COMMIT`.compile(nestedTrx))
      await nestedTrx.executeQuery(sql`BEGIN`.compile(nestedTrx))
      await nestedTrx.executeQuery(
        sql`SAVEPOINT ${sql.id(savepoint)}`.compile(nestedTrx),
      )
    }

    await nestedTrx.executeQuery(
      sql`SAVEPOINT ${sql.id(savepoint)}`.compile(db),
    )

    try {
      const result = await callback(nestedTrx, {
        rollbackToSavepoint,
        forceCommit,
      })
      if (rollbackOnly) {
        logger.debug('Rolling back to savepoint')
        await rollbackToSavepoint()
      }
      return result
    } catch (error) {
      logger.debug(error, 'Error in nested transaction, rolling back')
      await rollbackToSavepoint()
      throw error
    }
  }

  if (db instanceof Transaction) {
    return await body(db)
  }

  return await db.transaction().execute(body)
}
