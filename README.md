# local-skills

Extract individual skills from Claude Code plugin marketplaces and copy them into your project's `.claude/skills/` directory. Each project gets a curated, version-controlled set of skills.

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
local-skills update tdd
```

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

## Manifest

Installed skills are tracked in `.claude/local-skills.json`:

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

## How It Works

1. Parses the specifier to identify the plugin, marketplace, skill, and optional version
2. Shallow-clones the marketplace git repo
3. Reads `.claude-plugin/marketplace.json` to find the plugin
4. Copies the skill directory to `.claude/skills/<skill-name>/`
5. Records the source, ref, and commit SHA in the manifest

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
