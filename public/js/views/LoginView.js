import { Component } from '../core/Component.js';
import { html } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const PROFILES = {
  PRODUCER: { title: 'Soy productor', detail: 'Publico lo que cultivo para venderlo', icon: 'sprout', className: 'producer' },
  BUYER: { title: 'Quiero comprar', detail: 'Compro productos directo al campesino', icon: 'basket', className: 'buyer' },
};

/**
 * Login in two steps: 1) choose the profile (producer or buyer), 2) log in or create the account.
 */
export default class LoginView extends Component {
  constructor(props) {
    super(props);
    this.state = { role: null, signingUp: false, sending: false, error: null, values: {} };
  }

  onMount() {
    this.on('click', '[data-role]', (_e, el) => this.setState({ role: el.dataset.role, error: null }));
    this.on('click', '[data-action="change-profile"]', () => this.setState({ role: null, signingUp: false, error: null }));
    this.on('click', '[data-action="toggle-mode"]', () => this.setState({ signingUp: !this.state.signingUp, error: null }));
    this.on('submit', 'form', (e, form) => { e.preventDefault(); this.submit(form); });
  }

  onUpdate() {
    this.$('form input')?.focus();
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
<div class="login">
  <section class="hero">
    ${icon('leaf', { size: 48, className: 'hero-icon' })}
    <h1>Del campo a su mesa</h1>
    <p>Los campesinos publican lo que cultivan y usted les compra directo, sin intermediarios.</p>
    <ul>
      <li>Precios que fija el productor</li>
      <li>Productos frescos de la región</li>
      <li>Pedido sencillo con carrito de compras</li>
    </ul>
  </section>
  <section class="login-panel">${this.state.role ? this.#form() : this.#profiles()}</section>
</div>`;
  }

  #profiles() {
    return html`
<h2>¿Cómo quiere ingresar?</h2>
<p class="muted">Elija su perfil para continuar.</p>
<div class="profiles">
  ${Object.entries(PROFILES).map(([role, p]) => html`
  <button class="profile ${p.className}" type="button" data-role="${role}">
    ${icon(p.icon, { size: 32 })}
    <div><strong>${p.title}</strong><span>${p.detail}</span></div>
  </button>`)}
</div>`;
  }

  #form() {
    const { role, signingUp, sending, error, values: v } = this.state;
    const isProducer = role === 'PRODUCER';
    return html`
<button class="link-btn" type="button" data-action="change-profile">${icon('back', { size: 18 })}Cambiar perfil</button>
<div class="card">
  <h2>${signingUp ? 'Crear cuenta' : 'Ingresar'} como ${isProducer ? 'productor' : 'comprador'}</h2>
  <p class="muted">${signingUp ? 'Solo toma un minuto.' : 'Bienvenido de nuevo.'}</p>
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
  <p class="muted">${signingUp ? '¿Ya tiene cuenta?' : '¿No tiene cuenta?'}
    <button class="link-btn" type="button" data-action="toggle-mode">${signingUp ? 'Ingresar' : 'Crear una cuenta'}</button></p>
</div>`;
  }
}
