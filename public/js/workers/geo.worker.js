/**
 * Web Worker geoespacial: calcula distancias, filtra por radio y ordena el catálogo.
 * El catálogo se descarga una sola vez; cambiar el radio o la ubicación se resuelve
 * aquí, sin nuevas peticiones (ahorro de datos) y sin bloquear el hilo principal (mejor INP).
 */
import { distanciaKm, calculoPesado } from '../utilidades/geo.js';

const tareas = {
  FILTRAR({ items, origen, radioKm, categoria, productorId }) {
    const resultado = [];
    for (const item of items) {
      if (categoria && item.categoria !== categoria) continue;
      if (productorId && item.productorId !== productorId) continue;
      const distancia = origen && item.productor ? distanciaKm(origen, item.productor.ubicacion) : null;
      if (origen && radioKm && distancia > radioKm) continue;
      resultado.push({ ...item, distanciaKm: distancia == null ? null : Math.round(distancia * 10) / 10 });
    }
    resultado.sort((a, b) => (origen ? a.distanciaKm - b.distanciaKm : a.fechaDisponible.localeCompare(b.fechaDisponible)));
    return { items: resultado };
  },

  CALCULO_PESADO({ n }) {
    const inicio = performance.now();
    const suma = calculoPesado(n);
    return { suma, milisegundos: performance.now() - inicio };
  },
};

self.onmessage = ({ data }) => {
  const { id, tipo } = data;
  try {
    if (!tareas[tipo]) throw new Error(`Tarea desconocida: ${tipo}`);
    self.postMessage({ id, ok: true, ...tareas[tipo](data) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
