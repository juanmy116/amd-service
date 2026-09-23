// Genera los iconos de la PWA de técnicos («AMD SAV») a partir del logo blanco, sobre el rojo
// corporativo. Se ejecuta a mano cuando cambie el logo; los PNG resultantes se versionan.
//   node scripts/generate-pwa-icons.mjs
import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'

const RED = { r: 0xbf, g: 0x0d, b: 0x0d }
const OUT = 'public/pwa'
const logo = await readFile('public/images/logos/logo-amd-blanco.svg')

// logoRatio = ancho del logo respecto al lado del icono. El maskable deja más margen porque
// Android lo recorta en círculo (zona segura = 80 % central).
const ICONS = [
  { file: 'icon-192.png',          size: 192, logoRatio: 0.78 },
  { file: 'icon-512.png',          size: 512, logoRatio: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, logoRatio: 0.6 },
  { file: 'apple-touch-icon.png',  size: 180, logoRatio: 0.78 },
]

await mkdir(OUT, { recursive: true })

for (const { file, size, logoRatio } of ICONS) {
  const logoPng = await sharp(logo).resize({ width: Math.round(size * logoRatio) }).png().toBuffer()
  // removeAlpha() ⇒ PNG sin canal alfa: iOS pinta de NEGRO cualquier transparencia del apple-touch-icon.
  await sharp({ create: { width: size, height: size, channels: 3, background: RED } })
    .composite([{ input: logoPng, gravity: 'center' }])
    .removeAlpha()
    .png()
    .toFile(`${OUT}/${file}`)
  console.log(`✓ ${OUT}/${file} (${size}×${size})`)
}
