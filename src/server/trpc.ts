import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { z } from 'zod'

const t = initTRPC.context<object>().create({
  transformer: superjson,
})

export const publicProcedure = t.procedure

// ============================================================================
// App Router
// ============================================================================

export const appRouter = t.router({
  health: publicProcedure.output(z.object({ status: z.string() })).query(() => {
    return { status: 'ok' }
  }),
})

export type AppRouter = typeof appRouter
