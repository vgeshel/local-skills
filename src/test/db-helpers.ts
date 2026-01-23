import type { DB } from '@/server/db-types'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

let testDb: Kysely<DB> | null = null

export function getTestDb(): Kysely<DB> {
  if (!testDb) {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for tests')
    }

    const dialect = new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 10,
      }),
    })

    testDb = new Kysely<DB>({
      dialect,
    })
  }

  return testDb
}

/**
 * Cleans up test database by deleting all data from tables.
 * Add your tables here in reverse foreign key order.
 */
export async function cleanupTestDatabase(): Promise<void> {
  // Add cleanup for your tables here, e.g.:
  // const db = getTestDb()
  // await db.deleteFrom('child_table').execute()
  // await db.deleteFrom('parent_table').execute()
}

export async function closeTestDatabase(): Promise<void> {
  if (testDb) {
    await testDb.destroy()
    testDb = null
  }
}
