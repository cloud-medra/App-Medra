import React from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  FileWarning,
  Calendar,
  Hash,
  Building2,
  DollarSign,
  Copy,
  Receipt,
  Tag,
  Activity,
  CalendarDays,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas, filtrarFilasExport } from '../../../../../../../hooks/useColumnasPermitidas';

const PATH_VISTA = '/vacunatorio/archivosControlVacunatorio/solicitudDiferencias';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_detalle' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigoDoc', label: 'Cód. Documento' },
  { key: 'descripcionDoc', label: 'Descripción Documento' },
  { key: 'cantidadDoc', label: 'Cant. Documento' },
  { key: 'precioDoc', label: 'Precio Documento' },
  { key: 'totalLinea', label: 'Total Línea' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'descripcionMaestro', label: 'Descripción Maestro' },
  { key: 'articuloOC', label: 'Artículo OC' },
  { key: 'cantidadOC', label: 'Cant. OC' },
  { key: 'precioOC', label: 'Precio OC' },
  { key: 'estadoDiscrepancia', label: 'Estado Discrepancia' }
];

const DetalleSolicitudDif = ({
  documento,
  onVolver,
  formatearFechaEmision,
  renderBadgeEstadoGeneral,
  onExportarExcel,
  puedeExportar = true
}) => {
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_detalle', COLUMNAS_TABLA);
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();

  if (!documento) return null;

  const copiarAlPortapapeles = (texto, label) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    showToast(`${label} copiado al portapapeles`, 'info');
  };

  const parseMontoToFloat = (valor) => {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    const strVal = String(valor).replace(/[^0-9,-]/g, '').replace(',', '.');
    return parseFloat(strVal) || 0;
  };

  const formatearMoneda = (valor) => {
    const monto = parseMontoToFloat(valor);
    return `$${Math.round(monto).toLocaleString('es-CL')}`;
  };

  const handleExportarExcelLocal = () => {
    if (!puedeExportar) return;
    if (onExportarExcel) {
      onExportarExcel(documento);
      return;
    }

    const detalles = documento.detalles || [];

    if (detalles.length === 0) {
      showToast('No hay detalles para exportar', 'warning');
      return;
    }

    const datosExcel = detalles.map((item) => {
      const tagEstado = item.vincuOCTexto || item.estadoItem || 'Sin información';

      return {
        'Folio': documento.folio || '',
        'Ref. (OC)': documento.folioRef || 'Sin Referencia',
        'Cód. Maestro': item.codigoMaestro || item.codigo_maestro || '',
        'Descripción Maestro': item.descripcionMaestro || item.nombreMaestro || item.descripcion_maestro || '',
        'Artículo OC': item.articuloOC || item.articulo_oc || item.codigoOC || item.codigo_oc || '',
        'Cant. Documento': item.cantidad ?? 0,
        'Precio Documento': item.precio ?? 0,
        'Cant. OC': item.cantidadOC ?? 0,
        'Precio OC': item.precioOC ?? 0,
        'Estado Discrepancia': tagEstado
      };
    });

    // Solo las columnas que el usuario ve: las del documento según la tabla de

    // la lista y las de ítems según la tabla del detalle (permisos col_*).

    const columnaDoc = { 'Folio': 'folio', 'Ref. (OC)': 'ref' };

    const columnaDet = { 'Cód. Maestro': 'codigoMaestro', 'Descripción Maestro': 'descripcionMaestro', 'Artículo OC': 'articuloOC', 'Cant. Documento': 'cantidadDoc', 'Precio Documento': 'precioDoc', 'Cant. OC': 'cantidadOC', 'Precio OC': 'precioOC', 'Estado Discrepancia': 'estadoDiscrepancia' };

    const filasPermitidas = filtrarFilasExport(

      filtrarFilasExport(datosExcel, columnaDoc, (k) => hasPermission(PATH_VISTA, 'tabla_documentos', `col_${k}`)),

      columnaDet, (k) => hasPermission(PATH_VISTA, 'tabla_detalle', `col_${k}`)

    );

    const worksheet = XLSX.utils.json_to_sheet(filasPermitidas);

    // Anchos por encabezado (la hoja puede omitir columnas sin permiso).

    const anchosPorEncabezado = { 'Folio': 12, 'Ref. (OC)': 16, 'Cód. Maestro': 16, 'Descripción Maestro': 32, 'Artículo OC': 18, 'Cant. Documento': 16, 'Precio Documento': 16, 'Cant. OC': 12, 'Precio OC': 12, 'Estado Discrepancia': 24 };

    worksheet['!cols'] = Object.keys(filasPermitidas[0] || {}).map((h) => ({ wch: anchosPorEncabezado[h] || 14 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitud Diferencias');

    const nombreArchivo = `Solicitud_Diferencias_Folio_${documento.folio || 'S-N'}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
    showToast('Archivo Excel generado con éxito', 'success');
  };

  const observaciones =
    documento.observacionDiferencia ||
    documento.motivo ||
    documento.observacion ||
    'No se registraron observaciones adicionales para las diferencias de este documento.';

  const detalles = documento.detalles || [];

  return (
    <div className="relative flex flex-col h-full w-full bg-white dark:bg-gray-800 overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onVolver}
            className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-tinta-secundaria flex items-center gap-1 text-secundario transition-colors cursor-pointer"
            title="Volver a la lista"
          >
            <ArrowLeft size={15} className="text-[#2383C2]" />
            <span>Volver</span>
          </button>
          <span className="text-tinta-atenuada">|</span>
          <FileWarning className="text-amber-500" size={16} />
          <span className="text-etiqueta text-tinta-principal tracking-wide uppercase">
            Detalle Solicitud de Diferencias — Folio N° {documento.folio}
          </span>
        </div>
      </header>

      <div className="px-3 py-2 bg-slate-100/60 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 shrink-0">
        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Hash size={11} className="text-[#2383C2]" /> Folio
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {documento.folio}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Calendar size={11} className="text-[#2383C2]" /> Fecha Emisión
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {formatearFechaEmision
              ? formatearFechaEmision(documento.fchEmis)
              : documento.fchEmis || '-'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <CalendarDays size={11} className="text-[#2383C2]" /> Mes Imputado
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5 capitalize">
            {documento.mesImputado || documento.mes_imputado || '-'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Tag size={11} className="text-[#2383C2]" /> Ref. (OC)
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {documento.folioRef || 'Sin Referencia'}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <DollarSign size={11} className="text-[#2383C2]" /> Total Neto
          </span>
          <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
            {formatearMoneda(documento.total)}
          </span>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Activity size={11} className="text-[#2383C2]" /> Estado
          </span>
          <div className="mt-0.5 truncate">
            {renderBadgeEstadoGeneral ? (
              renderBadgeEstadoGeneral(documento.estado)
            ) : (
              <EstadoProcesoBadge estado={documento.estado} fallback="Diferencia Reportada" />
            )}
          </div>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <FileSpreadsheet size={11} className="text-emerald-600 dark:text-emerald-500" /> Exportar
          </span>
          <button
            type="button"
            onClick={handleExportarExcelLocal}
            disabled={!puedeExportar}
            className="mt-0.5 w-full flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-pequeno text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors shadow-xs cursor-pointer truncate disabled:opacity-40 disabled:cursor-not-allowed"
            title={puedeExportar ? 'Generar o descargar solicitud en Excel' : 'No tienes permiso para exportar la solicitud'}
          >
            <FileSpreadsheet size={11} />
            <span className="truncate">Solicitud Excel</span>
          </button>
        </div>

        <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
          <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
            <Copy size={11} className="text-[#2383C2]" /> Portapapeles
          </span>
          <button
            type="button"
            onClick={() =>
              copiarAlPortapapeles(
                `Folio: ${documento.folio}\nProveedor: ${documento.rznSoc}\nMonto: $${documento.total}\nObservación: ${observaciones}`,
                'Resumen'
              )
            }
            className="mt-0.5 w-full text-left text-etiqueta text-tinta-principal hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:underline truncate cursor-pointer"
            title="Copiar resumen al portapapeles"
          >
            Copiar Resumen
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between shrink-0 text-normal">
        <div className="flex items-center gap-2 truncate">
          <Building2 size={13} className="text-[#2383C2] shrink-0" />
          <span className="text-pequeno text-tinta-atenuada uppercase">
            Proveedor:
          </span>
          <span
            className="text-etiqueta text-tinta-principal truncate"
            title={documento.rznSoc}
          >
            {documento.rznSoc || 'Sin Razón Social'}
          </span>
          <span className="text-tinta-atenuada text-secundario">
            (RUT: {documento.rutEmisor || 'N/A'})
          </span>
          {documento.rutEmisor && (
            <button
              onClick={() => copiarAlPortapapeles(documento.rutEmisor, 'RUT')}
              className="text-tinta-atenuada hover:text-[#2383C2] transition-colors p-0.5 cursor-pointer"
              title="Copiar RUT"
            >
              <Copy size={12} />
            </button>
          )}
        </div>
        <span className="text-pequeno text-tinta-atenuada shrink-0">
          Total Ítems: <strong className="text-tinta-principal">{detalles.length}</strong>
        </span>
      </div>

      <div className="flex-grow flex flex-col min-h-0 p-3 space-y-3 overflow-hidden">
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md p-3 shrink-0 max-h-32 overflow-y-auto">
          <h4 className="text-amber-900 dark:text-amber-200 mb-1 flex items-center gap-1.5 text-etiqueta">
            <Receipt size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Motivo u Observaciones de la Discrepancia</span>
          </h4>
          <p className="text-tinta-principal dark:text-amber-200 text-secundario whitespace-pre-wrap">
            {observaciones}
          </p>
        </div>

        <div className="border border-slate-200 dark:border-gray-700 rounded-md overflow-auto flex-1 min-h-0 bg-white dark:bg-gray-800">
          <table className="w-full text-left text-secundario border-collapse min-w-[1400px]">
            <thead className="bg-slate-100 dark:bg-gray-900 sticky top-0 z-10 shadow-xs">
              <tr className="text-tinta-secundaria uppercase text-pequeno">
                {verColumna('linea') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-10 text-center">#</th>
                )}
                {verColumna('codigoDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28">Cód. Documento</th>
                )}
                {verColumna('descripcionDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700">Descripción Documento</th>
                )}
                {verColumna('cantidadDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 text-center">Cant. Documento</th>
                )}
                {verColumna('precioDoc') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">Precio Documento</th>
                )}
                {verColumna('totalLinea') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">Total Línea</th>
                )}
                {verColumna('codigoMaestro') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-blue-100/70 dark:bg-blue-950/60 text-tinta-principal dark:text-blue-200">Cód. Maestro</th>
                )}
                {verColumna('descripcionMaestro') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 bg-blue-100/70 dark:bg-blue-950/60 text-tinta-principal dark:text-blue-200">Descripción Maestro</th>
                )}
                {verColumna('articuloOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-blue-100/70 dark:bg-blue-950/60 text-tinta-principal dark:text-blue-200">Artículo OC</th>
                )}
                {verColumna('cantidadOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 bg-blue-100/70 dark:bg-blue-950/60 text-center text-blue-900 dark:text-blue-200">Cant. OC</th>
                )}
                {verColumna('precioOC') && (
                  <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 bg-blue-100/70 dark:bg-blue-950/60 text-right text-blue-900 dark:text-blue-200">Precio OC</th>
                )}
                {verColumna('estadoDiscrepancia') && (
                  <th className="py-1.5 px-2 border-b border-slate-200 dark:border-gray-700 w-36 text-center">Estado Discrepancia</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
              {detalles.length === 0 ? (
                <tr>
                  <td colSpan={columnasTabla.length} className="py-6 text-center text-tinta-atenuada text-normal">
                    Este documento no posee ítems cargados.
                  </td>
                </tr>
              ) : (
                detalles.map((item, idx) => {
                  const tieneDifCant = !!item.diferenciaCantidad;
                  const tieneDifPrecio = !!item.diferenciaPrecio;

                  const tagEstado = item.vincuOCTexto || item.estadoItem || 'Sin información';

                  return (
                    <tr key={item.id || item.codigo || idx} className="hover:bg-slate-50 dark:hover:bg-gray-700/40">
                      {verColumna('linea') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria text-center text-etiqueta">
                          {idx + 1}
                        </td>
                      )}
                      {verColumna('codigoDoc') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria">
                          {item.codigo || '-'}
                        </td>
                      )}
                      {verColumna('descripcionDoc') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal">
                          {item.nombre || item.descripcion}
                        </td>
                      )}
                      {verColumna('cantidadDoc') && (
                        <td className={`py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center ${tieneDifCant ? 'text-etiqueta text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : ''}`}>
                          {item.cantidad}
                        </td>
                      )}
                      {verColumna('precioDoc') && (
                        <td className={`py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right ${tieneDifPrecio ? 'text-etiqueta text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : ''}`}>
                          {formatearMoneda(item.precio)}
                        </td>
                      )}
                      {verColumna('totalLinea') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-etiqueta">
                          {formatearMoneda(item.monto || item.precio * item.cantidad)}
                        </td>
                      )}
                      {verColumna('codigoMaestro') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria bg-blue-50/30 dark:bg-blue-950/20">
                          {item.codigoMaestro || item.codigo_maestro || '-'}
                        </td>
                      )}
                      {verColumna('descripcionMaestro') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal bg-blue-50/30 dark:bg-blue-950/20">
                          {item.descripcionMaestro || item.nombreMaestro || item.descripcion_maestro || '-'}
                        </td>
                      )}
                      {verColumna('articuloOC') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria bg-blue-50/30 dark:bg-blue-950/20">
                          {item.articuloOC || item.articulo_oc || item.codigoOC || item.codigo_oc || '-'}
                        </td>
                      )}
                      {verColumna('cantidadOC') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">
                          {item.cantidadOC !== undefined && item.cantidadOC !== null ? item.cantidadOC : '-'}
                        </td>
                      )}
                      {verColumna('precioOC') && (
                        <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">
                          {item.precioOC !== undefined && item.precioOC !== null ? formatearMoneda(item.precioOC) : '-'}
                        </td>
                      )}
                      {verColumna('estadoDiscrepancia') && (
                        <td className="py-1 px-2 border-b border-slate-200 dark:border-gray-700 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-pequeno whitespace-nowrap ${
                              tagEstado === 'Sin diferencias'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : tagEstado.includes('Diferencia')
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-tinta-secundaria dark:bg-gray-700'
                            }`}
                          >
                            {tagEstado}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DetalleSolicitudDif;