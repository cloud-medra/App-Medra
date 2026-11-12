import React from 'react';
import {
  ArrowLeft,
  FileText,
  Calendar,
  CalendarDays,
  Hash,
  Building2,
  Tag,
  DollarSign,
  Activity,
  Link as LinkIcon,
  Loader2
} from 'lucide-react';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

const PATH_VISTA = '/laboratorio/archivosControlLaboratorio/vinculacionCodigos';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_detalle' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigoDoc', label: 'Cód. Documento' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'precioUnitario', label: 'P. Unitario' },
  { key: 'totalLinea', label: 'Total Línea' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'descripcionMaestro', label: 'Descripción Maestro' },
  { key: 'precioMaestro', label: 'Precio Maestro' },
  { key: 'estadoItem', label: 'Estado Ítem' }
];

const DetalleDocumento = ({
  documento,
  vinculando,
  puedeVincular,
  formatearFechaEmision,
  renderBadgeEstadoGeneral,
  onVolver,
  onVincular
}) => {
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_detalle', COLUMNAS_TABLA);
  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800">

      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onVolver}
            disabled={vinculando}
            className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-tinta-secundaria flex items-center gap-1 text-secundario transition-colors disabled:opacity-50"
            title="Volver a la lista"
          >
            <ArrowLeft size={15} className="text-[#2383C2]" />
            <span>Volver</span>
          </button>
          <span className="text-tinta-atenuada">|</span>
          <FileText className="text-[#2383C2]" size={15} />
          <span className="text-etiqueta text-tinta-principal tracking-wide uppercase">
            Detalle Documento Electrónico — Folio {documento.folio}
          </span>
        </div>
      </header>

      <div className="px-3 py-2 bg-slate-100/60 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 shrink-0">
        
        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Hash size={11} className="text-[#2383C2]" />
            Folio
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {documento.folio}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Calendar size={11} className="text-[#2383C2]" />
            Fecha Emisión
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {formatearFechaEmision(documento.fchEmis)}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <CalendarDays size={11} className="text-[#2383C2]" />
            Mes Imputado
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {documento.mesImputado || "N/A"}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Tag size={11} className="text-[#2383C2]" />
            Ref. (OC)
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {documento.folioRef || "N/A"}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <DollarSign size={11} className="text-[#2383C2]" />
            Total Neto
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            ${Math.round(Number(documento.total || 0)).toLocaleString('es-CL')}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Activity size={11} className="text-[#2383C2]" />
            Estado General
          </span>
          <div className="mt-0.5">
            {renderBadgeEstadoGeneral(documento.estado)}
          </div>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <LinkIcon size={11} className="text-[#2383C2]" />
            Acción
          </span>
          {puedeVincular ? (
            <button
              onClick={onVincular}
              disabled={vinculando}
              className="mt-0.5 w-full h-5 bg-[#2383C2] hover:bg-[#1d6fa5] active:bg-[#175b88] disabled:bg-[#2383C2]/60 text-white rounded text-pequeno flex items-center justify-center gap-1 transition-colors shadow-2xs disabled:cursor-not-allowed"
            >
              {vinculando ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  <span>Vinculando...</span>
                </>
              ) : (
                <>
                  <LinkIcon size={11} />
                  <span>Vincular</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-pequeno text-tinta-atenuada italic">Sin permiso</span>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 truncate">
          <Building2 size={13} className="text-[#2383C2] shrink-0" />
          <span className="text-pequeno text-tinta-atenuada uppercase">Receptor:</span>
          <span className="text-secundario text-tinta-principal truncate">{documento.rznSoc}</span>
        </div>
        <span className="text-pequeno text-tinta-atenuada shrink-0">
          Total ítems: <strong className="text-tinta-principal">{documento.detalles?.length || 0}</strong>
        </span>
      </div>

      <div className="flex-grow overflow-auto">
        <table className="w-full text-left text-secundario border-collapse min-w-[1200px]">
          <thead className="bg-slate-100 dark:bg-gray-900 sticky top-0 z-10 shadow-xs">
            <tr className="text-tinta-secundaria uppercase text-pequeno">
              {verColumna('linea') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-10 text-center">#</th>
              )}
              {verColumna('codigoDoc') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28">Cód. Documento</th>
              )}
              {verColumna('descripcion') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700">Descripción</th>
              )}
              {verColumna('cantidad') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 text-center">Cant.</th>
              )}
              {verColumna('unidad') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 text-center">Unidad</th>
              )}
              {verColumna('precioUnitario') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 text-right">P. Unitario</th>
              )}
              {verColumna('totalLinea') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 text-right">Total Línea</th>
              )}
              {verColumna('codigoMaestro') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-32 bg-slate-200/60 dark:bg-gray-800/80 text-tinta-principal">Cód. Maestro</th>
              )}
              {verColumna('descripcionMaestro') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 bg-slate-200/60 dark:bg-gray-800/80 text-tinta-principal">Descripción Maestro</th>
              )}
              {verColumna('precioMaestro') && (
                <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-slate-200/60 dark:bg-gray-800/80 text-right text-tinta-principal">Precio Maestro</th>
              )}
              {verColumna('estadoItem') && (
                <th className="py-1.5 px-2 border-b border-slate-200 dark:border-gray-700 w-32 bg-slate-200/60 dark:bg-gray-800/80 text-center text-tinta-principal">Estado Ítem</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
            {documento.detalles?.length === 0 || !documento.detalles ? (
              <tr>
                <td colSpan={columnasTabla.length} className="py-6 text-center text-tinta-atenuada text-normal">
                  Este documento no posee ítems cargados.
                </td>
              </tr>
            ) : (
              documento.detalles.map((item, idx) => (
                <tr
                  key={idx}
                  className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors"
                >
                  {verColumna('linea') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria text-etiqueta text-center">
                      {idx + 1}
                    </td>
                  )}
                  {verColumna('codigoDoc') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria truncate">
                      {item.codigo || '-'}
                    </td>
                  )}
                  {verColumna('descripcion') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal">
                      {item.nombre}
                    </td>
                  )}
                  {verColumna('cantidad') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center text-tinta-secundaria">
                      {item.cantidad}
                    </td>
                  )}
                  {verColumna('unidad') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center text-tinta-secundaria uppercase text-pequeno">
                      {item.unidad || '-'}
                    </td>
                  )}
                  {verColumna('precioUnitario') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-tinta-secundaria">
                      ${Math.round(Number(item.precio || 0)).toLocaleString('es-CL')}
                    </td>
                  )}
                  {verColumna('totalLinea') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-etiqueta text-tinta-principal">
                      ${Math.round(Number(item.monto || 0)).toLocaleString('es-CL')}
                    </td>
                  )}
                  {verColumna('codigoMaestro') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal text-etiqueta bg-slate-50/50 dark:bg-gray-900/30">
                      {item.codigoMaestro || '-'}
                    </td>
                  )}
                  {verColumna('descripcionMaestro') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal bg-slate-50/50 dark:bg-gray-900/30 truncate" title={item.descripcionMaestro}>
                      {item.descripcionMaestro || '-'}
                    </td>
                  )}
                  {verColumna('precioMaestro') && (
                    <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-tinta-principal text-etiqueta bg-slate-50/50 dark:bg-gray-900/30">
                      {item.precioMaestro !== undefined ? `$${Math.round(Number(item.precioMaestro || 0)).toLocaleString('es-CL')}` : '-'}
                    </td>
                  )}
                  {verColumna('estadoItem') && (
                    <td className="py-1 px-2 border-b border-slate-200 dark:border-gray-700 text-center bg-slate-50/50 dark:bg-gray-900/30">
                      <span className={`inline-block px-2 py-0.5 rounded text-pequeno ${
                        item.estadoItem === 'Sin Diferencias' || item.estadoItem === 'Vinculado'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                          : item.estadoItem === 'Con Diferencias'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                          : item.estadoItem === 'No Vinculado' || item.estadoItem === 'No encontrado'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                          : 'bg-slate-100 text-tinta-principal dark:bg-gray-700 border border-slate-200 dark:border-gray-600'
                      }`}>
                        {item.estadoItem === 'Vinculado' ? 'Sin Diferencias' : (item.estadoItem || 'Pendiente')}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DetalleDocumento;