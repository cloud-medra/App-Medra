import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, ClipboardCheck, History } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { formatoCantidad } from '../shared/catalogosBodega';
import { fechaHora } from '../shared/transito/transitos';
import FormCajaModal from './FormCajaModal';
import InventarioCajaModal from './InventarioCajaModal';
import HistorialCaja from './HistorialCaja';
import { productosDeCaja } from './cajas';
import { BarraCompletitud } from './comunes';

const PATH_VISTA = '/bodega/cajasBodega';

const COLUMNAS = [
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'codigo', label: 'Código' },
  { key: 'objetivo', label: 'Objetivo', alinear: 'text-right' },
  { key: 'actual', label: 'Actual', alinear: 'text-right' },
  { key: 'faltante', label: 'Faltante', alinear: 'text-right' },
];

// Contenido de una caja (objetivo, actual, faltante) con sus acciones.
const DetalleCaja = ({ caja, onVolver, onCambio }) => {
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'caja', COLUMNAS);
  const [editando, setEditando] = useState(false);
  const [inventariando, setInventariando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const cambio = () => { onCambio(); setVersionHistorial((v) => v + 1); };
  const productos = useMemo(() => productosDeCaja(caja), [caja]);

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
          <button type="button" onClick={() => setVerHistorial((v) => !v)} className={`h-7 px-2 rounded border font-semibold flex items-center gap-1 ${verHistorial ? 'border-[#2383C2] text-[#2383C2]' : 'border-gray-300 dark:border-gray-600'}`}><History size={12} /> Historial</button>
          {hasPermission(PATH_VISTA, 'cajas', 'btn_guardar') && (
            <button type="button" onClick={() => setEditando(true)} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1"><Pencil size={12} /> Editar</button>
          )}
        </div>
      </div>
      {caja.descripcion && <p className="text-gray-500">{caja.descripcion}</p>}
      {caja.ultimoInventario?.fecha && <p className="text-gray-500">Último inventario: {fechaHora(caja.ultimoInventario.fecha)} · {caja.ultimoInventario.usuario || ''}</p>}

      <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
        <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
          <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {productos.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">La caja no tiene productos. Usa “Editar” para agregarlos.</td></tr>}
          {productos.map((p) => (
            <tr key={p.productoId}>
              <td className="px-2 py-1.5">{p.nombre}</td>
              {ver('codigo') && <td className="px-2 py-1.5 font-num text-gray-500">{p.codigoMaestro || '—'}</td>}
              {ver('objetivo') && <td className="px-2 py-1.5 text-right font-num">{formatoCantidad(p.stockObjetivo)}</td>}
              {ver('actual') && <td className="px-2 py-1.5 text-right font-num">{formatoCantidad(p.stockActual)}</td>}
              {ver('faltante') && <td className={`px-2 py-1.5 text-right font-num ${p.faltante ? 'font-bold text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{p.faltante ? formatoCantidad(p.faltante) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {verHistorial && <HistorialCaja key={versionHistorial} caja={caja} />}

      {inventariando && <InventarioCajaModal caja={caja} onCerrar={() => setInventariando(false)} onHecho={cambio} />}
      {editando && <FormCajaModal caja={caja} onCerrar={() => setEditando(false)} onGuardada={() => { setEditando(false); onCambio(); }} />}
    </div>
  );
};

export default DetalleCaja;
