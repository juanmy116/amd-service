import { seed } from './fixtures'
import { adminClient, enableBilling } from '../rls/helpers'

// Seed antes de la suite. Los IDs se reusan vía un fichero temporal que leen los specs
// (Playwright no comparte estado en memoria entre globalSetup y los tests).
import { writeFileSync } from 'node:fs'

export default async function globalSetup() {
  // Capa 1 — abre el candado de facturación (arranca apagado por migración); el spec de facturación
  // emite por la UI, que oculta el botón «Émettre» mientras está echado.
  await enableBilling(adminClient())
  const ids = await seed()
  writeFileSync('tests/e2e/.seed.json', JSON.stringify(ids))
}
