---
name: tdd-workflow
description: Test-Driven Development workflow with vitest and real database. Use when implementing new features or fixing bugs.
---

# TDD Workflow Skill

Use this skill when implementing features using Test-Driven Development.

## The TDD Cycle

1. **Write a failing test** - Define expected behavior first
2. **Run the test** - Confirm it fails for the right reason
3. **Implement the minimum code** - Make the test pass
4. **Refactor** - Clean up while tests stay green
5. **Repeat** - Next test for next behavior

## Test File Setup

Place tests alongside source files with `.test.ts` extension:

```
src/services/
├── example.ts
├── example.test.ts
```

## Test Template

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  getTestDb,
  cleanupTestDatabase,
  closeTestDatabase,
} from '../test/db-helpers'

describe('ExampleService', () => {
  beforeEach(async () => {
    await cleanupTestDatabase() // Clean slate for each test
  })

  afterAll(async () => {
    await cleanupTestDatabase()
    await closeTestDatabase() // Close connections when done
  })

  describe('createExample', () => {
    it('creates an example with required fields', async () => {
      // Arrange
      const input = {
        name: 'Test Example',
        value: 42,
      }

      // Act
      const result = await exampleService.create(input)

      // Assert - verify return value
      expect(result.id).toBeDefined()
      expect(result.name).toBe('Test Example')

      // Assert - verify database state
      const db = getTestDb()
      const dbRecord = await db
        .selectFrom('example')
        .where('id', '=', result.id)
        .selectAll()
        .executeTakeFirstOrThrow()

      expect(dbRecord.name).toBe('Test Example')
    })
  })
})
```

## Key Testing Principles

### 1. Use Real Database

Do NOT mock Kysely or database connections:

```typescript
// Correct - use real test database
const db = getTestDb()
const result = await db.selectFrom('user').selectAll().execute()

// Wrong - mocking database
const mockDb = { selectFrom: vi.fn() }
```

### 2. Verify Actual Values

Don't just check that something exists - verify the actual expected values:

```typescript
// Correct - verify actual content
expect(result.title).toBe('Expected Title')
expect(result.items).toHaveLength(3)
expect(result.items[0].name).toBe('First Item')

// Wrong - only checking existence/shape
expect(result).toBeDefined()
expect(result.title).toBeTruthy()
```

### 3. Verify Database State

Don't trust return values alone - query the database:

```typescript
// After calling service function
const result = await userService.updateEmail(userId, 'new@email.com')

// Verify in database
const db = getTestDb()
const dbUser = await db
  .selectFrom('user')
  .where('id', '=', userId)
  .selectAll()
  .executeTakeFirstOrThrow()

expect(dbUser.email).toBe('new@email.com')
```

### 4. Test Error Cases

Cover failure modes, not just happy paths:

```typescript
describe('error handling', () => {
  it('throws NotFoundError when record does not exist', async () => {
    const nonExistentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    await expect(exampleService.getById(nonExistentId)).rejects.toThrow(
      NotFoundError,
    )
  })
})
```

## Running Tests

```bash
# Watch mode during development
bun test

# Run once (CI mode) - use before committing
bun test:run

# Run specific file
bun test src/services/example.test.ts

# Run tests matching pattern
bun test -t "creates an example"
```

## Bug Fix TDD Workflow

Bug fixes require proving the bug exists before fixing it:

1. **Query actual data** - Check database/logs to understand real state
2. **Write a FAILING test** - Test must fail because of the bug
3. **Watch it fail** - Confirms test catches the bug
4. **Implement the fix** - Minimal change to pass test
5. **Watch it pass** - Confirms fix works

## Anti-Patterns to Avoid

- Mocking database connections
- Testing only happy paths
- Assertions that only check existence (`toBeDefined()`, `toBeTruthy()`)
- Skipping tests with `.skip` or commenting out
- Writing implementation before tests
- Not running `bun test:run` before committing
