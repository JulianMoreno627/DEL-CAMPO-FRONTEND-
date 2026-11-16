import { Component } from '../core/Component.js';
import { html, formatPrice } from '../utils/format.js';
import { icon } from '../utils/icons.js';
import { productCard, productPhoto } from '../components/product.js';

const UNITS = ['kg', 'libra', 'unidad', 'docena', 'bulto', 'canastilla', 'atado'];
const MAX_DESCRIPTION = 300;
/** The AI may need a few seconds (and a second provider if the first one fails). */
const AI_TIMEOUT_MS = 25_000;

/**
 * Producer profile: their catalog.
 * - Summary (published products, orders to attend, sales).
 * - List of published products with how much has been sold.
 * - Editor in a <dialog> to create or edit, with a live preview of how the buyer will see it.
 * - AI assistant ("Publica con una foto"): from the photo it fills the name, description and unit and
 *   suggests the fair price. It only suggests: the producer reviews everything before publishing.
 *
 * The page is rendered once; afterwards only regions are re-rendered (#summary, #list, dialog content)
 * so what the producer is typing is never wiped out.
 */
export default class MyProductsView extends Component {
  #listings = [];
  #editing = null;       // listing being edited, or null if it is a new one
  #newPhoto = null;      // Blob already compressed by the Web Worker
  #previewUrl = null;
  #assist = { status: 'idle' }; // AI assistant: idle | loading | done | error

