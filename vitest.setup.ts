// Vitest setup file - sets up test environment
import { beforeAll } from 'vitest'

// Mock environment variables for tests
beforeAll(() => {
  process.env.DATABASE_URL = 'mongodb://localhost:27017/test'
  process.env.MYSQL_HOST = 'localhost'
  process.env.MYSQL_PORT = '3306'
  process.env.MYSQL_USER = 'test'
  process.env.MYSQL_PASSWORD = 'test'
  process.env.MYSQL_DATABASE = 'test'
  process.env.REDIS_URL = 'redis://localhost:6379'
  process.env.RCON_HOST = 'localhost'
  process.env.RCON_PORT = '25575'
  process.env.RCON_PASSWORD = 'test'
  process.env.NEXTAUTH_SECRET = 'test-secret-for-vitest'
  // NODE_ENV is typically set by the test runner, skip explicit assignment
})

