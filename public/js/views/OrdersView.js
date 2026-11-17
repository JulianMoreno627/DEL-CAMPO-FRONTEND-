import { Component } from '../core/Component.js';
import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';
import { productPhoto } from '../components/product.js';

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
    this.on('submit', 'form.rating', (e, form) => { e.preventDefault(); this.rate(form); });
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
    for (const input of form.querySelectorAll('input[type="radio"]:checked')) scores[input.name] = Number(input.value);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await this.props.api.post('/api/ratings', { orderId: form.dataset.order, scores, comment: form.comment.value });
      this.props.notify('¡Gracias! Su calificación ayuda a generar confianza.');
      const done = document.createElement('div');
      done.innerHTML = String(html`<div class="rating-done">${icon('star', { size: 22 })}<span><b>¡Gracias por calificar!</b> Su calificación ayuda a generar confianza.</span></div>`);
      form.replaceWith(done.firstElementChild);
    } catch (error) {
      button.disabled = false;
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
    const product = order.product ?? 'Producto';

    return html`
<article class="order-card ${order.status}">
  <div class="order-main">
    <div class="order-photo">${productPhoto({ photo: order.photo, product }, this.props.apiUrl)}</div>
    <div class="order-info">
      <div class="order-title">
        <h3>${product}</h3>
        <span class="chip ${order.status}">${STATUS_LABEL[order.status]}</span>
      </div>
      <p>${order.quantity} ${order.unit ?? ''} × ${formatPrice(order.unitPrice)}</p>
      <p class="order-party">${icon('user', { size: 16 })}${isProducer ? 'Comprador' : 'Productor'}: <b>${(isProducer ? order.buyerName : order.producerName) ?? '—'}</b></p>
    </div>
    <div class="order-side">
      <span class="order-total-label">Total</span>
      <span class="order-total">${formatPrice(order.total)}</span>
    </div>
  </div>
  ${actions.length ? html`<div class="order-actions">${actions.map(([status, text, className]) =>
    html`<button class="${className}" data-status="${status}" data-id="${order.id}">${text}</button>`)}</div>` : ''}
  ${order.status === 'DELIVERED' ? this.#ratingTemplate(order, isProducer) : ''}
</article>`;
  }

  /** Stars (1 to 5) for each criterion of the OTHER party: a producer rates a buyer and vice versa. */
  #ratingTemplate(order, isProducer) {
    const criteria = CRITERIA[isProducer ? 'BUYER' : 'PRODUCER'];
    return html`
<form class="rating" data-order="${order.id}">
  <div class="rating-header">
    <span class="rating-icon">${icon('star', { size: 20 })}</span>
    <div>
      <h4>Califique ${isProducer ? 'al comprador' : 'al productor'}</h4>
      <p class="muted small">Toque las estrellas: 1 es muy malo y 5 es excelente.</p>
    </div>
  </div>
  <div class="rating-criteria">
    ${Object.entries(criteria).map(([key, text]) => html`
    <fieldset class="rating-criterion">
      <legend>${text}</legend>
      <div class="stars">
        ${[5, 4, 3, 2, 1].map((n) => html`
        <input type="radio" id="${order.id}-${key}-${n}" name="${key}" value="${n}" required>
        <label for="${order.id}-${key}-${n}" title="${n} de 5">${icon('star', { size: 28 })}<span class="visually-hidden">${n} de 5</span></label>`)}
      </div>
    </fieldset>`)}
  </div>
  <label class="rating-comment">Comentario (opcional)
    <textarea name="comment" rows="2" maxlength="200"></textarea>
  </label>
  <button class="btn" type="submit">Enviar calificación</button>
</form>`;
  }
}