  async onMount() {
    this.on('click', '[data-action="new"]', () => this.openEditor(null));
    this.on('click', '[data-edit]', (_e, el) => this.openEditor(this.#listings.find((l) => l.id === el.dataset.edit)));
    this.on('click', '[data-delete]', (_e, el) => this.remove(el.dataset.delete));
    this.on('click', '[data-action="close"]', () => this.$('#editor').close());
    // preventDefault: the button sits inside the drop zone (<label>) and would also open the file picker
    this.on('click', '[data-action="remove-photo"]', (e) => { e.preventDefault(); this.usePhoto(null); });
    this.on('change', '#editor [name="photo"]', (_e, el) => this.usePhoto(el.files[0]));
    this.on('input', '#editor form', () => this.renderPreview());
    // A different unit may change whether the AI fair price applies (it is per kg, per unit…)
    this.on('change', '#editor select', () => { this.renderPreview(); this.#renderAssist(); });
    this.on('submit', '#editor form', (e, form) => { e.preventDefault(); this.save(form); });
    this.on('click', '[data-action="ai-suggest"]', () => this.suggestWithAi());
    this.on('click', '[data-action="ai-use-price"]', (_e, button) => this.#usePrice(Number(button.dataset.price)));
    // Drag and drop a photo onto the image area
    this.on('dragover', '.photo-drop', (e, zone) => { e.preventDefault(); zone.classList.add('dragging'); });
    this.on('dragleave', '.photo-drop', (_e, zone) => zone.classList.remove('dragging'));
    this.on('drop', '.photo-drop', (e, zone) => {
      e.preventDefault();
      zone.classList.remove('dragging');
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
      if (file) this.usePhoto(file);
    });
    // Close the editor when clicking outside the panel
    this.on('click', '#editor', (e, dialog) => { if (e.target === dialog) dialog.close(); });
    this.onCleanup(() => this.#releasePreview());
    await this.load();
  }

  async load() {
    const { api } = this.props;
    try {
      const [listings, orders] = await Promise.all([api.get('/api/listings/mine'), api.get('/api/orders').catch(() => [])]);
      this.#listings = listings;
      this.renderSummary(listings, orders);
      this.renderList();
    } catch (error) {
      this.$('#list').innerHTML = String(html`<p class="notice error">${error.message}</p>`);
    }
  }

  // ---------- Editor (create / edit)

  openEditor(listing) {
    this.#editing = listing ?? null;
    this.#newPhoto = null;
    this.#assist = { status: 'idle' };
    this.#releasePreview();
    const dialog = this.$('#editor');
    dialog.innerHTML = String(this.#editorTemplate());
    dialog.showModal();
    this.renderPreview();
    this.#renderAssist();
    dialog.querySelector('[name="product"]').focus();
  }

  /** Compression runs in a Web Worker: the interface keeps responding meanwhile. */
  async usePhoto(file) {
    this.#newPhoto = null;
    this.#releasePreview();
    const zone = this.$('#editor .photo-drop');
    if (file) {
      zone.classList.add('processing');
      try {
        const { blob } = await this.props.workers.image.run({ file, maxSide: 800, quality: 0.7 });
        this.#newPhoto = blob;
        this.#previewUrl = URL.createObjectURL(blob);
      } catch (error) {
        this.props.notify(error.message, 'error');
      } finally {
        zone.classList.remove('processing');
      }
    }
    this.$('#editor [name="photo"]').value = ''; // allows picking the same file again
    this.$('#editor .photo-drop-content').innerHTML = String(this.#photoDropContent());
    this.#assist = { status: 'idle' }; // a new photo: the previous suggestion no longer applies
    this.renderPreview();
    this.#renderAssist();
  }

  // ---------- AI assistant ("Publica con una foto")

  /** Sends the photo (already compressed) to the backend, which asks the AI. */
  async suggestWithAi() {
    if (!this.#newPhoto || this.#assist.status === 'loading') return;
    this.#assist = { status: 'loading' };
    this.#renderAssist();
    try {
      const suggestion = await this.props.api.post('/api/assistant/listing-suggestion', this.#newPhoto, { timeoutMs: AI_TIMEOUT_MS });
      this.#assist = { status: 'done', suggestion };
      if (suggestion.recognized) this.#applySuggestion(suggestion);
    } catch (error) {
      this.#assist = { status: 'error', message: error.message };
    }
    this.#renderAssist();
  }

  /** Fills the form with what the AI suggested (the producer can still change everything). */
  #applySuggestion({ product, description, unit, category }) {
    const form = this.$('#editor form');
    if (!form) return; // the editor was closed while the AI answered
    form.elements.product.value = product;
    if (description) form.elements.description.value = description;
    const unitSelect = form.elements.unit;
    if (!unitSelect.disabled && UNITS.includes(unit)) unitSelect.value = unit;
    form.elements.category.value = category;
    this.renderPreview();
  }

  #usePrice(price) {
    const input = this.$('#editor [name="price"]');
    if (!input || !(price > 0)) return;
    input.value = price;
    this.renderPreview();
    input.focus();
  }

  #renderAssist() {
    const target = this.$('#editor .ai-assist');
    if (!target) return;
    target.innerHTML = this.#newPhoto ? String(this.#assistTemplate()) : '';
  }

  #assistTemplate() {
    const { status, suggestion, message } = this.#assist;
    if (status === 'loading') {
      return html`<p class="ai-loading">${icon('sparkles', { size: 18 })} Mirando la foto…</p>`;
    }
    if (status === 'error') {
      return html`
<p class="notice error">${message}</p>
<button type="button" class="btn secondary block" data-action="ai-suggest">${icon('sparkles', { size: 18 })}Intentar de nuevo</button>`;
    }
    if (status === 'done') return this.#suggestionTemplate(suggestion);
    return html`
<button type="button" class="btn ai-button block" data-action="ai-suggest">${icon('sparkles', { size: 18 })}Completar con IA</button>
<p class="muted small">La IA mira la foto y llena el nombre, la descripción y la unidad. Usted revisa antes de publicar.</p>`;
  }

  #suggestionTemplate(s) {
    const retry = html`<button type="button" class="link-button" data-action="ai-suggest">Volver a intentar</button>`;
    const tip = s.photoTip ? html`<p class="notice warning">${icon('camera', { size: 16 })} ${s.photoTip}</p>` : '';
    if (!s.recognized) {
      return html`<div class="ai-result">
  <p><b>No reconocimos un producto del campo en la foto.</b> Puede llenar los datos a mano.</p>
  ${tip}${retry}
</div>`;
    }
    const unsure = s.confidence < 0.6 ? html`<p class="muted small">No estamos muy seguros: revise bien el nombre.</p>` : '';
    return html`<div class="ai-result">
  <p class="ai-title">${icon('sparkles', { size: 18 })} Parece <b>${s.product}</b> <span class="chip">${Math.round(s.confidence * 100)} % seguro</span></p>
  <p class="muted small">Llenamos el nombre, la descripción y la unidad. Revíselos antes de publicar.</p>
  ${unsure}${this.#fairPriceTemplate(s.fairPrice)}${tip}${retry}
</div>`;
  }

  #fairPriceTemplate(fair) {
    if (!fair) return html`<p class="muted small">Todavía no tenemos precio de referencia para este producto.</p>`;
    const suggested = Math.round((fair.min + fair.max) / 2 / 50) * 50;
    const sameUnit = this.$('#editor [name="unit"]')?.value === fair.unit;
    return html`<div class="ai-price">
  <p>Precio justo sugerido: <b>${formatPrice(fair.min)} – ${formatPrice(fair.max)}</b> por ${fair.unit}</p>
  <p class="muted small">En la ciudad se paga ${formatPrice(fair.marketPrice)} por ${fair.unit}. Así usted gana más que vendiéndole al intermediario y el comprador paga menos que en la tienda.</p>
  ${sameUnit
    ? html`<button type="button" class="btn secondary" data-action="ai-use-price" data-price="${suggested}">Usar ${formatPrice(suggested)}</button>`
    : html`<p class="muted small">La referencia es por ${fair.unit}; usted vende por otra unidad, así que ajuste el precio.</p>`}
</div>`;
  }

  /** The product as it will look, built from what is typed in the form. */
  #draft() {
    const form = this.$('#editor form');
    const data = Object.fromEntries(new FormData(form));
    const sold = this.#editing?.soldQuantity ?? 0;
    const { user } = this.props.store.state;
    return {
      product: data.product?.trim() || 'Nombre del producto',
      description: data.description?.trim() ?? '',
      price: Number(data.price) || 0,
      unit: data.unit ?? this.#editing?.unit ?? 'kg',
      availableQuantity: Math.max(0, (Number(data.quantity) || 0) - sold),
      photo: this.#editing?.photo ?? null,
      producer: { name: user.name, town: user.town },
    };
  }

  renderPreview() {
    const target = this.$('#editor .preview-card');
    if (!target) return;
    const draft = this.#draft();
    // The photo just picked (not uploaded yet) takes priority over the published one
    const photo = this.#previewUrl ? html`<img src="${this.#previewUrl}" alt="">` : null;
    target.innerHTML = String(productCard(draft, { apiUrl: this.props.apiUrl, photo }));
    const counter = this.$('#editor .char-counter');
    if (counter) counter.textContent = `${draft.description.length}/${MAX_DESCRIPTION}`;
  }

  async save(form) {
    const { api, notify } = this.props;
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    delete data.photo;
    if (!data.category) delete data.category; // only when the AI suggested one; otherwise the backend default
    data.price = Number(data.price);
    data.quantity = Number(data.quantity);

    button.disabled = true;
    try {
      const listing = this.#editing
        ? await api.patch(`/api/listings/${encodeURIComponent(this.#editing.id)}`, {
          product: data.product, description: data.description, price: data.price, quantity: data.quantity,
        })
        : await api.post('/api/listings', data);
      if (this.#newPhoto) {
        try {
          await api.post(`/api/listings/${encodeURIComponent(listing.id)}/photo`, this.#newPhoto);
        } catch (error) {
          notify(`Se guardó el producto, pero la foto no se pudo subir: ${error.message}`, 'error');
        }
      }
      notify(this.#editing ? 'Cambios guardados.' : '¡Producto publicado! Los compradores ya lo pueden ver.');
      this.$('#editor').close();
      await this.load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async remove(id) {
    const listing = this.#listings.find((l) => l.id === id);
    if (!confirm(`¿Eliminar "${listing?.product}" de sus productos?`)) return;
    try {
      await this.props.api.delete(`/api/listings/${encodeURIComponent(id)}`);
      this.props.notify('Producto eliminado.');
      await this.load();
    } catch (error) {
      this.props.notify(error.message, 'error');
    }
  }

  #releasePreview() {
    if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
    this.#previewUrl = null;
  }

  // ---------- Templates

  template() {
    return html`
<div class="section-header">
  <div>
    <h1>Mis productos</h1>
    <p class="subtitle">Lo que publique aquí lo verán los compradores, con el precio que usted ponga.</p>
  </div>
  <button class="btn large" data-action="new">${icon('plus', { size: 20 })}Nuevo producto</button>
</div>
<div id="summary" class="producer-summary"></div>
<div id="list"><p class="loading">Cargando…</p></div>
<dialog id="editor" class="dialog" aria-labelledby="editor-title"></dialog>`;
  }

  renderSummary(listings, orders) {
    const toAttend = orders.filter((o) => o.status === 'PENDING').length;
    const sold = orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.total, 0);
    const stats = [
      ['sprout', listings.length, listings.length === 1 ? 'producto publicado' : 'productos publicados', ''],
      ['receipt', toAttend, toAttend === 1 ? 'pedido por atender' : 'pedidos por atender', toAttend ? '#/pedidos' : ''],
      ['basket', formatPrice(sold), 'en ventas', ''],
    ];
    this.$('#summary').innerHTML = String(html`${stats.map(([iconName, value, text, link]) => html`
<${link ? 'a' : 'div'} class="stat" ${link ? html`href="${link}"` : ''}>
  <span class="stat-icon">${icon(iconName, { size: 22 })}</span>
  <span><b>${value}</b><small>${text}</small></span>
</${link ? 'a' : 'div'}>`)}`);
  }

  renderList() {
    const list = this.$('#list');
    if (!this.#listings.length) {
      list.innerHTML = String(html`
<div class="card empty large">
  <div class="empty-illustration" aria-hidden="true">🌱</div>
  <h2>Publique su primer producto</h2>
  <p>Agregue una foto, cuente qué cultiva y ponga su precio.</p>
  <button class="btn large" data-action="new">${icon('plus', { size: 20 })}Nuevo producto</button>
</div>`);
      return;
    }
    list.innerHTML = String(html`<div class="grid">${this.#listings.map((l) => this.#card(l))}</div>`);
  }

  #card(listing) {
    const total = listing.availableQuantity + listing.soldQuantity;
    const percent = total ? Math.round((listing.soldQuantity / total) * 100) : 0;
    return productCard(listing, {
      apiUrl: this.props.apiUrl,
      extra: html`
<div class="sales">
  <div class="sales-text"><span>Vendido</span><b>${listing.soldQuantity} de ${total} ${listing.unit}</b></div>
  <div class="progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div>
</div>`,
      actions: html`
<button class="btn secondary" data-edit="${listing.id}">Editar</button>
${listing.soldQuantity === 0
    ? html`<button class="icon-btn" title="Eliminar" aria-label="Eliminar ${listing.product}" data-delete="${listing.id}">${icon('trash', { size: 18 })}</button>`
    : ''}`,
    });
  }

  #photoDropContent() {
    const photo = this.#previewUrl
      ? html`<img src="${this.#previewUrl}" alt="Foto elegida">`
      : this.#editing?.photo ? productPhoto(this.#editing, this.props.apiUrl) : null;
    if (!photo) {
      return html`
<span class="photo-drop-empty">
  ${icon('camera', { size: 34 })}
  <b>Agregar foto</b>
  <small>Toque aquí o arrastre una imagen</small>
</span>`;
    }
    return html`${photo}
<span class="photo-drop-actions">
  <span class="chip">${icon('camera', { size: 14 })} Cambiar foto</span>
  ${this.#previewUrl ? html`<button type="button" class="chip" data-action="remove-photo">Quitar</button>` : ''}
</span>`;
  }

  #editorTemplate() {
    const l = this.#editing;
    const sold = l?.soldQuantity ?? 0;
    return html`
<form class="editor" method="dialog">
  <header class="editor-header">
    <div>
      <h2 id="editor-title">${l ? 'Editar producto' : 'Nuevo producto'}</h2>
      <p class="muted">${l ? 'Los cambios se ven de inmediato en la tienda.' : 'Complete los datos y mire en la vista previa cómo lo verán los compradores.'}</p>
    </div>
    <button type="button" class="icon-btn" data-action="close" aria-label="Cerrar">✕</button>
  </header>

  <div class="editor-body">
    <div class="editor-fields">
      <section class="step">
        <h3><span class="step-number">1</span>Foto</h3>
        <label class="photo-drop">
          <input name="photo" type="file" accept="image/*" class="visually-hidden">
          <span class="photo-drop-content">${this.#photoDropContent()}</span>
        </label>
        <div class="ai-assist" aria-live="polite"></div>
      </section>

      <section class="step">
        <h3><span class="step-number">2</span>¿Qué vende?</h3>
        <input type="hidden" name="category" value="${l?.category ?? ''}">
        <label>Nombre del producto
          <input name="product" required maxlength="60" placeholder="Ej: Papa criolla" value="${l?.product ?? ''}">
        </label>
        <label><span class="label-with-counter">Descripción <span class="char-counter muted"></span></span>
          <textarea name="description" rows="3" maxlength="${MAX_DESCRIPTION}" placeholder="Cómo lo cultiva, cuándo lo cosechó, cómo lo entrega…">${l?.description ?? ''}</textarea>
        </label>
      </section>

      <section class="step">
        <h3><span class="step-number">3</span>Precio y cantidad</h3>
        <div class="two-columns">
          <label>Precio
            <span class="prefixed-input">
              <span class="prefix">$</span>
              <input name="price" type="number" min="1" step="any" required placeholder="3500" value="${l?.price ?? ''}">
            </span>
          </label>
          <label>Se vende por
            <select name="unit" ${l ? 'disabled' : ''}>${UNITS.map((u) => html`<option ${u === (l?.unit ?? 'kg') ? 'selected' : ''}>${u}</option>`)}</select>
          </label>
        </div>
        <label>${l ? 'Cantidad total (incluye lo ya vendido)' : 'Cantidad que tiene para vender'}
          <input name="quantity" type="number" min="${Math.max(1, sold)}" step="any" required placeholder="Ej: 50" value="${l ? l.availableQuantity + sold : ''}">
        </label>
        ${sold ? html`<p class="muted">Ya vendió ${sold} ${l.unit}; no puede poner menos que eso.</p>` : ''}
      </section>
    </div>

    <aside class="editor-preview">
      <h3>Vista previa</h3>
      <p class="muted">Así lo verán los compradores.</p>
      <div class="preview-card"></div>
    </aside>
  </div>

  <footer class="editor-footer">
    <button type="button" class="btn secondary" data-action="close">Cancelar</button>
    <button type="submit" class="btn large">${l ? 'Guardar cambios' : 'Publicar producto'}</button>
  </footer>
</form>`;
  }
}
