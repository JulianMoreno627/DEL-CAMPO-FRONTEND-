import { Componente } from '../nucleo/Componente.js';
import { html, formatoPesos, formatoFecha } from '../utilidades/formato.js';

const ETIQUETA = { PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', ENTREGADA: 'Entregada', CANCELADA: 'Cancelada' };

/** Criterios con los que se califica a la contraparte (espejo del polimorfismo del backend). */
const CRITERIOS = {
  PRODUCTOR: { calidad: 'Calidad del producto', cumplimiento: 'Cumplimiento' },
  COMPRADOR: { pagoATiempo: 'Pago a tiempo', seriedad: 'Seriedad del pedido' },
};

/** Pedidos por lote y reputación bidireccional (CSR). */
export default class VistaReservas extends Componente {
  constructor(props) {
    super(props);
    this.estado = { cargando: true, reservas: [], error: null };
  }

  async alMontar() {
    this.on('click', '[data-estado]', (_e, el) => this.cambiarEstado(el.dataset.id, el.dataset.estado));
    this.on('submit', 'form.calificar', (e, form) => { e.preventDefault(); this.calificar(form); });
    await this.cargar();
  }

  async cargar() {
    if (!this.props.almacen.estado.usuario) return this.setEstado({ cargando: false });
    try {
      this.setEstado({ cargando: false, reservas: await this.props.api.get('/api/reservas'), error: null });
    } catch (error) {
      this.setEstado({ cargando: false, error: error.message });
    }
  }

  async cambiarEstado(id, estado) {
    try {
      await this.props.api.patch(`/api/reservas/${encodeURIComponent(id)}`, { estado });
      await this.cargar();
    } catch (error) {
      this.props.avisar(error.message, 'error');
    }
  }

  async calificar(form) {
    const puntajes = {};
    for (const select of form.querySelectorAll('select')) puntajes[select.name] = Number(select.value);
    try {
      await this.props.api.post('/api/calificaciones', { reservaId: form.dataset.reserva, puntajes, comentario: form.comentario.value });
      this.props.avisar('¡Gracias! Su calificación ayuda a generar confianza.');
      form.replaceWith(Object.assign(document.createElement('p'), { className: 'suave', textContent: 'Calificación enviada.' }));
    } catch (error) {
      this.props.avisar(error.message, 'error');
    }
  }

  plantilla() {
    const usuario = this.props.almacen.estado.usuario;
    const { cargando, reservas, error } = this.estado;
    if (!usuario) return html`<h1>Reservas</h1><p class="tarjeta">Elija un usuario arriba.</p>`;
    const soyProductor = usuario.rol === 'PRODUCTOR';
    return html`
<h1>${soyProductor ? 'Reservas de mis cosechas' : 'Mis reservas'}</h1>
${error ? html`<p class="pista BAJO">${error}</p>` : ''}
${cargando ? html`<p class="cargando">Cargando…</p>` : ''}
${!cargando && !reservas.length && !error ? html`<p class="tarjeta">No hay reservas todavía.</p>` : ''}
${reservas.map((r) => this.#tarjeta(r, soyProductor))}`;
  }

  #tarjeta(r, soyProductor) {
    const acciones = [];
    if (soyProductor && r.estado === 'PENDIENTE') acciones.push(['CONFIRMADA', 'Confirmar', 'boton']);
    if (soyProductor && r.estado === 'CONFIRMADA') acciones.push(['ENTREGADA', 'Marcar entregada', 'boton']);
    if (['PENDIENTE', 'CONFIRMADA'].includes(r.estado)) acciones.push(['CANCELADA', 'Cancelar', 'boton peligro']);
    // Califico al OTRO: si soy productor califico a un comprador y viceversa
    const criterios = CRITERIOS[soyProductor ? 'COMPRADOR' : 'PRODUCTOR'];

    return html`
<article class="tarjeta columna">
  <div class="fila">
    <strong>${r.producto ?? 'Cosecha'}</strong>
    <span class="chip ${r.estado}">${ETIQUETA[r.estado]}</span>
    <span class="precio">${formatoPesos(r.total)}</span>
  </div>
  <div class="suave">${r.cantidad} ${r.unidad ?? ''} × ${formatoPesos(r.precioUnitario)} · cosecha ${formatoFecha(r.fechaDisponible)}</div>
  <div class="suave">${soyProductor ? `Comprador: ${r.compradorNombre}` : `Productor: ${r.productorNombre}`}</div>
  ${acciones.length ? html`<div class="fila">${acciones.map(([estado, texto, clase]) =>
    html`<button class="${clase}" data-estado="${estado}" data-id="${r.id}">${texto}</button>`)}</div>` : ''}
  ${r.estado === 'ENTREGADA' ? html`
  <form class="calificar fila" data-reserva="${r.id}">
    ${Object.entries(criterios).map(([clave, texto]) => html`
      <label>${texto}<select name="${clave}">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}">${'★'.repeat(n)}</option>`)}</select></label>`)}
    <label>Comentario <input name="comentario" maxlength="200"></label>
    <button class="boton secundario">Calificar</button>
  </form>` : ''}
</article>`;
  }
}
