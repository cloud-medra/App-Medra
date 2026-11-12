import { Eye } from 'lucide-react';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../ui/ThRedimensionable';

// Tabla principal de órdenes (Laboratorio y Vacunatorio), con columnas
// redimensionables. Doble clic o el ojo abren el detalle.

// Granularidad por columna: `col_<key>` en la sección 'listado' de la vista que
// monta la tabla (`pathVista`; ver useColumnasPermitidas).
const COLUMNAS = [
  { key: 'nro', label: 'Nro.Orden', ancho: 130, min: 80 },
  { key: 'fecha', label: 'F.Orden', ancho: 100, min: 70 },
  { key: 'rut', label: 'Rut Proveedor', ancho: 130, min: 80 },
  { key: 'proveedor', label: 'Proveedor', ancho: 360, min: 120 },
  { key: 'items', label: 'Items', align: 'text-center', ancho: 70, min: 50 },
  { key: 'total', label: 'Total', align: 'text-right', ancho: 130, min: 80 },
  { key: 'acciones', label: 'Acciones', align: 'text-center', ancho: 80, min: 60 },
];

const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70';

// Sin `onSeleccionar` (sin permiso de ver detalle) la fila no abre el detalle.
const TablaOrdenes = ({ pathVista, ordenes, onSeleccionar }) => {
  const { columnasVisibles, ver } = useColumnasPermitidas(pathVista, 'listado', COLUMNAS);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);

  return (
    <table
      className="text-left text-secundario border-collapse"
      style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
    >
      <ColgroupRedimensionable columnas={columnasVisibles} anchos={anchos} relleno />
      <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
        <tr className="text-tinta-secundaria uppercase text-pequeno tracking-wider">
          {columnasVisibles.map(col => (
            <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.align || ''}`}>{col.label}</ThRedimensionable>
          ))}
          <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
        {ordenes.map((o) => (
          <tr
            key={o.id}
            onDoubleClick={onSeleccionar ? () => onSeleccionar(o) : undefined}
            className={`hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150 ${onSeleccionar ? 'cursor-pointer' : ''} group border-l-2 border-l-transparent hover:border-l-[#2383C2]`}
          >
            {ver('nro') && (
              <td className={`${TD} text-tinta-principal truncate`}>{o["Nro.Orden"]}</td>
            )}
            {ver('fecha') && (
              <td className={`${TD} text-tinta-secundaria truncate`}>{o["F.Orden"]}</td>
            )}
            {ver('rut') && (
              <td className={`${TD} text-tinta-secundaria truncate`}>{o["Rut proveedor"]}</td>
            )}
            {ver('proveedor') && (
              <td className={`${TD} text-tinta-principal truncate`} title={o["Proveedor"]}>{o["Proveedor"]}</td>
            )}
            {ver('items') && (
              <td className={`${TD} text-tinta-secundaria text-center`}>{o.totalItems}</td>
            )}
            {ver('total') && (
              <td className={`${TD} text-tinta-principal text-right truncate`}>${o.totalOrden?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
            )}
            {ver('acciones') && (
              <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700 text-center">
                {onSeleccionar && (
                  <button onClick={() => onSeleccionar(o)} className="text-tinta-atenuada hover:text-[#2383C2] transition inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700">
                    <Eye size={13} />
                  </button>
                )}
              </td>
            )}
            <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TablaOrdenes;
