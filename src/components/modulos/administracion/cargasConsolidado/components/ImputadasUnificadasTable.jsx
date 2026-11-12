import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';
import { ORIGEN_LABEL, ORIGEN_BADGE_STYLE } from '../utils/normalizarFila';

const COLUMNAS = [
  { key: 'origen', label: 'Origen', ancho: 105, min: 90 },
  { key: 'gestionId', label: 'ID', ancho: 85, min: 60 },
  { key: 'paciente', label: 'Paciente', ancho: 160, min: 80 },
  { key: 'medico', label: 'Médico', ancho: 120, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 85, min: 65 },
  { key: 'empresa', label: 'Empresa', ancho: 150, min: 80 },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'referencia', label: 'Referencia', ancho: 150, min: 80 },
  { key: 'cantidad', label: 'Cant.', ancho: 65, min: 45 },
  { key: 'costoUnitario', label: 'Costo Unit.', ancho: 95, min: 60 },
  { key: 'venta', label: 'Venta', ancho: 95, min: 60 },
  { key: 'total', label: 'Total', ancho: 95, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 85, min: 50 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 95, min: 65 },
  { key: 'estado', label: 'Estado', ancho: 95, min: 60 },
  { key: 'periodo', label: 'Período', ancho: 100, min: 65 },
];

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

// `encabezado` (opcional) reemplaza el contenido de la franja superior; sin él
// se muestra el resumen de las filas recibidas (pestaña Imputadas).
const ImputadasUnificadasTable = ({ filas, encabezado }) => {
  const { anchos, handleResize } = useColumnResize(COLUMNAS);

  const totalVenta = filas.reduce((acc, f) => acc + (Number(f.venta) || 0), 0);

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 text-pequeno">
        {encabezado ?? (<>
        <span className="text-tinta-secundaria">{filas.length} registro{filas.length === 1 ? '' : 's'}</span>
        <span className="text-etiqueta text-emerald-700 dark:text-emerald-400">Total venta: ${totalVenta.toLocaleString('es-CL')}</span>
        </>)}
      </div>
      <div className="flex-grow overflow-auto">
        <table className="text-left text-pequeno border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead className="bg-slate-50 dark:bg-gray-900/60 sticky top-0 z-10">
            <tr className="text-tinta-secundaria uppercase text-pequeno">
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
                <td colSpan={COLUMNAS.length} className="px-3 py-6 text-center text-tinta-atenuada">
                  Sin registros imputados
                </td>
              </tr>
            ) : (
              filas.map((fila) => (
                <tr key={`${fila.origen}:${fila.id}`}>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                    <span className={`inline-block px-1.5 py-0.5 text-pequeno rounded border uppercase ${ORIGEN_BADGE_STYLE[fila.origen]}`}>
                      {ORIGEN_LABEL[fila.origen]}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-etiqueta text-[#2383C2] truncate">{fila.gestionId}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-principal truncate">{fila.paciente}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria truncate">{fila.medico}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">{formatearFechaTabla(fila.fecha)}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria truncate">{fila.empresa}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-numero-tabla text-emerald-600 dark:text-emerald-400 truncate">{fila.codigo}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-principal truncate">{fila.referencia}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-tinta-principal">{fila.cantidad}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">${Number(fila.costoUnitario).toLocaleString('es-CL')}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400">${Number(fila.venta).toLocaleString('es-CL')}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 text-etiqueta">${Number(fila.total).toLocaleString('es-CL')}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria truncate">{fila.lote}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">{fila.vencimiento ? formatearFechaTabla(fila.vencimiento) : '-'}</td>
                  <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">{fila.estado}</td>
                  <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">
                    {fila.periodoMes && fila.periodoAnio ? `${fila.periodoMes} ${fila.periodoAnio}` : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ImputadasUnificadasTable;
