import { Componente } from '../nucleo/Componente.js';
import { html, formatoPesos, formatoFecha, formatoBytes, ETIQUETA_ESTADO, SIGUIENTE_ESTADO, CATEGORIAS } from '../utilidades/formato.js';

/**
 * "Mi finca" — panel del productor, diseñado offline-first:
 * lee y escribe en IndexedDB y deja que el GestorSincronizacion envíe los cambios cuando haya señal.
 *
 * El formulario se pinta una sola vez; luego solo se re-renderizan regiones (#lista, #pista-precio,
 * #info-foto) para no borrar lo que el productor está escribiendo.
 */
export default class VistaProductor extends Componente {
  #fotoComprimida = null;
  #urlVistaPrevia = null;

  get productor() {
    const u = this.props.almacen.estado.usuario;
    return u?.rol === 'PRODUCTOR' ? u : null;
  }

  async alMontar() {
    if (!this.productor) return;
    this.on('submit', '#form-cosecha', (e, form) => { e.preventDefault(); this.crear(form); });
    this.on('change', '#form-cosecha [name="producto"]', (_e, el) => this.consultarPrecioJusto(el.value));
    this.on('input', '#form-cosecha [name="precioUnitario"]', () => this.pintarPista());
    this.on('change', '#form-cosecha [name="foto"]', (_e, el) => this.comprimirFoto(el.files[0]));
    this.on('click', '[data-avanzar]', (_e, el) => this.avanzar(el.dataset.id, el.dataset.avanzar));
    this.on('submit', 'form.editar', (e, form) => { e.preventDefault(); this.editar(form); });
    this.escuchar(this.props.sync, 'sincronizado', () => this.pintarLista());
    this.alLimpiar(() => this.#urlVistaPrevia && URL.revokeObjectURL(this.#urlVistaPrevia));

    await this.pintarLista();          // 1) instantáneo desde IndexedDB (funciona sin señal)
    await this.refrescarDesdeServidor(); // 2) si hay señal, trae la versión del servidor
  }

  async refrescarDesdeServidor() {
    const { api, db } = this.props;
    try {
      const { cosechas } = await api.get(`/api/productores/${encodeURIComponent(this.productor.id)}`);
      const conCambiosPendientes = new Set((await db.todos('outbox')).map((op) => op.entidadId));
      for (const c of cosechas) {
        if (!conCambiosPendientes.has(c.id)) await db.poner('cosechas', { ...c, _pendiente: false });
      }
      await this.pintarLista();
    } catch {
      /* sin conexión: se queda la copia local */
    }
  }

  // ---------- Acciones (todas pasan por la cola offline)

  async crear(form) {
    const datos = Object.fromEntries(new FormData(form));
    delete datos.foto;
    datos.cantidadEstimada = Number(datos.cantidadEstimada);
    datos.precioUnitario = Number(datos.precioUnitario);
    const id = crypto.randomUUID(); // el id se genera en el cliente: así la cosecha existe aunque no haya red

    await this.props.sync.registrarCambio('CREAR_COSECHA', id, datos, this.productor.id);
    if (this.#fotoComprimida) await this.props.sync.registrarFoto(id, this.#fotoComprimida, this.productor.id);

    form.reset();
    this.#fotoComprimida = null;
    this.$('#info-foto').innerHTML = '';
    this.$('#pista-precio').innerHTML = '';
    this.estado.referencia = null;
    this.props.avisar(navigator.onLine ? 'Cosecha registrada.' : 'Cosecha guardada en el teléfono. Se enviará cuando haya señal.');
    await this.pintarLista();
  }

  async avanzar(id, estado) {
    await this.props.sync.registrarCambio('ACTUALIZAR_COSECHA', id, { estado }, this.productor.id);
    await this.pintarLista();
  }

  async editar(form) {
    const datos = {
      cantidadEstimada: Number(form.cantidadEstimada.value),
      precioUnitario: Number(form.precioUnitario.value),
    };
    await this.props.sync.registrarCambio('ACTUALIZAR_COSECHA', form.dataset.id, datos, this.productor.id);
    await this.pintarLista();
  }

  async consultarPrecioJusto(producto) {
    this.estado.referencia = null;
    if (producto.trim()) {
      try {
        this.estado.referencia = await this.props.api.get(`/api/precios/${encodeURIComponent(producto.trim().toLowerCase())}`);
      } catch { /* sin referencia o sin señal */ }
    }
    this.pintarPista();
  }

  /** La compresión corre en un Web Worker: la interfaz sigue respondiendo mientras tanto. */
  async comprimirFoto(archivo) {
    const info = this.$('#info-foto');
    this.#fotoComprimida = null;
    if (!archivo) return void (info.innerHTML = '');
    info.textContent = 'Comprimiendo foto…';
    try {
      const r = await this.props.workers.imagen.ejecutar({ archivo, maxLado: 800, calidad: 0.7 });
      this.#fotoComprimida = r.blob;
      if (this.#urlVistaPrevia) URL.revokeObjectURL(this.#urlVistaPrevia);
      this.#urlVistaPrevia = URL.createObjectURL(r.blob);
      const ahorro = Math.round((1 - r.bytesComprimido / r.bytesOriginal) * 100);
      info.innerHTML = String(html`
        <img src="${this.#urlVistaPrevia}" alt="Vista previa" width="${r.ancho}" height="${r.alto}" style="max-width:160px;height:auto;border-radius:8px">
        <span class="pista">${formatoBytes(r.bytesOriginal)} → ${formatoBytes(r.bytesComprimido)} (−${ahorro} %) en ${r.milisegundos} ms, dentro de un Web Worker</span>`);
    } catch (error) {
      info.textContent = error.message;
    }
  }

  // ---------- Renderizado

  plantilla() {
    if (!this.productor) {
      return html`<h1>Mi finca</h1><p class="tarjeta">Esta sección es para productores. Elija un productor en el selector de arriba (demo).</p>`;
    }
    const p = this.productor;
    return html`
<h1>${p.finca}</h1>
<p class="suave">${p.vereda} · ${p.municipio}. Funciona sin señal: lo que registre se guarda en el teléfono y se envía solo.</p>
<p><a href="${this.props.apiUrl}/productores/${encodeURIComponent(p.id)}">Ver mi página pública</a></p>

<h2>Registrar cosecha</h2>
<form id="form-cosecha" class="tarjeta formulario">
  <label>Producto <input name="producto" required placeholder="Ej: papa criolla" list="productos"></label>
  <datalist id="productos">${['papa criolla', 'arveja', 'lechuga', 'cebolla larga', 'mora', 'tomate de árbol', 'fresa', 'zanahoria'].map((x) => html`<option value="${x}">`)}</datalist>
  <label>Categoría <select name="categoria">${Object.entries(CATEGORIAS).map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>
  <label>Unidad <select name="unidad"><option>kg</option><option>unidad</option><option>bulto</option><option>canastilla</option></select></label>
  <label>Cantidad estimada <input name="cantidadEstimada" type="number" min="1" required></label>
  <label>Precio por unidad (COP) <input name="precioUnitario" type="number" min="1" step="any" required></label>
  <label>Fecha estimada de cosecha <input name="fechaDisponible" type="date" required></label>
  <label>Estado actual
    <select name="estado">${['SEMBRADO', 'EN_CRECIMIENTO', 'DISPONIBLE'].map((e) => html`<option value="${e}">${ETIQUETA_ESTADO[e]}</option>`)}</select>
  </label>
  <label>Foto (se comprime en el teléfono) <input name="foto" type="file" accept="image/*" capture="environment"></label>
  <div id="pista-precio" class="ancho"></div>
  <div id="info-foto" class="ancho fila"></div>
  <label class="ancho">Descripción <textarea name="descripcion" rows="2" maxlength="300"></textarea></label>
  <button class="boton">Guardar cosecha</button>
</form>

<h2>Mis cosechas</h2>
<div id="lista"><p class="cargando">Cargando…</p></div>`;
  }

  pintarPista() {
    const ref = this.estado.referencia;
    const pista = this.$('#pista-precio');
    if (!pista) return;
    if (!ref) return void (pista.innerHTML = '');
    const precio = Number(this.$('#form-cosecha [name="precioUnitario"]').value);
    const { minimo, maximo } = ref.rangoJusto;
    const evaluacion = !precio ? '' : precio < minimo ? 'BAJO' : precio > maximo ? 'ALTO' : 'JUSTO';
    const mensaje = { BAJO: '⚠ Está vendiendo por debajo de lo justo.', ALTO: 'Su precio está por encima del rango; podría vender menos.', JUSTO: '✓ Precio dentro del rango justo.', '': '' }[evaluacion];
    pista.innerHTML = String(html`<p class="pista ${evaluacion}">
      Precio justo sugerido para ${ref.producto}: <b>${formatoPesos(minimo)} – ${formatoPesos(maximo)}</b> por ${ref.unidad}.
      En la ciudad se paga ${formatoPesos(ref.precioMercado)}; un intermediario le pagaría ~${formatoPesos(ref.precioIntermediario)}. ${mensaje}</p>`);
  }

  async pintarLista() {
    const lista = this.$('#lista');
    if (!lista || !this.productor) return;
    const cosechas = (await this.props.db.todos('cosechas', 'productorId', this.productor.id))
      .sort((a, b) => String(a.fechaDisponible).localeCompare(String(b.fechaDisponible)));
    lista.innerHTML = String(cosechas.length
      ? html`<div class="rejilla">${cosechas.map((c) => this.#tarjeta(c))}</div>`
      : html`<p class="tarjeta">Aún no ha registrado cosechas.</p>`);
  }

  #tarjeta(c) {
    const siguiente = SIGUIENTE_ESTADO[c.estado];
    return html`
<article class="tarjeta columna">
  <div class="fila">
    <strong>${c.producto}</strong>
    <span class="chip ${c.estado}">${ETIQUETA_ESTADO[c.estado]}</span>
    ${c._pendiente ? html`<span class="chip aviso" title="Guardado en el teléfono">⟳ Sin sincronizar</span>` : ''}
    ${c._fotoPendiente ? html`<span class="chip aviso">Foto en cola</span>` : ''}
  </div>
  <div class="suave">Cosecha: ${formatoFecha(c.fechaDisponible)} · ${formatoPesos(c.precioUnitario)} / ${c.unidad}</div>
  <div class="suave">Reservado ${c.cantidadReservada ?? 0} de ${c.cantidadEstimada} ${c.unidad} · Libre ${c.cantidadLibre}</div>
  ${c.estado !== 'AGOTADO' ? html`
  <form class="editar fila" data-id="${c.id}">
    <label>Cantidad <input name="cantidadEstimada" type="number" min="${Math.max(1, c.cantidadReservada ?? 0)}" value="${c.cantidadEstimada}" style="width:6em"></label>
    <label>Precio <input name="precioUnitario" type="number" min="1" step="any" value="${c.precioUnitario}" style="width:7em"></label>
    <button class="boton secundario">Actualizar</button>
  </form>` : ''}
  ${siguiente ? html`<button class="boton" data-avanzar="${siguiente}" data-id="${c.id}">Marcar como: ${ETIQUETA_ESTADO[siguiente]}</button>` : ''}
</article>`;
  }
}
