# TypeScript + Next.js + PostgreSQL Template

A production-ready template for TypeScript applications with:

- **TypeScript** strict mode with comprehensive ESLint rules
- **Next.js 16** with App Router
- **PostgreSQL** with Kysely (type-safe queries)
- **tRPC** for type-safe APIs
- **Vitest** for testing with real database
- **Pre-commit hooks** for quality assurance
- **Claude Code skills** for agentic development

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (runtime)
- PostgreSQL 16+

### Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   cp .env.test.example .env.test.local
   ```

   Edit `.env.local` and `.env.test.local` with your database URLs.

3. **Create databases**

   ```bash
   createdb myapp
   createdb myapp_test
   ```

4. **Run migrations**

   ```bash
   bun db:migrate
   bun db:codegen
   ```

5. **Start development server**

   ```bash
   bun dev
   ```

## Development Commands

```bash
# Development
bun dev              # Start dev server with pino-pretty logging
bun build            # Production build
bun typecheck        # TypeScript type checking
bun lint             # ESLint
bun format           # Prettier formatting

# Testing
bun test             # Watch mode
bun test:run         # Single run with coverage

# Database
bun db:migrate       # Run pending migrations
bun db:migrate:create <name>  # Create new migration
bun db:codegen       # Regenerate TypeScript types
```

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/trpc/          # tRPC HTTP handler
│   ├── globals.css        # Tailwind CSS
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── migrations/            # Kysely migrations
├── scripts/               # Build/dev scripts
├── src/
│   ├── components/        # React components
│   ├── lib/               # Shared utilities
│   │   ├── logger.ts      # Pino logger
│   │   ├── providers.tsx  # React Query provider
│   │   └── trpc.ts        # tRPC client
│   ├── server/
│   │   ├── db.ts          # Kysely database client
│   │   ├── db-types.ts    # Generated types (don't edit)
│   │   └── trpc.ts        # tRPC router
│   └── test/              # Test utilities
├── .claude/               # Claude Code configuration
│   ├── settings.json      # Hooks configuration
│   └── skills/            # Development skills
├── CLAUDE.md              # AI agent instructions
└── package.json
```

## Key Features

### Type Safety

- **No `any` types** - Enforced by ESLint
- **No `as` casts** - Use Zod validation instead
- **Generated database types** - Run `bun db:codegen` after migrations

### Database Patterns

```typescript
// All operations in transactions
await db.transaction().execute(async (trx) => {
  // Your queries here
})

// JSONB writes
import { jsonb } from '@/server/db'
await trx.insertInto('table').values({ data: jsonb({ key: 'value' }) })

// JSONB reads
import { parseJsonbRecord } from '@/server/db'
const data = parseJsonbRecord(row.data)
```

### Pre-commit Hooks

The pre-commit hook runs:

1. `bun typecheck` - Type checking
2. `scripts/check-lint-exceptions.ts` - Blocks `eslint-disable` comments
3. `bun lint` - ESLint
4. `lint-staged` - Format changed files

## Claude Code Integration

This template includes Claude Code skills for:

- **TDD workflow** - Test-driven development guidance
- **Database migrations** - Schema change patterns

See `.claude/skills/` for details.

## License

MIT
