/** Distancia entre dos coordenadas (fórmula de Haversine), en km. Compartida por el hilo principal y el Web Worker. */
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Carga de trabajo artificial para comparar hilo principal vs Web Worker en la vista de Rendimiento. */
export function calculoPesado(n) {
  const origen = { lat: 4.65, lng: -74.06 };
  let suma = 0;
  for (let i = 0; i < n; i++) {
    suma += distanciaKm(origen, { lat: 4 + (i % 1000) / 1000, lng: -74.5 + (i % 777) / 777 });
  }
  return suma;
}
