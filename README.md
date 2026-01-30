# TypeScript Project

A TypeScript project with:

- **TypeScript** strict mode with comprehensive ESLint rules
- **Vitest** for testing
- **Pre-commit hooks** for quality assurance
- **Claude Code skills** for agentic development

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (runtime)
- [pnpm](https://pnpm.io) (package manager)

### Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your configuration.

## Development Commands

```bash
# Development
pnpm run typecheck        # TypeScript type checking
pnpm run lint             # ESLint
pnpm run format           # Prettier formatting

# Testing
pnpm run test             # Watch mode
pnpm run test:run         # Single run
pnpm run test:coverage    # Run with coverage
```

## Project Structure

```
├── scripts/               # Build/dev scripts
├── src/
│   ├── lib/               # Shared utilities
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

### Pre-commit Hooks

The pre-commit hook runs:

1. `pnpm run typecheck` - Type checking
2. `scripts/check-lint-exceptions.ts` - Blocks `eslint-disable` comments
3. `pnpm run lint` - ESLint
4. `lint-staged` - Format changed files

## Claude Code Integration

This project includes Claude Code skills for:

- **TDD workflow** - Test-driven development guidance

See `.claude/skills/` for details.

## License

MIT
