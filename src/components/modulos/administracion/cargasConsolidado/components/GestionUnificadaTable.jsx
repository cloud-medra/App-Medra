import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';
import { MESES } from '../../controlMensual/constants';
import { ORIGEN_LABEL, ORIGEN_BADGE_STYLE } from '../utils/normalizarFila';
import { ESTADO_BADGE, ESTADO_FINALIZADO } from '../../../operaciones/consignacion/utils/estadosConsignacion';

const COLUMNAS = [
  { key: 'origen', label: 'Origen', ancho: 105, min: 90 },
  { key: 'id', label: 'ID', ancho: 90, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 180, min: 80 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 70 },
  { key: 'empresa', label: 'Empresa', ancho: 160, min: 80 },
  { key: 'centro', label: 'Centro', ancho: 90, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 90, min: 60 },
  { key: 'estado', label: 'Estado', ancho: 100, min: 60 },
  { key: 'costo', label: 'Costo', ancho: 95, min: 60 },
  { key: 'solicitud', label: 'Solicitud', ancho: 100, min: 60 },
  { key: 'periodo', label: 'Período', ancho: 110, min: 70 },
  { key: 'registradoPor', label: 'Registrado Por', ancho: 130, min: 70 },
];

// "Período" (contable) es informativo, sin relación con el filtro Año/Mes
// de esta tabla (que actúa sobre "fecha") — pueden no coincidir.
const formatearPeriodo = (periodoAnio, periodoMes) => {
  if (!periodoAnio || !periodoMes) return '-';
  const meta = MESES.find(m => m.id === periodoMes);
  return `${meta?.nombre || periodoMes} ${periodoAnio}`;
};

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

const GestionUnificadaTable = ({ filas, onAbrirDetalle }) => {
  const { anchos, handleResize } = useColumnResize(COLUMNAS);

  return (
    <div className="flex-grow overflow-auto">
      <table className="text-left text-[10.5px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
        <thead className="bg-slate-50 dark:bg-gray-900/60 sticky top-0 z-10">
          <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
            {COLUMNAS.map(col => (
              <th
                key={col.key}
                className="relative px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700"
                style={{ width: anchos[col.key] }}
              >
                {col.label}
                <ManijaRedimension colKey={col.key} anchoActual={anchos[col.key]} anchoMin={col.min} onResize={handleResize} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={COLUMNAS.length} className="px-3 py-6 text-center text-slate-400 dark:text-gray-500">
                Sin registros para los filtros actuales
              </td>
            </tr>
          ) : (
            filas.map((fila) => (
              <tr
                key={`${fila.origen}:${fila.id}`}
                onDoubleClick={() => onAbrirDetalle(fila)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/60 transition"
                title="Doble clic para ver el detalle"
              >
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded border uppercase ${ORIGEN_BADGE_STYLE[fila.origen]}`}>
                    {ORIGEN_LABEL[fila.origen]}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-semibold text-[#2383C2] truncate">
                  {fila.gestionId}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 truncate">
                  {fila.nombre}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                  {formatearFechaTabla(fila.fecha)}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                  {fila.empresa}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                  {fila.centro}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                  {fila.atributo}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                  {fila.estado === ESTADO_FINALIZADO
                    ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${ESTADO_BADGE.FINALIZADO}`}>{fila.estado}</span>
                    : fila.estado}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 font-medium">
                  {fila.costo ? `$${Number(fila.costo).toLocaleString('es-CL')}` : '-'}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                  {fila.solicitud}
                </td>
                <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300" title="Período contable — puede no coincidir con la fecha">
                  {formatearPeriodo(fila.periodoAnio, fila.periodoMes)}
                </td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300 truncate">
                  {fila.registradoPor}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default GestionUnificadaTable;
