import { Fragment, useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, Plus, Trash2, X, CheckCircle2, Layers } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import CentroSelect from '../../../ui/CentroSelect';
import { lotesFEFO, normalizarLote, MAX_LINEAS_EGRESO, MAX_OBSERVACION } from '../../../../../functions/bodega/nucleo.mjs';
import CampoEscaneoBodega from '../shared/escaneo/CampoEscaneoBodega';
import { identificarLectura, datosLoteDeLectura, datosLoteEnEspera, combinarDatosLote } from '../shared/escaneo/identificarLectura';
import ModalVincularCodigo from '../shared/ModalVincularCodigo';
import BuscadorProducto from '../shared/BuscadorProducto';
import { egresar, leerLotesDeProducto, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import { estadoVencimiento } from '../shared/vencimientos';
import { agregarLineaEgreso, reservadoPorLote, resumenPorCentro } from './lineasEgreso';
import { referenciaProducto } from '../shared/documentos/lineasDocumento';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';

const PATH_VISTA = '/bodega/egresoBodega';
// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 60 },
  { key: 'producto', label: 'Producto', fija: true, ancho: 280, min: 110 },
  { key: 'lote', label: 'Lote', ancho: 150, min: 55 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 110, min: 80 },
  { key: 'centro', label: 'Centro', ancho: 160, min: 70 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 85, min: 60 },
  { key: 'quitar', label: '', fija: true, ancho: 40, min: 34 },
];
const CLAVE_CENTRO = 'bodega.ultimoCentroEgreso';
const leerUltimoCentro = () => { try { return JSON.parse(localStorage.getItem(CLAVE_CENTRO) || 'null'); } catch { return null; } };
const guardarUltimoCentro = (c) => { try { localStorage.setItem(CLAVE_CENTRO, JSON.stringify(c)); } catch { /* sin almacenamiento */ } };
const INPUT = 'h-9 px-2 border border-gray-300 dark:border-gray-600 rounded text-[13px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]';

