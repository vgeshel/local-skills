---
name: database-migration
description: Create and manage database migrations with Kysely. Use when creating tables, adding columns, or modifying schema.
---

# Database Migration Skill

Use this skill when creating or modifying database schema.

## Workflow

1. **Create migration file**

   ```bash
   bun db:migrate:create <migration_name>
   ```

2. **Implement the migration** (see patterns below)

3. **Run migration and regenerate types**

   ```bash
   bun db:migrate && bun db:codegen && bun typecheck
   ```

4. **Verify** - Check that `src/server/db-types.ts` reflects your changes

## Migration File Template

Migrations define a local interface for the tables they interact with. This is necessary because `db-types.ts` doesn't include new tables until after the migration runs.

```typescript
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Define only the tables this migration needs
interface MigrationDB {
  // For CREATE TABLE: define the shape you're creating
  my_new_table: {
    id: string
    name: string
    created_at: Date
    updated_at: Date
  }
}

export async function up(db: Kysely<MigrationDB>): Promise<void> {
  // Implementation
}

export async function down(db: Kysely<MigrationDB>): Promise<void> {
  // Rollback implementation
}
```

## Schema Requirements

### Primary Keys

- Always use `id` as a single-column UUID surrogate primary key
- Never use natural keys or composite keys

```typescript
.addColumn('id', 'uuid', (col) =>
  col.primaryKey().defaultTo(sql`gen_random_uuid()`)
)
```

### Timestamps

- Every table MUST have `created_at`
- Most tables should have `updated_at` (unless insert-only)

```typescript
.addColumn('created_at', 'timestamptz', (col) =>
  col.notNull().defaultTo(sql`now()`)
)
.addColumn('updated_at', 'timestamptz', (col) =>
  col.notNull().defaultTo(sql`now()`)
)
```

### Foreign Keys

- Always declare and enforce as foreign keys
- Use RESTRICT mode (no cascading deletes)
- No orphaned records allowed

```typescript
.addColumn('user_id', 'uuid', (col) =>
  col.notNull().references('user.id').onDelete('restrict')
)
```

### Normalization

- Schema MUST be normalized
- No denormalized or redundant data unless explicitly requested
- Each fact stored in exactly one place

## JSONB Columns

When you need flexible schema, use JSONB:

```typescript
.addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
```

Use `jsonb()` helper when writing:

```typescript
import { jsonb } from '@/server/db'
await trx.insertInto('table').values({ metadata: jsonb({ key: 'value' }) })
```

## Indexes

Add indexes for frequently queried columns:

```typescript
.createIndex('idx_example_user_id')
.on('example')
.column('user_id')
.execute()
```

## Complete Example

```typescript
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

interface MigrationDB {
  example: {
    id: string
    user_id: string
    title: string
    metadata: unknown
    created_at: Date
    updated_at: Date
  }
}

export async function up(db: Kysely<MigrationDB>): Promise<void> {
  await db.schema
    .createTable('example')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('user.id').onDelete('restrict'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute()

  await db.schema
    .createIndex('idx_example_user_id')
    .on('example')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<MigrationDB>): Promise<void> {
  await db.schema.dropTable('example').execute()
}
```

## Anti-Patterns to Avoid

- Using `Kysely<any>` - define a local `MigrationDB` interface instead
- Composite primary keys
- Natural keys as primary keys
- Cascading deletes
- Manually setting `created_at` (let database default handle it)
- Forgetting to run `bun db:codegen` after migration
