import { Fragment, useState } from 'react';
import { History, ChevronRight, ChevronDown } from 'lucide-react';
import Spinner from '../../../../ui/Spinner';

const formatearPrecio = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

const formatearFecha = (iso) => {
  if (!iso) return '—';
  const f = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(f.getDate())}-${p(f.getMonth() + 1)}-${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
};

const claseTh = 'py-1 px-1.5 border-b border-slate-200 dark:border-gray-700';

// Últimas importaciones de la empresa seleccionada; cada fila se expande
// para ver los cambios de precio que hizo esa importación.
const HistorialImportaciones = ({ historial, cargando }) => {
  const [expandida, setExpandida] = useState(null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 shadow-2xs">
      <div className="px-2.5 py-1.5 bg-slate-50/80 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
        <History size={13} className="text-[#2383C2]" />
        <h3 className="text-pequeno text-tinta-principal uppercase tracking-wide">
          Historial de importaciones
        </h3>
      </div>

      {cargando ? (
        <div className="p-4 flex items-center justify-center gap-1.5 text-pequeno text-tinta-atenuada">
          <Spinner size="xs" color="#2383C2" />
          <span>Cargando historial…</span>
        </div>
      ) : historial.length === 0 ? (
        <div className="p-4 text-center text-pequeno text-tinta-atenuada">Esta empresa aún no tiene importaciones de precios.</div>
      ) : (
        <div className="overflow-auto max-h-72">
          <table className="w-full text-left text-pequeno border-collapse">
            <thead className="bg-slate-100/70 dark:bg-gray-900 text-tinta-secundaria uppercase text-pequeno sticky top-0">
              <tr>
                <th className={`${claseTh} w-5`}></th>
                <th className={claseTh}>Fecha</th>
                <th className={claseTh}>Usuario</th>
                <th className={claseTh}>Archivo</th>
                <th className={`${claseTh} text-center`}>Actualizados</th>
                <th className={`${claseTh} text-center`}>Omitidos</th>
                <th className={`${claseTh} text-center`}>Errores</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(imp => {
                const abierta = expandida === imp.id;
                return (
                  <Fragment key={imp.id}>
                    <tr
                      onClick={() => setExpandida(abierta ? null : imp.id)}
                      className="border-b border-slate-100 dark:border-gray-700/60 hover:bg-slate-50 dark:hover:bg-gray-700/30 cursor-pointer"
                    >
                      <td className="py-1 px-1.5 text-tinta-atenuada">{abierta ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</td>
                      <td className="py-1 px-1.5 text-numero-tabla whitespace-nowrap">{formatearFecha(imp.fechaIso)}</td>
                      <td className="py-1 px-1.5">{imp.usuario}</td>
                      <td className="py-1 px-1.5 text-tinta-secundaria truncate max-w-[200px]" title={imp.archivo}>{imp.archivo}</td>
                      <td className="py-1 px-1.5 text-center text-etiqueta text-emerald-600 dark:text-emerald-400">{imp.totalActualizados}</td>
                      <td className="py-1 px-1.5 text-center text-tinta-secundaria">{imp.totalOmitidos}</td>
                      <td className={`py-1 px-1.5 text-center ${imp.totalErrores > 0 ? 'text-etiqueta text-red-600 dark:text-red-400' : 'text-tinta-secundaria'}`}>{imp.totalErrores}</td>
                    </tr>
                    {abierta && (
                      <tr className="bg-slate-50/60 dark:bg-gray-900/40">
                        <td></td>
                        <td colSpan={6} className="py-1.5 px-1.5">
                          <ul className="space-y-0.5 max-h-40 overflow-auto">
                            {(imp.cambios || []).map(c => (
                              <li key={c.id}>
                                <span className="text-numero-tabla">{c.referencia}</span>: {formatearPrecio(c.precioAnterior)} → <span className="text-emerald-600 dark:text-emerald-400">{formatearPrecio(c.precioNuevo)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HistorialImportaciones;
