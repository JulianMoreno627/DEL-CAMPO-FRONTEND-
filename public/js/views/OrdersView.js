import { Component } from '../core/Component.js';
import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';

/** Labels shown to the user for each order status. */
const STATUS_LABEL = { PENDING: 'Pendiente', CONFIRMED: 'Confirmada', DELIVERED: 'Entregada', CANCELLED: 'Cancelada' };

/** Criteria used to rate the other party (mirrors the backend's polymorphism). */
const CRITERIA = {
  PRODUCER: { quality: 'Calidad del producto', reliability: 'Cumplimiento' },
  BUYER: { paysOnTime: 'Pago a tiempo', seriousness: 'Seriedad del pedido' },
};

/** Orders (what was bought from the cart) and two-way reputation (CSR). */
export default class OrdersView extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, orders: [], error: null };
  }

  async onMount() {
    this.on('click', '[data-status]', (_e, el) => this.changeStatus(el.dataset.id, el.dataset.status));
    this.on('submit', 'form.rate', (e, form) => { e.preventDefault(); this.rate(form); });
    await this.load();
  }

  async load() {
    try {
      this.setState({ loading: false, orders: await this.props.api.get('/api/orders'), error: null });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  }

  async changeStatus(id, status) {
    try {
      await this.props.api.patch(`/api/orders/${encodeURIComponent(id)}`, { status });
      await this.load();
    } catch (error) {
      this.props.notify(error.message, 'error');
    }
  }

  async rate(form) {
    const scores = {};
    for (const select of form.querySelectorAll('select')) scores[select.name] = Number(select.value);
    try {
      await this.props.api.post('/api/ratings', { orderId: form.dataset.order, scores, comment: form.comment.value });
      this.props.notify('¡Gracias! Su calificación ayuda a generar confianza.');
      form.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Calificación enviada.' }));
    } catch (error) {
      this.props.notify(error.message, 'error');
    }
  }

  template() {
    const { user } = this.props.store.state;
    const { loading, orders, error } = this.state;
    const isProducer = user.role === 'PRODUCER';
    return html`
<h1>${isProducer ? 'Pedidos recibidos' : 'Mis pedidos'}</h1>
<p class="subtitle">${isProducer ? 'Confirme y entregue lo que le compraron.' : 'Lo que ha comprado y en qué va cada pedido.'}</p>
${error ? html`<p class="notice error">${error}</p>` : ''}
${loading ? html`<p class="loading">Cargando…</p>` : ''}
${!loading && !orders.length && !error ? html`<div class="card empty">${icon('receipt', { size: 40 })}<p>${isProducer ? 'Aún no ha recibido pedidos.' : 'Aún no ha hecho pedidos.'}</p></div>` : ''}
${orders.map((order) => this.#card(order, isProducer))}`;
  }

  #card(order, isProducer) {
    const actions = [];
    if (isProducer && order.status === 'PENDING') actions.push(['CONFIRMED', 'Confirmar', 'btn']);
    if (isProducer && order.status === 'CONFIRMED') actions.push(['DELIVERED', 'Marcar entregada', 'btn']);
    if (['PENDING', 'CONFIRMED'].includes(order.status)) actions.push(['CANCELLED', 'Cancelar', 'btn danger']);
    // Rate the OTHER party: a producer rates a buyer and vice versa
    const criteria = CRITERIA[isProducer ? 'BUYER' : 'PRODUCER'];

    return html`
<article class="card stack order">
  <div class="row">
    <strong>${order.product ?? 'Producto'}</strong>
    <span class="chip ${order.status}">${STATUS_LABEL[order.status]}</span>
    <span class="price">${formatPrice(order.total)}</span>
  </div>
  <div class="muted">${order.quantity} ${order.unit ?? ''} × ${formatPrice(order.unitPrice)}</div>
  <div class="muted">${isProducer ? `Comprador: ${order.buyerName}` : `Productor: ${order.producerName}`}</div>
  ${actions.length ? html`<div class="row">${actions.map(([status, text, className]) =>
    html`<button class="${className}" data-status="${status}" data-id="${order.id}">${text}</button>`)}</div>` : ''}
  ${order.status === 'DELIVERED' ? html`
  <form class="rate row" data-order="${order.id}">
    ${Object.entries(criteria).map(([key, text]) => html`
      <label>${text}<select name="${key}">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}">${'★'.repeat(n)}</option>`)}</select></label>`)}
    <label>Comentario <input name="comment" maxlength="200"></label>
    <button class="btn secondary">Calificar</button>
  </form>` : ''}
</article>`;
  }
}
