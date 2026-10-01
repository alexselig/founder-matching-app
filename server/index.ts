import { createServer } from './app.js'

const port = Number(process.env.PORT ?? '3000')
const host = process.env.HOST ?? '127.0.0.1'

const server = createServer({
  databaseStatus: () => 'ready',
})

try {
  await server.listen({ port, host })
  console.log(`Founder app server listening on http://${host}:${port}`)
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
