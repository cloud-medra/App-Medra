import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, ClipboardCheck, History, PackagePlus, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { formatoCantidad } from '../shared/catalogosBodega';
import { fechaHora } from '../shared/transito/transitos';
import FormCajaModal from './FormCajaModal';
import InventarioCajaModal from './InventarioCajaModal';
import HistorialCaja from './HistorialCaja';
import ReponerCajaModal from './ReponerCajaModal';
import { productosDeCaja, cajaTrasInventario, moverElemento } from './cajas';
import { BarraCompletitud, BotonesExportar } from './comunes';
import { exportarContenidoCaja, exportarInventarioCaja, exportarReposicionCaja } from './exportarCajas';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { mensajeError, ordenarCaja } from '../shared/bodegaApi';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { referenciaProducto } from '../shared/documentos/lineasDocumento';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';

const PATH_VISTA = '/bodega/cajasBodega';

const COLUMNAS = [
  { key: 'producto', label: 'Producto', fija: true, ancho: 280, min: 120 },
  { key: 'referencia', label: 'Referencia', ancho: 140, min: 70 },
  { key: 'objetivo', label: 'Objetivo', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'actual', label: 'Actual', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'faltante', label: 'Faltante', alinear: 'text-right', ancho: 90, min: 60 },
];

