# local-skills

Claude skills (also used by other coding tools) are distributed via [plugins](https://code.claude.com/docs/en/discover-plugins#install-plugins) and normally installed in ~/.claude. This leads to each contributor to a project, or even each machine, having a different set of skills.

This little utility helps you install skills from Claude Code plugin marketplaces into your project's `.claude/skills/` directory. Each project gets a curated, version-controlled set of skills.

## Installation

```bash
pnpm install
```

## Usage

### Add a skill

```bash
# GitHub shorthand
local-skills add superpowers@anthropics/claude-code/tdd

# Pinned to a tag
local-skills add superpowers@anthropics/claude-code/tdd:v2.0

# All skills from a plugin
local-skills add superpowers@anthropics/claude-code/*

# Full git URL
local-skills add my-plugin@https://gitlab.com/team/repo.git/my-skill
```

### Update a skill

```bash
# Pull latest from upstream
local-skills update tdd

# Overwrite locally modified skill files
local-skills update --force tdd
```

If you've hand-edited installed skill files, `update` will refuse to overwrite them unless you pass `--force`. Skills pinned to a specific commit SHA are skipped automatically.

### Remove a skill

```bash
local-skills remove tdd
```

## Specifier Format

```
<plugin>@<marketplace>/<skill>[:<version>]
```

| Part          | Description                         |
| ------------- | ----------------------------------- |
| `plugin`      | Plugin name in the marketplace      |
| `marketplace` | GitHub `owner/repo` or full git URL |
| `skill`       | Skill name (or `*` for all)         |
| `version`     | Optional git ref (tag, branch)      |

## Tracked Files

Both files are intended to be committed to git.

### Manifest (`local-skills.json`)

Declares what skills are installed and from where:

```json
{
  "skills": {
    "tdd": {
      "source": "superpowers@anthropics/claude-code",
      "ref": "main",
      "sha": "abc123def456..."
    }
  }
}
```

### State file (`local-skills-state.json`)

Records what the skill files looked like at install time, so `update` can detect local modifications:

```json
{
  "skills": {
    "tdd": {
      "contentHash": "45019b204ee8..."
    }
  }
}
```

## How It Works

1. Parses the specifier to identify the plugin, marketplace, skill, and optional version
2. Shallow-clones the marketplace git repo
3. Reads `.claude-plugin/marketplace.json` to find the plugin
4. Copies the skill directory to `.claude/skills/<skill-name>/`
5. Records the source, ref, and commit SHA in the manifest
6. Computes a content hash of the installed files and stores it in the state file

### Update behavior

- **Pinned SHA** — if the `ref` in the manifest is a 40-character commit SHA, the skill is considered pinned and the update is skipped
- **Local modification detection** — the content hash of the installed files is compared against the stored hash; if they differ, the update is refused unless `--force` is passed
- **No state file** — if the state file is missing (e.g. from a pre-existing install), the modification check is skipped and the update proceeds unconditionally

## Development

```bash
pnpm run typecheck        # Type checking
pnpm run lint             # ESLint
pnpm run test             # Watch mode
pnpm run test:run         # Single run
pnpm run test:coverage    # Coverage (100% required)
```

## License

MIT
