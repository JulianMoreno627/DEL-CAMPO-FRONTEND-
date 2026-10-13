import { html } from '../utilidades/formato.js';

/**
 * Mapa de productores cercanos en SVG puro: 0 KB de teselas descargadas (un mapa de teselas
 * como Leaflet/OSM consume cientos de KB por vista, inviable con datos limitados).
 * Proyección equirectangular local alrededor del comprador: suficiente para distancias < 200 km.
 */
export function mapaLigero({ origen, puntos, radioKm, apiUrl }) {
  if (!origen || !puntos.length) return '';
  const KM_POR_GRADO_LAT = 110.57;
  const kmPorGradoLng = 111.32 * Math.cos((origen.lat * Math.PI) / 180);
  const proyectar = ({ lat, lng }) => ({ x: (lng - origen.lng) * kmPorGradoLng, y: -(lat - origen.lat) * KM_POR_GRADO_LAT });

  const alcance = Math.max(radioKm || 0, ...puntos.map((p) => Math.hypot(proyectar(p.ubicacion).x, proyectar(p.ubicacion).y))) * 1.1 || 10;
  const escala = 140 / alcance;

  return html`
<svg class="mapa" viewBox="-160 -160 320 320" role="img" aria-label="Mapa de fincas cercanas">
  <title>Fincas alrededor de su punto de entrega</title>
  ${radioKm ? html`<circle r="${radioKm * escala}" fill="#2f6b3a14" stroke="#2f6b3a" stroke-dasharray="4 4"/>` : ''}
  <circle r="6" fill="#7a4f2a"/>
  <text y="20" text-anchor="middle" font-size="11" fill="#7a4f2a">Usted</text>
  ${puntos.map((p) => {
    const { x, y } = proyectar(p.ubicacion);
    return html`
  <a href="${apiUrl}/productores/${encodeURIComponent(p.id)}">
    <circle cx="${x * escala}" cy="${y * escala}" r="7" fill="#2f6b3a"><title>${p.finca} (${p.vereda}) · ${p.distanciaKm} km</title></circle>
    <text x="${x * escala}" y="${y * escala - 10}" text-anchor="middle" font-size="10" fill="#1f2a1f">${p.finca}</text>
  </a>`;
  })}
</svg>`;
}
