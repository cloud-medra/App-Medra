import React, { useState, useEffect, useCallback } from 'react';
import {
    collection,
    getDocs,
    doc,
    updateDoc,
    addDoc,
    serverTimestamp,
    query,
    where
} from 'firebase/firestore';
import { db, auth } from '../../../../../../../firebaseConfig';
import {
    ClipboardList,
    Search,
    RefreshCw,
    Eye
} from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { useModal } from '../../../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import DetalleVinculacionOC from './DetalleVinculacionOC';
import { useLaboratorioData } from '../../../LaboratorioDataContext';
import { ESTADOS_VINCULACION_ORDENES } from '../../pendientesLaboratorio';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_documentos' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'folio', label: 'Folio' },
  { key: 'emision', label: 'Emisión' },
  { key: 'mesImputacion', label: 'Mes Imputado' },
  { key: 'ref', label: 'Ref.' },
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'total', label: 'Total (Neto)' },
  { key: 'estado', label: 'Estado' },
  { key: 'acciones', label: 'Acciones' }
];

const VinculacionOrden = () => {
    const [documentos, setDocumentos] = useState([]);
    const [aniosDisponibles, setAniosDisponibles] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [filtroAnio, setFiltroAnio] = useState('');
    const [loading, setLoading] = useState(false);

    const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);

    const { showToast } = useToast();

    const { getAnios, getMeses } = useLaboratorioData();
    const { confirmAction } = useModal();
    const { hasPermission } = useGranularPermission();

    const PATH_VISTA = "/laboratorio/archivosControlLaboratorio/vinculacionOrdenes"; // permisos propios de esta pestaña
    const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
    const COL_BASE = "laboratorio_documentos";

    const formatearFechaEmision = (fechaStr) => {
        if (!fechaStr) return '';
        const partes = fechaStr.replace(/-/g, '/').split('/');
        if (partes.length === 3) {
            const [anio, mes, dia] = partes;
            if (anio.length === 4) return `${dia}/${mes}/${anio}`;
        }
        return fechaStr;
    };

    const formatearMesImputado = (valMes) => {
        if (!valMes) return '-';
        if (typeof valMes === 'string' && valMes.includes('_')) {
            const partes = valMes.split('_');
            const nombreMes = partes[1] || partes[0];
            return nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
        }
        return valMes;
    };

    const parseFecha = (fechaStr) => {
        if (!fechaStr) return 0;
        if (fechaStr.includes('/')) {
            const [d, m, y] = fechaStr.split('/');
            return new Date(`${y}-${m}-${d}`).getTime() || 0;
        }
        return new Date(fechaStr).getTime() || 0;
    };

    useEffect(() => {
        const cargarAnios = async () => {
            try {
                const anios = await getAnios(COL_BASE);
                setAniosDisponibles(anios);

                if (anios.length > 0) {
                    setFiltroAnio(prev => prev || anios[0]);
                }
            } catch (error) {
                console.error("Error al cargar años:", error);
            }
        };
        cargarAnios();
    }, [getAnios]);

    const cargarDocumentosProcesarOC = useCallback(async () => {
        if (!filtroAnio) {
            setDocumentos([]);
            return;
        }

        setLoading(true);
        try {
            const estadosPermitidos = ESTADOS_VINCULACION_ORDENES; // los mismos del contador del menú
            const mesesIds = await getMeses(COL_BASE, filtroAnio);

            // Consulta por mes filtrando por estado en el servidor, en vez de un
            // collectionGroup global que leía todos los documentos de todas las colecciones.
            const resultadosPorMes = await Promise.all(mesesIds.map(async (mesId) => {
                const snap = await getDocs(query(
                    collection(db, COL_BASE, filtroAnio, "meses", mesId, "documentos"),
                    where("estado", "in", estadosPermitidos)
                ));
                return snap.docs.map(d => ({ id: d.id, mesId, ...d.data() }));
            }));
            const docsAcumulados = resultadosPorMes.flat();

            docsAcumulados.sort((a, b) => parseFecha(b.fchEmis) - parseFecha(a.fchEmis));
            setDocumentos(docsAcumulados);
        } catch (error) {
            console.error("Error al cargar documentos:", error);
            showToast("Error al obtener los documentos pendientes", "error");
        } finally {
            setLoading(false);
        }
    }, [filtroAnio, showToast, getMeses]);

    useEffect(() => {
        setDocumentoSeleccionado(null);
    }, [filtroAnio]);

    useEffect(() => {
        cargarDocumentosProcesarOC();
    }, [cargarDocumentosProcesarOC]);

    const puedeVerDetalle = hasPermission(PATH_VISTA, "tabla_documentos", "btn_ver");
    const handleVerDetalles = (documento) => { if (puedeVerDetalle) setDocumentoSeleccionado(documento); };
    const handleVolverALista = () => setDocumentoSeleccionado(null);

    const handleVincularOrdenCompra = ({ ordenCompra, detallesActualizados, estadoGeneral }) => {
        if (!documentoSeleccionado) return;

        const folioOC = ordenCompra?.folioCalculado || ordenCompra?.folio || ordenCompra?.id || "N/A";
        const estadoFinal = estadoGeneral || "Diferencia Reportada";

        confirmAction(
            "Confirmar Vinculación de OC",
            `¿Desea cruzar los ítems del documento con la Orden de Compra N° ${folioOC}?`,
            async () => {
                try {
                    const currentUser = auth.currentUser;
                    const usuarioInfo = {
                        uid: currentUser?.uid || "desconocido",
                        email: currentUser?.email || "usuario_anonimo",
                        nombre: currentUser?.displayName || currentUser?.email?.split('@')[0] || "Usuario"
                    };

                    const ahora = new Date();
                    const fechaHoraString = ahora.toLocaleString('es-CL');

                    const docRef = doc(
                        db,
                        COL_BASE,
                        filtroAnio,
                        "meses",
                        documentoSeleccionado.mesId,
                        "documentos",
                        documentoSeleccionado.id
                    );

                    await updateDoc(docRef, {
                        detalles: detallesActualizados,
                        estado: estadoFinal,
                        ordenCompraVinculada: {
                            id: ordenCompra?.id || null,
                            folio: folioOC,
                            fechaVinculacion: fechaHoraString
                        }
                    });

                    try {
                        const logsRef = collection(docRef, "logs");
                        await addDoc(logsRef, {
                            accion: "VINCULACION_OC",
                            detalle: `Cruce de ítems con OC N° ${folioOC} sobre folio ${documentoSeleccionado.folio || documentoSeleccionado.id} — Resultado: ${estadoFinal}`,
                            fechaHora: fechaHoraString,
                            timestamp: serverTimestamp(),
                            usuario: usuarioInfo,
                            ocVinculadaId: ordenCompra?.id || null,
                            estadoResultante: estadoFinal
                        });
                    } catch (logError) {
                        console.error("Error al registrar log de OC:", logError);
                    }

                    showToast(`Ítems cruzados con la OC N° ${folioOC} — ${estadoFinal}`, "success");

                    setDocumentos(prev => prev.filter(f => f.id !== documentoSeleccionado.id));
                } catch (error) {
                    console.error("Error al cruzar Orden de Compra:", error);
                    showToast("Error al procesar el cruce con la Orden de Compra", "error");
                }
            }
        );
    };

    const busquedaLower = busqueda.trim().toLowerCase();
    const documentosFiltrados = documentos.filter(f => {
        if (!busquedaLower) return true;
        const folioStr = String(f.folio || '').toLowerCase();
        const rznSocStr = String(f.rznSoc || '').toLowerCase();
        const folioRefStr = String(f.folioRef || '').toLowerCase();
        const mesStr = String(f.mesImputado || f.mesId || '').toLowerCase();

        return folioStr.includes(busquedaLower) ||
            rznSocStr.includes(busquedaLower) ||
            folioRefStr.includes(busquedaLower) ||
            mesStr.includes(busquedaLower);
    });

    const renderBadgeEstadoGeneral = (estado) => <EstadoProcesoBadge estado={estado} fallback="Sin Estado" />;

    return (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden p-0 relative font-sans">

            {documentoSeleccionado ? (
                <DetalleVinculacionOC
                    documento={documentoSeleccionado}
                    onVolver={handleVolverALista}
                    onVincular={handleVincularOrdenCompra}
                    puedeVincular={hasPermission(PATH_VISTA, "acciones_detalle", "btn_vincular_oc")}
                    formatearFechaEmision={formatearFechaEmision}
                    renderBadgeEstadoGeneral={renderBadgeEstadoGeneral}
                />
            ) : (
                <>
                    <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClipboardList size={16} className="text-[#2383C2]" />
                            <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
                                Vinculación de Orden de Compra (Documentos Listos para OC)
                            </span>
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
                                        placeholder="Buscar por Folio, Ref, Mes o Razón Social..."
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            onClick={cargarDocumentosProcesarOC}
                            disabled={!filtroAnio || loading}
                            className="h-6 px-2 rounded text-[11px] font-medium bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Recargar datos"
                        >
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            <span>Actualizar</span>
                        </button>
                    </div>

                    {hasPermission(PATH_VISTA, "tabla_documentos") && (
                        <div className="flex-grow overflow-auto">
                            {loading ? (
                                <div className="w-full h-40 flex items-center justify-center text-xs text-slate-500 dark:text-gray-400">
                                    Cargando documentos en estado "Procesar OC" del año {filtroAnio}...
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
                                              <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%]">Mes Imputado</th>
                                            )}
                                            {verColumna('ref') && (
                                              <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[10%]">Ref.</th>
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
                                              <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-[7%] text-center">Acciones</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                                        {documentosFiltrados.length === 0 ? (
                                            <tr>
                                                <td colSpan={columnasTabla.length} className="px-3 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                                                    {filtroAnio
                                                        ? "No hay documentos listos para Orden de Compra (Procesar OC) en este año."
                                                        : "Seleccione un año para visualizar los documentos."}
                                                </td>
                                            </tr>
                                        ) : (
                                            documentosFiltrados.map((f) => (
                                                <tr
                                                    key={f.id}
                                                    onDoubleClick={() => handleVerDetalles(f)}
                                                    className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
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
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 whitespace-nowrap font-medium">
                                                          {formatearMesImputado(f.mesImputado || f.mesId)}
                                                      </td>
                                                    )}
                                                    {verColumna('ref') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 truncate">
                                                          {f.folioRef}
                                                      </td>
                                                    )}
                                                    {verColumna('razonSocial') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 truncate" title={f.rznSoc}>
                                                          {f.rznSoc}
                                                      </td>
                                                    )}
                                                    {verColumna('total') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100 font-normal text-right whitespace-nowrap">
                                                          ${parseInt(f.total || 0, 10).toLocaleString('es-CL')}
                                                      </td>
                                                    )}
                                                    {verColumna('estado') && (
                                                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
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
                                                              className="p-1 text-slate-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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

export default VinculacionOrden;