'use client'

import { TrpcProvider } from '@/lib/providers'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return <TrpcProvider>{children}</TrpcProvider>
}
