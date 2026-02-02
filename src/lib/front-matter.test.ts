import { describe, expect, it } from 'vitest'

import { parseFrontMatter } from './front-matter.js'

describe('parseFrontMatter', () => {
  it('parses YAML front matter from markdown', () => {
    const content = `---
name: tdd
description: Test-driven development
---

# TDD Skill`

    const result = parseFrontMatter(content)

    expect(result.data).toEqual({
      name: 'tdd',
      description: 'Test-driven development',
    })
    expect(result.content).toContain('# TDD Skill')
  })

  it('returns empty data when no front matter', () => {
    const content = '# Just a heading'

    const result = parseFrontMatter(content)

    expect(result.data).toEqual({})
    expect(result.content).toBe('# Just a heading')
  })

  it('handles empty content', () => {
    const result = parseFrontMatter('')

    expect(result.data).toEqual({})
    expect(result.content).toBe('')
  })
})