// Contenido de una caja (objetivo, actual, faltante) con sus acciones.
const DetalleCaja = ({ caja, onVolver, onCambio }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'caja', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'bodega.caja');
  // La caja guarda nombre y código; la referencia sale del maestro en memoria.
  const { datos: maestro } = useCatalogo('bodegaProductos');
  const porId = useMemo(() => Object.fromEntries(maestro.map((p) => [p.id, p])), [maestro]);
  const [editando, setEditando] = useState(false);
  const [inventariando, setInventariando] = useState(false);
  const [reponiendo, setReponiendo] = useState(null); // caja a reponer (la actual o la recién inventariada)
  const puedeReponer = hasPermission(PATH_VISTA, 'caja', 'btn_reponer');
  const puedeExportar = hasPermission(PATH_VISTA, 'caja', 'btn_exportar');
  const { userData } = useUser() || {};
  const { showToast } = useToast();
  // Un registro recién hecho no trae usuario (lo pone el servidor): se usa el actual.
  const conUsuario = (r) => ({ ...r, usuario: r.usuario || { nombre: userData?.nombreCompleto || userData?.email || '' } });
  const exportarCon = (fn) => async (formato) => {
    try { await fn(formato); } catch (e) { showToast(mensajeError(e, 'No se pudo exportar.'), 'error'); }
  };
  const botonesInventario = (inv) => puedeExportar && <BotonesExportar alto="h-9" exportar={exportarCon((f) => exportarInventarioCaja(caja, conUsuario(inv), f))} />;
  const botonesReposicion = (rep) => puedeExportar && <BotonesExportar alto="h-9" exportar={exportarCon((f) => exportarReposicionCaja(caja, conUsuario(rep), f))} />;
  const [verHistorial, setVerHistorial] = useState(false);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const cambio = () => { onCambio(); setVersionHistorial((v) => v + 1); };
  const productosGuardados = useMemo(() => productosDeCaja(caja), [caja]);

  // Orden manual (arrastre o flechas), con actualización optimista: se
  // muestra al tiro y se guarda con una sola llamada. Va atado a la caja
  // recibida, así que al llegar la caja releída se descarta solo; si el
  // guardado falla se descarta y vuelve el orden guardado.
  const puedeOrdenar = hasPermission(PATH_VISTA, 'cajas', 'btn_guardar');
  const [optimista, setOptimista] = useState(null); // { caja, ids }
  const [ordenando, setOrdenando] = useState(false);
  const [arrastre, setArrastre] = useState(null); // { desde, sobre } (índices)
  const productos = useMemo(() => {
    if (optimista?.caja !== caja) return productosGuardados;
    const porProducto = Object.fromEntries(productosGuardados.map((p) => [p.productoId, p]));
    return optimista.ids.map((id) => porProducto[id]).filter(Boolean);
  }, [optimista, caja, productosGuardados]);
  // Mientras se guarda (y se relee la caja) no se permite otro movimiento.
  const mover = async (desde, hasta) => {
    const actuales = productos.map((p) => p.productoId);
    const ids = moverElemento(actuales, desde, hasta);
    if (ordenando || ids === actuales) return;
    setOptimista({ caja, ids });
    setOrdenando(true);
    try {
      await ordenarCaja({ cajaId: caja.id, orden: ids });
    } catch (e) {
      setOptimista(null);
      setOrdenando(false);
      showToast(mensajeError(e, 'No se pudo guardar el orden.'), 'error');
      return;
    }
    await onCambio();
    setOrdenando(false);
  };
  const arrastrable = puedeOrdenar && !ordenando && productos.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onVolver} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1"><ArrowLeft size={12} /> Cajas</button>
        <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{caja.nombre}</h3>
        {caja.activa === false && <span className="px-1.5 rounded bg-gray-200 dark:bg-gray-700 text-[10px] font-bold">INACTIVA</span>}
        <BarraCompletitud valor={caja.completitud} />
        <span className="text-gray-500">{formatoCantidad(caja.totalFaltante)} u. faltantes</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {hasPermission(PATH_VISTA, 'caja', 'btn_inventario') && productos.length > 0 && (
            <button type="button" onClick={() => setInventariando(true)} className="h-7 px-2 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><ClipboardCheck size={12} /> Hacer inventario</button>
          )}
          {puedeReponer && caja.activa !== false && (
            <button type="button" onClick={() => setReponiendo(caja)} disabled={!caja.totalFaltante} title={caja.totalFaltante ? 'Reponer faltantes desde la Bodega General' : 'La caja está completa'} className="h-7 px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 disabled:opacity-40"><PackagePlus size={12} /> Reponer</button>
          )}
          {puedeExportar && <BotonesExportar deshabilitado={!productos.length} exportar={exportarCon((f) => exportarContenidoCaja(caja, f))} />}
          <button type="button" onClick={() => setVerHistorial((v) => !v)} className={`h-7 px-2 rounded border font-semibold flex items-center gap-1 ${verHistorial ? 'border-[#2383C2] text-[#2383C2]' : 'border-gray-300 dark:border-gray-600'}`}><History size={12} /> Historial</button>
          {hasPermission(PATH_VISTA, 'cajas', 'btn_guardar') && (
            <button type="button" onClick={() => setEditando(true)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1"><Pencil size={12} /> Editar</button>
          )}
        </div>
      </div>
      {caja.descripcion && <p className="text-gray-500">{caja.descripcion}</p>}
      {caja.ultimoInventario?.fecha && <p className="text-gray-500">Último inventario: {fechaHora(caja.ultimoInventario.fecha)} · {caja.ultimoInventario.usuario || ''}</p>}

      <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
          {productos.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>La caja no tiene productos. Usa “Editar” para agregarlos.</FilaAnchoCompleto>}
          {productos.map((p, i) => {
            const referencia = referenciaProducto(porId[p.productoId]);
            // Arrastre nativo de HTML5 (como Orden de módulos); en celular,
            // donde no hay arrastre, sirven las flechas.
            const eventosArrastre = arrastrable ? {
              draggable: true,
              onDragStart: (e) => { setArrastre({ desde: i, sobre: i }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.productoId); },
              onDragOver: (e) => { e.preventDefault(); if (arrastre && arrastre.sobre !== i) setArrastre({ ...arrastre, sobre: i }); },
              onDrop: (e) => { e.preventDefault(); if (arrastre) mover(arrastre.desde, i); setArrastre(null); },
              onDragEnd: () => setArrastre(null),
            } : {};
            // Línea azul donde va a caer: abajo si baja, arriba si sube.
            const marcaDestino = arrastre && arrastre.sobre === i && arrastre.desde !== i
              ? (arrastre.desde < i ? 'shadow-[inset_0_-2px_0_#2383C2]' : 'shadow-[inset_0_2px_0_#2383C2]') : '';
            return (
              <FilaBodega key={p.productoId} columnas={columnasVisibles} className={`${arrastrable ? 'cursor-grab' : ''} ${marcaDestino}`} {...eventosArrastre} celdas={{
                producto: (
                  <td className={TD} title={p.nombre}>
                    {puedeOrdenar && productos.length > 1 ? (
                      <span className="flex items-center gap-1 min-w-0">
                        <GripVertical size={12} className="shrink-0 text-gray-400" aria-hidden="true" />
                        <button type="button" onClick={() => mover(i, i - 1)} disabled={ordenando || i === 0} aria-label={`Subir ${p.nombre}`} title="Subir" className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"><ChevronUp size={12} /></button>
                        <button type="button" onClick={() => mover(i, i + 1)} disabled={ordenando || i === productos.length - 1} aria-label={`Bajar ${p.nombre}`} title="Bajar" className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"><ChevronDown size={12} /></button>
                        <span className="truncate">{p.nombre}</span>
                      </span>
                    ) : p.nombre}
                  </td>
                ),
                referencia: <td className={`${TD} font-num text-gray-600 dark:text-gray-300`} title={`${referencia} · ${p.codigoMaestro || ''}`}>{referencia || '—'}</td>,
                objetivo: <td className={`${TD} text-right font-num`}>{formatoCantidad(p.stockObjetivo)}</td>,
                actual: <td className={`${TD} text-right font-num`}>{formatoCantidad(p.stockActual)}</td>,
                faltante: <td className={`${TD} text-right font-num ${p.faltante ? 'font-bold text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{p.faltante ? formatoCantidad(p.faltante) : '—'}</td>,
              }} />
            );
          })}
        </TablaBodega>
      </div>

      {verHistorial && <HistorialCaja key={versionHistorial} caja={caja} accionesInventario={botonesInventario} accionesReposicion={botonesReposicion} />}

      {inventariando && (
        <InventarioCajaModal
          caja={caja}
          onCerrar={() => setInventariando(false)}
          onHecho={cambio}
          pie={(inv) => (
            <>
              {botonesInventario(inv)}
              {puedeReponer && caja.activa !== false && inv.resumen?.faltante > 0 && (
                <button type="button" onClick={() => { setInventariando(false); setReponiendo(cajaTrasInventario(caja, inv.lineas)); }} className="h-9 px-3 rounded bg-emerald-600 text-white font-bold flex items-center gap-1"><PackagePlus size={14} /> Reponer faltantes</button>
              )}
            </>
          )}
        />
      )}
      {reponiendo && <ReponerCajaModal caja={reponiendo} onCerrar={() => setReponiendo(null)} onHecho={cambio} pie={botonesReposicion} />}
      {editando && <FormCajaModal caja={caja} onCerrar={() => setEditando(false)} onGuardada={() => { setEditando(false); onCambio(); }} />}
    </div>
  );
};

export default DetalleCaja;
