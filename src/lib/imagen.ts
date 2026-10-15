/**
 * Reduce una imagen en el navegador y la devuelve como data URL JPEG (fondo blanco).
 * Se usa para firmas y fotos referenciales de requerimientos: quedan livianas para guardarlas e imprimirlas.
 */
export async function reducirImagen(file: File, maxLado = 600, calidad = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Suba una imagen (foto o captura).')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('No se pudo leer la imagen.')); img.src = url })
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * escala)); c.height = Math.max(1, Math.round(img.height * escala))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', calidad)
  } finally {
    URL.revokeObjectURL(url)
  }
}
