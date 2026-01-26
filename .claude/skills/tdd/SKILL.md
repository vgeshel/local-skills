---
name: tdd
description: Test-Driven Development workflow with vitest and real database. Use when implementing features, fixing bugs, or addressing coverage gaps.
---

# Test-Driven Development (TDD) Skill

This skill guides you through test-driven development with 100% coverage using vitest and real database testing.

## When to Use

- Writing new features or workflows
- Fixing bugs (TDD proves the bug exists before fixing)
- Adding tests to existing code
- Fixing coverage gaps
- Before committing code with new functionality

## The TDD Cycle

### 1. RED: Write a Failing Test First

- Identify the behavior to implement
- Write a test that defines the expected behavior
- Run `bun test:run` - the test should FAIL
- If it passes, your test isn't testing what you think

### 2. GREEN: Minimum Code to Pass

- Write the minimum code to make the test pass
- Don't over-engineer - just make it work
- Run `bun test:run` - the test should PASS

### 3. REFACTOR: Clean Up

- Improve code quality while keeping tests green
- Run `bun test:run` after each change

### 4. REPEAT

- Next test for next behavior

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

Don't just check existence - verify expected values:

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

## Branch Coverage Patterns

Every conditional creates branches. Write tests for BOTH:

| Pattern     | Branches | Tests Needed          |
| ----------- | -------- | --------------------- |
| `a ? b : c` | 2        | Truthy and falsy      |
| `a ?? b`    | 2        | Defined and undefined |
| `a \|\| b`  | 2        | Truthy and falsy      |
| `a && b`    | 2        | Truthy and falsy      |

### Testing Ternary Expressions

For code like:

```typescript
const msg = output ? `Output: ${output}` : ''
```

Write TWO tests:

```typescript
// Test 1: truthy branch
it('includes output when present', () => {
  // Setup with output: 'value'
  expect(result).toContain('Output:')
})

// Test 2: falsy branch
it('omits output when absent', () => {
  // Setup with output: undefined
  expect(result).not.toContain('Output:')
})
```

### Testing Nullish Coalescing

For code like:

```typescript
serverUrl: deps.serverUrl ?? 'https://github.com'
```

Write TWO tests:

```typescript
// Test 1: value provided
it('uses provided serverUrl', () => {
  const deps = { serverUrl: 'https://custom.com' }
  expect(result.serverUrl).toBe('https://custom.com')
})

// Test 2: value undefined
it('uses default when not provided', () => {
  const deps = { serverUrl: undefined }
  expect(result.serverUrl).toBe('https://github.com')
})
```

### Testing Optional Object Patterns

For code like:

```typescript
runContext: deps.runId
  ? { runId: deps.runId, serverUrl: deps.serverUrl ?? 'https://github.com' }
  : undefined
```

Write THREE tests:

1. `runId` not provided -> `runContext` is `undefined`
2. `runId` provided with `serverUrl` -> uses provided values
3. `runId` provided without `serverUrl` -> uses default serverUrl

## Bug Fix TDD Workflow

Bug fixes require proving the bug exists before fixing it:

1. **Query actual data** - Check database/logs to understand real state
2. **Write a FAILING test** - Test must fail because of the bug
3. **Watch it fail** - Confirms test catches the bug
4. **Implement the fix** - Minimal change to pass test
5. **Watch it pass** - Confirms fix works

## Running Tests

```bash
# Watch mode during development
bun test

# Run once (CI mode)
bun test:run

# Run with coverage verification (USE BEFORE COMMITTING)
bun test:coverage

# Run specific file
bun test src/services/example.test.ts

# Run tests matching pattern
bun test -t "creates an example"
```

## Verification Sequence

**Before committing new code:**

```bash
bun typecheck        # Type safety
bun lint             # Code style
bun test:coverage    # Tests AND coverage (100% required)
```

**NEVER** use `bun test:run` for final verification - it doesn't check coverage.

## Quick Checklist

Before committing:

- [ ] Every ternary `a ? b : c` has tests for BOTH branches
- [ ] Every nullish coalescing `a ?? b` has tests for defined AND undefined
- [ ] `bun test:coverage` shows 100% for all columns
- [ ] No istanbul ignore comments added (write tests instead)

## Anti-Patterns to Avoid

1. **Mocking database connections** - Use real test database
2. **Testing only happy paths** - Cover error cases
3. **Weak assertions** - Avoid `toBeDefined()`, `toBeTruthy()` alone
4. **Skipping tests** - No `.skip` or commenting out
5. **Writing implementation before tests** - Tests come first
6. **Running `bun test:run` instead of `bun test:coverage`** - Pre-commit will fail
7. **Using istanbul ignore comments** - This violates "never relax guardrails"
8. **Not testing both branches** - Every `?` or `??` needs at least 2 tests
