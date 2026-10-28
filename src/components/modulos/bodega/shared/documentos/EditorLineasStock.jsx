import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X, PackageCheck } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import CampoEscaneoBodega from '../escaneo/CampoEscaneoBodega';
import { identificarLectura, datosLoteDeLectura, datosLoteEnEspera, combinarDatosLote, opcionesLote, datosLoteEnTexto, esSoloLote } from '../escaneo/identificarLectura';
import ModalVincularCodigo from '../ModalVincularCodigo';
import BuscadorProducto from '../BuscadorProducto';
import { mensajeError, leerLotesDeProducto } from '../bodegaApi';
import { formatoCantidad } from '../catalogosBodega';
import { estadoVencimiento } from '../vencimientos';
import { formatoPesos } from '../../inventarioBodega/formato';
import { normalizarPrecioUnitario, normalizarLote } from '../../../../../../functions/bodega/nucleo.mjs';
import {
  agregarLinea, campoFaltante, campoSugerido, cambiarCantidad, cambiarPrecio, quitarLinea, totalUnidades,
  totalLinea, totalValorLineas, precioInicialLinea, referenciaProducto, campoInicial, siguienteCampo,
} from './lineasDocumento';
import { useColumnasCarga } from './columnasCarga';
import { useColumnasIngreso } from './columnasIngreso';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../anchosTablaBodega';

// Columnas de la tabla de líneas (permiso col_<key> en la sección "lineas"
// de la vista que monta el editor: Ingreso o Inventario; Carga inicial usa
// las de columnasCarga). Mismo diseño que el Maestro (TablaBodega).
const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 60 },
  { key: 'producto', label: 'Producto', fija: true, ancho: 280, min: 110 },
  { key: 'lote', label: 'Lote', ancho: 110, min: 55 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 130, min: 80 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 95, min: 70 },
  { key: 'quitar', label: '', fija: true, ancho: 40, min: 34 },
];
// Celda con un campo editable: sin relleno vertical para que la fila quede
// del mismo alto que las de solo texto.
const TD_CAMPO = `${TD} !py-0 text-right`;
const CAMPO_FILA = 'h-6 px-1.5 text-right font-num border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900';

const CLAVE_AUTO = 'bodega.autoAgregarEscaneo';
const leerAuto = () => { try { return localStorage.getItem(CLAVE_AUTO) !== 'no'; } catch { return true; } };
const guardarAuto = (v) => { try { localStorage.setItem(CLAVE_AUTO, v ? 'si' : 'no'); } catch { /* sin almacenamiento */ } };

const INPUT = 'h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]';

// Editor de líneas por escaneo, común a Ingreso y Carga inicial.
// Flujo: escanear (o buscar) producto -> cantidad -> lote -> vencimiento ->
// Enter agrega la línea y el foco vuelve al campo de escaneo. Si el código
// trae lote/vencimiento (GS1) se autocompletan; un segundo código con solo
// lote/vencimiento completa la línea en curso sin cambiar el producto. Con
// "Agregar al escanear", una lectura completa se agrega sola con cantidad 1
// (escanear 10 cajas iguales = 10 unidades). El mismo producto + lote +
// vencimiento se suma a la línea existente.
//
// `conPrecio` (solo Carga inicial): muestra la referencia del producto en vez
// del código maestro, agrega precio unitario (precargado desde el maestro
// clínico, editable), total por línea y total general; al tomar un producto
// el foco va a Cantidad con el valor seleccionado, y Enter pasa al siguiente
// campo (Precio, Lote, Vencimiento) hasta el último, que agrega la línea.
// `conPrecioUnitario` (Ingreso): solo agrega precio unitario (precargado
// con el precio neto; es el costo de entrada del costo promedio) y totales.
// Lotes que ya existen del producto en curso (al escanear solo el GTIN):
// clic para usar ese lote y vencimiento. Si lo escrito no calza con
// ninguno, se avisa que se creará un lote nuevo al confirmar.
// Aviso de lote sin vencimiento (se puede guardar así y completarlo después:
// Maestro → filtro "Con lotes sin vencimiento").
const SinVencimiento = () => (
  <span className="ml-1 normal-case px-1 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Sin vencimiento</span>
);

