import { Component } from '../core/Component.js';
import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';
import { productCard, productPhoto, availabilityText, quantitySelector, enableQuantitySelectors } from '../components/product.js';

/**
 * Buyer profile: the products published by producers, only with the price they set.
 * Tapping a product opens its detail; products are added to the cart from the card or the detail.
 */
export default class ProductsView extends Component {
  #searchTimer = null;
  #turn = 0;

  constructor(props) {
    super(props);
    this.state = { error: null, listings: [], search: '' };
  }

  async onMount() {
    this.on('input', '[name="search"]', (_e, el) => {
      // Wait until the user stops typing so there is not one request per letter
      clearTimeout(this.#searchTimer);
      this.#searchTimer = setTimeout(() => this.load(el.value), 300);
    });
    this.on('submit', 'form.add-to-cart', (e, form) => { e.preventDefault(); this.addToCart(form); });
    this.on('click', '[data-view]', (_e, el) => this.showDetail(el.dataset.view));
    this.on('click', '[data-action="close"]', () => this.$('#detail').close());
    this.on('click', '#detail', (e, dialog) => { if (e.target === dialog) dialog.close(); });
    enableQuantitySelectors(this);
    this.onCleanup(() => clearTimeout(this.#searchTimer));
    await this.load('');
  }

  async load(search) {
    const turn = ++this.#turn;
    this.state.search = search;
    try {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const listings = await this.props.api.get(`/api/listings${query}`);
      if (turn !== this.#turn) return; // arrived late: there is already a newer search
      Object.assign(this.state, { listings, error: null });
    } catch (error) {
      this.state.error = error.message;
    }
    this.renderList();
  }

  async addToCart(form) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { items } = await this.props.api.post('/api/cart/items', {
        listingId: form.dataset.listing, quantity: Number(form.quantity.value),
      });
      this.props.store.update({ cartCount: items.length });
      this.props.notify(`${form.dataset.product} agregado al carrito.`);
      this.$('#detail').close();
    } catch (error) {
      this.props.notify(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  showDetail(id) {
    const listing = this.state.listings.find((l) => l.id === id);
    if (!listing) return;
    const dialog = this.$('#detail');
    dialog.innerHTML = String(html`
<article class="detail">
  <button type="button" class="icon-btn close-detail" data-action="close" aria-label="Cerrar">✕</button>
  <div class="detail-photo">${productPhoto(listing, this.props.apiUrl)}</div>
  <div class="detail-info">
    <h2>${listing.product}</h2>
    ${listing.producer ? html`<p class="product-seller">${icon('pin', { size: 16 })}${listing.producer.name}${listing.producer.town ? ` · ${listing.producer.town}` : ''}</p>` : ''}
    <p class="detail-price">${formatPrice(listing.price)}<small> / ${listing.unit}</small></p>
    <p class="product-stock">${availabilityText(listing)}</p>
    <h3>Descripción</h3>
    <p class="detail-description">${listing.description || 'El productor no agregó una descripción.'}</p>
    ${this.#addToCartForm(listing, { large: true })}
  </div>
</article>`);
    dialog.showModal();
  }

  // The search box is rendered once; only #list is re-rendered so typing keeps the focus
  template() {
    const firstName = this.props.store.state.user?.name.split(' ')[0] ?? '';
    return html`
<div class="section-header">
  <div>
    <h1>Hola, ${firstName}</h1>
    <p class="subtitle">Productos frescos, directo de quien los cultiva.</p>
  </div>
  <label class="search">
    <span class="visually-hidden">Buscar</span>
    ${icon('search', { size: 18 })}
    <input name="search" type="search" placeholder="Buscar producto…" value="${this.state.search}">
  </label>
</div>
<div id="list"><p class="loading">Cargando productos…</p></div>
<dialog id="detail" class="dialog" aria-label="Detalle del producto"></dialog>`;
  }

  renderList() {
    const list = this.$('#list');
    if (!list) return;
    const { error, listings, search } = this.state;
    if (error) return void (list.innerHTML = String(html`<p class="notice error">${error}</p>`));
    if (!listings.length) {
      list.innerHTML = String(html`
<div class="card empty large">
  <div class="empty-illustration" aria-hidden="true">${search ? '🔍' : '🧺'}</div>
  <h2>${search ? 'No encontramos ese producto' : 'Aún no hay productos'}</h2>
  <p>${search ? 'Pruebe con otro nombre.' : 'Cuando los productores publiquen lo que cultivan, aparecerá aquí.'}</p>
</div>`);
      return;
    }
    list.innerHTML = String(html`
<p class="result-count">${listings.length} ${listings.length === 1 ? 'producto disponible' : 'productos disponibles'}${search ? html` para «${search}»` : ''}</p>
<div class="grid">${listings.map((listing) => productCard(listing, {
    apiUrl: this.props.apiUrl,
    opensDetail: true,
    actions: this.#addToCartForm(listing),
  }))}</div>`);
  }

  #addToCartForm(listing, { large = false } = {}) {
    return html`
<form class="add-to-cart ${large ? 'add-to-cart-large' : ''}" data-listing="${listing.id}" data-product="${listing.product}">
  ${quantitySelector({ value: 1, max: listing.availableQuantity, label: `Cantidad en ${listing.unit}` })}
  <button class="btn ${large ? 'large' : ''}" type="submit">${icon('cart', { size: 18 })}${large ? 'Agregar al carrito' : 'Agregar'}</button>
</form>`;
  }
}
