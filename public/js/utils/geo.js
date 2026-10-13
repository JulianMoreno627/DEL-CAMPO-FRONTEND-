/** Distance between two coordinates (Haversine formula), in km. */
export function distanceKm(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Artificial workload to compare the main thread vs a Web Worker in the performance view. */
export function heavyCalculation(n) {
  const origin = { lat: 4.65, lng: -74.06 };
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += distanceKm(origin, { lat: 4 + (i % 1000) / 1000, lng: -74.5 + (i % 777) / 777 });
  }
  return sum;
}
