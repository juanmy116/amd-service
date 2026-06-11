import { teardown } from './fixtures'
import { rmSync } from 'node:fs'

export default async function globalTeardown() {
  await teardown()
  try { rmSync('tests/e2e/.seed.json') } catch { /* noop */ }
}
