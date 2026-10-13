/**
 * Web Worker de compresión de imágenes.
 * Una foto de un celular pesa 2–5 MB; subirla con un plan de datos limitado es inviable.
 * Aquí se redimensiona a máx. 800 px y se recodifica en WebP (~50–150 KB) usando OffscreenCanvas,
 * FUERA del hilo principal, para que la interfaz no se congele en celulares de gama baja.
 * (Mismo objetivo que la librería browser-image-compression, sin añadir dependencias.)
 */
self.onmessage = async ({ data }) => {
  const { id, archivo, maxLado = 800, calidad = 0.7 } = data;
  try {
    const inicio = performance.now();
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = new OffscreenCanvas(ancho, alto);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    let blob = await lienzo.convertToBlob({ type: 'image/webp', quality: calidad });
    if (blob.type !== 'image/webp') blob = await lienzo.convertToBlob({ type: 'image/jpeg', quality: calidad });

    self.postMessage({
      id, ok: true, blob, ancho, alto,
      bytesOriginal: archivo.size,
      bytesComprimido: blob.size,
      milisegundos: Math.round(performance.now() - inicio),
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: `No se pudo comprimir la imagen: ${error.message}` });
  }
};
