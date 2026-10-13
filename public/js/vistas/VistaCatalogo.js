import { Componente } from '../nucleo/Componente.js';
import { mapaLigero } from '../componentes/mapaLigero.js';
import { html, formatoPesos, formatoFecha, diasHasta, ETIQUETA_ESTADO, CATEGORIAS } from '../utilidades/formato.js';

const EVALUACION = {
  JUSTO: { texto: 'Precio justo', clase: '' },
  BAJO: { texto: 'Por debajo de lo justo', clase: 'alerta' },
  ALTO: { texto: 'Sobre el rango sugerido', clase: 'aviso' },
  SIN_REFERENCIA: { texto: 'Sin referencia', clase: 'aviso' },
};

/**
 * Catálogo por temporada — Client-Side Rendering (CSR).
 * Se renderiza en el navegador porque es muy interactivo (filtros, radio, reservas):
 * el catálogo se descarga una vez y el Web Worker geoespacial filtra/ordena localmente.
 */
export default class VistaCatalogo extends Componente {
  constructor(props) {
    super(props);
    const usuario = props.almacen.estado.usuario;
    this.estado = {
      cargando: true,
      error: null,
      todos: [],
      visibles: [],
      categoria: '',
      radioKm: 0,
      origen: usuario?.rol === 'COMPRADOR' ? usuario.ubicacion : null,
      productorId: props.consulta.get('productor') ?? '',
      // Save-Data: si el usuario activó "ahorro de datos" en el navegador, no se cargan fotos
      mostrarFotos: !navigator.connection?.saveData,
    };
  }

  async alMontar() {
    this.on('change', '[name="categoria"]', (_e, el) => this.filtrar({ categoria: el.value }));
    this.on('change', '[name="radio"]', (_e, el) => this.filtrar({ radioKm: Number(el.value) }));
    this.on('change', '[name="fotos"]', (_e, el) => this.setEstado({ mostrarFotos: el.checked }));
    this.on('click', '[data-accion="ubicacion"]', () => this.usarMiUbicacion());
    this.on('click', '[data-accion="quitar-productor"]', () => { location.hash = '#/catalogo'; });
    this.on('submit', 'form.reservar', (e, form) => { e.preventDefault(); this.reservar(form); });
    await this.cargar();
  }

  async cargar() {
    const { api, db } = this.props;
    try {
      const todos = await api.get('/api/catalogo');
      db.guardarCache('catalogo', todos).catch(() => {});
      this.estado.todos = todos;
    } catch (error) {
      // Sin red y sin caché del Service Worker: último catálogo guardado en IndexedDB
      const guardado = await db.leerCache('catalogo').catch(() => null);
      if (!guardado) return this.setEstado({ cargando: false, error: error.message });
      this.estado.todos = guardado;
      this.estado.error = 'Mostrando el último catálogo guardado (sin conexión).';
    }
    await this.filtrar({ cargando: false });
  }

  /** El filtrado y ordenamiento por distancia corre en el Web Worker, no en el hilo principal. */
  async filtrar(cambios = {}) {
    Object.assign(this.estado, cambios);
    const { todos, origen, radioKm, categoria, productorId } = this.estado;
    const { items } = await this.props.workers.geo.ejecutar({ tipo: 'FILTRAR', items: todos, origen, radioKm, categoria, productorId });
    this.setEstado({ visibles: items });
  }

