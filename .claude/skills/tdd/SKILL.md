---
name: tdd
description: Test-Driven Development workflow with vitest. Use when implementing features, fixing bugs, or addressing coverage gaps.
---

# Test-Driven Development (TDD) Skill

This skill guides you through test-driven development with 100% coverage using vitest.

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
- Run `pnpm run test:run` - the test should FAIL
- If it passes, your test isn't testing what you think

### 2. GREEN: Minimum Code to Pass

- Write the minimum code to make the test pass
- Don't over-engineer - just make it work
- Run `pnpm run test:run` - the test should PASS

### 3. REFACTOR: Clean Up

- Improve code quality while keeping tests green
- Run `pnpm run test:run` after each change

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
import { describe, it, expect } from 'vitest'

describe('ExampleService', () => {
  describe('createExample', () => {
    it('creates an example with required fields', () => {
      // Arrange
      const input = {
        name: 'Test Example',
        value: 42,
      }

      // Act
      const result = exampleService.create(input)

      // Assert
      expect(result.name).toBe('Test Example')
      expect(result.value).toBe(42)
    })
  })
})
```

## Key Testing Principles

### 1. Verify Actual Values

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

### 2. Test Error Cases

Cover failure modes, not just happy paths:

```typescript
describe('error handling', () => {
  it('throws NotFoundError when record does not exist', () => {
    const nonExistentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    expect(() => exampleService.getById(nonExistentId)).toThrow(NotFoundError)
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

1. **Understand the bug** - Check logs to understand real state
2. **Write a FAILING test** - Test must fail because of the bug
3. **Watch it fail** - Confirms test catches the bug
4. **Implement the fix** - Minimal change to pass test
5. **Watch it pass** - Confirms fix works

## Running Tests

```bash
# Watch mode during development
pnpm run test

# Run once (CI mode)
pnpm run test:run

# Run with coverage verification (USE BEFORE COMMITTING)
pnpm run test:coverage

# Run specific file
pnpm run test src/services/example.test.ts

# Run tests matching pattern
pnpm run test -t "creates an example"
```

## Verification Sequence

**Before committing new code:**

```bash
pnpm run typecheck        # Type safety
pnpm run lint             # Code style
pnpm run test:coverage    # Tests AND coverage (100% required)
```

**NEVER** use `pnpm run test:run` for final verification - it doesn't check coverage.

## Quick Checklist

Before committing:

- [ ] Every ternary `a ? b : c` has tests for BOTH branches
- [ ] Every nullish coalescing `a ?? b` has tests for defined AND undefined
- [ ] `pnpm run test:coverage` shows 100% for all columns
- [ ] No istanbul ignore comments added (write tests instead)

## Anti-Patterns to Avoid

1. **Testing only happy paths** - Cover error cases
2. **Weak assertions** - Avoid `toBeDefined()`, `toBeTruthy()` alone
3. **Skipping tests** - No `.skip` or commenting out
4. **Writing implementation before tests** - Tests come first
5. **Running `pnpm run test:run` instead of `pnpm run test:coverage`** - Pre-commit will fail
6. **Using istanbul ignore comments** - This violates "never relax guardrails"
7. **Not testing both branches** - Every `?` or `??` needs at least 2 tests
