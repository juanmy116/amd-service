import { seed } from './fixtures'

// Seed antes de la suite. Los IDs se reusan vía un fichero temporal que leen los specs
// (Playwright no comparte estado en memoria entre globalSetup y los tests).
import { writeFileSync } from 'node:fs'

export default async function globalSetup() {
  const ids = await seed()
  writeFileSync('tests/e2e/.seed.json', JSON.stringify(ids))
}
