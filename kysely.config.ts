import * as fs from 'fs'
import { PostgresDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import * as path from 'path'
import { Pool } from 'pg'

/**
 * Generate migration prefix in YYYYMMDD_NNN_ format.
 * Uses today's date and finds the next available sequence number.
 */
function getMigrationPrefix(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${year}${month}${day}`

  // Find the next sequence number by checking existing migrations
  const migrationsDir = path.join(__dirname, 'migrations')

  let seq = 1
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
    const todayMigrations = files.filter((f: string) =>
      f.startsWith(datePrefix),
    )
    seq = todayMigrations.length + 1
  }

  return `${datePrefix}_${String(seq).padStart(3, '0')}_`
}

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env['DATABASE_URL'],
    }),
  }),
  migrations: {
    migrationFolder: './migrations',
    getMigrationPrefix,
  },
})
