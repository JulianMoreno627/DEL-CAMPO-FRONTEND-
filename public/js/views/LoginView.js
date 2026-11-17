import { Component } from '../core/Component.js';
import { html } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const PROFILES = {
  PRODUCER: { title: 'Soy productor', detail: 'Publico lo que cultivo y recibo pedidos', icon: 'sprout', className: 'producer' },
  BUYER: { title: 'Quiero comprar', detail: 'Compro directo al campesino', icon: 'basket', className: 'buyer' },
};

const STEPS = [
  ['camera', 'El campesino publica', 'Toma una foto de su cosecha, la IA llena los datos y él pone su precio.'],
  ['basket', 'Usted elige', 'Ve productos frescos de la región, con el precio que fijó quien los cultiva.'],
  ['truck', 'Pide y recibe', 'Arma su carrito, compra y sigue el pedido hasta que lo recibe.'],
];

const AUDIENCES = [
  {
    role: 'PRODUCER', icon: 'sprout', title: 'Para productores', cta: 'Empezar a vender',
    points: ['Publique en minutos: la IA reconoce su producto en la foto', 'Usted pone el precio, con una sugerencia de precio justo', 'Reciba pedidos y conozca la reputación de quien le compra'],
  },
  {
    role: 'BUYER', icon: 'basket', title: 'Para compradores', cta: 'Empezar a comprar',
    points: ['Precios sin intermediarios, directo de la finca', 'Productos frescos de la región y de temporada', 'Para hogares, tiendas y restaurantes'],
  },
];

/**
 * Landing page and login in two steps: 1) choose the profile (producer or buyer), 2) log in or create the account.
 * The login panel is always at the top (first screen); the rest of the page explains how the platform works.
 */
export default class LoginView extends Component {
  constructor(props) {
    super(props);
    this.state = { role: null, signingUp: false, sending: false, error: null, values: {} };
  }

