import { useMemo, useState } from 'react';
import { PackageCheck, Undo2, StickyNote, History, Building2 } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { MAX_ACCIONES_TRANSITO } from '../../../../../../functions/bodega/nucleo.mjs';
import { estadoVencimiento } from '../vencimientos';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../anchosTablaBodega';
import GestionTransitoModal from './GestionTransitoModal';
import HistorialTransitoModal from './HistorialTransitoModal';
import { diasEnTransito, fechaHora } from './transitos';

// Columnas (permiso col_<key> en la sección "listado" de la vista que monta
// la tabla: Tránsito o Tránsito por centro).
// Mismo diseño que el Maestro (TablaBodega): columnas redimensionables.
const COLUMNAS = [
  { key: 'sel', label: '', fija: true, ancho: 30, min: 26 },
  { key: 'referencia', label: 'Referencia', ancho: 120, min: 60 },
  { key: 'producto', label: 'Producto', fija: true, ancho: 240, min: 110 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 55 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 125, min: 80 },
  { key: 'centro', label: 'Centro', ancho: 140, min: 70 },
  { key: 'cantidad', label: 'Pend. / salida', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'enCentro', label: 'Dejado en centro', alinear: 'text-right', ancho: 105, min: 60 },
  { key: 'fechaSalida', label: 'Salida', ancho: 115, min: 75 },
  { key: 'dias', label: 'Días', alinear: 'text-right', ancho: 55, min: 40 },
  { key: 'usuario', label: 'Usuario', ancho: 120, min: 60 },
  { key: 'solicitante', label: 'Destino / solicitante', ancho: 150, min: 70 },
  { key: 'salida', label: 'N° salida', alinear: 'text-right', ancho: 75, min: 50 },
  { key: 'acciones', label: 'Acciones', fija: true, ancho: 130, min: 110 },
];
const BOTON = 'p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700';
const BOTON_SELECCION = 'h-7 px-2.5 rounded text-white font-bold flex items-center gap-1';

