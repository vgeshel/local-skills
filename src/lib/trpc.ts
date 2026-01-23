import type { AppRouter } from '@/server/trpc'
import { httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import superjson from 'superjson'

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return ''
  }
  // SSR: assume localhost
  return 'http://localhost:3000'
}

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
})
