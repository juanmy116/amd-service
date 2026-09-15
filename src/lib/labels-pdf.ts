import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'

// Datos de una etiqueta de máquina. Replica el contenido de la etiqueta
// unitaria (PR #66): solo Machine + N° Série + QR.
export type MachineLabel = {
  marque: string
  modele: string
  numero_serie: string
  qrUrl: string
}

export type LabelsPdfInput = {
  labels: MachineLabel[]
  // Logo AMD en BLANCO (PNG con transparencia) para la cabecera roja. Si falta,
  // se dibuja "AMD SERVICE" en texto blanco como respaldo.
  logoPng?: Uint8Array | null
}

// Colores corporativos AMD.
const RED = rgb(0xbf / 255, 0x0d / 255, 0x0d / 255)
const INK = rgb(0.094, 0.094, 0.106)
const MUTED = rgb(0.63, 0.63, 0.67)
const LINE = rgb(0.9, 0.9, 0.92)

// A4 vertical (puntos PDF) + cuadrícula 2×2 = 4 etiquetas por hoja. La celda
// resultante (~262×385 pt ≈ 92×136 mm) conserva la proporción vertical de la
// etiqueta física (68×100 mm).
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 28
const COLS = 2
const ROWS = 2
const GAP = 16
const CELL_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS
const CELL_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS
const PER_PAGE = COLS * ROWS

const HEAD_H = 48 // alto de la cabecera roja
const PAD = 18 // padding lateral del cuerpo
const LOGO_W = 140 // ancho del logo blanco en la cabecera
const QR_SIZE = 136 // lado del QR (reducido para dejar sitio a "SERVICE TECHNIQUE")
// Cuerpo de "SERVICE TECHNIQUE". La celda del PDF es más ancha que la etiqueta
// física (~92 mm frente a 68 mm), así que se escala respecto de los 20 pt
// aprobados en la etiqueta unitaria para que se vea del mismo tamaño relativo.
const CTA_SIZE = 27

// WinAnsi (fuentes estándar) cubre el francés; sustituye cualquier carácter
// fuera de Latin-1 por '?' para no romper la generación del PDF.
function san(value: string | number | null | undefined): string {
  return (value ?? '').toString().replace(/[^ -ÿ]/g, '?')
}

// Recorta un texto con '...' si no cabe en maxWidth.
function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && font.widthOfTextAtSize(cut + '...', size) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return cut + '...'
}

type Fonts = { reg: PDFFont; bold: PDFFont; mono: PDFFont }

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  cx: number,
  y: number,
  color: ReturnType<typeof rgb>,
) {
  const t = san(text)
  page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y, size, font, color })
}

// Dibuja un campo "ÉTIQUETTE / valeur" y devuelve la Y de la siguiente fila.
function drawField(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  topY: number,
  width: number,
  label: string,
  value: string,
  valueSize: number,
  valueFont: PDFFont,
): number {
  page.drawText(san(label), { x, y: topY, size: 7, font: fonts.bold, color: MUTED })
  const valueY = topY - valueSize - 4
  page.drawText(truncate(san(value), valueFont, valueSize, width), {
    x,
    y: valueY,
    size: valueSize,
    font: valueFont,
    color: INK,
  })
  return valueY - 14
}

function drawLabel(
  page: PDFPage,
  fonts: Fonts,
  logo: PDFImage | null,
  data: MachineLabel,
  qrImg: PDFImage,
  x: number,
  y: number,
) {
  const top = y + CELL_H
  const cx = x + CELL_W / 2

  // Fondo blanco.
  page.drawRectangle({ x, y, width: CELL_W, height: CELL_H, color: rgb(1, 1, 1) })

  // Cabecera roja con logo blanco centrado (o respaldo de texto).
  const bandY = top - HEAD_H
  page.drawRectangle({ x, y: bandY, width: CELL_W, height: HEAD_H, color: RED })
  if (logo) {
    const dims = logo.scale(LOGO_W / logo.width)
    page.drawImage(logo, {
      x: cx - dims.width / 2,
      y: bandY + (HEAD_H - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    })
  } else {
    drawCentered(page, fonts.bold, 'AMD SERVICE', 16, cx, bandY + HEAD_H / 2 - 6, rgb(1, 1, 1))
  }

  // Cuerpo: Machine + N° Série.
  let cursor = bandY - 22
  cursor = drawField(page, fonts, x + PAD, cursor, CELL_W - 2 * PAD, 'MACHINE', `${data.marque} ${data.modele}`.trim(), 11, fonts.bold)
  cursor = drawField(page, fonts, x + PAD, cursor, CELL_W - 2 * PAD, 'N° SÉRIE', data.numero_serie, 9.5, fonts.mono)

  // QR centrado + "SERVICE TECHNIQUE" (rojo, dos líneas) en el espacio restante.
  const qrTop = cursor - 14
  const qrY = qrTop - QR_SIZE
  page.drawImage(qrImg, { x: cx - QR_SIZE / 2, y: qrY, width: QR_SIZE, height: QR_SIZE })
  drawCentered(page, fonts.bold, 'SERVICE', CTA_SIZE, cx, qrY - CTA_SIZE - 8, RED)
  drawCentered(page, fonts.bold, 'TECHNIQUE', CTA_SIZE, cx, qrY - 2 * CTA_SIZE - 12, RED)

  // Marco de la etiqueta (encima de todo, nítido).
  page.drawRectangle({ x, y, width: CELL_W, height: CELL_H, borderColor: LINE, borderWidth: 0.75 })
}

// Genera el PDF con todas las etiquetas (4 por hoja A4).
export async function buildLabelsPdf(input: LabelsPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  }
  const logo = input.logoPng ? await pdf.embedPng(input.logoPng) : null

  // QR por máquina (PNG de alta resolución, corrección de errores 'H' y zona de
  // silencio): mismo nivel de robustez que la etiqueta unitaria, tolerante a
  // desgaste/suciedad de la etiqueta física.
  const qrImgs = await Promise.all(
    input.labels.map(async (l) => {
      const buf = await QRCode.toBuffer(l.qrUrl, { errorCorrectionLevel: 'H', width: 600, margin: 1 })
      return pdf.embedPng(buf)
    }),
  )

  for (let i = 0; i < input.labels.length; i++) {
    if (i % PER_PAGE === 0) pdf.addPage([PAGE_W, PAGE_H])
    const page = pdf.getPage(pdf.getPageCount() - 1)
    const slot = i % PER_PAGE
    const col = slot % COLS
    const row = Math.floor(slot / COLS)
    const x = MARGIN + col * (CELL_W + GAP)
    const y = PAGE_H - MARGIN - (row + 1) * CELL_H - row * GAP
    drawLabel(page, fonts, logo, input.labels[i], qrImgs[i], x, y)
  }

  return pdf.save()
}
