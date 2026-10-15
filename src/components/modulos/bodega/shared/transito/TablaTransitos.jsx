import { useMemo, useState } from 'react';
import { PackageCheck, Undo2, StickyNote, History } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { MAX_ACCIONES_TRANSITO } from '../../../../../../functions/bodega/nucleo.mjs';
import { estadoVencimiento } from '../vencimientos';
import GestionTransitoModal from './GestionTransitoModal';
import HistorialTransitoModal from './HistorialTransitoModal';
import { diasEnTransito, fechaHora } from './transitos';

// Columnas (permiso col_<key> en la sección "listado" de la vista que monta
// la tabla: Tránsito o Tránsito por centro).
const COLUMNAS = [
  { key: 'sel', label: '', fija: true },
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'lote', label: 'Lote' },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'centro', label: 'Centro' },
  { key: 'cantidad', label: 'Pend. / salida', alinear: 'text-right' },
  { key: 'fechaSalida', label: 'Salida' },
  { key: 'dias', label: 'Días', alinear: 'text-right' },
  { key: 'usuario', label: 'Usuario' },
  { key: 'solicitante', label: 'Destino / solicitante' },
  { key: 'salida', label: 'N° salida', alinear: 'text-right' },
  { key: 'acciones', label: 'Acciones', fija: true },
];
const BOTON = 'p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700';

// Tabla de tránsitos abiertos con acciones de a uno o sobre los
// seleccionados (máx. MAX_ACCIONES_TRANSITO). onCambio() se llama después de
// cada acción para volver a leer.
//   rutaVista / origen: '/bodega/transitoBodega' + 'transito' o
//                       '/bodega/centrosBodega' + 'centros'.
const TablaTransitos = ({ transitos, rutaVista, origen, onCambio, ocultarCentro = false }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(rutaVista, 'listado', COLUMNAS);
  const columnas = ocultarCentro ? columnasVisibles.filter((c) => c.key !== 'centro') : columnasVisibles;
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [modal, setModal] = useState(null); // { accion, transitos }
  const [historial, setHistorial] = useState(null);
  const puede = {
    ENTREGAR: hasPermission(rutaVista, 'acciones', 'btn_entregar'),
    DEVOLVER: hasPermission(rutaVista, 'acciones', 'btn_devolver'),
    NOTA: hasPermission(rutaVista, 'acciones', 'btn_nota'),
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
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded bg-blue-50 dark:bg-sky-950/30 border border-blue-200 dark:border-sky-900 text-[12px]">
          <span className="font-bold">{seleccionados.length} seleccionado(s)</span>
          {seleccionados.length > MAX_ACCIONES_TRANSITO && <span className="text-amber-700">Se procesan los primeros {MAX_ACCIONES_TRANSITO}.</span>}
          {puede.ENTREGAR && <button type="button" onClick={() => abrir('ENTREGAR', seleccionados)} className="h-8 px-2.5 rounded bg-emerald-600 text-white font-bold flex items-center gap-1"><PackageCheck size={13} /> Entregar</button>}
          {puede.DEVOLVER && <button type="button" onClick={() => abrir('DEVOLVER', seleccionados)} className="h-8 px-2.5 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Undo2 size={13} /> Devolver</button>}
          {puede.NOTA && <button type="button" onClick={() => abrir('NOTA', seleccionados)} className="h-8 px-2.5 rounded bg-amber-600 text-white font-bold flex items-center gap-1"><StickyNote size={13} /> Nota</button>}
          <button type="button" onClick={() => setSeleccion(new Set())} className="ml-auto text-[11px] underline text-gray-600">Quitar selección</button>
        </div>
      )}
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400 sticky top-0">
            <tr>
              {columnas.map((c) => (
                <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>
                  {c.key === 'sel'
                    ? <input type="checkbox" aria-label="Seleccionar todos" checked={todos} onChange={() => setSeleccion(todos ? new Set() : new Set(transitos.map((t) => t.id)))} />
                    : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {transitos.length === 0 && <tr><td colSpan={columnas.length} className="px-2 py-6 text-center text-gray-400 italic">No hay nada en tránsito.</td></tr>}
            {transitos.map((t) => {
              const venc = estadoVencimiento(t.vencimiento);
              const dias = diasEnTransito(t.fechaSalida);
              return (
                <tr key={t.id} className={`${seleccion.has(t.id) ? 'bg-blue-50/60 dark:bg-sky-950/20' : venc.fila}`}>
                  <td className="px-2 py-1"><input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(t.id)} onChange={() => alternar(t.id)} /></td>
                  {ver('codigo') && <td className="px-2 py-1 font-num text-[#2383C2]">{t.codigoMaestro}</td>}
                  <td className="px-2 py-1 font-semibold text-gray-800 dark:text-gray-100">{t.productoNombre}</td>
                  {ver('lote') && <td className="px-2 py-1 font-num">{t.lote || '—'}</td>}
                  {ver('vencimiento') && <td className="px-2 py-1 font-num whitespace-nowrap">{t.vencimiento || '—'} {venc.etiqueta && <span className={`px-1 rounded text-[9px] font-bold ${venc.badge}`}>{venc.etiqueta}</span>}</td>}
                  {ver('centro') && !ocultarCentro && <td className="px-2 py-1">{t.centroNombre}</td>}
                  {ver('cantidad') && <td className="px-2 py-1 text-right font-num"><strong className="text-amber-600 dark:text-amber-400">{t.pendiente}</strong> / {t.cantidadSalida}</td>}
                  {ver('fechaSalida') && <td className="px-2 py-1 whitespace-nowrap">{fechaHora(t.fechaSalida)}</td>}
                  {ver('dias') && <td className={`px-2 py-1 text-right font-num ${dias > 7 ? 'text-red-600 font-bold' : ''}`}>{dias ?? '—'}</td>}
                  {ver('usuario') && <td className="px-2 py-1">{t.usuario?.nombre || ''}</td>}
                  {ver('solicitante') && <td className="px-2 py-1">{t.solicitante || '—'}</td>}
                  {ver('salida') && <td className="px-2 py-1 text-right font-num">{t.salidaNumero}</td>}
                  <td className="px-1 py-1 whitespace-nowrap">
                    {puede.ENTREGAR && <button type="button" onClick={() => abrir('ENTREGAR', [t])} title="Entregar (usado)" className={`${BOTON} text-emerald-600`}><PackageCheck size={14} /></button>}
                    {puede.DEVOLVER && <button type="button" onClick={() => abrir('DEVOLVER', [t])} title="Devolver a stock" className={`${BOTON} text-[#2383C2]`}><Undo2 size={14} /></button>}
                    {puede.NOTA && <button type="button" onClick={() => abrir('NOTA', [t])} title="Mantener en tránsito (nota)" className={`${BOTON} text-amber-600`}><StickyNote size={14} /></button>}
                    <button type="button" onClick={() => setHistorial(t)} title="Historial" className={`${BOTON} text-gray-500`}><History size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal && <GestionTransitoModal accion={modal.accion} transitos={modal.transitos} origen={origen} onCerrar={() => setModal(null)} onHecho={hecho} />}
      {historial && <HistorialTransitoModal transito={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  );
};

export default TablaTransitos;
