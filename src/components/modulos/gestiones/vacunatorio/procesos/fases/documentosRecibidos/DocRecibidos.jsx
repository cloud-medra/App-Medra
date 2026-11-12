import React, { useState, useEffect } from 'react';
import { collection, deleteDoc, doc, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../../../../firebaseConfig';
import { FileText, Trash2, Search, Eye, Settings, History } from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { useModal } from '../../../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import DetalleFacturaModal from '../../../vizualizador/XmlDetallesDoc';
import EditorDocumentos from './EditorDocumentos';
import HistorialDocumentos from './HistorialDocumentos'; 
import { useVacunatorioData } from '../../../VacunatorioDataContext';
import { getEstadoProcesoClase } from '../../../../shared/estadosProceso';
import CeldasDatosIngreso from '../../../../shared/CeldasDatosIngreso';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_documentos' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'folio', label: 'Folio' },
  { key: 'emision', label: 'Emisión' },
  { key: 'ref', label: 'Ref.' },
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'total', label: 'Total (Neto)' },
  { key: 'estado', label: 'Estado' },
  { key: 'orden', label: 'Orden' },
  { key: 'acta', label: 'Acta' },
  { key: 'salida', label: 'Salida' },
  { key: 'mesImputado', label: 'Mes imputado' },
  { key: 'acciones', label: 'Acciones' }
];

