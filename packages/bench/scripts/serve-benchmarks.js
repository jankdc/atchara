#!/usr/bin/env node

import { serve } from '@hono/node-server'
import serverConfig from '../server.js'

const port = serverConfig.port
const server = serve(
  {
    fetch: serverConfig.fetch,
    port,
  },
  (info) => {
    console.log(`Server running on http://localhost:${info.port}`)
  }
)

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
