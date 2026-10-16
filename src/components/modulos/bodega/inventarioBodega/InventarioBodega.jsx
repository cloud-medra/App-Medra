import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Play, RefreshCw, Save, Lock, Ban, ArrowLeft, History } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { MAX_CONTEOS_POR_ENVIO, MAX_NOMBRE_INVENTARIO, MAX_OBSERVACION } from '../../../../../functions/bodega/nucleo.mjs';
import {
  leerEstadoBodega, leerInventario, leerLineasInventario, leerLineasInventarioPorId, leerInventarios, iniciarInventario, reanudarInventario,
  registrarConteo, anularInventario, mensajeError,
} from '../shared/bodegaApi';
import { formatoCantidad, opcionesCatalogo } from '../shared/catalogosBodega';
import EditorLineasStock from '../shared/documentos/EditorLineasStock';
import { totalUnidades } from '../shared/documentos/lineasDocumento';
import { fechaHora } from '../shared/transito/transitos';
import ComparacionInventario from './ComparacionInventario';
import CierreInventarioModal from './CierreInventarioModal';
import { formatoPesos } from './formato';
import { mezclarPorId } from '../shared/listasLocales';
import { resolverDuenos } from './duenosConteo';

const PATH_VISTA = '/bodega/inventarioBodega';
const ESTADO_BADGE = {
  PREPARANDO: 'bg-amber-100 text-amber-700', ABIERTO: 'bg-blue-100 text-blue-700', CERRANDO: 'bg-amber-100 text-amber-700',
  CERRADO: 'bg-emerald-100 text-emerald-700', ANULADO: 'bg-gray-200 text-gray-600',
};
const INPUT = 'h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900';