const DocumentosRecibidos = () => {
  const [documentos, setDocumentos] = useState([]);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);
  const [documentoParaConfigurar, setDocumentoParaConfigurar] = useState(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedDocumentoForLog, setSelectedDocumentoForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroMes, setFiltroMes] = useState("");

  const { showToast } = useToast();

  const { getAnios, getMeses } = useVacunatorioData();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/vacunatorio/archivosControlVacunatorio/documentosRecibidos"; // permisos propios de esta pestaña
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
  const COL_BASE = "vacunatorio_documentos";

  const formatearFechaEmision = (fechaStr) => {
    if (!fechaStr) return '-';
    const partes = fechaStr.replace(/-/g, '/').split('/');
    if (partes.length === 3) {
      const [anio, mes, dia] = partes;
      if (anio.length === 4) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    return fechaStr;
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

  useEffect(() => {
    if (!filtroAnio) { setMesesDisponibles([]); return; }
    const cargarMeses = async () => {
      try {
        const meses = await getMeses(COL_BASE, filtroAnio);
        setMesesDisponibles(meses);
      } catch (error) {
        console.error("Error al cargar meses:", error);
      }
    };
    cargarMeses();
  }, [filtroAnio, getMeses]);

  useEffect(() => {
    if (!filtroAnio || !filtroMes) { setDocumentos([]); return; }
    const path = `${COL_BASE}/${filtroAnio}/meses/${filtroMes}/documentos`;
    const q = query(collection(db, path), orderBy("fchEmis", "desc"));
    return onSnapshot(q, (snapshot) => setDocumentos(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [filtroAnio, filtroMes]);

  const handleDelete = (id) => {
    confirmAction("Eliminar Documento", "¿Estás seguro de eliminar este registro?", async () => {
      await deleteDoc(doc(db, COL_BASE, filtroAnio, "meses", filtroMes, "documentos", id));
      showToast("Documento eliminado", "info");
    });
  };

  const abrirHistorialLogs = async (documento) => {
    setSelectedDocumentoForLog(documento);
    setShowLogModal(true);
    setLoadingLogs(true);

    try {
      const logsRef = collection(db, COL_BASE, filtroAnio, "meses", filtroMes, "documentos", documento.id, "logs");
      const q = query(logsRef, orderBy("timestamp", "desc"));

      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogsList(logsData);
    } catch (error) {
      console.error("Error cargando logs:", error);
      setLogsList([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const documentosFiltrados = documentos.filter(docItem =>
    docItem.folio?.toLowerCase().includes(busqueda.toLowerCase()) ||
    docItem.rznSoc?.toLowerCase().includes(busqueda.toLowerCase()) ||
    docItem.folioRef?.toLowerCase().includes(busqueda.toLowerCase()) ||
    docItem.estado?.toLowerCase().includes(busqueda.toLowerCase()) ||
    (docItem.orden || docItem.numOrden)?.toString().toLowerCase().includes(busqueda.toLowerCase()) ||
    (docItem.acta || docItem.numActa)?.toString().toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden p-0 relative">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#2383C2]" />
          <span className="text-normal text-tinta-principal tracking-wide uppercase">
            Documentos Recibidos (XML)
          </span>
        </div>
      </header>

      <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center border-b border-slate-200 dark:border-gray-700">
        {hasPermission(PATH_VISTA, "filtros_busqueda", "select_anio") && (
          <select
            value={filtroAnio}
            onChange={(e) => { setFiltroAnio(e.target.value); setFiltroMes(""); }}
            className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none focus:border-[#2383C2]"
          >
            <option value="">Año</option>
            {aniosDisponibles.map((a, idx) => <option key={`anio-${a}-${idx}`} value={a}>{a}</option>)}
          </select>
        )}

        {hasPermission(PATH_VISTA, "filtros_busqueda", "select_mes") && (
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none capitalize focus:border-[#2383C2]"
          >
            <option value="">Mes</option>
            {mesesDisponibles.map((m, idx) => <option key={`mes-${m}-${idx}`} value={m}>{m}</option>)}
          </select>
        )}

        {hasPermission(PATH_VISTA, "filtros_busqueda", "input_busqueda") && (
          <div className="relative flex-grow max-w-xs">
            <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
              placeholder="Buscar por Folio, Ref, Orden, Acta, Razón Social..."
            />
          </div>
        )}
      </div>

      {hasPermission(PATH_VISTA, "tabla_documentos") && (
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-secundario border-collapse table-fixed min-w-[950px]">
            <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
              <tr className="text-tinta-secundaria uppercase text-pequeno tracking-wider">
                {verColumna('folio') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[9%]">Folio</th>
                )}
                {verColumna('emision') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[9%]">Emisión</th>
                )}
                {verColumna('ref') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[9%]">Ref.</th>
                )}
                {verColumna('razonSocial') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[22%]">Razón Social</th>
                )}
                {verColumna('total') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[10%] text-right">Total (Neto)</th>
                )}
                {verColumna('estado') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[11%] text-center">Estado</th>
                )}
                {verColumna('orden') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[7%] text-center">Orden</th>
                )}
                {verColumna('acta') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[7%] text-center">Acta</th>
                )}
                {verColumna('salida') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[7%] text-center">Salida</th>
                )}
                {verColumna('mesImputado') && (
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[9%] text-center">Mes imputado</th>
                )}
                {verColumna('acciones') && (
                  <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-[8%] text-center">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
              {documentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={columnasTabla.length} className="py-8 text-center text-tinta-atenuada text-secundario">
                    {!filtroAnio || !filtroMes ? "Selecciona un año y mes para cargar registros." : "No se encontraron documentos con los criterios seleccionados."}
                  </td>
                </tr>
              ) : (
                documentosFiltrados.map((docItem) => (
                  <tr
                    key={docItem.id}
                    className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    {verColumna('folio') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal truncate">
                        {docItem.folio || '-'}
                      </td>
                    )}
                    {verColumna('emision') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-secundaria whitespace-nowrap">
                        {formatearFechaEmision(docItem.fchEmis)}
                      </td>
                    )}
                    {verColumna('ref') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-secundaria truncate">
                        {docItem.folioRef || '-'}
                      </td>
                    )}
                    {verColumna('razonSocial') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal truncate" title={docItem.rznSoc}>
                        {docItem.rznSoc || '-'}
                      </td>
                    )}
                    {verColumna('total') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal text-right whitespace-nowrap">
                        ${Math.round(Number(docItem.total) || 0).toLocaleString('es-CL')}
                      </td>
                    )}
                    {verColumna('estado') && (
                      <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-pequeno border ${getEstadoProcesoClase(docItem.estado)}`}>
                          {docItem.estado || "Iniciar Ingreso"}
                        </span>
                      </td>
                    )}
                    <CeldasDatosIngreso documento={docItem} ver={verColumna} />
                    {verColumna('acciones') && (
                      <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700 text-center">
                        <div className="flex justify-center gap-1.5">
                          {hasPermission(PATH_VISTA, "tabla_documentos", "btn_log") && (
                            <button
                              onClick={() => abrirHistorialLogs(docItem)}
                              className="text-tinta-atenuada hover:text-[#2383C2] transition inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                              title="Ver Historial / Logs"
                            >
                              <History size={13} />
                            </button>
                          )}
                          {hasPermission(PATH_VISTA, "tabla_documentos", "btn_ver") && (
                            <button
                              onClick={() => setDocumentoSeleccionado(docItem)}
                              className="text-tinta-atenuada hover:text-[#2383C2] transition inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                              title="Ver Detalle"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          {hasPermission(PATH_VISTA, "tabla_documentos", "btn_configurar") && (
                            <button
                              onClick={() => setDocumentoParaConfigurar(docItem)}
                              className="text-tinta-atenuada hover:text-amber-600 transition inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                              title="Configurar"
                            >
                              <Settings size={13} />
                            </button>
                          )}
                          {hasPermission(PATH_VISTA, "tabla_documentos", "btn_eliminar") && (
                            <button
                              onClick={() => handleDelete(docItem.id)}
                              className="text-tinta-atenuada hover:text-red-500 transition inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {documentoSeleccionado && (
        <DetalleFacturaModal
          pathVista={PATH_VISTA}
          documento={documentoSeleccionado}
          onClose={() => setDocumentoSeleccionado(null)}
        />
      )}

      {documentoParaConfigurar && (
        <EditorDocumentos
          documento={documentoParaConfigurar}
          filtroAnio={filtroAnio}
          filtroMes={filtroMes}
          onClose={() => setDocumentoParaConfigurar(null)}
        />
      )}

      <HistorialDocumentos
        showLogModal={showLogModal}
        onClose={() => setShowLogModal(false)}
        selectedFacturaForLog={selectedDocumentoForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
      />
    </div>
  );
};

export default DocumentosRecibidos;