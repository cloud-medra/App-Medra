import React from 'react';
import { X, FileText, Calendar, Hash, Building2, Tag, DollarSign } from 'lucide-react';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'detalle_documento' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigo', label: 'Cód.' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'precioUnitario', label: 'P. Unitario' },
  { key: 'totalLinea', label: 'Total Línea' }
];

const DetalleFacturaModal = ({ pathVista, documento, onClose }) => {
  const { ver: verColumna } = useColumnasPermitidas(pathVista, 'detalle_documento', COLUMNAS_TABLA);
  if (!documento) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-[2px] p-3 text-[11px]">
      <div className="bg-white dark:bg-gray-800 w-full max-w-6xl rounded-lg shadow-xl overflow-hidden flex flex-col h-[92vh] border border-gray-200 dark:border-gray-700">

        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="text-[#2383C2]" size={16} />
            <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">
              Detalle Documento
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-2 bg-gray-50/30 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          {[
            { label: "Folio", value: documento.folio, icon: Hash },
            { label: "Fecha Emisión", value: documento.fchEmis, icon: Calendar },
            { label: "Ref. (OC)", value: documento.folioRef || "N/A", icon: Tag },
            { label: "Total Neto", value: `$${parseInt(documento.total || 0).toLocaleString('es-CL')}`, icon: DollarSign }
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                <span className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  {Icon && <Icon size={11} className="text-[#2383C2]" />}
                  {item.label}
                </span>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 truncate mt-0.5">
                  {item.value}
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-1.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Building2 size={13} className="text-[#2383C2] shrink-0" />
            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Receptor:</span>
            <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">{documento.rznSoc}</span>
          </div>
          <span className="text-[10px] text-gray-400 font-semibold shrink-0">
            Total ítems: <strong className="text-gray-700 dark:text-gray-200">{documento.detalles?.length || 0}</strong>
          </span>
        </div>

        <div className="flex-grow overflow-y-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-20 shadow-sm">
              <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                {verColumna('linea') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-10 text-center">#</th>
                )}
                {verColumna('codigo') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-28">Cód.</th>
                )}
                {verColumna('descripcion') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Descripción</th>
                )}
                {verColumna('cantidad') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-20 text-center">Cant.</th>
                )}
                {verColumna('unidad') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-20 text-center">Unidad</th>
                )}
                {verColumna('precioUnitario') && (
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-28 text-right">P. Unitario</th>
                )}
                {verColumna('totalLinea') && (
                  <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 w-32 text-right">Total Línea</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
              {documento.detalles?.map((item, idx) => (
                <tr 
                  key={idx} 
                  className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                >
                  {verColumna('linea') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 font-bold text-center">
                      {idx + 1}
                    </td>
                  )}
                  {verColumna('codigo') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 truncate">
                      {item.codigo || '-'}
                    </td>
                  )}
                  {verColumna('descripcion') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-800 dark:text-gray-200 font-medium">
                      {item.nombre}
                    </td>
                  )}
                  {verColumna('cantidad') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-600 dark:text-gray-300 font-medium">
                      {item.cantidad}
                    </td>
                  )}
                  {verColumna('unidad') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-500 dark:text-gray-400 uppercase text-[10px]">
                      {item.unidad || '-'}
                    </td>
                  )}
                  {verColumna('precioUnitario') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-right text-gray-600 dark:text-gray-300">
                      ${parseInt(item.precio || 0).toLocaleString('es-CL')}
                    </td>
                  )}
                  {verColumna('totalLinea') && (
                    <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-right font-bold text-gray-800 dark:text-gray-100">
                      ${parseInt(item.monto || 0).toLocaleString('es-CL')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0">
          <p className="text-[9px] text-gray-400 italic">Documento procesado desde archivo XML.</p>
          <button
            onClick={onClose}
            className="h-7 px-4 bg-[#2383C2] hover:bg-[#1c6fa6] text-white rounded text-[10px] font-bold transition shadow-sm"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

export default DetalleFacturaModal;