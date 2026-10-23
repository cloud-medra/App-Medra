import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, CheckCircle2, FilePlus2, RefreshCw, Trash2, FolderOpen, Lock, LockOpen, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import {
  TIPOS_DOCUMENTO_INGRESO, MAX_LINEAS_DOCUMENTO, MAX_OBSERVACION, validarCabecera,
} from '../../../../../../functions/bodega/nucleo.mjs';
import {
  guardarBorrador, eliminarBorrador, confirmarDocumento, leerDocumento, leerDocumentos, leerConfigBodega, configurarCargaInicial, mensajeError,
} from '../bodegaApi';
import { formatoCantidad } from '../catalogosBodega';
import EditorLineasStock from './EditorLineasStock';
import SelectorProveedor from './SelectorProveedor';
import { erroresLineas, totalUnidades, totalValorLineas, lineasDesdeDocumento, hoyISO } from './lineasDocumento';
import { formatoPesos } from '../../inventarioBodega/formato';
import { ponerPrimero } from '../listasLocales';

// Largo de las listas de borradores y confirmados recientes.
const MAX_BORRADORES = 30;
const MAX_CONFIRMADOS = 15;

const INPUT = 'w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-60';
const LABEL = 'block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5';
const BOTON = 'h-7 px-2.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed';

const cabeceraVacia = (tipo) => (tipo === 'INGRESO'
  ? { tipoDocumento: 'GUIA', numero: '', ordenCompra: '', proveedorId: '', fecha: hoyISO(), observacion: '', consignacion: false }
  : { observacion: '', propietarioId: '' });

const fechaCorta = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '');

const etiquetaDocumento = (d) => (d.tipo === 'INGRESO'
  ? `${TIPOS_DOCUMENTO_INGRESO[d.tipoDocumento] || 'Documento'} N° ${d.numero || '—'} · ${d.proveedorNombre || 'sin proveedor'}${d.consignacion ? ' · EN CONSIGNACIÓN' : ''}`
  : `Carga inicial${d.propietarioNombre ? ` · consignado ${d.propietarioNombre}` : ''}${d.observacion ? ` · ${d.observacion}` : ''}`);

