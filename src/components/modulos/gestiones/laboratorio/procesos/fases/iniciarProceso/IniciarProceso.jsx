import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../../../../../firebaseConfig';
import { FileText, Search, PlayCircle, CheckSquare, Square, X, Play } from 'lucide-react';
import { useToast } from '../../../../../../../context/ToastContext';
import { useModal } from '../../../../../../../context/ModalContext';
import { useUser } from '../../../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../../../hooks/useGranularPermission';
import { useLaboratorioData } from '../../../LaboratorioDataContext';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_documentos' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'sel', label: 'Selección', fija: true },
  { key: 'folio', label: 'Folio' },
  { key: 'emision', label: 'Emisión' },
  { key: 'ref', label: 'Ref.' },
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'total', label: 'Total (Neto)' },
  { key: 'estado', label: 'Estado' }
];

const IniciarProceso = () => {
  const [documentos, setDocumentos] = useState([]);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [loading, setLoading] = useState(false);

  const [seleccionadas, setSeleccionadas] = useState([]);

  const [showModalIniciar, setShowModalIniciar] = useState(false);
  const [procesando, setProcesando] = useState(false);


  const { showToast } = useToast();

  const { getAnios, getMeses } = useLaboratorioData();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/laboratorio/archivosControlLaboratorio/iniciarProcesos"; // permisos propios de esta pestaña
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
  const COL_BASE = "laboratorio_documentos";

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
    if (!filtroAnio) {
      setDocumentos([]);
      setSeleccionadas([]);
      return;
    }

    const cargarDocumentosDelAnio = async () => {
      setLoading(true);
      try {
        const mesesIds = await getMeses(COL_BASE, filtroAnio);
        let docsAcumulados = [];

        for (const mesId of mesesIds) {
          const docsSnap = await getDocs(collection(db, COL_BASE, filtroAnio, "meses", mesId, "documentos"));

          docsSnap.docs.forEach(d => {
            const data = d.data();
            const estadoActual = data.estado || "Iniciar Ingreso";

            if (estadoActual === "Iniciar Ingreso") {
              docsAcumulados.push({
                id: d.id,
                mesId,
                ...data,
                estado: estadoActual
              });
            }
          });
        }

        docsAcumulados.sort((a, b) => new Date(b.fchEmis || 0) - new Date(a.fchEmis || 0));
        setDocumentos(docsAcumulados);
        setSeleccionadas([]);
      } catch (error) {
        console.error("Error al cargar documentos para iniciar proceso:", error);
        showToast("Error al obtener los documentos del año", "error");
      } finally {
        setLoading(false);
      }
    };

    cargarDocumentosDelAnio();
  }, [filtroAnio, getMeses]);

  const toggleSeleccion = (documento) => {
    setSeleccionadas(prev => {
      const existe = prev.some(item => item.id === documento.id);
      if (existe) {
        return prev.filter(item => item.id !== documento.id);
      } else {
        return [...prev, documento];
      }
    });
  };

  const toggleSeleccionarTodas = () => {
    if (seleccionadas.length === documentosFiltrados.length) {
      setSeleccionadas([]);
    } else {
      setSeleccionadas([...documentosFiltrados]);
    }
  };

  const puedeIniciarProceso = hasPermission(PATH_VISTA, "acciones_proceso", "btn_iniciar_proceso");

  const handleAbrirModalIniciar = () => {
    if (seleccionadas.length === 0 || !puedeIniciarProceso) return;


    setShowModalIniciar(true);
  };

  const handleConfirmarInicioProceso = async () => {

    setProcesando(true);
    try {
      const currentUser = auth.currentUser;

      const usuarioInfo = {
        uid: currentUser?.uid || "desconocido",
        email: userData?.email || currentUser?.email || "usuario_anonimo",
        nombre: userData?.nombreCompleto || userData?.nombre || currentUser?.displayName || currentUser?.email?.split('@')[0] || "Usuario"
      };

      const ahora = new Date();
      const fechaHoraString = ahora.toLocaleString('es-CL');

      const promesasUpdate = seleccionadas.map(async (docu) => {
        const docRef = doc(db, COL_BASE, filtroAnio, "meses", docu.mesId, "documentos", docu.id);

        await updateDoc(docRef, {
          estado: "Proceso Iniciado",
          procesoIniciado: {
            fechaHora: fechaHoraString,
            timestamp: serverTimestamp(),
            usuario: usuarioInfo
          }
        });

        try {
          const logsRef = collection(docRef, "logs");
          await addDoc(logsRef, {
            accion: "INICIO_PROCESO",
            detalle: `El proceso ha iniciado para el folio ${docu.folio || docu.id}`,
            estadoAnterior: docu.estado || "Iniciar Ingreso",
            nuevoEstado: "Proceso Iniciado",
            fechaHora: fechaHoraString,
            timestamp: serverTimestamp(),
            usuario: usuarioInfo
          });
        } catch (logError) {
          console.error(`Error al escribir log para el documento ${docu.id}:`, logError);
        }
      });

      await Promise.all(promesasUpdate);

      const idsProcesados = new Set(seleccionadas.map(docu => docu.id));
      setDocumentos(prev => prev.filter(docu => !idsProcesados.has(docu.id)));
      setSeleccionadas([]);
      setShowModalIniciar(false);

      showToast(
        `${seleccionadas.length} documento(s) pasaron a 'Proceso Iniciado'`,
        "success"
      );
    } catch (error) {
      console.error("Error al actualizar estados y guardar logs:", error);
      showToast("Hubo un error al actualizar el estado", "error");
    } finally {
      setProcesando(false);
    }
  };

  const documentosFiltrados = documentos.filter(docu =>
    docu.folio?.includes(busqueda) ||
    docu.rznSoc?.toLowerCase().includes(busqueda.toLowerCase()) ||
    docu.folioRef?.includes(busqueda)
  );

  const todasSeleccionadas = documentosFiltrados.length > 0 && seleccionadas.length === documentosFiltrados.length;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden p-0 relative">

      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#2383C2]" />
          <span className="text-normal text-tinta-principal tracking-wide uppercase">
            Iniciar Proceso de Documentos (Selección por Año)
          </span>
        </div>
      </header>

      <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center justify-between border-b border-slate-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-1.5 items-center flex-grow">
          {hasPermission(PATH_VISTA, "filtros_busqueda", "select_anio") && (
            <select
              value={filtroAnio}
              onChange={(e) => setFiltroAnio(e.target.value)}
              className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none focus:border-[#2383C2]"
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
                className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
                placeholder="Buscar por Folio, Ref o Razón Social..."
              />
            </div>
          )}
        </div>

        {puedeIniciarProceso && (
        <button
          onClick={handleAbrirModalIniciar}
          disabled={seleccionadas.length === 0}
          className={`h-6 px-2.5 rounded text-secundario flex items-center gap-1 transition-colors ${
            seleccionadas.length > 0
              ? 'bg-[#2383C2] text-white hover:bg-blue-600 shadow-xs cursor-pointer'
              : 'bg-slate-200 dark:bg-gray-700 text-tinta-atenuada cursor-not-allowed'
          }`}
        >
          <PlayCircle size={13} />
          <span>Iniciar Proceso ({seleccionadas.length})</span>
        </button>
        )}
      </div>

      {hasPermission(PATH_VISTA, "tabla_documentos") && (
        <div className="flex-grow overflow-auto">
          {loading ? (
            <div className="w-full h-40 flex items-center justify-center text-normal text-tinta-secundaria">
              Cargando documentos pendientes del año {filtroAnio}...
            </div>
          ) : (
            <table className="w-full text-left text-secundario border-collapse table-fixed min-w-[800px]">
              <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                <tr className="text-tinta-secundaria uppercase text-pequeno tracking-wider">
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[4%] text-center">
                    <button
                      onClick={toggleSeleccionarTodas}
                      className="text-tinta-secundaria hover:text-[#2383C2] focus:outline-none"
                      title="Seleccionar todas"
                      type="button"
                    >
                      {todasSeleccionadas ? (
                        <CheckSquare size={14} className="text-[#2383C2]" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </th>
                  {verColumna('folio') && (
                    <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%]">Folio</th>
                  )}
                  {verColumna('emision') && (
                    <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%]">Emisión</th>
                  )}
                  {verColumna('ref') && (
                    <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[12%]">Ref.</th>
                  )}
                  {verColumna('razonSocial') && (
                    <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[34%]">Razón Social</th>
                  )}
                  {verColumna('total') && (
                    <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-[13%] text-right">Total (Neto)</th>
                  )}
                  {verColumna('estado') && (
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-[13%] text-center">Estado</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                {documentosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={columnasTabla.length} className="px-3 py-6 text-center text-tinta-atenuada text-normal">
                      {filtroAnio
                        ? "No hay documentos pendientes en estado 'Iniciar Ingreso' para este año."
                        : "Seleccione un año para visualizar los documentos pendientes."}
                    </td>
                  </tr>
                ) : (
                  documentosFiltrados.map((docu) => {
                    const isSelected = seleccionadas.some(item => item.id === docu.id);

                    return (
                      <tr
                        key={docu.id}
                        onClick={() => toggleSeleccion(docu)}
                        className={`border-l-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[#2383C2] bg-blue-50/50 dark:bg-blue-950/30'
                            : 'border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40'
                        }`}
                      >
                        <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-[#2383C2] focus:ring-0 cursor-pointer"
                          />
                        </td>
                        {verColumna('folio') && (
                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal truncate">
                            {docu.folio}
                          </td>
                        )}
                        {verColumna('emision') && (
                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-secundaria whitespace-nowrap">
                            {formatearFechaEmision(docu.fchEmis)}
                          </td>
                        )}
                        {verColumna('ref') && (
                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-secundaria truncate">
                            {docu.folioRef}
                          </td>
                        )}
                        {verColumna('razonSocial') && (
                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal truncate" title={docu.rznSoc}>
                            {docu.rznSoc}
                          </td>
                        )}
                        {verColumna('total') && (
                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-tinta-principal text-right whitespace-nowrap">
                            ${parseInt(docu.total || 0).toLocaleString('es-CL')}
                          </td>
                        )}
                        {verColumna('estado') && (
                          <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center whitespace-nowrap">
                            <EstadoProcesoBadge estado={docu.estado} />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModalIniciar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 max-w-md w-full p-4 space-y-4 text-tinta-principal">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-gray-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#2383C2]/10 text-[#2383C2]">
                  <Play size={18} className="fill-current" />
                </div>
                <div>
                  <h3 className="text-subtitulo">Iniciar proceso</h3>
                  <p className="text-pequeno text-tinta-secundaria">Confirmación de procesamiento de documentos</p>
                </div>
              </div>
              <button
                onClick={() => setShowModalIniciar(false)}
                disabled={procesando}
                className="text-tinta-atenuada hover:text-tinta-secundaria p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-secundario">
              <p className="text-tinta-secundaria">
                ¿Desea iniciar el proceso para <span className="text-etiqueta text-[#2383C2]">{seleccionadas.length} documento(s)</span> seleccionado(s)?
              </p>

            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-gray-700">
              <button
                onClick={() => setShowModalIniciar(false)}
                disabled={procesando}
                className="px-3 py-1.5 rounded bg-slate-200 dark:bg-gray-700 text-tinta-principal text-secundario hover:bg-slate-300 dark:hover:bg-gray-600 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarInicioProceso}
                disabled={procesando}
                className="px-3 py-1.5 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-etiqueta flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {procesando ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Play size={12} className="fill-current" />
                    Confirmar e Iniciar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IniciarProceso;