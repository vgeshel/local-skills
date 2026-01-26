# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## Project Overview

**[Your Project Name]** - Brief description of what this application does.

## Skills

This project includes skills for procedural guidance. Use these when performing specific tasks:

| Skill                | When to Use                                     |
| -------------------- | ----------------------------------------------- |
| `database-migration` | Creating or modifying database schema           |
| `tdd`                | ANY code change: features, bug fixes, refactors |

## Agentic Coding Principles

### Dependency Knowledge

**NEVER rely on internal knowledge of libraries and dependencies.** Your training data is outdated and APIs change frequently.

Instead:

- **Check `package.json`** for actual versions used in this project
- **Search official documentation** for the specific version in use
- **Search the web** if official docs are insufficient

## Inviolable Constraints

These rules apply to ALL code. No exceptions.

### Type Safety

- **NO `any` types** - Strictly prohibited everywhere
- **NO `as` casts** - ESLint will fail the build. Exceptions only for JSONB reads using `parseJsonbRecord()`/`parseJsonbArray()`
- **Zod for external data** - Use `schema.parse()` for client input, API responses, JSONB reads
- **Run `bun typecheck` after EVERY change**
- **Run `bun lint` after EVERY change**

### Database

- **ALL operations in transactions** - `db.transaction().execute(async (trx) => {...})`
- **Use `jsonb()` helper for JSONB writes** - Import from `@/server/db`
- **Use `.returningAll()` pattern** - Not insert-then-select
- **Normalized schema** - No denormalized/redundant data
- **UUID primary keys** - Single-column `id`, no natural/composite keys
- **FK constraints** - RESTRICT mode, no cascading deletes
- **Timestamps** - `created_at` required, `updated_at` for mutable tables
- **Never set `created_at`** - Let database default handle it
- **Set `updated_at` on UPDATE** - Use `sql\`now()\`` since no trigger exists

### TDD (Test-Driven Development)

**TDD applies to ALL code changes. No exceptions.**

- New features
- Bug fixes (the test proves the bug exists, then proves it's fixed)
- Refactors
- "One-line fixes" (small changes cause big production issues)

**The TDD workflow:**

1. **STOP before editing code** - If you're about to use the Edit tool on a `.ts` file, pause
2. **Write a failing test first** - The test defines what "correct" means
3. **Run the test, watch it fail** - This proves the test is valid
4. **Write the minimal code to pass** - No more, no less
5. **Refactor if needed** - Tests protect you

**Testing standards:**

- **Real database** - No mocking Kysely/connections
- **Verify actual values** - Not just existence/shape
- **All tests must pass** - Run `bun test:run` before committing

### Pre-Commit (Non-Negotiable)

```bash
bun typecheck  # Must pass with zero errors
bun lint       # Must pass with zero errors
bun test:run   # All tests must pass
```

**NEVER use `--no-verify`** - If pre-commit hooks fail, fix the issue.

### Git

- **Never commit to main** - Use feature branches
- **Give user chance to review** before committing

## Key Commands

```bash
# Development
bun dev              # Start dev server
bun typecheck        # Type checking (ALWAYS run after changes)
bun build            # Production build
bun lint             # ESLint
bun format           # Prettier

# Testing
bun test             # Watch mode
bun test:run         # CI mode (run before commit)

# Database
bun db:migrate       # Run migrations
bun db:codegen       # Regenerate types (ALWAYS after migrations)

# Workflows
bun db:migrate && bun db:codegen && bun typecheck  # After migrations
bun typecheck && bun lint && bun test:run          # Before commit
```

## Architecture

### Technology Stack

- **Runtime**: Bun (not Node.js)
- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS
- **Backend**: tRPC + PostgreSQL with Kysely
- **Validation**: Zod + TypeScript strict mode

### Directory Structure

```
app/                    # Next.js App Router
src/
├── server/
│   ├── db.ts          # Kysely client + jsonb helper
│   ├── db-types.ts    # AUTO-GENERATED (never edit)
│   └── trpc.ts        # tRPC router
├── lib/               # Shared utilities
├── components/        # React components
└── test/              # Test utilities
migrations/            # TypeScript migrations
```

### Data Flow

```
Browser → tRPC client → src/server/trpc.ts → src/services/* → Database
```

### Critical Patterns

**JSONB Handling**:

```typescript
// Writing - use jsonb() helper
await trx.insertInto('t').values({ data: jsonb({ key: 'value' }) })

// Reading - use parse utilities
const data = parseJsonbRecord(row.data)
```

**Logging**: Use pino, never console.log

## Dependencies Documentation

- Kysely: https://kysely.dev/llms-full.txt
- Next.js: https://nextjs.org/docs/llms-full.txt
- Zod: https://zod.dev/llms.txt