const LotesExistentes = ({ opciones, lote, vencimiento, onElegir }) => {
  if (opciones === undefined) return null;
  const actual = normalizarLote(lote);
  const existe = opciones !== 'cargando' && opciones.some((o) => normalizarLote(o.lote) === actual && (o.vencimiento || '') === (vencimiento || ''));
  return (
    <div className="w-full flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-[10px] font-bold uppercase text-gray-500">Lotes existentes:</span>
      {opciones === 'cargando' && <span className="text-gray-400 italic">cargando…</span>}
      {opciones !== 'cargando' && opciones.length === 0 && <span className="text-gray-400 italic">ninguno</span>}
      {opciones !== 'cargando' && opciones.slice(0, 20).map((o) => {
        const activo = normalizarLote(o.lote) === actual && (o.vencimiento || '') === (vencimiento || '');
        const venc = estadoVencimiento(o.vencimiento);
        return (
          <button key={`${o.lote}|${o.vencimiento}`} type="button" onClick={() => onElegir(o)}
            className={`px-2 py-0.5 rounded border font-num ${activo ? 'border-[#2383C2] bg-white dark:bg-gray-900 ring-2 ring-[#2383C2]/40 font-bold' : 'border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-gray-900/50'}`}>
            {o.lote || 'S/L'} · {o.vencimiento || 'sin venc.'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>} · stock {formatoCantidad(o.disponible)}
          </button>
        );
      })}
      {opciones !== 'cargando' && (actual || vencimiento) && !existe && <span className="px-1.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[10px]">LOTE NUEVO: se crea al confirmar</span>}
    </div>
  );
};

