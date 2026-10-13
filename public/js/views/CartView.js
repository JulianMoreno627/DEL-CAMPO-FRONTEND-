import { Component } from '../core/Component.js';
import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';
import { quantitySelector, enableQuantitySelectors, illustrationFor } from '../components/product.js';

/** Buyer's shopping cart: change quantities, remove products and check out. */
export default class CartView extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, error: null, cart: { items: [], total: 0 }, buying: false };
  }

  async onMount() {
    enableQuantitySelectors(this);
    this.on('change', '[name="quantity"]', (_e, el) => this.changeQuantity(el.dataset.listing, el.value));
    this.on('click', '[data-remove]', (_e, el) => this.run(() => this.props.api.delete(`/api/cart/items/${encodeURIComponent(el.dataset.remove)}`)));
    this.on('click', '[data-action="clear"]', () => this.run(() => this.props.api.delete('/api/cart')));
    this.on('click', '[data-action="checkout"]', () => this.checkout());
    await this.run(() => this.props.api.get('/api/cart'));
  }

  changeQuantity(listingId, quantity) {
    return this.run(() => this.props.api.patch(`/api/cart/items/${encodeURIComponent(listingId)}`, { quantity: Number(quantity) }));
  }

  /** Every cart operation returns the updated cart: it is rendered and the header badge is updated. */
  async run(operation) {
    try {
      const cart = await operation();
      this.props.store.update({ cartCount: cart.items.length });
      this.setState({ loading: false, error: null, cart });
    } catch (error) {
      if (this.state.loading) this.setState({ loading: false, error: error.message });
      else {
        this.props.notify(error.message, 'error');
        this.update(); // puts the quantity field back to its previous value
      }
    }
  }

  async checkout() {
    this.setState({ buying: true });
    try {
      const { orders, total } = await this.props.api.post('/api/cart/checkout');
      this.props.store.update({ cartCount: 0 });
      this.props.notify(`¡Compra realizada! ${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'} por ${formatPrice(total)}.`);
      location.hash = '#/pedidos';
    } catch (error) {
      this.props.notify(error.message, 'error');
      this.setState({ buying: false });
      await this.run(() => this.props.api.get('/api/cart')); // shows which product no longer has enough quantity
    }
  }

  template() {
    const { loading, error, cart, buying } = this.state;
    if (loading) return html`<h1>Carrito</h1><p class="loading">Cargando…</p>`;
    if (error) return html`<h1>Carrito</h1><p class="notice error">${error}</p>`;
    if (!cart.items.length) {
      return html`<h1>Carrito</h1>
<div class="card empty">${icon('cart', { size: 44 })}<p>Su carrito está vacío.</p>
  <a class="btn" href="#/productos">Ver productos</a></div>`;
    }
    const allAvailable = cart.items.every((item) => item.available);
    const count = cart.items.length;
    return html`
<h1>Carrito</h1>
<p class="subtitle">${count} ${count === 1 ? 'producto' : 'productos'}</p>
<div class="cart">
  <div>${cart.items.map((item) => this.#line(item))}</div>
  <aside class="card cart-summary">
    <h2>Resumen</h2>
    ${cart.items.filter((item) => item.product).map((item) => html`<div class="summary-line"><span>${item.product} × ${item.quantity}</span><span>${formatPrice(item.subtotal)}</span></div>`)}
    <div class="total"><span>Total</span><span>${formatPrice(cart.total)}</span></div>
    ${allAvailable ? '' : html`<p class="notice error">Ajuste o quite los productos que ya no alcanzan para poder comprar.</p>`}
    <button class="btn large block" data-action="checkout" ${buying || !allAvailable ? 'disabled' : ''}>${buying ? 'Comprando…' : 'Comprar'}</button>
    <button class="link-btn" data-action="clear" ${buying ? 'disabled' : ''}>Vaciar carrito</button>
  </aside>
</div>`;
  }

  #line(item) {
    if (!item.product) {
      return html`
<article class="card cart-line">
  <div class="thumbnail">?</div>
  <span class="muted">Este producto ya no está publicado.</span>
  <button class="icon-btn" data-remove="${item.listingId}" aria-label="Quitar">${icon('trash', { size: 18 })}</button>
</article>`;
    }
    return html`
<article class="card cart-line">
  ${item.photo ? html`<img class="thumbnail" src="${this.props.apiUrl}${item.photo}" alt="" width="72" height="72" loading="lazy">` : html`<div class="thumbnail" aria-hidden="true">${illustrationFor(item.product)}</div>`}
  <div class="stack" style="gap:2px">
    <strong>${item.product}</strong>
    <span class="muted">${formatPrice(item.price)} / ${item.unit}</span>
    ${item.available ? '' : html`<span><span class="chip danger">Solo quedan ${item.availableQuantity} ${item.unit}</span></span>`}
  </div>
  <div class="cart-line-actions">
    ${quantitySelector({ value: item.quantity, max: item.availableQuantity, label: `Cantidad de ${item.product}`, attributes: html`data-listing="${item.listingId}"` })}
    <span class="price">${formatPrice(item.subtotal)}</span>
    <button class="icon-btn" data-remove="${item.listingId}" aria-label="Quitar ${item.product}">${icon('trash', { size: 18 })}</button>
  </div>
</article>`;
  }
}
