import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';

/** Illustration for products without a photo: the first keyword found in the name wins (that is why "papaya" goes before "papa"). */
const ILLUSTRATIONS = [
  ['papaya', '🍈'], ['papa', '🥔'], ['zanahoria', '🥕'], ['fresa', '🍓'], ['mora', '🫐'], ['arándano', '🫐'], ['lechuga', '🥬'],
  ['cebolla', '🧅'], ['ajo', '🧄'], ['tomate', '🍅'], ['arveja', '🫛'], ['frijol', '🫘'], ['haba', '🫛'],
  ['maíz', '🌽'], ['mazorca', '🌽'], ['aguacate', '🥑'], ['plátano', '🍌'], ['banano', '🍌'], ['naranja', '🍊'],
  ['mandarina', '🍊'], ['limón', '🍋'], ['mango', '🥭'], ['piña', '🍍'], ['uva', '🍇'], ['manzana', '🍎'],
  ['pera', '🍐'], ['durazno', '🍑'], ['cereza', '🍒'], ['coco', '🥥'], ['kiwi', '🥝'], ['pepino', '🥒'],
  ['pimentón', '🫑'], ['ají', '🌶️'], ['brócoli', '🥦'], ['champiñón', '🍄'], ['café', '☕'], ['huevo', '🥚'],
  ['leche', '🥛'], ['queso', '🧀'], ['miel', '🍯'], ['arroz', '🌾'], ['trigo', '🌾'], ['melón', '🍈'],
  ['sandía', '🍉'], ['yuca', '🍠'], ['batata', '🍠'], ['cubio', '🥔'], ['ulluco', '🥔'], ['hierba', '🌿'], ['cilantro', '🌿'],
];

export function illustrationFor(productName) {
  const text = productName.toLowerCase();
  return ILLUSTRATIONS.find(([keyword]) => text.includes(keyword))?.[1] ?? '🌱';
}

/** The product photo or, if it has none, an illustration on a soft background. Nothing is ever drawn on top of it. */
export function productPhoto(listing, apiUrl, { className = '' } = {}) {
  return listing.photo
    ? html`<img class="${className}" src="${apiUrl}${listing.photo}" alt="${listing.product}" width="400" height="300" loading="lazy" decoding="async">`
    : html`<div class="${className} no-photo" role="img" aria-label="${listing.product}"><span aria-hidden="true">${illustrationFor(listing.product)}</span></div>`;
}

/** "Quedan 30 kg" / "Agotado" */
export function availabilityText(listing) {
  return listing.availableQuantity > 0 ? `Quedan ${listing.availableQuantity} ${listing.unit}` : 'Agotado';
}

/**
 * Product card with a fixed order so every card lines up:
 * photo → name and seller → description → price and availability → actions.
 * Used by the buyer (to add to the cart) and by the producer (to manage their products).
 * @param {object} listing listing as returned by /api/listings
 * @param {object} options
 * @param {string} options.apiUrl
 * @param {import('../utils/format.js').SafeHtml} [options.actions] buttons at the bottom
 * @param {import('../utils/format.js').SafeHtml} [options.extra] content between the price and the actions
 * @param {boolean} [options.opensDetail] the photo and the name open the product detail
 * @param {import('../utils/format.js').SafeHtml} [options.photo] image to show instead of listing.photo (preview)
 */
export function productCard(listing, { apiUrl, actions = '', extra = '', opensDetail = false, photo = null }) {
  const openAttr = opensDetail ? html`data-view="${listing.id}"` : '';
  return html`
<article class="product">
  <div class="product-photo ${opensDetail ? 'clickable' : ''}" ${openAttr}>${photo ?? productPhoto(listing, apiUrl)}</div>
  <div class="product-body">
    <div class="product-header">
      <h3 class="product-name ${opensDetail ? 'clickable' : ''}" ${openAttr}>${listing.product}</h3>
      ${listing.producer ? html`<p class="product-seller">${icon('pin', { size: 15 })}${listing.producer.name}${listing.producer.town ? ` · ${listing.producer.town}` : ''}</p>` : ''}
    </div>
    <p class="product-description">${listing.description || html`<span class="no-description">Sin descripción</span>`}</p>
    <div class="product-footer">
      <span class="product-price">${formatPrice(listing.price)}<small> / ${listing.unit}</small></span>
      <span class="product-stock ${listing.availableQuantity > 0 ? '' : 'sold-out'}">${availabilityText(listing)}</span>
    </div>
    ${extra}
    ${actions ? html`<div class="product-actions">${actions}</div>` : ''}
  </div>
</article>`;
}

/**
 * Quantity selector "− n +". The buttons change the field and fire "change" (see enableQuantitySelectors).
 * @param {import('../utils/format.js').SafeHtml} [options.attributes] extra attributes for the input
 */
export function quantitySelector({ name = 'quantity', value = 1, max, label = 'Cantidad', attributes = '' }) {
  return html`
<div class="qty">
  <button type="button" data-step="-1" aria-label="Menos">${icon('minus', { size: 16 })}</button>
  <input name="${name}" type="number" min="1" ${max != null ? html`max="${max}"` : ''} value="${value}" required aria-label="${label}" ${attributes}>
  <button type="button" data-step="1" aria-label="Más">${icon('plus', { size: 16 })}</button>
</div>`;
}

/** Event delegation for every quantity selector in a view. */
export function enableQuantitySelectors(component) {
  component.on('click', '.qty [data-step]', (_e, button) => {
    const input = button.parentElement.querySelector('input');
    const max = input.max ? Number(input.max) : Infinity;
    const next = Math.min(max, Math.max(1, (Number(input.value) || 1) + Number(button.dataset.step)));
    if (next === Number(input.value)) return;
    input.value = next;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