// Tabla de tránsitos abiertos con acciones de a uno o sobre los
// seleccionados (máx. MAX_ACCIONES_TRANSITO). onCambio() se llama después de
// cada acción para volver a leer.
//   rutaVista / origen: '/bodega/transitoBodega' + 'transito' o
//                       '/bodega/centrosBodega' + 'centros'.
const TablaTransitos = ({ transitos, rutaVista, origen, onCambio, ocultarCentro = false }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(rutaVista, 'listado', COLUMNAS);
  const columnas = useMemo(() => (ocultarCentro ? columnasVisibles.filter((c) => c.key !== 'centro') : columnasVisibles), [columnasVisibles, ocultarCentro]);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnas, `bodega.transito.${origen}`);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [modal, setModal] = useState(null); // { accion, transitos }
  const [historial, setHistorial] = useState(null);
  const puede = {
    ENTREGAR: hasPermission(rutaVista, 'acciones', 'btn_entregar'),
    DEVOLVER: hasPermission(rutaVista, 'acciones', 'btn_devolver'),
    NOTA: hasPermission(rutaVista, 'acciones', 'btn_nota'),
    DEJAR_EN_CENTRO: hasPermission(rutaVista, 'acciones', 'btn_dejar_centro'),
  };
  const seleccionados = useMemo(() => transitos.filter((t) => seleccion.has(t.id)), [transitos, seleccion]);
  const todos = transitos.length > 0 && seleccionados.length === transitos.length;

  const alternar = (id) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const abrir = (accion, lista) => setModal({ accion, transitos: lista.slice(0, MAX_ACCIONES_TRANSITO) });
  const hecho = (r) => { setModal(null); setSeleccion(new Set()); onCambio(r); };

  return (
    <div className="flex flex-col gap-2">
      {seleccionados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded bg-blue-50 dark:bg-sky-950/30 border border-blue-200 dark:border-sky-900 text-[11px]">
          <span className="font-bold">{seleccionados.length} seleccionado(s)</span>
          {seleccionados.length > MAX_ACCIONES_TRANSITO && <span className="text-amber-700">Se procesan los primeros {MAX_ACCIONES_TRANSITO}.</span>}
          {puede.ENTREGAR && <button type="button" onClick={() => abrir('ENTREGAR', seleccionados)} className={`${BOTON_SELECCION} bg-emerald-600`}><PackageCheck size={13} /> Entregar</button>}
          {puede.DEVOLVER && <button type="button" onClick={() => abrir('DEVOLVER', seleccionados)} className={`${BOTON_SELECCION} bg-[#2383C2]`}><Undo2 size={13} /> Devolver</button>}
          {puede.DEJAR_EN_CENTRO && <button type="button" onClick={() => abrir('DEJAR_EN_CENTRO', seleccionados)} className={`${BOTON_SELECCION} bg-violet-600`}><Building2 size={13} /> Dejar en centro</button>}
          {puede.NOTA && <button type="button" onClick={() => abrir('NOTA', seleccionados)} className={`${BOTON_SELECCION} bg-amber-600`}><StickyNote size={13} /> Nota</button>}
          <button type="button" onClick={() => setSeleccion(new Set())} className="ml-auto text-[11px] underline text-gray-600">Quitar selección</button>
        </div>
      )}
      <div className="flex justify-end">
        <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} />
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <TablaBodega
          columnas={columnas}
          anchos={anchos}
          onResize={handleResize}
          encabezado={(c) => (c.key === 'sel'
            ? <input type="checkbox" aria-label="Seleccionar todos" checked={todos} onChange={() => setSeleccion(todos ? new Set() : new Set(transitos.map((t) => t.id)))} />
            : c.label)}
        >
          {transitos.length === 0 && <FilaAnchoCompleto columnas={columnas}>No hay nada en tránsito.</FilaAnchoCompleto>}
          {transitos.map((t) => {
            const venc = estadoVencimiento(t.vencimiento);
            const dias = diasEnTransito(t.fechaSalida);
            const celdas = {
              sel: <td className={`${TD} text-center`}><input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(t.id)} onChange={() => alternar(t.id)} /></td>,
              referencia: <td className={`${TD} font-num text-gray-700 dark:text-gray-200`} title={t.referencia ? `${t.referencia} · ${t.codigoMaestro}` : t.codigoMaestro}>{t.referencia || '—'}</td>,
              producto: (
                <td className={`${TD} font-semibold text-gray-800 dark:text-gray-100`} title={`${t.productoNombre}${t.propietarioNombre ? ` · consignado ${t.propietarioNombre}` : ''}`}>
                  {t.productoNombre}
                  {t.propietarioNombre && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" title="Stock en consignación">CONSIG. {t.propietarioNombre}</span>}
                </td>
              ),
              lote: <td className={`${TD} font-num`}>{t.lote || '—'}</td>,
              vencimiento: <td className={`${TD} font-num`}>{t.vencimiento || '—'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>,
              centro: <td className={TD} title={t.centroNombre}>{t.centroNombre}</td>,
              cantidad: <td className={`${TD} text-right font-num`}><strong className="text-amber-600 dark:text-amber-400">{t.pendiente}</strong> / {t.cantidadSalida}</td>,
              enCentro: <td className={`${TD} text-right font-num`}>{t.enCentro ? <strong className="text-violet-600 dark:text-violet-400">{t.enCentro}</strong> : '—'}</td>,
              fechaSalida: <td className={TD}>{fechaHora(t.fechaSalida)}</td>,
              dias: <td className={`${TD} text-right font-num ${dias > 7 ? 'text-red-600 font-bold' : ''}`}>{dias ?? '—'}</td>,
              usuario: <td className={TD} title={t.usuario?.nombre || ''}>{t.usuario?.nombre || ''}</td>,
              solicitante: <td className={TD} title={t.solicitante || ''}>{t.solicitante || '—'}</td>,
              salida: <td className={`${TD} text-right font-num`}>{t.salidaNumero}</td>,
              acciones: (
                <td className={TD}>
                  {puede.ENTREGAR && <button type="button" onClick={() => abrir('ENTREGAR', [t])} title="Entregar (usado)" className={`${BOTON} text-emerald-600`}><PackageCheck size={14} /></button>}
                  {puede.DEVOLVER && <button type="button" onClick={() => abrir('DEVOLVER', [t])} title="Devolver a stock" className={`${BOTON} text-[#2383C2]`}><Undo2 size={14} /></button>}
                  {puede.DEJAR_EN_CENTRO && (t.pendiente || 0) > 0 && <button type="button" onClick={() => abrir('DEJAR_EN_CENTRO', [t])} title="Dejar en centro (no usado)" className={`${BOTON} text-violet-600`}><Building2 size={14} /></button>}
                  {puede.NOTA && <button type="button" onClick={() => abrir('NOTA', [t])} title="Mantener en tránsito (nota)" className={`${BOTON} text-amber-600`}><StickyNote size={14} /></button>}
                  <button type="button" onClick={() => setHistorial(t)} title="Historial" className={`${BOTON} text-gray-500`}><History size={14} /></button>
                </td>
              ),
            };
            return <FilaBodega key={t.id} columnas={columnas} celdas={celdas} className={seleccion.has(t.id) ? 'bg-blue-50/60 dark:bg-sky-950/20' : venc.fila} />;
          })}
        </TablaBodega>
      </div>
      {modal && <GestionTransitoModal accion={modal.accion} transitos={modal.transitos} origen={origen} onCerrar={() => setModal(null)} onHecho={hecho} />}
      {historial && <HistorialTransitoModal transito={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  );
};

export default TablaTransitos;
