/**
 * Image compression Web Worker.
 * A phone photo weighs 2–5 MB; uploading it on a limited data plan is not viable.
 * Here it is resized to max. 800 px and re-encoded as WebP (~50–150 KB) using OffscreenCanvas,
 * OFF the main thread, so the interface does not freeze on low-end phones.
 * (Same goal as the browser-image-compression library, without adding dependencies.)
 */
self.onmessage = async ({ data }) => {
  const { id, file, maxSide = 800, quality = 0.7 } = data;
  try {
    const start = performance.now();
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    self.postMessage({
      id, ok: true, blob, width, height,
      originalBytes: file.size,
      compressedBytes: blob.size,
      milliseconds: Math.round(performance.now() - start),
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: `No se pudo comprimir la imagen: ${error.message}` });
  }
};
