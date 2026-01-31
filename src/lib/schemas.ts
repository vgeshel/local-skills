import { z } from 'zod'

const ManifestSkillEntrySchema = z.object({
  source: z.string(),
  ref: z.string(),
  sha: z.string(),
})

export const ManifestSchema = z.object({
  skills: z.record(z.string(), ManifestSkillEntrySchema),
})

const GitHubSourceSchema = z.object({
  source: z.literal('github'),
  repo: z.string(),
})

const UrlSourceSchema = z.object({
  source: z.literal('url'),
  url: z.string(),
})

const PluginSourceSchema = z.union([
  z.string(),
  GitHubSourceSchema,
  UrlSourceSchema,
])

const MarketplacePluginSchema = z.object({
  name: z.string(),
  source: PluginSourceSchema,
})

export const MarketplaceConfigSchema = z.object({
  plugins: z.array(MarketplacePluginSchema),
  metadata: z
    .object({
      pluginRoot: z.string().optional(),
    })
    .optional(),
})
