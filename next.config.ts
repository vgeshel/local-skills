import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Exclude pino and related packages from server-side bundling
  // This prevents Turbopack from trying to bundle thread-stream test files
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
}

export default nextConfig
