import matter from 'gray-matter'
import { z } from 'zod'

const frontMatterDataSchema = z.record(z.string(), z.unknown())

export interface FrontMatterResult {
  readonly data: Record<string, unknown>
  readonly content: string
}

export function parseFrontMatter(input: string): FrontMatterResult {
  const result = matter(input)
  return {
    data: frontMatterDataSchema.parse(result.data),
    content: result.content,
  }
}