const EditorLineasStock = ({ rutaVista, lineas, onCambiar, deshabilitado = false, conPrecio = false, conPrecioUnitario = false }) => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const columnasGenerales = useColumnasPermitidas(rutaVista, 'lineas', COLUMNAS);
  const columnasCarga = useColumnasCarga();
  const columnasIngreso = useColumnasIngreso();
  // Precio unitario por línea: Carga inicial (conPrecio) e Ingreso (conPrecioUnitario).
  const precioEnLinea = conPrecio || conPrecioUnitario;
  const { columnasVisibles } = conPrecio ? columnasCarga : conPrecioUnitario ? columnasIngreso : columnasGenerales;
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, `bodega.lineas.${conPrecio ? 'cargaInicialBodega' : rutaVista.split('/').pop()}`);
  const [pendiente, setPendiente] = useState(null); // { producto, cantidad, lote, vencimiento, codigoLeido }
  const [senal, setSenal] = useState({ tipo: null, mensaje: '' });
  const [lecturaSinVincular, setLecturaSinVincular] = useState(null);
  // Segundo código (lote/vencimiento) escaneado antes que el producto.
  const [espera, setEspera] = useState(null);
  // Lotes existentes por producto, para elegir al escanear solo el GTIN.
  const [lotesProducto, setLotesProducto] = useState({});
  const [auto, setAuto] = useState(leerAuto);
  const escanerRef = useRef(null);
  const cantidadRef = useRef(null);
  const precioRef = useRef(null);
  const loteRef = useRef(null);
  const vencimientoRef = useRef(null);
  // Último texto del campo Lote convertido como código de solo lote ("10" +
  // lote): si se vuelve a escribir igual y Enter, se deja tal cual (un lote
  // que de verdad empieza con "10").
  const loteLiteralRef = useRef('');

  const refDe = (campo) => ({ cantidad: cantidadRef, precio: precioRef, lote: loteRef, vencimiento: vencimientoRef }[campo] || escanerRef);
  // El foco se mueve en un efecto, después de que React pinta el panel del
  // producto (con setTimeout el campo a veces aún no existía y el foco se
  // quedaba en el escáner). `seleccionar` deja el contenido seleccionado
  // para escribir encima (Carga inicial).
  const [foco, setFoco] = useState(null); // { campo, seleccionar, n }
  useEffect(() => {
    if (!foco) return;
    const destino = refDe(foco.campo).current;
    destino?.focus();
    if (foco.seleccionar && destino?.type !== 'date') destino?.select?.();
  }, [foco]);
  const enfocar = (campo, seleccionar = false) => setFoco((f) => ({ campo, seleccionar, n: (f?.n || 0) + 1 }));

  const agregar = (p) => {
    const r = agregarLinea(lineas, { ...p, productoId: p.producto.id });
    onCambiar(r.lineas);
    setPendiente(null);
    const lote = r.linea.lote ? ` lote ${r.linea.lote}` : '';
    setSenal({ tipo: 'ok', mensaje: r.sumada ? `+${p.cantidad} ${p.producto.nombre}${lote}: se sumó a la línea existente (total ${r.linea.cantidad}).` : `Agregado: ${p.cantidad} ${p.producto.nombre}${lote}.` });
    enfocar(null);
  };

  // Deja el producto en curso; si está completo y "Agregar al escanear"
  // está activo, lo agrega; si no, enfoca el primer dato que falta.
  // `precioNeto`: el escrito al crear el producto (Carga inicial).
  const cargarLotes = (producto) => {
    if (!(producto.manejaLote || producto.manejaVencimiento) || lotesProducto[producto.id]) return;
    setLotesProducto((m) => ({ ...m, [producto.id]: 'cargando' }));
    leerLotesDeProducto(producto.id)
      .then((lotes) => setLotesProducto((m) => ({ ...m, [producto.id]: opcionesLote(lotes) })))
      .catch(() => setLotesProducto((m) => ({ ...m, [producto.id]: [] })));
  };

  const tomarProducto = (producto, lectura, precioNeto = '') => {
    if (producto.activo === false) {
      setSenal({ tipo: 'error', mensaje: `${producto.nombre} está inactivo.` });
      return;
    }
    // Lote/vencimiento: los del propio código o los del segundo código
    // escaneado antes (en espera).
    const { usoEspera, ...datosLote } = combinarDatosLote(lectura, espera);
    if (espera) setEspera(null);
    cargarLotes(producto);
    const nuevo = {
      producto, cantidad: 1, ...datosLote, codigoLeido: lectura?.codigo || '',
      ...(precioEnLinea ? { precioUnitario: precioInicialLinea(producto, precioNeto) } : {}),
    };
    if (pendiente && pendiente.producto.id !== producto.id) {
      setSenal({ tipo: 'aviso', mensaje: `Se descartó ${pendiente.producto.nombre} (no se agregó).` });
    }
    const falta = campoFaltante(nuevo);
    const sugerido = campoSugerido(nuevo);
    if (!falta && !sugerido && auto) { agregar(nuevo); return; }
    setPendiente(nuevo);
    const primero = campoInicial(nuevo, precioEnLinea);
    const indicacion = primero === 'lote' ? 'escanea el código de lote (o escribe el lote) y luego la cantidad'
      : falta ? `ingresa ${falta}` : sugerido ? `ingresa ${sugerido} (opcional) y presiona Enter` : 'presiona Enter para agregar';
    const conLote = usoEspera ? ` (lote ${datosLote.lote || '—'} del código anterior)` : '';
    if (!pendiente || pendiente.producto.id === producto.id) setSenal({ tipo: 'ok', mensaje: `${producto.nombre}${conLote}: ${indicacion}.` });
    enfocar(primero, true);
  };

  const onLectura = async (texto) => {
    try {
      // Con un producto en curso que maneja lote, un código con solo lote
      // ("10" + lote, sin vencimiento) se toma como su segundo código.
      const r = await identificarLectura(texto, { conProductoEnCurso: Boolean(pendiente?.producto?.manejaLote) });
      if (!r) return;
      if (r.tipo === 'datosLote') {
        const datos = datosLoteDeLectura(r.lectura);
        if (!pendiente) {
          // Se aplica al próximo producto que se escanee.
          setEspera(datosLoteEnEspera(r.lectura));
          setSenal({ tipo: 'aviso', mensaje: `Lote ${datos.lote || '—'} · vence ${datos.vencimiento || '—'} leído: escanea ahora el código del producto.` });
          return;
        }
        const completado = {
          ...pendiente,
          lote: datos.lote || pendiente.lote,
          vencimiento: datos.vencimiento || pendiente.vencimiento,
          codigoLote: r.lectura.codigo,
        };
        const falta = campoFaltante(completado);
        const sugerido = campoSugerido(completado);
        if (!falta && !sugerido && auto) { agregar(completado); return; }
        setPendiente(completado);
        setSenal(esSoloLote(r.lectura) && !completado.vencimiento
          ? { tipo: 'aviso', mensaje: `Lote ${datos.lote} leído para ${pendiente.producto.nombre}: el código no trae vencimiento. Escríbelo si viene en la caja, o déjalo vacío y presiona Enter.` }
          : { tipo: 'ok', mensaje: `Lote/vencimiento completados para ${pendiente.producto.nombre}.` });
        enfocar(campoInicial(completado, precioEnLinea), true);
        return;
      }
      if (r.tipo === 'sinVincular') { setLecturaSinVincular(r.lectura); return; }
      tomarProducto(r.producto, r.lectura);
    } catch (error) {
      setSenal({ tipo: 'error', mensaje: mensajeError(error) });
    }
  };

  const confirmarPendiente = () => {
    const falta = campoFaltante(pendiente);
    if (falta) { setSenal({ tipo: 'error', mensaje: `Falta ${falta}.` }); enfocar(falta); return; }
    if (precioEnLinea && normalizarPrecioUnitario(pendiente.precioUnitario).error) {
      setSenal({ tipo: 'error', mensaje: 'El precio unitario debe ser un número mayor o igual a cero.' });
      enfocar('precio', true);
      return;
    }
    agregar({ ...pendiente, cantidad: Number(pendiente.cantidad) });
  };
  // Enter pasa al siguiente campo (Lote → Vencimiento → Cantidad y, en
  // Carga inicial, Precio), saltando lote/vencimiento ya completos; el
  // último agrega la línea. Igual en Carga inicial, Ingreso e Inventario.
  // El campo sale de data-campo del input.
  const alPresionarEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const siguiente = siguienteCampo(pendiente, e.currentTarget.dataset.campo, precioEnLinea);
    if (siguiente) { enfocar(siguiente, true); return; }
    confirmarPendiente();
  };
  // En el campo Lote: si lo escaneado es el código GS1 de lote/vencimiento
  // (código 2), rellena Lote y Vencimiento en vez de dejar el código como
  // texto y pasa a Cantidad. Si no, Enter funciona como siempre.
  const alTeclaEnLote = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const texto = e.currentTarget.value;
    const datos = datosLoteEnTexto(texto, { soloLote: texto !== loteLiteralRef.current });
    if (!datos) { alPresionarEnter(e); return; }
    e.preventDefault();
    const soloLote = esSoloLote(datos.lectura);
    loteLiteralRef.current = soloLote ? texto : '';
    const completado = {
      ...pendiente,
      lote: datos.lote || '',
      vencimiento: datos.vencimiento || pendiente.vencimiento,
      codigoLote: datos.codigoLote || pendiente.codigoLote || '',
    };
    setSenal(soloLote && !completado.vencimiento
      ? { tipo: 'aviso', mensaje: `Código de lote leído: lote ${datos.lote}, sin vencimiento. Escríbelo si viene en la caja, o déjalo vacío y presiona Enter. (Si el lote es literalmente ${texto}, escríbelo de nuevo.)` }
      : { tipo: 'ok', mensaje: `Código de lote leído: lote ${datos.lote || '—'} · vence ${datos.vencimiento || '—'}. Ingresa la cantidad.` });
    if (!campoFaltante(completado) && !campoSugerido(completado) && auto) { agregar(completado); return; }
    setPendiente(completado);
    enfocar(campoInicial(completado, precioEnLinea), true);
  };
  const cambiar = (campo) => (e) => setPendiente((p) => ({ ...p, [campo]: e.target.value }));

  const total = totalUnidades(lineas);

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2 items-start">
        <CampoEscaneoBodega ref={escanerRef} autoFocus onLectura={onLectura} deshabilitado={deshabilitado} senal={senal.tipo} mensaje={senal.mensaje} />
        <div className="flex flex-col gap-1">
          <BuscadorProducto deshabilitado={deshabilitado} onElegir={(p) => tomarProducto(p, null)} />
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 font-semibold" title="Si el código trae todo lo necesario, se agrega con cantidad 1 sin presionar nada más">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); guardarAuto(e.target.checked); }} /> Agregar al escanear (cantidad 1)
          </label>
        </div>
      </div>

      {pendiente && (
        <div className="flex flex-wrap items-end gap-1.5 px-2 py-1.5 rounded-lg border-2 border-[#2383C2]/50 bg-blue-50/50 dark:bg-sky-950/20">
          <div className="flex-1 min-w-[180px]">
            <span className="block text-[10px] font-bold uppercase text-gray-500">Producto</span>
            <span className="font-bold text-gray-800 dark:text-gray-100">{pendiente.producto.nombre}</span>
            <span className="ml-1 font-num text-[11px] text-gray-500">
              {conPrecio ? (referenciaProducto(pendiente.producto) ? `Ref. ${referenciaProducto(pendiente.producto)}` : 'Sin referencia') : pendiente.producto.codigoMaestro}
            </span>
          </div>
          {pendiente.producto.manejaLote && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Lote <span className="normal-case font-normal">(opcional)</span></span>
              <input ref={loteRef} value={pendiente.lote} onChange={cambiar('lote')} data-campo="lote" onKeyDown={alTeclaEnLote} maxLength={300} placeholder="Escanea el código de lote" title="Escanea aquí el código 2 (lote/vencimiento) o escribe el lote" className={`${INPUT} w-36 font-num uppercase`} />
            </label>
          )}
          {pendiente.producto.manejaVencimiento && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">
                Vencimiento <span className="normal-case font-normal">(opcional)</span>
                {!pendiente.vencimiento && <SinVencimiento />}
              </span>
              <input ref={vencimientoRef} type="date" value={pendiente.vencimiento} onChange={cambiar('vencimiento')} data-campo="vencimiento" onKeyDown={alPresionarEnter} className={`${INPUT} w-40 font-num`} />
            </label>
          )}
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Cantidad</span>
            <input ref={cantidadRef} type="number" min="1" step="1" inputMode="numeric" value={pendiente.cantidad} onChange={cambiar('cantidad')} data-campo="cantidad" onKeyDown={alPresionarEnter} className={`${INPUT} w-24 font-num`} />
          </label>
          {precioEnLinea && (
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-gray-500">Precio unitario <span className="normal-case font-normal">(opcional)</span></span>
              <input ref={precioRef} type="number" min="0" step="1" inputMode="numeric" value={pendiente.precioUnitario ?? ''} onChange={cambiar('precioUnitario')} data-campo="precio" onKeyDown={alPresionarEnter} className={`${INPUT} w-32 font-num`} aria-label="Precio unitario" />
            </label>
          )}
          <button type="button" onClick={confirmarPendiente} className="h-7 px-2.5 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={13} /> Agregar</button>
          <button type="button" onClick={() => { setPendiente(null); enfocar(null); }} title="Descartar" className="h-7 px-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200"><X size={14} /></button>
          {(pendiente.producto.manejaLote || pendiente.producto.manejaVencimiento) && (
            <LotesExistentes opciones={lotesProducto[pendiente.producto.id]} lote={pendiente.lote} vencimiento={pendiente.vencimiento}
              onElegir={(o) => { setPendiente((p) => ({ ...p, lote: o.lote, vencimiento: o.vencimiento })); enfocar('cantidad', true); }} />
          )}
        </div>
      )}
      {espera && !pendiente && (
        <div className="flex items-center gap-2 px-2 py-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-200">
          <span>Lote <strong className="font-num">{espera.lote || '—'}</strong> · vence <strong className="font-num">{espera.vencimiento || '—'}</strong> en espera: escanea el código del producto.</span>
          <button type="button" onClick={() => setEspera(null)} title="Descartar" className="ml-auto p-0.5"><X size={12} /></button>
        </div>
      )}

      <div className="flex justify-end -mb-1">
        <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
          {lineas.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>Escanea o busca un producto para agregar líneas.</FilaAnchoCompleto>}
          {lineas.map((l) => {
            const p = porId[l.productoId];
            const venc = estadoVencimiento(l.vencimiento);
            const referencia = referenciaProducto(p);
            const celdas = {
              referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={referencia ? `${referencia} · ${p?.codigoMaestro || ''}` : p?.codigoMaestro}>{referencia || '—'}</td>,
              producto: <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={p?.nombre || ''}>{p?.nombre || <span className="text-red-600">Producto no encontrado</span>}</td>,
              lote: <td className={`${TD} font-num`} title={l.lote || ''}>{l.lote || '—'}</td>,
              vencimiento: <td className={`${TD} font-num`}>{l.vencimiento || (p?.manejaVencimiento ? <SinVencimiento /> : '—')} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>,
              cantidad: (
                <td className={TD_CAMPO}>
                  <input type="number" min="1" step="1" inputMode="numeric" value={l.cantidad} disabled={deshabilitado}
                    onChange={(e) => onCambiar(cambiarCantidad(lineas, l.key, e.target.value === '' ? '' : Number(e.target.value)))}
                    className={`${CAMPO_FILA} w-full max-w-20`} aria-label="Cantidad" />
                </td>
              ),
              precio: (
                <td className={TD_CAMPO}>
                  <input type="number" min="0" step="1" inputMode="numeric" value={l.precioUnitario ?? ''} disabled={deshabilitado}
                    onChange={(e) => onCambiar(cambiarPrecio(lineas, l.key, e.target.value))}
                    className={`${CAMPO_FILA} w-full max-w-28`} aria-label="Precio unitario" />
                </td>
              ),
              total: <td className={`${TD} text-right font-num font-semibold`}>{formatoPesos(totalLinea(l))}</td>,
              quitar: (
                <td className={`${TD} !py-0 text-center`}>
                  <button type="button" disabled={deshabilitado} onClick={() => onCambiar(quitarLinea(lineas, l.key))} title="Quitar línea" className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={14} /></button>
                </td>
              ),
            };
            return <FilaBodega key={l.key} columnas={columnasVisibles} celdas={celdas} className={venc.fila} />;
          })}
          {lineas.length > 0 && (
            <FilaAnchoCompleto columnas={columnasVisibles} className="bg-gray-50 dark:bg-gray-900 font-bold" celdaClassName="px-2 py-1 text-right">
              <PackageCheck size={13} className="inline mr-1 text-emerald-600" />{lineas.length} línea(s) · {formatoCantidad(total)} unidad(es)
              {precioEnLinea && <> · Total {conPrecio ? 'carga' : 'ingreso'} <span className="font-num">{formatoPesos(totalValorLineas(lineas))}</span></>}
            </FilaAnchoCompleto>
          )}
        </TablaBodega>
      </div>

      {lecturaSinVincular && (
        <ModalVincularCodigo
          lectura={lecturaSinVincular}
          productoSugerido={pendiente?.producto || null}
          conPrecioNeto={conPrecio}
          onDatosLote={(datos) => setEspera(datosLoteEnEspera(datos.lectura))}
          onCerrar={() => { setLecturaSinVincular(null); enfocar(null); }}
          onVinculado={(producto, extra) => { const lectura = lecturaSinVincular; setLecturaSinVincular(null); tomarProducto(producto, lectura, extra?.precioNeto); }}
        />
      )}
    </div>
  );
};

export default EditorLineasStock;
