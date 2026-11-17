import { Component } from '../core/Component.js';
import { html } from '../utils/format.js';
import { icon } from '../utils/icons.js';
import { avatar, roleLabel } from '../utils/avatar.js';
import { currentTheme, setTheme } from '../core/theme.js';

const BUYER_TYPES = [['CONSUMER', 'Hogar'], ['STORE', 'Tienda'], ['RESTAURANT', 'Restaurante']];
const LEVELS = { NEW: 'Nuevo', TRUSTED: 'Confiable', REGULAR: 'Regular', AT_RISK: 'En riesgo' };

/**
 * Profile of the session user: photo, personal data (each profile edits its own fields),
 * reputation, appearance (light / dark theme) and logout.
 * After a change the user is saved in the session (updateSessionUser), so the header updates too.
 * Only the regions that change are re-rendered, so what the user is typing is never wiped out.
 */
export default class ProfileView extends Component {
  #saving = false;

  async onMount() {
    this.on('change', '[name="avatar"]', (_e, input) => this.uploadAvatar(input.files[0]));
    this.on('submit', 'form.profile-form', (e, form) => { e.preventDefault(); this.save(form); });
    this.on('click', '[data-theme-choice]', (_e, button) => setTheme(button.dataset.themeChoice));
    this.on('click', '[data-action="logout"]', () => this.props.endSession());
    this.listen(window, 'themechange', () => this.#renderThemeChoices());
    await this.loadReputation();
  }

  get user() {
    return this.props.store.state.user;
  }

  async loadReputation() {
    const target = this.$('#reputation');
    try {
      const reputation = await this.props.api.get(`/api/users/${encodeURIComponent(this.user.id)}/reputation`);
      target.innerHTML = String(this.#reputationTemplate(reputation));
    } catch {
      target.innerHTML = ''; // the reputation is extra information: without it the profile still works
    }
  }

  /** The photo is compressed in the Web Worker (≈400 px) before being sent: fewer mobile data. */
  async uploadAvatar(file) {
    if (!file) return;
    const label = this.$('.avatar-upload');
    label.classList.add('processing');
    try {
      const { blob } = await this.props.workers.image.run({ file, maxSide: 400, quality: 0.8 });
      const user = await this.props.api.post('/api/users/me/avatar', blob);
      this.props.updateSessionUser(user);
      this.#renderIdentity();
      this.props.notify('Foto de perfil actualizada.');
    } catch (error) {
      this.props.notify(error.message, 'error');
    } finally {
      this.$('.avatar-upload')?.classList.remove('processing');
      const input = this.$('[name="avatar"]');
      if (input) input.value = '';
    }
  }

  async save(form) {
    if (this.#saving) return;
    this.#saving = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const user = await this.props.api.patch('/api/users/me', Object.fromEntries(new FormData(form)));
      this.props.updateSessionUser(user);
      this.#renderIdentity();
      this.props.notify('Perfil actualizado.');
    } catch (error) {
      this.props.notify(error.message, 'error');
    } finally {
      this.#saving = false;
      button.disabled = false;
    }
  }

  // ---------- Templates

  template() {
    const u = this.user;
    const isProducer = u.role === 'PRODUCER';
    return html`
<div class="profile-page">
  <section class="profile-hero">
    <div class="profile-identity">${this.#identityTemplate()}</div>
    <div id="reputation" class="profile-reputation"></div>
  </section>

  <div class="profile-grid">
    <form class="card profile-form">
      <h2>${icon('user', { size: 20 })}Datos personales</h2>
      <p class="muted">${isProducer ? 'Así lo verán los compradores en sus productos.' : 'Así lo verán los productores en sus pedidos.'}</p>
      <div class="two-columns">
        <label>Nombre completo <input name="name" required maxlength="80" autocomplete="name" value="${u.name}"></label>
        <label>Teléfono <input name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="Ej: 300 123 4567" value="${u.phone ?? ''}"></label>
      </div>
      ${isProducer ? html`
      <h3>${icon('home', { size: 18 })}Su finca</h3>
      <label>Nombre de la finca <input name="farm" required maxlength="80" value="${u.farm ?? ''}"></label>
      <div class="two-columns">
        <label>Vereda <input name="village" maxlength="80" placeholder="Ej: El Rosal" value="${u.village ?? ''}"></label>
        <label>Municipio <input name="town" maxlength="80" placeholder="Ej: Ventaquemada" value="${u.town ?? ''}"></label>
      </div>` : html`
      <label>¿Para quién compra?
        <select name="type">${BUYER_TYPES.map(([value, text]) => html`<option value="${value}" ${u.type === value ? 'selected' : ''}>${text}</option>`)}</select>
      </label>`}
      <div class="form-actions"><button class="btn large" type="submit">Guardar cambios</button></div>
    </form>

    <aside class="stack">
      <section class="card">
        <h2>${icon(currentTheme() === 'dark' ? 'moon' : 'sun', { size: 20 })}Apariencia</h2>
        <p class="muted">Elija cómo quiere ver la aplicación en este dispositivo.</p>
        <div class="theme-choices" role="group" aria-label="Tema">${this.#themeChoicesTemplate()}</div>
      </section>
      <section class="card">
        <h2>${icon('logout', { size: 20 })}Sesión</h2>
        <p class="muted">Cierre la sesión si este celular o computador no es suyo.</p>
        <button class="btn danger block" type="button" data-action="logout">Cerrar sesión</button>
      </section>
    </aside>
  </div>
</div>`;
  }

  #identityTemplate() {
    const u = this.user;
    const place = [u.village, u.town].filter(Boolean).join(', ');
    const buyerType = BUYER_TYPES.find(([value]) => value === u.type)?.[1];
    return html`
<label class="avatar-upload" title="Cambiar foto de perfil">
  ${avatar(u, this.props.apiUrl, { size: 112, className: 'avatar-large' })}
  <input type="file" name="avatar" accept="image/*" class="visually-hidden">
  <span class="avatar-upload-badge">${icon('camera', { size: 16 })}</span>
  <span class="visually-hidden">Cambiar foto de perfil</span>
</label>
<div class="identity-text">
  <span class="chip ${u.role === 'BUYER' ? 'buyer' : ''}">${roleLabel(u.role)}${buyerType ? ` · ${buyerType}` : ''}</span>
  <h1>${u.name}</h1>
  <p class="identity-details">
    ${u.role === 'PRODUCER' && u.farm ? html`<span>${icon('home', { size: 16 })}${u.farm}</span>` : ''}
    ${place ? html`<span>${icon('pin', { size: 16 })}${place}</span>` : ''}
    ${u.phone ? html`<span>${icon('phone', { size: 16 })}${u.phone}</span>` : ''}
  </p>
</div>`;
  }

  #reputationTemplate({ score, total, level }) {
    return html`
<div class="reputation-score">
  <span class="reputation-value">${icon('star', { size: 22 })}${score.toFixed(1)}</span>
  <span class="muted">de 5</span>
</div>
<div class="reputation-text">
  <b>${LEVELS[level] ?? level}</b>
  <span class="muted">${total === 0 ? 'Aún sin calificaciones' : `${total} ${total === 1 ? 'calificación' : 'calificaciones'}`}</span>
</div>`;
  }

  #themeChoicesTemplate() {
    const theme = currentTheme();
    return html`${[['light', 'sun', 'Claro'], ['dark', 'moon', 'Oscuro']].map(([value, iconName, text]) => html`
<button type="button" class="theme-choice" data-theme-choice="${value}" aria-pressed="${theme === value}">${icon(iconName, { size: 18 })}${text}</button>`)}`;
  }

  #renderIdentity() {
    const target = this.$('.profile-identity');
    if (target) target.innerHTML = String(this.#identityTemplate());
  }

  #renderThemeChoices() {
    const target = this.$('.theme-choices');
    if (target) target.innerHTML = String(this.#themeChoicesTemplate());
  }
}
