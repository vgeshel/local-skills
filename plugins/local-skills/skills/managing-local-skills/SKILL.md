---
name: managing-local-skills
description: >-
  Manages Claude Code skills from plugin marketplaces using the local-skills CLI.
  Use when the user wants to add, update, remove, list, or inspect skills from
  a marketplace, or when managing the project's .claude/skills/ directory with
  version-tracked skills. Triggers on "install a skill", "add skill from marketplace",
  "update skills", "list available skills", "remove skill", or "local-skills".
---

# Managing Skills with local-skills CLI

`local-skills` is a CLI tool for extracting and managing Claude Code skills from plugin marketplaces. It installs skills into `.claude/skills/` with version tracking, modification detection, and update management.

## Prerequisites

The tool must be installed from npm before use:

```bash
npm install -g local-skills
```

Verify installation:

```bash
local-skills --help
```

## Commands

### Add a skill

```bash
local-skills add <specifier>
```

The specifier format is `<plugin>@<marketplace>/<skill>[:<version>]`:

| Part          | Description                         |
| ------------- | ----------------------------------- |
| `plugin`      | Plugin name in the marketplace      |
| `marketplace` | GitHub `owner/repo` or full git URL |
| `skill`       | Skill name (or `*` for all)         |
| `version`     | Optional git ref (tag, branch)      |

Examples:

```bash
# Add a single skill from a GitHub marketplace
local-skills add superpowers@anthropics/claude-code/tdd

# Pinned to a specific tag
local-skills add superpowers@anthropics/claude-code/tdd:v2.0

# All skills from a plugin
local-skills add superpowers@anthropics/claude-code/*

# From a full git URL
local-skills add my-plugin@https://gitlab.com/team/repo.git/my-skill
```

### List skills

```bash
local-skills ls [source]
```

Options:

- `--long, -l` — Show descriptions
- `--installed` — Only installed skills
- `--not-installed` — Only non-installed skills

Examples:

```bash
# List all installed skills
local-skills ls --installed

# List skills from a remote marketplace with descriptions
local-skills ls anthropics/claude-code --long

# List skills not yet installed from a marketplace
local-skills ls anthropics/claude-code --not-installed
```

### Show skill details

```bash
local-skills info <skill>
```

Displays source, version, and content information for an installed skill.

### Update a skill

```bash
local-skills update <skill-name>
```

Options:

- `--force, -f` — Overwrite locally modified files

Update behavior:

- Skills pinned to a specific commit SHA (40-char hex) are skipped automatically
- If skill files were modified locally, update is refused unless `--force` is passed
- If the state file is missing, modification check is skipped

### Remove a skill

```bash
local-skills remove <skill-name>
```

Removes the skill directory from `.claude/skills/` and cleans up tracking files.

## Tracked Files

Both files should be committed to version control:

- **`.claude/local-skills.json`** — Manifest declaring what skills are installed and from where (source, ref, SHA)
- **`.claude/local-skills-state.json`** — Content hashes for installed skill files, used to detect local modifications

## How It Works

1. Parses the specifier to identify the plugin, marketplace, skill, and optional version
2. Shallow-clones the marketplace git repo
3. Reads `.claude-plugin/marketplace.json` to find the plugin
4. Copies the skill directory to `.claude/skills/<skill-name>/`
5. Records the source, ref, and commit SHA in the manifest
6. Computes a content hash and stores it in the state file

## Workflow Guidance

When a user asks to add skills from a marketplace:

1. Check if `local-skills` is installed: `local-skills --help`
2. If not installed, install it: `npm install -g local-skills`
3. If the user knows the marketplace, use `local-skills ls <marketplace> --long` to show available skills
4. Use `local-skills add` with the appropriate specifier
5. Verify installation with `local-skills ls --installed`

When a user asks to update skills:

1. Check current state: `local-skills ls --installed`
2. Run `local-skills update <skill-name>` for each skill
3. If update fails due to local modifications, inform the user and suggest `--force` only if they confirm

When a user asks about available skills:

1. Use `local-skills ls <marketplace> --long` to browse a marketplace
2. Use `local-skills info <skill>` for details on an installed skill
