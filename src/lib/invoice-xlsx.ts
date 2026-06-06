import ExcelJS from 'exceljs'

export type InvoiceHeader = {
  numero_facture: string; client_name: string; period_year: number; period_month: number
  currency: string; total_amount: number; has_estimated: boolean
}
export type InvoiceLineRow = {
  numero_contrat: string; machine_label: string; plan_name: string; billing_type: string
  fixed_fee: number | null; price_bw: number | null; price_color: number | null
  delta_bw: number; delta_color: number; amount_fixed: number; amount_bw: number
  amount_color: number; amount_total: number; is_estimated: boolean
}

export async function buildInvoiceWorkbook(h: InvoiceHeader, lines: InvoiceLineRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AMD Service'
  const ws = wb.addWorksheet(h.numero_facture)

  ws.addRow([`Facture ${h.numero_facture}`])
  ws.addRow([`Client : ${h.client_name}`])
  ws.addRow([`Période : ${String(h.period_month).padStart(2, '0')}/${h.period_year}`])
  ws.addRow([])
  const headerRow = ws.addRow(['Contrat', 'Machine', 'Plan', 'Forfait', 'Prix B&N', 'ΔB&N', 'Prix Coul.', 'ΔCoul.', 'Total', 'Estimée'])
  headerRow.font = { bold: true }

  const firstDataRow = headerRow.number + 1
  lines.forEach((l, i) => {
    const r = firstDataRow + i
    // N2: la fórmula solo es válida para precio plano. En hybrid_tiered los precios son null
    // y el importe vive en los tramos → escribir amount_total como valor literal.
    // H11: redondear cada producto (ROUND(.,0)) para cuadrar con amount_total, que se calculó
    // con Math.round por componente; con precios decimales un E*F sin redondear divergería.
    const totalCell = l.billing_type === 'hybrid_tiered'
      ? l.amount_total
      : { formula: `D${r}+ROUND(E${r}*F${r},0)+ROUND(G${r}*H${r},0)` }
    ws.addRow([
      l.numero_contrat, l.machine_label, l.plan_name,
      l.amount_fixed, l.price_bw ?? 0, l.delta_bw, l.price_color ?? 0, l.delta_color,
      totalCell,
      l.is_estimated ? 'OUI' : '',
    ])
  })

  const lastDataRow = firstDataRow + lines.length - 1
  const totalRow = ws.addRow(['', '', '', '', '', '', '', 'TOTAL', { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }])
  totalRow.font = { bold: true }

  ws.columns.forEach(c => { c.width = 16 })
  ws.getColumn(2).width = 32

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
