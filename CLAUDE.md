# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## Project Overview

**[Your Project Name]** - Brief description of what this application does.

## Skills

This project includes skills for procedural guidance. Use these when performing specific tasks:

| Skill | When to Use                                     |
| ----- | ----------------------------------------------- |
| `tdd` | ANY code change: features, bug fixes, refactors |

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
- **NO `as` casts** - ESLint will fail the build
- **Zod for external data** - Use `schema.parse()` for client input, API responses
- **Run `pnpm run typecheck` after EVERY change**
- **Run `pnpm run lint` after EVERY change**

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

- **Verify actual values** - Not just existence/shape
- **All tests must pass** - Run `pnpm run test:run` before committing

### Pre-Commit (Non-Negotiable)

```bash
pnpm run typecheck  # Must pass with zero errors
pnpm run lint       # Must pass with zero errors
pnpm run test:run   # All tests must pass
```

**NEVER use `--no-verify`** - If pre-commit hooks fail, fix the issue.

### Git

- **Never commit to main** - Use feature branches
- **Give user chance to review** before committing

## Key Commands

```bash
# Development
pnpm run typecheck        # Type checking (ALWAYS run after changes)
pnpm run lint             # ESLint
pnpm run format           # Prettier

# Testing
pnpm run test             # Watch mode
pnpm run test:run         # CI mode (run before commit)

# Workflows
pnpm run typecheck && pnpm run lint && pnpm run test:run          # Before commit
```

## Architecture

### Technology Stack

- **Runtime**: Node.js
- **Package Manager**: pnpm
- **Language**: TypeScript strict mode
- **Validation**: Zod

### Directory Structure

```
src/
├── lib/               # Shared utilities
└── test/              # Test utilities
scripts/               # Build/dev scripts
```

## Dependencies Documentation

- Zod: https://zod.dev/llms.txt