// Salida de la Bodega General a tránsito en uno o varios centros.
// Por línea: escanear o buscar el producto -> lote (el exacto del código o
// FEFO) -> cantidad -> centro (obligatorio, recuerda el último) -> agregar.
// Al confirmar, la Cloud Function baja el disponible y sube el tránsito del
// centro de cada línea en una sola transacción.
const EgresoBodega = () => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'lineas', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'bodega.egreso.lineas');
  const { datos: productos } = useCatalogo('bodegaProductos');
  const { datos: centros } = useCatalogo('centros');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const [seleccion, setSeleccion] = useState(null); // { producto, lotes, loteId, cantidad }
  const [lotesCache, setLotesCache] = useState({});
  // Segundo código (lote/vencimiento) escaneado antes que el producto.
  const [espera, setEspera] = useState(null);
  const [centro, setCentro] = useState(leerUltimoCentro);
  const [lineas, setLineas] = useState([]);
  const [agrupar, setAgrupar] = useState(false);
  const [solicitante, setSolicitante] = useState('');
  const [observacion, setObservacion] = useState('');
  const [senal, setSenal] = useState({ tipo: null, mensaje: '' });
  const [ocupado, setOcupado] = useState(false);
  const [lecturaSinVincular, setLecturaSinVincular] = useState(null);
  const escanerRef = useRef(null);
  const cantidadRef = useRef(null);

  const enfocar = (ref = escanerRef) => setTimeout(() => ref.current?.focus(), 0);
  const reservado = useMemo(() => reservadoPorLote(lineas), [lineas]);
  // Lotes con lo que queda disponible descontando lo ya agregado a la lista.
  const lotesDisponibles = (lotes) => lotesFEFO(lotes)
    .map((l) => ({ ...l, restante: (l.disponible || 0) - (reservado[l.id] || 0) }))
    .filter((l) => l.restante > 0);

  const lotesDe = async (productoId) => {
    if (lotesCache[productoId]) return lotesCache[productoId];
    const lotes = await leerLotesDeProducto(productoId);
    setLotesCache((c) => ({ ...c, [productoId]: lotes }));
    return lotes;
  };

  // Elige el lote: el exacto del código (si trae lote/vencimiento) o FEFO.
  const elegirLote = (producto, lotes, datosLote) => {
    const disponibles = lotesDisponibles(lotes);
    if (!disponibles.length) {
      setSeleccion(null);
      setSenal({ tipo: 'error', mensaje: `${producto.nombre}: sin stock disponible en la Bodega General.` });
      return;
    }
    let lote = disponibles[0];
    let exacto = false;
    if (datosLote.lote || datosLote.vencimiento) {
      const buscado = disponibles.find((l) => (!datosLote.lote || normalizarLote(l.lote) === normalizarLote(datosLote.lote))
        && (!datosLote.vencimiento || l.vencimiento === datosLote.vencimiento));
      if (!buscado) {
        setSeleccion({ producto, loteId: lote.id, cantidad: 1 });
        setSenal({ tipo: 'error', mensaje: `El lote ${datosLote.lote || ''} ${datosLote.vencimiento || ''} no tiene stock disponible. Elige otro lote.` });
        return;
      }
      lote = buscado;
      exacto = true;
    }
    setSeleccion({ producto, loteId: lote.id, cantidad: 1, codigoLote: exacto ? (datosLote.codigoLote || '') : '' });
    // Sin código de lote y con lote/vencimiento: el cursor queda en el
    // escáner, listo para el código 2 (o se ingresa la cantidad del FEFO).
    const esperaCodigoLote = !exacto && (producto.manejaLote || producto.manejaVencimiento);
    setSenal({ tipo: 'ok', mensaje: `${producto.nombre}: lote ${lote.lote || 'S/L'}${lote.propietarioNombre ? ` (consignado ${lote.propietarioNombre})` : ''} ${exacto ? '(el del código)' : '(vence primero)'} · quedan ${lote.restante}.${esperaCodigoLote ? ' Escanea el código de lote para elegir ese lote, o ingresa la cantidad.' : ''}` });
    enfocar(esperaCodigoLote ? escanerRef : lote.restante > 1 ? cantidadRef : escanerRef);
  };

  const tomarProducto = async (producto, lectura) => {
    if (producto.activo === false) { setSenal({ tipo: 'error', mensaje: `${producto.nombre} está inactivo.` }); return; }
    try {
      const lotes = await lotesDe(producto.id);
      // Lote/vencimiento del propio código o del segundo código leído antes.
      const datosLote = combinarDatosLote(lectura, espera);
      if (espera) setEspera(null);
      elegirLote(producto, lotes, datosLote);
    } catch (error) {
      setSenal({ tipo: 'error', mensaje: mensajeError(error) });
    }
  };

  const onLectura = async (texto) => {
    try {
      const r = await identificarLectura(texto);
      if (!r) return;
      if (r.tipo === 'datosLote') {
        const datos = datosLoteDeLectura(r.lectura);
        if (!seleccion) {
          setEspera(datosLoteEnEspera(r.lectura));
          setSenal({ tipo: 'aviso', mensaje: `Lote ${datos.lote || '—'} · vence ${datos.vencimiento || '—'} leído: escanea ahora el código del producto.` });
          return;
        }
        elegirLote(seleccion.producto, lotesCache[seleccion.producto.id] || [], { ...datos, codigoLote: r.lectura.codigo });
        return;
      }
      if (r.tipo === 'sinVincular') { setLecturaSinVincular(r.lectura); return; }
      await tomarProducto(r.producto, r.lectura);
    } catch (error) {
      setSenal({ tipo: 'error', mensaje: mensajeError(error) });
    }
  };

  const disponiblesSeleccion = seleccion ? lotesDisponibles(lotesCache[seleccion.producto.id] || []) : [];
  const loteSeleccionado = disponiblesSeleccion.find((l) => l.id === seleccion?.loteId);

  const agregar = () => {
    if (!seleccion || !loteSeleccionado) { setSenal({ tipo: 'error', mensaje: 'Elige un producto y un lote con stock.' }); return; }
    const cantidad = Number(seleccion.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) { setSenal({ tipo: 'error', mensaje: 'La cantidad debe ser un número entero mayor a cero.' }); enfocar(cantidadRef); return; }
    if (cantidad > loteSeleccionado.restante) { setSenal({ tipo: 'error', mensaje: `Solo quedan ${loteSeleccionado.restante} en el lote ${loteSeleccionado.lote || 'S/L'}.` }); enfocar(cantidadRef); return; }
    if (!centro?.id) { setSenal({ tipo: 'error', mensaje: 'Elige el centro de destino.' }); return; }
    if (lineas.length >= MAX_LINEAS_EGRESO) { setSenal({ tipo: 'error', mensaje: `Máximo ${MAX_LINEAS_EGRESO} líneas por salida: confirma esta y sigue en otra.` }); return; }
    const r = agregarLineaEgreso(lineas, { producto: seleccion.producto, lote: loteSeleccionado, cantidad, centro, codigoLote: seleccion.codigoLote || '' });
    setLineas(r.lineas);
    setSenal({ tipo: 'ok', mensaje: `${r.sumada ? 'Sumado' : 'Agregado'}: ${cantidad} ${seleccion.producto.nombre} lote ${loteSeleccionado.lote || 'S/L'} → ${centro.nombre}.` });
    setSeleccion(null);
    enfocar();
  };

  const cambiarCentro = (c) => {
    const nuevo = { id: c.id, nombre: c.nombre };
    setCentro(nuevo);
    guardarUltimoCentro(nuevo);
  };

  const confirmar = () => {
    if (!lineas.length) return;
    const resumen = resumenPorCentro(lineas).map((c) => `${c.nombre}: ${c.unidades} u.`).join(' · ');
    confirmAction('Confirmar salida a tránsito', `Se sacarán de la Bodega General ${formatoCantidad(lineas.reduce((n, l) => n + l.cantidad, 0))} unidad(es) en ${lineas.length} línea(s) y quedarán en tránsito en: ${resumen}. ¿Confirmar?`, async () => {
      setOcupado(true);
      try {
        const r = await egresar({ lineas: lineas.map(({ productoId, loteId, cantidad, centroId, codigoLote }) => ({ productoId, loteId, cantidad, centroId, codigoLote })), solicitante, observacion });
        showToast(`Salida N° ${r.numero} confirmada (${r.lineas} línea/s).`, 'success');
        setLineas([]); setSolicitante(''); setObservacion(''); setLotesCache({}); setSeleccion(null);
        setSenal({ tipo: 'ok', mensaje: `Salida N° ${r.numero} confirmada.` });
      } catch (error) {
        showToast(mensajeError(error), 'error');
        setSenal({ tipo: 'error', mensaje: `No se confirmó la salida: ${mensajeError(error)}` });
        setLotesCache({});
      } finally {
        setOcupado(false);
        enfocar();
      }
    }, { type: 'primary', confirmText: 'Confirmar salida' });
  };

  const filas = agrupar ? [...lineas].sort((a, b) => a.centroNombre.localeCompare(b.centroNombre, 'es')) : lineas;
  const subtotales = resumenPorCentro(lineas);
  const nombreCentroActual = centro?.id ? (centros.find((c) => c.id === centro.id)?.nombre || centro.nombre) : '';

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[12px]">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase">
          <ArrowUpFromLine size={14} className="text-[#2383C2]" /> Egreso · salida a tránsito por centro
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2 items-start">
          <CampoEscaneoBodega ref={escanerRef} autoFocus onLectura={onLectura} deshabilitado={ocupado} senal={senal.tipo} mensaje={senal.mensaje} />
          <BuscadorProducto deshabilitado={ocupado} onElegir={(p) => tomarProducto(p, null)} filtro={(p) => (p.disponible || 0) > 0} placeholder="Buscar producto con stock…" />
        </div>

        {seleccion && (
          <div className="p-2 rounded-lg border-2 border-[#2383C2]/50 bg-blue-50/50 dark:bg-sky-950/20 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800 dark:text-gray-100">{seleccion.producto.nombre} <span className="font-num text-[11px] text-gray-500">{seleccion.producto.codigoMaestro}</span></span>
              <button type="button" onClick={() => { setSeleccion(null); enfocar(); }} title="Descartar" className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Lote">
              {disponiblesSeleccion.map((l, i) => {
                const venc = estadoVencimiento(l.vencimiento);
                const activo = l.id === seleccion.loteId;
                return (
                  <button key={l.id} type="button" role="radio" aria-checked={activo} onClick={() => setSeleccion((s) => ({ ...s, loteId: l.id, codigoLote: '' }))}
                    className={`px-2.5 py-1.5 rounded border text-left ${activo ? 'border-[#2383C2] bg-white dark:bg-gray-900 ring-2 ring-[#2383C2]/40' : 'border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-gray-900/50'}`}>
                    <div className="font-num font-bold">{l.lote || 'S/L'} {i === 0 && <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">FEFO</span>}</div>
                    {l.propietarioNombre && <div className="text-[9px] font-bold text-violet-700 dark:text-violet-300">CONSIG. {l.propietarioNombre}</div>}
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 font-num">
                      {l.vencimiento || 'sin venc.'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>} · disp. {l.restante}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-gray-500">Cantidad</span>
                <input ref={cantidadRef} type="number" min="1" max={loteSeleccionado?.restante || 1} step="1" inputMode="numeric" value={seleccion.cantidad}
                  onChange={(e) => setSeleccion((s) => ({ ...s, cantidad: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                  className={`${INPUT} w-24 font-num`} />
              </label>
              <div className="flex flex-col w-64">
                <span className="text-[10px] font-bold uppercase text-gray-500">Centro de destino *</span>
                <CentroSelect todos value={centro?.id || null} onChange={cambiarCentro} placeholder="Elegir centro…" />
              </div>
              <button type="button" onClick={agregar} className="h-9 px-3 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={14} /> Agregar</button>
            </div>
          </div>
        )}
        {!seleccion && nombreCentroActual && (
          <p className="text-[11px] text-gray-500">Centro por defecto para la próxima línea: <strong>{nombreCentroActual}</strong> (se puede cambiar en cada una).</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300">Líneas de la salida</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> <Layers size={12} /> Agrupar por centro
            </label>
            <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
          </div>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
          <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
            {lineas.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>Escanea o busca un producto para agregar líneas.</FilaAnchoCompleto>}
            {filas.map((l, i) => {
              const p = porId[l.productoId];
              const referencia = referenciaProducto(p);
              const encabezado = agrupar && (i === 0 || filas[i - 1].centroId !== l.centroId);
              const sub = subtotales.find((c) => c.centroId === l.centroId);
              const celdas = {
                referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={referencia ? `${referencia} · ${p?.codigoMaestro || ''}` : p?.codigoMaestro}>{referencia || '—'}</td>,
                producto: <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={l.productoNombre}>{l.productoNombre}</td>,
                lote: (
                  <td className={`${TD} font-num`} title={`${l.lote || ''}${l.propietarioNombre ? ` · consignado ${l.propietarioNombre}` : ''}`}>
                    {l.lote || '—'}{l.propietarioNombre && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">CONSIG. {l.propietarioNombre}</span>}
                  </td>
                ),
                vencimiento: <td className={`${TD} font-num`}>{l.vencimiento || '—'}</td>,
                centro: <td className={TD} title={l.centroNombre}>{l.centroNombre}</td>,
                cantidad: <td className={`${TD} text-right font-num font-bold`}>{l.cantidad}</td>,
                quitar: (
                  <td className={`${TD} !py-0 text-center`}>
                    <button type="button" disabled={ocupado} onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} title="Quitar línea" className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={14} /></button>
                  </td>
                ),
              };
              return (
                <Fragment key={l.key}>
                  {encabezado && (
                    <FilaAnchoCompleto columnas={columnasVisibles} className="bg-amber-50 dark:bg-amber-950/20" celdaClassName="px-2 py-1 font-bold text-amber-800 dark:text-amber-200 border-b border-gray-200 dark:border-gray-700/70">
                      {l.centroNombre} · {sub.lineas} línea(s) · {sub.unidades} u.
                    </FilaAnchoCompleto>
                  )}
                  <FilaBodega columnas={columnasVisibles} celdas={celdas} />
                </Fragment>
              );
            })}
          </TablaBodega>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Solicitante / destino (opcional)</span>
            <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} maxLength={120} disabled={ocupado} className={INPUT} placeholder="Ej: Dra. Pérez, Pabellón 3" />
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-gray-500">Observación (opcional)</span>
            <input value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={MAX_OBSERVACION} disabled={ocupado} className={INPUT} />
          </label>
        </div>
        {hasPermission(PATH_VISTA, 'egreso', 'btn_confirmar') && (
          <div className="flex justify-end">
            <button type="button" onClick={confirmar} disabled={ocupado || !lineas.length} className="h-10 px-4 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <CheckCircle2 size={15} /> Confirmar salida ({lineas.length})
            </button>
          </div>
        )}
      </div>

      {lecturaSinVincular && (
        <ModalVincularCodigo
          lectura={lecturaSinVincular}
          productoSugerido={seleccion?.producto || null}
          onDatosLote={(datos) => setEspera(datosLoteEnEspera(datos.lectura))}
          onCerrar={() => { setLecturaSinVincular(null); enfocar(); }}
          onVinculado={(producto) => { const lectura = lecturaSinVincular; setLecturaSinVincular(null); tomarProducto(producto, lectura); }}
        />
      )}
    </div>
  );
};

export default EgresoBodega;
