/**
 * Safe templates: html`...` automatically escapes every interpolated value (prevents XSS),
 * unless it is already a SafeHtml (nested template).
 */
export class SafeHtml {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function toText(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(toText).join('');
  if (value instanceof SafeHtml) return value.text;
  return escapeHtml(value);
}

export function html(parts, ...values) {
  return new SafeHtml(parts.reduce((acc, part, i) => acc + part + (i < values.length ? toText(values[i]) : ''), ''));
}

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatPrice = (n) => copFormatter.format(n ?? 0);

export function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}
