import { html } from './format.js';

/**
 * Profile photo of a user, or their initial on a soft background if they have none.
 * The color of the initial depends on the profile (producer green, buyer harvest yellow).
 *
 * @param {{name: string, role: string, avatar?: string|null}} user
 * @param {string} apiUrl backend URL (the photos are served at <apiUrl>/avatars/<file>)
 * @param {object} [options]
 * @param {number} [options.size] in px
 * @param {string} [options.className]
 */
export function avatar(user, apiUrl, { size = 36, className = '' } = {}) {
  const style = `--avatar-size:${size}px`;
  const kind = user.role === 'BUYER' ? 'buyer' : 'producer';
  if (user.avatar) {
    return html`<img class="avatar ${className}" style="${style}" src="${apiUrl}${user.avatar}" alt="" width="${size}" height="${size}" decoding="async">`;
  }
  return html`<span class="avatar ${kind} ${className}" style="${style}" aria-hidden="true">${initials(user.name)}</span>`;
}

/** First letters of the first two words: "Rosa Pérez" → "RP". */
export function initials(name) {
  return String(name ?? '').trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('') || '?';
}

export const roleLabel = (role) => (role === 'PRODUCER' ? 'Productor' : 'Comprador');
