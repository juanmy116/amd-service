// src/lib/pdfToImages.ts
//
// Trocea un PDF en imágenes JPEG, UNA por página, EN EL NAVEGADOR (no en el servidor).
// Motivo: en Vercel/serverless renderizar PDF es frágil (depende de canvas nativo) y choca
// con el límite de 4,5 MB por petición; un PDF de 46 páginas (5 MB) no cabría. Aquí el peso
// lo lleva el equipo del admin y cada página resultante entra por la subida normal de imágenes.
//
// Solo se importa dinámicamente desde un componente cliente (usa canvas + Web Worker).

// Cada página se rasteriza a ~este ancho en píxeles. Compromiso calidad/peso para el OCR:
// nítido para leer el N° de série y los contadores, sin generar JPEG enormes.
const TARGET_WIDTH = 1654 // ≈ A4 a 200 DPI
const JPEG_QUALITY = 0.85

export type PdfProgress = (done: number, total: number) => void

/** Renderiza cada página del PDF a un Blob JPEG. Lanza si el PDF no se puede abrir. */
export async function pdfToJpegBlobs(file: File, onProgress?: PdfProgress): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist')
  // Worker servido como asset del mismo origen (Turbopack resuelve new URL(import.meta.url)).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await loadingTask.promise
  const blobs: Blob[] = []

  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = TARGET_WIDTH / base.width
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas_unavailable')

      await page.render({ canvas, canvasContext: ctx, viewport }).promise

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      )
      page.cleanup()
      if (blob) blobs.push(blob)
      onProgress?.(n, pdf.numPages)
    }
  } finally {
    await loadingTask.destroy()
  }

  return blobs
}
