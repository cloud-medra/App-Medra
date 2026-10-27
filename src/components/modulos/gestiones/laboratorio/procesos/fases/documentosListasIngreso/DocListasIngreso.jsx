import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../../../../firebaseConfig';
import {
    CheckCircle2,
    Search,
    RefreshCw,
    Eye,
    AlertTriangle,
    DollarSign,
    FileText
} from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { useModal } from '../../../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import DetalleListasIngreso from './DetalleListasIngreso';
import { useLaboratorioData } from '../../../LaboratorioDataContext';
import { ESTADOS_DOCUMENTOS_LISTOS } from '../../pendientesLaboratorio';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

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

const DocListasIngreso = () => {
    const [documentos, setDocumentos] = useState([]);
    const [aniosDisponibles, setAniosDisponibles] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [filtroAnio, setFiltroAnio] = useState('');
    const [loading, setLoading] = useState(false);

    const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);

    const { showToast } = useToast();

    const { getAnios, getMeses } = useLaboratorioData();
    const { hasPermission } = useGranularPermission();

    const PATH_VISTA = "/laboratorio/archivosControlLaboratorio/documentosListos"; // permisos propios de esta pestaña
    const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
    const COL_BASE = "laboratorio_documentos";

    const ESTADOS_PERMITIDOS = ESTADOS_DOCUMENTOS_LISTOS; // los mismos del contador del menú

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

    const cargarDocumentosListos = useCallback(async () => {
        if (!filtroAnio) {
            setDocumentos([]);
            return;
        }

        setLoading(true);
        try {
            const mesesIds = await getMeses(COL_BASE, filtroAnio);

            const promesasMeses = mesesIds.map(async (mesId) => {
                const docsSnap = await getDocs(query(
                    collection(db, COL_BASE, filtroAnio, "meses", mesId, "documentos"),
                    where("estado", "in", ESTADOS_PERMITIDOS)
                ));

                return docsSnap.docs
                    .map(d => ({ id: d.id, mesId, anio: filtroAnio, ...d.data() }))
                    .filter(data => ESTADOS_PERMITIDOS.includes(data.estado));
            });

            const resultadosPorMes = await Promise.all(promesasMeses);
            const docsAcumulados = resultadosPorMes.flat();

            docsAcumulados.sort((a, b) => new Date(b.fchEmis || 0) - new Date(a.fchEmis || 0));
            setDocumentos(docsAcumulados);
        } catch (error) {
            console.error("Error al cargar documentos listos para ingreso:", error);
            showToast("Error al obtener los documentos listos para ingreso", "error");
        } finally {
            setLoading(false);
        }
    }, [filtroAnio, showToast, getMeses]);

    useEffect(() => {
        cargarDocumentosListos();
    }, [cargarDocumentosListos]);

    const puedeVerDetalle = hasPermission(PATH_VISTA, "tabla_documentos", "btn_ver");
    const handleVerDetalles = (documento) => { if (puedeVerDetalle) setDocumentoSeleccionado(documento); };
    const handleVolverALista = () => setDocumentoSeleccionado(null);

    const documentosFiltrados = useMemo(() => {
        const query = busqueda.toLowerCase().trim();
        if (!query) return documentos;
        return documentos.filter(f =>
            (f.folio && String(f.folio).toLowerCase().includes(query)) ||
            (f.rznSoc && f.rznSoc.toLowerCase().includes(query)) ||
            (f.folioRef && String(f.folioRef).toLowerCase().includes(query)) ||
            (f.rutEmisor && f.rutEmisor.toLowerCase().includes(query)) ||
            (f.estado && f.estado.toLowerCase().includes(query)) ||
            (f.mesImputado && String(f.mesImputado).toLowerCase().includes(query)) ||
            (f.mes_imputado && String(f.mes_imputado).toLowerCase().includes(query))
        );
    }, [documentos, busqueda]);

    const totalMontoListas = useMemo(() => {
        return documentosFiltrados.reduce((acc, f) => acc + (Math.round(Number(f.total) || 0)), 0);
    }, [documentosFiltrados]);

    const renderBadgeEstadoGeneral = (estado) => <EstadoProcesoBadge estado={estado} fallback="Listo para Ingreso" />;

    return (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden p-0 relative font-sans">
            {documentoSeleccionado ? (
                <DetalleListasIngreso
                    documento={documentoSeleccionado}
                    formatearFechaEmision={formatearFechaEmision}
                    renderBadgeEstadoGeneral={renderBadgeEstadoGeneral}
                    onVolver={handleVolverALista}
                    puedeFinalizarActa={hasPermission(PATH_VISTA, "acciones_detalle", "btn_finalizar_acta")}
                    onActualizarDocumento={(documentoActualizado) => {
                        setDocumentos(prev =>
                            prev.map(f => (f.id === documentoActualizado.id ? { ...f, ...documentoActualizado } : f))
                        );
                        setDocumentoSeleccionado(documentoActualizado);
                    }}
                />
            ) : (
                <>
                    <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <h1 className="text-[12px] font-normal text-slate-800 dark:text-gray-100 uppercase tracking-wide">
                                    Documentos Listos para Ingreso
                                </h1>
                                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                                    Gestión y seguimiento de documentos validados y listos para su contabilización o ingreso final
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                            <div className="px-2.5 py-1 rounded bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
                                <FileText size={13} className="text-slate-500" />
                                <span className="text-slate-600 dark:text-gray-400">Total Casos:</span>
                                <span className="font-semibold text-slate-800 dark:text-gray-200">{documentosFiltrados.length}</span>
                            </div>
                            <div className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1.5">
                                <DollarSign size={13} className="text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-700 dark:text-emerald-300">Monto:</span>
                                <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                                    ${totalMontoListas.toLocaleString('es-CL')}
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
                            <button
                                onClick={cargarDocumentosListos}
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
                                    <RefreshCw size={16} className="animate-spin text-emerald-500" />
                                    <span>Cargando documentos listos para ingreso del año {filtroAnio}...</span>
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
                                                                ? "No se encontraron registros en estado 'Listo para Ingreso' para este año."
                                                                : "Seleccione un año para visualizar los documentos."}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            documentosFiltrados.map((f) => (
                                                <tr
                                                    key={f.id}
                                                    onDoubleClick={() => handleVerDetalles(f)}
                                                    className="border-l-2 border-transparent hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer"
                                                    title="Doble clic para ver el detalle"
                                                >
                                                    {verColumna('folio') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 font-normal text-slate-800 dark:text-gray-100 truncate">
                                                          {f.folio}
                                                      </td>
                                                    )}
                                                    {verColumna('emision') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 whitespace-nowrap">
                                                          {formatearFechaEmision(f.fchEmis)}
                                                      </td>
                                                    )}
                                                    {verColumna('mesImputacion') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 text-center font-medium whitespace-nowrap">
                                                          {obtenerMesImputacion(f)}
                                                      </td>
                                                    )}
                                                    {verColumna('ref') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 truncate">
                                                          {f.folioRef || 'S/R'}
                                                      </td>
                                                    )}
                                                    {verColumna('razonSocial') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 truncate" title={f.rznSoc}>
                                                          {f.rznSoc || 'Sin Razón Social'}
                                                      </td>
                                                    )}
                                                    {verColumna('total') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100 font-normal text-right whitespace-nowrap">
                                                          ${Math.round(Number(f.total || 0)).toLocaleString('es-CL')}
                                                      </td>
                                                    )}
                                                    {verColumna('estado') && (
                                                      <td className="px-1 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                                                          {renderBadgeEstadoGeneral(f.estado)}
                                                      </td>
                                                    )}
                                                    {verColumna('acciones') && (
                                                      <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                                                          <button
                                                              disabled={!puedeVerDetalle}
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  handleVerDetalles(f);
                                                              }}
                                                              className="p-1 text-slate-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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

export default DocListasIngreso;