  usarMiUbicacion() {
    if (!navigator.geolocation) return this.props.avisar('Este navegador no permite ubicación', 'error');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => this.filtrar({ origen: { lat: coords.latitude, lng: coords.longitude }, radioKm: this.estado.radioKm || 50 }),
      () => this.props.avisar('No se pudo obtener la ubicación', 'error'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }, // baja precisión: menos batería
    );
  }

  async reservar(form) {
    const boton = form.querySelector('button');
    boton.disabled = true;
    try {
      await this.props.api.post('/api/reservas', { cosechaId: form.dataset.cosecha, cantidad: Number(form.cantidad.value) });
      this.props.avisar('Reserva creada. El productor debe confirmarla.');
      await this.cargar();
    } catch (error) {
      this.props.avisar(error.message, 'error');
      boton.disabled = false;
    }
  }

  plantilla() {
    const { cargando, error, visibles, categoria, radioKm, origen, productorId, mostrarFotos } = this.estado;
    const usuario = this.props.almacen.estado.usuario;
    const esComprador = usuario?.rol === 'COMPRADOR';
    const fincas = [...new Map(visibles.filter((i) => i.productor).map((i) => [i.productor.id, { ...i.productor, distanciaKm: i.distanciaKm }])).values()];

    return html`
<h1>Cosechas de temporada</h1>
<p class="suave">Compre directo a la finca. Puede reservar parte de una cosecha antes de que esté lista.</p>
<div class="tarjeta filtros">
  <label>Categoría
    <select name="categoria">
      <option value="">Todas</option>
      ${Object.entries(CATEGORIAS).map(([v, t]) => html`<option value="${v}" ${v === categoria ? 'selected' : ''}>${t}</option>`)}
    </select>
  </label>
  <label>Distancia máxima
    <select name="radio" ${origen ? '' : 'disabled'}>
      ${[0, 25, 50, 100, 200].map((r) => html`<option value="${r}" ${r === radioKm ? 'selected' : ''}>${r ? `${r} km` : 'Sin límite'}</option>`)}
    </select>
  </label>
  <button class="boton secundario" data-accion="ubicacion" type="button">Usar mi ubicación</button>
  <label class="fila"><input type="checkbox" name="fotos" ${mostrarFotos ? 'checked' : ''}> Mostrar fotos</label>
</div>
${productorId ? html`<p>Filtrando por un productor. <button class="boton secundario" data-accion="quitar-productor">Ver todos</button></p>` : ''}
${!esComprador ? html`<p class="pista">Para reservar, elija arriba un usuario comprador (demo).</p>` : ''}
${error ? html`<p class="pista ALTO">${error}</p>` : ''}
${origen ? mapaLigero({ origen, puntos: fincas, radioKm, apiUrl: this.props.apiUrl }) : ''}
${cargando ? html`<p class="cargando">Cargando catálogo…</p>` : ''}
${!cargando && !visibles.length ? html`<p class="tarjeta">No hay cosechas con esos filtros.</p>` : ''}
<div class="rejilla">${visibles.map((c) => this.#tarjeta(c, esComprador, mostrarFotos))}</div>`;
  }

  #tarjeta(c, esComprador, mostrarFotos) {
    const evaluacion = EVALUACION[c.precio?.evaluacion] ?? EVALUACION.SIN_REFERENCIA;
    const ref = c.precio?.referencia;
    const dias = diasHasta(c.fechaDisponible);
    return html`
<article class="tarjeta columna">
  ${mostrarFotos && c.foto ? html`<img class="foto" src="${this.props.apiUrl}${c.foto}" alt="${c.producto}" width="400" height="300" loading="lazy" decoding="async">` : ''}
  <div class="fila">
    <strong>${c.producto}</strong>
    <span class="chip ${c.estado}">${ETIQUETA_ESTADO[c.estado]}</span>
  </div>
  <div class="fila">
    <span class="precio">${formatoPesos(c.precioUnitario)} / ${c.unidad}</span>
    <span class="chip ${evaluacion.clase}">${evaluacion.texto}</span>
  </div>
  ${ref ? html`<div class="suave">En la ciudad: ${formatoPesos(ref.precioMercado)} · Intermediario le paga al campesino: ${formatoPesos(ref.precioIntermediario)}</div>` : ''}
  <div class="suave">
    ${dias > 0 ? `Lista en ${dias} días (${formatoFecha(c.fechaDisponible)})` : `Disponible desde ${formatoFecha(c.fechaDisponible)}`}
    · Libre: ${c.cantidadLibre} de ${c.cantidadEstimada} ${c.unidad}
  </div>
  ${c.productor ? html`<div><a href="${this.props.apiUrl}/productores/${encodeURIComponent(c.productor.id)}">${c.productor.finca}</a>
    <span class="suave">· ${c.productor.vereda}, ${c.productor.municipio}${c.distanciaKm != null ? ` · ${c.distanciaKm} km` : ''}</span></div>` : ''}
  ${esComprador && c.cantidadLibre > 0 ? html`
  <form class="reservar fila" data-cosecha="${c.id}">
    <label>Cantidad (${c.unidad}) <input name="cantidad" type="number" min="1" max="${c.cantidadLibre}" value="${Math.min(10, c.cantidadLibre)}" required style="width:6em"></label>
    <button class="boton">Reservar</button>
  </form>` : ''}
</article>`;
  }
}
