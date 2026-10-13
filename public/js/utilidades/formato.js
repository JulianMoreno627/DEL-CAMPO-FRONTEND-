/**
 * Plantillas seguras: html`...` escapa automáticamente cada valor interpolado (previene XSS),
 * salvo que ya sea un HtmlSeguro (plantilla anidada).
 */
export class HtmlSeguro {
  constructor(texto) { this.texto = texto; }
  toString() { return this.texto; }
}

export const escapar = (v) => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function aTexto(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(aTexto).join('');
  if (v instanceof HtmlSeguro) return v.texto;
  return escapar(v);
}

export function html(partes, ...valores) {
  return new HtmlSeguro(partes.reduce((acc, parte, i) => acc + parte + (i < valores.length ? aTexto(valores[i]) : ''), ''));
}

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatoPesos = (n) => pesos.format(n ?? 0);

const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatoFecha = (iso) => (iso ? fecha.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—');

export function diasHasta(iso) {
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00Z`) - hoy) / 86_400_000);
}

export function formatoBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(2)} MB`;
}

export const ETIQUETA_ESTADO = {
  SEMBRADO: 'Sembrado', EN_CRECIMIENTO: 'En crecimiento', DISPONIBLE: 'Disponible', AGOTADO: 'Agotado',
};

/** Siguiente estado permitido en la máquina de estados de la cosecha (espejo del backend). */
export const SIGUIENTE_ESTADO = { SEMBRADO: 'EN_CRECIMIENTO', EN_CRECIMIENTO: 'DISPONIBLE', DISPONIBLE: 'AGOTADO' };

export const CATEGORIAS = { hortalizas: 'Hortalizas', tuberculos: 'Tubérculos', frutas: 'Frutas', granos: 'Granos', otros: 'Otros' };