  onMount() {
    this.on('click', '[data-role]', (_e, el) => {
      const fromPanel = Boolean(el.closest('.login-panel'));
      this.setState({ role: el.dataset.role, signingUp: el.dataset.signup === 'true' || this.state.signingUp, error: null });
      if (!fromPanel) this.$('.login-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    this.on('click', '[data-action="change-profile"]', () => this.setState({ role: null, signingUp: false, error: null }));
    this.on('click', '[data-action="toggle-mode"]', () => this.setState({ signingUp: !this.state.signingUp, error: null }));
    this.on('submit', 'form', (e, form) => { e.preventDefault(); this.submit(form); });
  }

  onUpdate() {
    this.$('.login-panel form input')?.focus({ preventScroll: true });
  }

  async submit(form) {
    const { role, signingUp } = this.state;
    const data = { ...Object.fromEntries(new FormData(form)), role };
    const { password: _password, ...values } = data; // keep what was typed (except the password) if there is an error
    this.setState({ sending: true, error: null, values });
    try {
      const session = await this.props.api.post(signingUp ? '/api/auth/register' : '/api/auth/login', data);
      this.props.startSession(session);
    } catch (error) {
      this.setState({ sending: false, error: error.message });
    }
  }

  template() {
    return html`
<div class="landing">
  <section class="landing-hero">
    <div class="landing-copy">
      <span class="eyebrow">${icon('leaf', { size: 16 })}Comercio directo campesino–consumidor</span>
      <h1>Del campo a su mesa, <span class="highlight">sin intermediarios</span></h1>
      <p class="lead">Los campesinos publican lo que cultivan y usted les compra directo. Ellos ganan más y usted paga un precio justo.</p>
      <ul class="trust">
        <li><span class="trust-icon">${icon('tag', { size: 20 })}</span><span><b>Precio justo</b><small>Sugerido con precios de referencia</small></span></li>
        <li><span class="trust-icon">${icon('truck', { size: 20 })}</span><span><b>Directo</b><small>De la finca a su mesa</small></span></li>
        <li><span class="trust-icon">${icon('sparkles', { size: 20 })}</span><span><b>Con IA</b><small>Publique con solo una foto</small></span></li>
      </ul>
    </div>
    <div class="login-panel card">${this.state.role ? this.#form() : this.#profiles()}</div>
  </section>

  <section class="how">
    <h2>¿Cómo funciona?</h2>
    <ol class="steps">
      ${STEPS.map(([iconName, title, text], i) => html`
      <li class="card">
        <span class="step-badge">${i + 1}</span>
        <span class="step-icon">${icon(iconName, { size: 26 })}</span>
        <h3>${title}</h3>
        <p>${text}</p>
      </li>`)}
    </ol>
  </section>

  <section class="audiences">
    ${AUDIENCES.map((a) => html`
    <article class="audience ${a.role === 'BUYER' ? 'buyer' : 'producer'}">
      <span class="audience-icon">${icon(a.icon, { size: 28 })}</span>
      <h2>${a.title}</h2>
      <ul>${a.points.map((point) => html`<li>${point}</li>`)}</ul>
      <button class="btn ${a.role === 'BUYER' ? 'secondary' : ''}" type="button" data-role="${a.role}" data-signup="true">${a.cta}</button>
    </article>`)}
  </section>

  <footer class="landing-footer">
    <span>${icon('leaf', { size: 16 })} Del Campo · Comercio directo campesino–consumidor</span>
    <a href="${this.props.apiUrl}/temporada/">Calendario de temporada</a>
  </footer>
</div>`;
  }

  #profiles() {
    return html`
<h2>¿Cómo quiere ingresar?</h2>
<p class="muted">Elija su perfil para continuar.</p>
<div class="profiles">
  ${Object.entries(PROFILES).map(([role, p]) => html`
  <button class="profile ${p.className}" type="button" data-role="${role}">
    ${icon(p.icon, { size: 30 })}
    <span class="profile-text"><strong>${p.title}</strong><span>${p.detail}</span></span>
    ${icon('back', { size: 18, className: 'profile-arrow' })}
  </button>`)}
</div>
<p class="muted small panel-note">Ingrese con su correo. Si es su primera vez, cree una cuenta en un minuto.</p>`;
  }

  #form() {
    const { role, signingUp, sending, error, values: v } = this.state;
    const isProducer = role === 'PRODUCER';
    return html`
<button class="link-btn" type="button" data-action="change-profile">${icon('back', { size: 18 })}Cambiar perfil</button>
<div class="panel-title">
  <span class="panel-icon ${isProducer ? 'producer' : 'buyer'}">${icon(isProducer ? 'sprout' : 'basket', { size: 22 })}</span>
  <div>
    <h2>${signingUp ? 'Crear cuenta' : 'Ingresar'} como ${isProducer ? 'productor' : 'comprador'}</h2>
    <p class="muted">${signingUp ? 'Solo toma un minuto.' : 'Bienvenido de nuevo.'}</p>
  </div>
</div>
<form class="login-form">
  ${signingUp ? html`
  <label>Nombre completo <input name="name" required autocomplete="name" value="${v.name ?? ''}"></label>
  ${isProducer ? html`<label>Municipio o vereda <input name="town" placeholder="Ej: Ventaquemada" value="${v.town ?? ''}"></label>` : ''}
  <label>Teléfono (opcional) <input name="phone" type="tel" autocomplete="tel" value="${v.phone ?? ''}"></label>` : ''}
  <label>Correo <input name="email" type="email" required autocomplete="email" value="${v.email ?? ''}"></label>
  <label>Contraseña <input name="password" type="password" required minlength="6" autocomplete="${signingUp ? 'new-password' : 'current-password'}"></label>
  ${error ? html`<p class="notice error">${error}</p>` : ''}
  <button class="btn large block" ${sending ? 'disabled' : ''}>${sending ? 'Un momento…' : signingUp ? 'Crear cuenta' : 'Ingresar'}</button>
</form>
<p class="muted switch-mode">${signingUp ? '¿Ya tiene cuenta?' : '¿No tiene cuenta?'}
  <button class="link-btn" type="button" data-action="toggle-mode">${signingUp ? 'Ingresar' : 'Crear una cuenta'}</button></p>`;
  }
}