// Lista de borradores o de confirmados recientes.
const ListaDocumentos = ({ titulo, documentos, cargando, onActualizar, onAbrir, onEliminar, nombreProducto }) => {
  const [abierto, setAbierto] = useState(null);
  return (
    <section className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300">{titulo} <span className="text-gray-400 font-normal">({documentos.length})</span></h3>
        <button type="button" onClick={onActualizar} title="Actualizar" className="p-1 rounded text-gray-500 hover:text-[#2383C2]"><RefreshCw size={12} className={cargando ? 'animate-spin' : ''} /></button>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-auto text-[11px]">
        {documentos.length === 0 && <li className="px-3 py-3 text-gray-400 italic">{cargando ? 'Cargando…' : 'Sin documentos.'}</li>}
        {documentos.map((d) => (
          <li key={d.id} className="px-3 py-1.5">
            <div className="flex items-center gap-2">
              {!onAbrir && (
                <button type="button" onClick={() => setAbierto(abierto === d.id ? null : d.id)} className="text-gray-400">{abierto === d.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{etiquetaDocumento(d)}</div>
                <div className="text-gray-500">
                  {(d.lineas || []).length} línea(s) · {formatoCantidad(d.totalUnidades ?? totalUnidades(d.lineas || []))} u. ·
                  {d.tipo === 'CARGA_INICIAL' && <> {formatoPesos(d.totalValor ?? totalValorLineas(d.lineas || []))} ·</>} {(d.confirmadoPor || d.actualizadoPor || d.creadoPor)?.nombre || ''} · {fechaCorta(d.confirmadoEn || d.actualizadoEn)}
                </div>
              </div>
              {onAbrir && <button type="button" onClick={() => onAbrir(d)} title="Abrir borrador" className="p-1.5 rounded text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700"><FolderOpen size={14} /></button>}
              {onEliminar && <button type="button" onClick={() => onEliminar(d)} title="Eliminar borrador" className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={14} /></button>}
            </div>
            {abierto === d.id && (
              <ul className="mt-1 ml-5 text-gray-600 dark:text-gray-300">
                {(d.lineas || []).map((l) => (
                  <li key={l.loteId || `${l.productoId}-${l.lote}-${l.vencimiento}`}>
                    {l.cantidad} × {l.productoNombre || nombreProducto(l.productoId)}{l.lote ? ` · lote ${l.lote}` : ''}{l.vencimiento ? ` · vence ${l.vencimiento}` : ''}
                    {l.precioUnitario != null && ` · ${formatoPesos(l.precioUnitario)} c/u`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

// Pantalla común de Ingreso por documento (tipo INGRESO) y Carga inicial
// (tipo CARGA_INICIAL): cabecera, líneas por escaneo, borradores y
// confirmación. Toda escritura pasa por las Cloud Functions; lo que se ve
// aquí se vuelve a validar en el servidor.
//   ruta / seccion: vista y sección de permisos ('documento' o 'carga').
const PantallaDocumento = ({ tipo, ruta, seccion, titulo, icono: Icono, aviso }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const { datos: productos } = useCatalogo('bodegaProductos');
  const { datos: empresas } = useCatalogo('empresas');
  const porId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const [docId, setDocId] = useState(null);
  const [cabecera, setCabecera] = useState(() => cabeceraVacia(tipo));
  const [lineas, setLineas] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [errores, setErrores] = useState([]);
  const [borradores, setBorradores] = useState([]);
  const [confirmados, setConfirmados] = useState([]);
  const [cargandoListas, setCargandoListas] = useState(true);
  const [version, setVersion] = useState(0);
  const [config, setConfig] = useState(null);
  // Cambia al limpiar o abrir otro documento: reinicia el editor (descarta
  // el producto a medio ingresar).
  const [reinicio, setReinicio] = useState(0);

  const puede = (accion) => hasPermission(ruta, seccion, accion);
  const esCarga = tipo === 'CARGA_INICIAL';
  const cargaCerrada = esCarga && config?.cargaInicialCerrada === true;

  useEffect(() => {
    let vigente = true;
    Promise.all([
      leerDocumentos({ tipo, estado: 'BORRADOR', max: MAX_BORRADORES }),
      leerDocumentos({ tipo, estado: 'CONFIRMADO', max: MAX_CONFIRMADOS }),
      esCarga ? leerConfigBodega() : Promise.resolve(null),
    ]).then(([b, c, cfg]) => {
      if (!vigente) return;
      setBorradores(b); setConfirmados(c); setConfig(cfg); setCargandoListas(false);
    }).catch((e) => { if (vigente) { setCargandoListas(false); showToast(mensajeError(e, 'No se pudieron leer los documentos.'), 'error'); } });
    return () => { vigente = false; };
  }, [tipo, esCarga, version, showToast]);
  const recargarListas = useCallback(() => { setCargandoListas(true); setVersion((v) => v + 1); }, []);
  // Tras guardar o confirmar se relee solo ese documento (1 lectura) y se
  // ubica en su lista; si falla, se recargan las listas. Los documentos de
  // otros usuarios llegan con "Actualizar".
  const reflejarDocumento = useCallback(async (id) => {
    try {
      const d = await leerDocumento(id);
      if (!d) { recargarListas(); return; }
      setBorradores((l) => (d.estado === 'BORRADOR' ? ponerPrimero(l, d, MAX_BORRADORES) : l.filter((x) => x.id !== d.id)));
      if (d.estado === 'CONFIRMADO') setConfirmados((l) => ponerPrimero(l, d, MAX_CONFIRMADOS));
    } catch {
      recargarListas();
    }
  }, [recargarListas]);

  const limpiar = () => { setDocId(null); setCabecera(cabeceraVacia(tipo)); setLineas([]); setErrores([]); setReinicio((n) => n + 1); };
  const cambiarCabecera = (campo) => (e) => setCabecera((c) => ({ ...c, [campo]: e?.target ? e.target.value : e }));
  const datosEnvio = () => ({ id: docId, tipo, cabecera, lineas: lineas.map(({ key, ...l }) => { void key; return l; }) });

  const guardar = async () => {
    setOcupado(true);
    try {
      const r = await guardarBorrador(datosEnvio());
      setDocId(r.id);
      showToast(r.duplicado ? 'Borrador guardado. Ojo: ese documento de ese proveedor ya fue ingresado.' : 'Borrador guardado.', r.duplicado ? 'error' : 'success');
      reflejarDocumento(r.id);
    } catch (error) {
      showToast(mensajeError(error), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = () => {
    const lista = [...validarCabecera(tipo, cabecera).errores, ...erroresLineas(lineas, porId)];
    if (!lineas.length) lista.push('Agrega al menos una línea.');
    if (lineas.length > MAX_LINEAS_DOCUMENTO) lista.push(`Máximo ${MAX_LINEAS_DOCUMENTO} líneas por documento: divide el ingreso en dos.`);
    setErrores(lista);
    if (lista.length) return;
    const proveedor = empresas.find((e) => e.id === cabecera.proveedorId)?.nombre;
    const duenio = tipo === 'INGRESO'
      ? (cabecera.consignacion ? proveedor : '')
      : empresas.find((e) => e.id === cabecera.propietarioId)?.nombre;
    const mensaje = `Se sumarán ${formatoCantidad(totalUnidades(lineas))} unidad(es) en ${lineas.length} línea(s) al stock disponible de la Bodega General${proveedor ? ` (${TIPOS_DOCUMENTO_INGRESO[cabecera.tipoDocumento]} N° ${cabecera.numero}, ${proveedor})` : ''}${duenio ? `, como stock EN CONSIGNACIÓN de ${duenio}` : ', como stock propio'}. Después no se puede editar. ¿Confirmar?`;
    confirmAction(esCarga ? 'Confirmar carga inicial' : 'Confirmar ingreso', mensaje, async () => {
      setOcupado(true);
      try {
        const r = await confirmarDocumento(datosEnvio());
        showToast(`${esCarga ? 'Carga inicial' : 'Ingreso'} confirmado: ${r.lineas} línea(s), ${formatoCantidad(r.unidades)} unidad(es).`, 'success');
        limpiar();
        if (r.id) reflejarDocumento(r.id); else recargarListas();
      } catch (error) {
        showToast(mensajeError(error), 'error');
        setErrores([`No se confirmó: ${mensajeError(error)}`]);
      } finally {
        setOcupado(false);
      }
    }, { type: 'primary', confirmText: 'Confirmar' });
  };

  const abrirBorrador = (d) => {
    setDocId(d.id);
    setCabecera({ ...cabeceraVacia(tipo), ...Object.fromEntries(Object.keys(cabeceraVacia(tipo)).map((k) => [k, d[k] ?? cabeceraVacia(tipo)[k]])) });
    setLineas(lineasDesdeDocumento(d.lineas));
    setErrores([]);
    setReinicio((n) => n + 1);
  };
  const quitarBorrador = (d) => confirmAction('Eliminar borrador', `¿Eliminar el borrador "${etiquetaDocumento(d)}"?`, async () => {
    try {
      await eliminarBorrador(d.id);
      if (d.id === docId) limpiar();
      setBorradores((l) => l.filter((x) => x.id !== d.id));
    } catch (error) {
      showToast(mensajeError(error), 'error');
    }
  }, { type: 'danger', confirmText: 'Eliminar' });

  const alternarCarga = () => confirmAction(
    cargaCerrada ? 'Reabrir carga inicial' : 'Cerrar carga inicial',
    cargaCerrada ? 'Se podrá volver a cargar stock sin documento. ¿Reabrir?' : 'Nadie podrá confirmar más cargas iniciales (el stock nuevo entra por Ingreso). ¿Cerrar?',
    async () => {
      try {
        const r = await configurarCargaInicial(!cargaCerrada);
        setConfig((c) => ({ ...c, cargaInicialCerrada: r.cargaInicialCerrada }));
      } catch (error) {
        showToast(mensajeError(error), 'error');
      }
    }, { type: 'warning' }
  );

  const bloqueado = ocupado || cargaCerrada;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase">
          <Icono size={14} className="text-[#2383C2]" /> {titulo}
          {docId && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] normal-case">Borrador</span>}
        </h2>
        {esCarga && puede('btn_cerrar_carga') && (
          <button type="button" onClick={alternarCarga} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-[11px] font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300">
            {cargaCerrada ? <><LockOpen size={12} /> Reabrir carga inicial</> : <><Lock size={12} /> Cerrar carga inicial</>}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-2">
        <div className="flex flex-col gap-2 min-w-0">
          {aviso && (
            <div className="flex items-start gap-2 px-2 py-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{cargaCerrada ? 'La carga inicial está CERRADA: el stock nuevo se ingresa por Ingreso (guía o factura).' : aviso}</span>
            </div>
          )}

          {tipo === 'INGRESO' ? (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div>
                <label className={LABEL} htmlFor="doc-tipo">Tipo *</label>
                <select id="doc-tipo" value={cabecera.tipoDocumento} onChange={cambiarCabecera('tipoDocumento')} disabled={bloqueado} className={INPUT}>
                  {Object.entries(TIPOS_DOCUMENTO_INGRESO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="doc-numero">N° documento *</label>
                <input id="doc-numero" value={cabecera.numero} onChange={cambiarCabecera('numero')} disabled={bloqueado} maxLength={40} className={`${INPUT} font-num uppercase`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="doc-oc">N° orden de compra</label>
                <input id="doc-oc" value={cabecera.ordenCompra} onChange={cambiarCabecera('ordenCompra')} disabled={bloqueado} maxLength={40} className={`${INPUT} font-num uppercase`} />
              </div>
              <div className="col-span-2">
                <span className={LABEL}>Proveedor *</span>
                <SelectorProveedor valor={cabecera.proveedorId} onCambiar={cambiarCabecera('proveedorId')} deshabilitado={bloqueado} />
              </div>
              <div>
                <label className={LABEL} htmlFor="doc-fecha">Fecha *</label>
                <input id="doc-fecha" type="date" value={cabecera.fecha} onChange={cambiarCabecera('fecha')} disabled={bloqueado} className={`${INPUT} font-num`} />
              </div>
              <div className="col-span-2 md:col-span-5">
                <label className={LABEL} htmlFor="doc-obs">Observación</label>
                <input id="doc-obs" value={cabecera.observacion} onChange={cambiarCabecera('observacion')} disabled={bloqueado} maxLength={MAX_OBSERVACION} className={INPUT} />
              </div>
              <label className="col-span-2 md:col-span-1 flex items-end gap-1.5 pb-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300" title="El stock que entra queda a nombre del proveedor (Stock consignado), no como propio.">
                <input type="checkbox" checked={cabecera.consignacion === true} onChange={(e) => setCabecera((c) => ({ ...c, consignacion: e.target.checked }))} disabled={bloqueado} />
                En consignación
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-2">
              <div>
                <label className={LABEL} htmlFor="doc-obs">Observación</label>
                <input id="doc-obs" value={cabecera.observacion} onChange={cambiarCabecera('observacion')} disabled={bloqueado} maxLength={MAX_OBSERVACION} className={INPUT} placeholder="Ej: Carga inicial estante E1" />
              </div>
              <div>
                <span className={LABEL}>Dueño del stock (vacío = propio)</span>
                <SelectorProveedor valor={cabecera.propietarioId} onCambiar={cambiarCabecera('propietarioId')} deshabilitado={bloqueado}
                  placeholder="Propio · o busca la empresa consignante…" tituloCambiar="Volver a stock propio" />
              </div>
            </div>
          )}

          <EditorLineasStock key={reinicio} rutaVista={ruta} lineas={lineas} onCambiar={setLineas} deshabilitado={bloqueado} conPrecio={esCarga} conPrecioUnitario={!esCarga} />

          {errores.length > 0 && (
            <ul className="text-[11px] text-red-600 dark:text-red-400 list-disc pl-5">{errores.map((e) => <li key={e}>{e}</li>)}</ul>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={limpiar} disabled={ocupado} className={`${BOTON} bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200`}><FilePlus2 size={14} /> Nuevo</button>
            {puede('btn_guardar_borrador') && (
              <button type="button" onClick={guardar} disabled={bloqueado || !lineas.length} className={`${BOTON} border border-[#2383C2] text-[#2383C2] hover:bg-blue-50 dark:hover:bg-gray-700`}><Save size={14} /> Guardar borrador</button>
            )}
            {puede('btn_confirmar') && (
              <button type="button" onClick={confirmar} disabled={bloqueado || !lineas.length} className={`${BOTON} bg-emerald-600 hover:bg-emerald-700 text-white`}><CheckCircle2 size={14} /> {esCarga ? 'Confirmar carga inicial' : 'Confirmar ingreso'}</button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <ListaDocumentos titulo="Borradores" documentos={borradores} cargando={cargandoListas} onActualizar={recargarListas}
            onAbrir={abrirBorrador} onEliminar={puede('btn_eliminar_borrador') ? quitarBorrador : null} nombreProducto={(id) => porId[id]?.nombre || id} />
          <ListaDocumentos titulo="Confirmados recientes" documentos={confirmados} cargando={cargandoListas} onActualizar={recargarListas} nombreProducto={(id) => porId[id]?.nombre || id} />
        </div>
      </div>
    </div>
  );
};

export default PantallaDocumento;