// El mismo lote existe como propio y consignado (o de dos empresas): elegir
// a quién corresponde lo contado de cada línea.
const ElegirDuenoModal = ({ ambiguos, onCancelar, onConfirmar }) => {
  const [elecciones, setElecciones] = useState(() => Object.fromEntries(ambiguos.map((a) => [a.linea.key, a.opciones[0].propietarioId || ''])));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Elegir dueño del lote">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-[12px]">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100">¿De quién es lo contado?</h3>
          <p className="text-[11px] text-gray-500">Estos lotes existen como stock propio y en consignación (o de más de una empresa). Elige a cuál sumar el conteo.</p>
        </div>
        <ul className="p-4 overflow-auto flex flex-col gap-2">
          {ambiguos.map(({ linea, opciones, productoNombre }) => (
            <li key={linea.key} className="flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[200px]"><strong>{productoNombre || 'Producto'}</strong> · lote {linea.lote || 'S/L'} · {linea.vencimiento || 'sin venc.'} · {linea.cantidad} u.</span>
              <select value={elecciones[linea.key]} onChange={(e) => setElecciones((x) => ({ ...x, [linea.key]: e.target.value }))} className={INPUT} aria-label="Dueño">
                {opciones.map((o) => <option key={o.propietarioId || 'propio'} value={o.propietarioId || ''}>{o.propietarioId ? `Consignado · ${o.propietarioNombre}` : 'Propio'}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 font-semibold">Cancelar</button>
          <button type="button" onClick={() => onConfirmar(elecciones)} className="h-9 px-4 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Guardar conteo</button>
        </div>
      </div>
    </div>
  );
};

// Inicio: nombre + alcance (todas o algunas categorías) e historial.
const InicioInventario = ({ onIniciado, onAbrirHistorial }) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { datos: catalogos } = useCatalogo('bodegaCatalogos');
  const categorias = useMemo(() => opcionesCatalogo(catalogos, 'CATEGORIA'), [catalogos]);
  const [nombre, setNombre] = useState('');
  const [elegidas, setElegidas] = useState([]);
  const [iniciando, setIniciando] = useState(false);
  const [historial, setHistorial] = useState(null);

  useEffect(() => {
    let vigente = true;
    leerInventarios().then((h) => { if (vigente) setHistorial(h); }).catch(() => { if (vigente) setHistorial([]); });
    return () => { vigente = false; };
  }, []);

  const iniciar = async () => {
    setIniciando(true);
    try {
      const r = await iniciarInventario({ nombre, categorias: elegidas });
      showToast(`Inventario iniciado: ${r.lineas} lote(s) en la foto del stock.`, 'success');
      onIniciado(r.id);
    } catch (e) {
      showToast(mensajeError(e), 'error');
    } finally {
      setIniciando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {hasPermission(PATH_VISTA, 'inventario', 'btn_iniciar') ? (
        <section className="flex flex-col gap-2 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-bold text-[12px] uppercase text-gray-700 dark:text-gray-200">Nueva toma de inventario</h3>
          <p className="text-[11px] text-gray-500">Se cuenta el disponible de la Bodega General. Mientras esté abierto, no se puede ingresar, egresar ni devolver stock de los productos del alcance (las entregas desde tránsito sí).</p>
          <label className="flex flex-col"><span className="text-[10px] font-bold uppercase text-gray-500">Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={MAX_NOMBRE_INVENTARIO} className={INPUT} placeholder="Ej: Inventario octubre 2026" />
          </label>
          <div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Alcance (sin marcar = todos los productos)</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {categorias.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-[12px]">
                  <input type="checkbox" checked={elegidas.includes(c.id)} onChange={(e) => setElegidas((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} /> {c.nombre}
                </label>
              ))}
            </div>
          </div>
          <button type="button" onClick={iniciar} disabled={iniciando || !nombre.trim()} className="self-start h-7 px-3 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1.5 disabled:opacity-50"><Play size={14} /> {iniciando ? 'Iniciando…' : 'Iniciar inventario'}</button>
        </section>
      ) : <p className="text-gray-500 italic">No hay un inventario abierto.</p>}
      <section className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <h3 className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 font-bold text-[11px] uppercase text-gray-600 dark:text-gray-300 flex items-center gap-1"><History size={12} /> Historial</h3>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-[11px] max-h-96 overflow-auto">
          {historial === null && <li className="px-3 py-3 text-gray-400 italic">Cargando…</li>}
          {historial?.length === 0 && <li className="px-3 py-3 text-gray-400 italic">Sin inventarios.</li>}
          {historial?.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => onAbrirHistorial(i.id)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <div className="flex items-center gap-2">
                  <span className="font-semibold flex-1">{i.nombre}</span>
                  <span className={`px-1.5 rounded text-[9px] font-bold ${ESTADO_BADGE[i.estado] || ''}`}>{i.estado}</span>
                </div>
                <div className="text-gray-500">
                  {fechaHora(i.fechaInicio)} · {i.iniciadoPor?.nombre || ''} · {i.lineasTotal || 0} línea(s)
                  {i.resumen && ` · +${i.resumen.unidadesSobrantes} / −${i.resumen.unidadesFaltantes}${i.resumen.conPrecio ? ` · ${formatoPesos(i.resumen.valorSobrante - i.resumen.valorFaltante)}` : ''}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

// Inventario abierto (contar + comparar + cerrar) o uno del historial
// (solo lectura).
const DetalleInventario = ({ id, onSalir, puedeVolver }) => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const [inventario, setInventario] = useState(null);
  const [lineas, setLineas] = useState(null);
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState('contar');
  const [conteo, setConteo] = useState([]);
  const [reinicio, setReinicio] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [ambiguos, setAmbiguos] = useState(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([leerInventario(id), leerLineasInventario(id)])
      .then(([inv, l]) => { if (vigente) { setInventario(inv); setLineas(l); } })
      .catch((e) => { if (vigente) showToast(mensajeError(e), 'error'); });
    return () => { vigente = false; };
  }, [id, version, showToast]);
  // Recarga completa (botón Actualizar, reanudar, cerrar): trae también
  // los conteos de los demás usuarios.
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  // Tras registrar un conteo propio: relee solo el inventario y las líneas
  // tocadas (con lo que quedó en el servidor, incluidos conteos de otros
  // sobre esas mismas líneas), no todas. Si falla, recarga completa.
  const reflejarConteo = useCallback(async (resultados) => {
    const ids = [...new Set(resultados.flatMap((r) => (r?.lineas || []).map((l) => l.id)))];
    try {
      const [inv, actualizadas] = await Promise.all([leerInventario(id), leerLineasInventarioPorId(id, ids)]);
      if (inv) setInventario(inv);
      setLineas((l) => mezclarPorId(l || [], actualizadas));
    } catch {
      recargar();
    }
  }, [id, recargar]);

  if (!inventario || !lineas) return <p className="text-gray-400 italic">Cargando inventario…</p>;
  const abierto = inventario.estado === 'ABIERTO';
  const verPestana = abierto ? pestana : 'comparacion';

  // elecciones: { [key de la línea]: propietarioId } para los lotes con más
  // de un dueño; sin ellas, si hay alguno ambiguo se pregunta primero.
  const guardarConteo = async (elecciones = null) => {
    const { conteos, ambiguos: porElegir } = resolverDuenos(conteo, lineas, elecciones || {});
    if (porElegir.length) { setAmbiguos(porElegir); return; }
    setAmbiguos(null);
    setOcupado(true);
    try {
      const resultados = [];
      for (let i = 0; i < conteos.length; i += MAX_CONTEOS_POR_ENVIO) {
        resultados.push(await registrarConteo({ inventarioId: id, modo: 'sumar', conteos: conteos.slice(i, i + MAX_CONTEOS_POR_ENVIO) }));
      }
      showToast(`Conteo guardado: ${formatoCantidad(totalUnidades(conteo))} unidad(es).`, 'success');
      setConteo([]);
      setReinicio((n) => n + 1);
      reflejarConteo(resultados);
    } catch (e) {
      showToast(mensajeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const reanudar = async () => {
    setOcupado(true);
    try {
      await reanudarInventario(id);
      recargar();
    } catch (e) {
      showToast(mensajeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const anular = async () => {
    const motivo = window.prompt('Motivo de la anulación (el stock no cambia):');
    if (!motivo?.trim()) return;
    try {
      await anularInventario({ id, motivo: motivo.slice(0, MAX_OBSERVACION) });
      showToast('Inventario anulado.', 'info');
      onSalir();
      recargar();
    } catch (e) {
      showToast(mensajeError(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {puedeVolver && <button type="button" onClick={onSalir} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-[11px]"><ArrowLeft size={12} /> Volver</button>}
        <h3 className="text-[14px] font-bold text-gray-800 dark:text-gray-100">{inventario.nombre}</h3>
        <span className={`px-1.5 rounded text-[10px] font-bold ${ESTADO_BADGE[inventario.estado] || ''}`}>{inventario.estado}</span>
        <span className="text-[11px] text-gray-500">
          {inventario.alcance?.categoriasNombres?.length ? `Categorías: ${inventario.alcance.categoriasNombres.join(', ')}` : 'Todos los productos'} · iniciado {fechaHora(inventario.fechaInicio)} por {inventario.iniciadoPor?.nombre || ''}
          {inventario.estado === 'CERRADO' && ` · cerrado ${fechaHora(inventario.fechaCierre)} por ${inventario.cerradoPor?.nombre || ''} · motivo: ${inventario.motivoAjuste}`}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={recargar} className="h-8 px-2 rounded border border-gray-300 dark:border-gray-600"><RefreshCw size={13} /></button>
          {(inventario.estado === 'PREPARANDO' || inventario.estado === 'CERRANDO') && (
            <button type="button" onClick={reanudar} disabled={ocupado} className="h-8 px-3 rounded bg-amber-600 text-white font-bold">{inventario.estado === 'PREPARANDO' ? 'Reanudar preparación' : 'Reanudar cierre'}</button>
          )}
          {abierto && hasPermission(PATH_VISTA, 'inventario', 'btn_anular') && (
            <button type="button" onClick={anular} className="h-8 px-3 rounded border border-gray-400 font-bold flex items-center gap-1 text-gray-700 dark:text-gray-200"><Ban size={13} /> Anular</button>
          )}
          {abierto && hasPermission(PATH_VISTA, 'inventario', 'btn_cerrar') && (
            <button type="button" onClick={() => setCerrando(true)} disabled={conteo.length > 0} title={conteo.length ? 'Guarda o descarta el conteo pendiente antes de cerrar' : ''} className="h-8 px-3 rounded bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1 disabled:opacity-50"><Lock size={13} /> Cerrar con ajuste…</button>
          )}
        </div>
      </div>

      {abierto && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[['contar', 'Contar'], ['comparacion', 'Comparación']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPestana(v)} className={`h-8 px-3 -mb-px border-b-2 font-semibold ${pestana === v ? 'border-[#2383C2] text-[#2383C2]' : 'border-transparent text-gray-500'}`}>{l}</button>
          ))}
        </div>
      )}

      {verPestana === 'contar' && hasPermission(PATH_VISTA, 'inventario', 'btn_contar') && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">Escanea lo que hay físicamente en la bodega. Cada lectura <strong>se suma</strong> a lo ya contado de ese lote al guardar; para corregir un valor usa la pestaña Comparación. Un lote que no estaba en el sistema se agrega.</p>
          <EditorLineasStock key={reinicio} rutaVista={PATH_VISTA} lineas={conteo} onCambiar={setConteo} deshabilitado={ocupado} />
          <div className="flex justify-end">
            <button type="button" onClick={() => guardarConteo()} disabled={ocupado || !conteo.length} className="h-7 px-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <Save size={15} /> {ocupado ? 'Guardando…' : `Guardar conteo (${formatoCantidad(totalUnidades(conteo))} u.)`}
            </button>
          </div>
        </div>
      )}
      {ambiguos && <ElegirDuenoModal ambiguos={ambiguos} onCancelar={() => setAmbiguos(null)} onConfirmar={guardarConteo} />}
      {verPestana === 'comparacion' && <ComparacionInventario inventario={inventario} lineas={lineas} editable={abierto} onConteo={(r) => reflejarConteo([r])} />}

      {cerrando && (
        <CierreInventarioModal
          inventario={inventario}
          lineas={lineas}
          onCerrar={() => setCerrando(false)}
          onHecho={(r) => { setCerrando(false); showToast(`Inventario cerrado: ${r.resumen.sobrantes + r.resumen.faltantes} ajuste(s).`, 'success'); recargar(); }}
        />
      )}
    </div>
  );
};

// Inventario físico de la Bodega General: iniciar (foto del stock teórico),
// contar escaneando, comparar teórico/contado y cerrar con ajuste.
const InventarioBodega = () => {
  const { showToast } = useToast();
  const [abiertoId, setAbiertoId] = useState(undefined); // undefined = cargando
  const [historialId, setHistorialId] = useState(null);

  useEffect(() => {
    let vigente = true;
    leerEstadoBodega()
      .then((e) => { if (vigente) setAbiertoId(e.inventarioAbierto?.id || null); })
      .catch((e) => { if (vigente) { setAbiertoId(null); showToast(mensajeError(e), 'error'); } });
    return () => { vigente = false; };
  }, [showToast]);

  const id = historialId || abiertoId;
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[12px]">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><ClipboardCheck size={14} className="text-[#2383C2]" /> Inventario físico · Bodega General</h2>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abiertoId === undefined ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : id ? (
          <DetalleInventario key={id} id={id} puedeVolver={Boolean(historialId)} onSalir={() => { setHistorialId(null); setAbiertoId(undefined); leerEstadoBodega().then((e) => setAbiertoId(e.inventarioAbierto?.id || null)).catch(() => setAbiertoId(null)); }} />
        ) : (
          <InicioInventario onIniciado={(nuevo) => setAbiertoId(nuevo)} onAbrirHistorial={setHistorialId} />
        )}
      </div>
    </div>
  );
};

export default InventarioBodega;
