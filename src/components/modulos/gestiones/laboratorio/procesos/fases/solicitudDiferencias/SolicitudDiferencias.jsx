import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../../../../../firebaseConfig';
import * as XLSX from 'xlsx';
import {
  FileWarning,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
  DollarSign,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { useModal } from '../../../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import DetalleSolicitudDif from './DetalleSolicitudDif';
import { useLaboratorioData } from '../../../LaboratorioDataContext';
import { ESTADOS_SOLICITUD_DIFERENCIAS } from '../../pendientesLaboratorio';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useColumnasPermitidas, filtrarFilasExport } from '../../../../../../../hooks/useColumnasPermitidas';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_documentos' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'folio', label: 'Folio' },
  { key: 'emision', label: 'Emisión' },
  { key: 'mesImputacion', label: 'Mes Imputación' },
  { key: 'ref', label: 'Ref. (OC)' },
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'total', label: 'Total (Neto)' },
  { key: 'estado', label: 'Estado' },
  { key: 'acciones', label: 'Acciones' }
];

const SolicitudDiferencias = () => {
  const [documentos, setDocumentos] = useState([]);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);

  const { showToast } = useToast();

  const { getAnios, getMeses } = useLaboratorioData();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/laboratorio/archivosControlLaboratorio/solicitudDiferencias"; // permisos propios de esta pestaña
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
  const COL_BASE = "laboratorio_documentos";
  
  const ESTADOS_PERMITIDOS = ESTADOS_SOLICITUD_DIFERENCIAS; // los mismos del contador del menú

  const formatearFechaEmision = (fechaStr) => {
    if (!fechaStr) return '';
    const partes = fechaStr.replace(/-/g, '/').split('/');
    if (partes.length === 3) {
      const [anio, mes, dia] = partes;
      if (anio.length === 4) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    return fechaStr;
  };

  const obtenerMesImputacion = (documento) => {
    const valor = documento?.mesImputado || documento?.mes_imputado;
    if (!valor) return '—';

    if (typeof valor === 'string') {
      if (valor.includes('-')) {
        const [anio, mes] = valor.split('-');
        return `${mes}/${anio}`;
      }
      return valor;
    }

    const fecha = valor.toDate ? valor.toDate() : new Date(valor);
    if (isNaN(fecha.getTime())) return '—';

    return fecha.toLocaleDateString('es-CL', { month: '2-digit', year: 'numeric' });
  };

  useEffect(() => {
    const cargarAnios = async () => {
      try {
        const anios = await getAnios(COL_BASE);
        setAniosDisponibles(anios);
      } catch (error) {
        console.error("Error al cargar años:", error);
      }
    };
    cargarAnios();
  }, [getAnios]);

  const cargarDocumentosDiferencias = useCallback(async () => {
    if (!filtroAnio) {
      setDocumentos([]);
      return;
    }

    setLoading(true);
    try {
      const mesesIds = await getMeses(COL_BASE, filtroAnio);

      const promesasMeses = mesesIds.map(async (mesId) => {
        const docsSnap = await getDocs(collection(db, COL_BASE, filtroAnio, "meses", mesId, "documentos"));

        return docsSnap.docs
          .map(d => ({ id: d.id, mesId, anio: filtroAnio, ...d.data() }))
          .filter(data => ESTADOS_PERMITIDOS.includes(data.estado) || data.tieneDiferencias === true);
      });

      const resultadosPorMes = await Promise.all(promesasMeses);
      const docsAcumulados = resultadosPorMes.flat();

      docsAcumulados.sort((a, b) => new Date(b.fchEmis || 0) - new Date(a.fchEmis || 0));
      setDocumentos(docsAcumulados);
    } catch (error) {
      console.error("Error al cargar documentos:", error);
      showToast("Error al obtener los documentos con diferencias o vinculación parcial", "error");
    } finally {
      setLoading(false);
    }
  }, [filtroAnio, showToast, getMeses]);

  useEffect(() => {
    cargarDocumentosDiferencias();
  }, [cargarDocumentosDiferencias]);

  const puedeVerDetalle = hasPermission(PATH_VISTA, "tabla_documentos", "btn_ver");
  const handleVerDetalles = (documento) => { if (puedeVerDetalle) setDocumentoSeleccionado(documento); };
  const handleVolverALista = () => setDocumentoSeleccionado(null);

  const documentosFiltrados = useMemo(() => {
    const query = busqueda.toLowerCase().trim();
    if (!query) return documentos;
    return documentos.filter(d =>
      (d.folio && String(d.folio).toLowerCase().includes(query)) ||
      (d.rznSoc && d.rznSoc.toLowerCase().includes(query)) ||
      (d.folioRef && String(d.folioRef).toLowerCase().includes(query)) ||
      (d.rutEmisor && d.rutEmisor.toLowerCase().includes(query)) ||
      (d.estado && d.estado.toLowerCase().includes(query)) ||
      (d.mesImputado && String(d.mesImputado).toLowerCase().includes(query)) ||
      (d.mes_imputado && String(d.mes_imputado).toLowerCase().includes(query))
    );
  }, [documentos, busqueda]);

  const totalMontoDiferencias = useMemo(() => {
    return documentosFiltrados.reduce((acc, d) => acc + (Math.round(Number(d.total) || 0)), 0);
  }, [documentosFiltrados]);

  const handleExportarTodoExcel = () => {
    if (!hasPermission(PATH_VISTA, "acciones_detalle", "btn_exportar_todo")) return;
    if (documentosFiltrados.length === 0) {
      showToast('No hay documentos para exportar', 'warning');
      return;
    }

    confirmAction(
      "Confirmar Exportación y Solicitud",
      `¿Está seguro de exportar el reporte y cambiar el estado de ${documentosFiltrados.length} documento(s) a "Solicitud Enviada"?`,
      async () => {
        setExportando(true);
        try {
          const filasExcel = [];

          documentosFiltrados.forEach((documento) => {
            const detalles = documento.detalles || [];

            if (detalles.length === 0) {
              filasExcel.push({
                'Folio': documento.folio || '',
                'Emisión': formatearFechaEmision(documento.fchEmis),
                'Proveedor': documento.rznSoc || 'Sin Razón Social',
                'Ref. (OC)': documento.folioRef || 'Sin Referencia',
                'Cód. Maestro': '',
                'Descripción Maestro': '',
                'Artículo OC': '',
                'Cant. Documento': '',
                'Precio Documento': '',
                'Cant. OC': '',
                'Precio OC': '',
                'Estado Discrepancia': 'Sin ítems cargados'
              });
              return;
            }

            detalles.forEach((item) => {
              const tagEstado = item.vincuOCTexto || item.estadoItem || 'Sin información';

              filasExcel.push({
                'Folio': documento.folio || '',
                'Emisión': formatearFechaEmision(documento.fchEmis),
                'Proveedor': documento.rznSoc || 'Sin Razón Social',
                'Ref. (OC)': documento.folioRef || 'Sin Referencia',
                'Cód. Maestro': item.codigoMaestro || item.codigo_maestro || '',
                'Descripción Maestro': item.descripcionMaestro || item.nombreMaestro || item.descripcion_maestro || '',
                'Artículo OC': item.articuloOC || item.articulo_oc || item.codigoOC || item.codigo_oc || '',
                'Cant. Documento': item.cantidad ?? 0,
                'Precio Documento': item.precio ?? 0,
                'Cant. OC': item.cantidadOC ?? 0,
                'Precio OC': item.precioOC ?? 0,
                'Estado Discrepancia': tagEstado
              });
            });
          });

          if (filasExcel.length === 0) {
            showToast('No hay ítems para exportar', 'warning');
            setExportando(false);
            return;
          }

          // Solo las columnas que el usuario ve: las del documento según la tabla de

          // la lista y las de ítems según la tabla del detalle (permisos col_*).

          const columnaDoc = { 'Folio': 'folio', 'Emisión': 'emision', 'Proveedor': 'razonSocial', 'Ref. (OC)': 'ref' };

          const columnaDet = { 'Cód. Maestro': 'codigoMaestro', 'Descripción Maestro': 'descripcionMaestro', 'Artículo OC': 'articuloOC', 'Cant. Documento': 'cantidadDoc', 'Precio Documento': 'precioDoc', 'Cant. OC': 'cantidadOC', 'Precio OC': 'precioOC', 'Estado Discrepancia': 'estadoDiscrepancia' };

          const filasPermitidas = filtrarFilasExport(

            filtrarFilasExport(filasExcel, columnaDoc, (k) => hasPermission(PATH_VISTA, 'tabla_documentos', `col_${k}`)),

            columnaDet, (k) => hasPermission(PATH_VISTA, 'tabla_detalle', `col_${k}`)

          );

          const worksheet = XLSX.utils.json_to_sheet(filasPermitidas);

          // Anchos por encabezado (la hoja puede omitir columnas sin permiso).

          const anchosPorEncabezado = { 'Folio': 12, 'Emisión': 12, 'Proveedor': 28, 'Ref. (OC)': 16, 'Cód. Maestro': 16, 'Descripción Maestro': 32, 'Artículo OC': 18, 'Cant. Documento': 14, 'Precio Documento': 14, 'Cant. OC': 12, 'Precio OC': 12, 'Estado Discrepancia': 24 };

          worksheet['!cols'] = Object.keys(filasPermitidas[0] || {}).map((h) => ({ wch: anchosPorEncabezado[h] || 14 }));

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitud Diferencias General');

          const nombreArchivo = `Solicitud_Diferencias_General_${filtroAnio || 'Todos'}.xlsx`;
          XLSX.writeFile(workbook, nombreArchivo);

          const currentUser = auth.currentUser;
          const usuarioInfo = {
            uid: currentUser?.uid || "desconocido",
            email: currentUser?.email || "usuario_anonimo",
            nombre: currentUser?.displayName || currentUser?.email?.split('@')[0] || "Usuario"
          };

          const nuevoEstadoGeneral = "Solicitud Enviada";

          const promesasActualizacion = documentosFiltrados.map(async (documento) => {
            if (!documento.mesId || !documento.id) return;

            const estadoAnteriorGeneral = documento.estado || "Diferencia Reportada";
            const docRef = doc(db, COL_BASE, filtroAnio, "meses", documento.mesId, "documentos", documento.id);

            await updateDoc(docRef, { estado: nuevoEstadoGeneral });

            try {
              const logsRef = collection(docRef, "logs");
              await addDoc(logsRef, {
                accion: "SOLICITUD_DIFERENCIAS_EXPORTADA",
                detalle: `Solicitud de diferencias generada y exportada para el folio ${documento.folio || documento.id}`,
                estadoAnterior: estadoAnteriorGeneral,
                nuevoEstado: nuevoEstadoGeneral,
                fechaHora: new Date().toLocaleString('es-CL'),
                timestamp: serverTimestamp(),
                usuario: usuarioInfo
              });
            } catch (logError) {
              console.error("Error al escribir log de solicitud:", logError);
            }
          });

          await Promise.all(promesasActualizacion);

          await cargarDocumentosDiferencias();

          showToast(`Excel generado y ${documentosFiltrados.length} documento(s) actualizado(s) a "Solicitud Enviada".`, 'success');
        } catch (error) {
          console.error("Error al exportar y registrar logs:", error);
          showToast("Error al procesar la exportación y actualización de estados", "error");
        } finally {
          setExportando(false);
        }
      }
    );
  };

  const renderBadgeEstadoGeneral = (estado) => <EstadoProcesoBadge estado={estado} fallback="Diferencia Reportada" />;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden p-0 relative font-sans">
      {documentoSeleccionado ? (
        <DetalleSolicitudDif
          documento={documentoSeleccionado}
          exportando={exportando}
          formatearFechaEmision={formatearFechaEmision}
          getBadgeStyle={renderBadgeEstadoGeneral}
          onVolver={handleVolverALista}
          puedeExportar={hasPermission(PATH_VISTA, "acciones_detalle", "btn_exportar_solicitud")}
        />
      ) : (
        <>
          <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                <FileWarning size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-[12px] font-normal text-slate-800 dark:text-gray-100 uppercase tracking-wide">
                  Solicitud de Diferencias y Vinculaciones
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  Gestión e inspección de documentos con discrepancias o vinculación parcial
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="px-2.5 py-1 rounded bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
                <FileText size={13} className="text-slate-500" />
                <span className="text-slate-600 dark:text-gray-400">Total Casos:</span>
                <span className="font-semibold text-slate-800 dark:text-gray-200">{documentosFiltrados.length}</span>
              </div>
              <div className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1.5">
                <DollarSign size={13} className="text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-300">Monto:</span>
                <span className="font-semibold text-amber-900 dark:text-amber-200">
                  ${totalMontoDiferencias.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </header>

          <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center justify-between border-b border-slate-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-1.5 items-center flex-grow">
              {hasPermission(PATH_VISTA, "filtros_busqueda", "select_anio") && (
                <select
                  value={filtroAnio}
                  onChange={(e) => setFiltroAnio(e.target.value)}
                  className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2]"
                >
                  <option value="">Seleccionar Año</option>
                  {aniosDisponibles.map((a, idx) => (
                    <option key={`anio-${a}-${idx}`} value={a}>{a}</option>
                  ))}
                </select>
              )}

              {hasPermission(PATH_VISTA, "filtros_busqueda", "input_busqueda") && (
                <div className="relative flex-grow max-w-xs">
                  <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
                  <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:border-[#2383C2]"
                    placeholder="Buscar por Folio, RUT, Ref, Estado..."
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {hasPermission(PATH_VISTA, "acciones_detalle", "btn_exportar_todo") && (
              <button
                onClick={handleExportarTodoExcel}
                disabled={!filtroAnio || loading || exportando || documentosFiltrados.length === 0}
                className="h-6 px-2.5 rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                title="Descargar Excel con todos los ítems, cambiar estado y registrar log"
              >
                <FileSpreadsheet size={12} />
                <span>Exportar Todo</span>
              </button>
              )}

              <button
                onClick={cargarDocumentosDiferencias}
                disabled={!filtroAnio || loading}
                className="h-6 px-2 rounded text-[11px] font-medium bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                title="Recargar datos"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                <span>Actualizar</span>
              </button>
            </div>
          </div>

          {hasPermission(PATH_VISTA, "tabla_documentos") && (
            <div className="flex-grow overflow-auto">
              {loading ? (
                <div className="w-full h-40 flex items-center justify-center text-xs text-slate-500 dark:text-gray-400 gap-2">
                  <RefreshCw size={16} className="animate-spin text-amber-500" />
                  <span>Cargando documentos del año {filtroAnio}...</span>
                </div>
              ) : (
                <table className="w-full text-left text-[11px] border-collapse table-fixed min-w-[950px]">
                  <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                    <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
                      {verColumna('folio') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[10%]">Folio</th>
                      )}
                      {verColumna('emision') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[10%]">Emisión</th>
                      )}
                      {verColumna('mesImputacion') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[11%] text-center">Mes Imputación</th>
                      )}
                      {verColumna('ref') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[10%]">Ref. (OC)</th>
                      )}
                      {verColumna('razonSocial') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[27%]">Razón Social</th>
                      )}
                      {verColumna('total') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%] text-right">Total (Neto)</th>
                      )}
                      {verColumna('estado') && (
                        <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%] text-center">Estado</th>
                      )}
                      {verColumna('acciones') && (
                        <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-[8%] text-center">Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                    {documentosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={columnasTabla.length} className="px-3 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                          <div className="flex flex-col items-center gap-1.5">
                            <AlertTriangle size={18} className="text-slate-300 dark:text-gray-600" />
                            <span>
                              {filtroAnio
                                ? "No se encontraron registros de diferencias o vinculación parcial para este año."
                                : "Seleccione un año para visualizar los documentos."}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      documentosFiltrados.map((d) => (
                        <tr
                          key={d.id}
                          onDoubleClick={() => handleVerDetalles(d)}
                          className="border-l-2 border-transparent hover:border-amber-500 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors cursor-pointer"
                          title="Doble clic para ver el detalle"
                        >
                          {verColumna('folio') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 font-normal text-slate-800 dark:text-gray-100 truncate">
                              {d.folio}
                            </td>
                          )}
                          {verColumna('emision') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 whitespace-nowrap">
                              {formatearFechaEmision(d.fchEmis)}
                            </td>
                          )}
                          {verColumna('mesImputacion') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 text-center font-medium whitespace-nowrap">
                              {obtenerMesImputacion(d)}
                            </td>
                          )}
                          {verColumna('ref') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 truncate">
                              {d.folioRef || 'S/R'}
                            </td>
                          )}
                          {verColumna('razonSocial') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 truncate" title={d.rznSoc}>
                              {d.rznSoc || 'Sin Razón Social'}
                            </td>
                          )}
                          {verColumna('total') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100 font-normal text-right whitespace-nowrap">
                              ${Math.round(Number(d.total || 0)).toLocaleString('es-CL')}
                            </td>
                          )}
                          {verColumna('estado') && (
                            <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                              {renderBadgeEstadoGeneral(d.estado)}
                            </td>
                          )}
                          {verColumna('acciones') && (
                            <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                              <button
                                disabled={!puedeVerDetalle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVerDetalles(d);
                                }}
                                className="p-1 text-slate-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Visualizar documento"
                              >
                                <Eye size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SolicitudDiferencias;