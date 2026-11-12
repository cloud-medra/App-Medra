import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { Microscope, Plus, Trash2, Search, Pencil, Save, X, History, Copy } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';

const EmpresasVacunatorio = () => {
  const [vacunatorio, setVacunatorio] = useState([]);
  const [formData, setFormData] = useState({ nombre: '', rut: '', estado: 'ACTIVO' });
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedLabForLog, setSelectedLabForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/vacunatorio/empresasVacunatorio";
  const COL_BASE = "vacunatorio_empresas";

  useEffect(() => {
    const q = query(collection(db, COL_BASE), orderBy("fechaRegistro", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVacunatorio(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const formatearRut = (rut) => {
    let valor = rut.replace(/[^0-9kK]/g, '');
    if (valor.length < 2) return valor;
    const cuerpo = valor.slice(0, -1);
    const dv = valor.slice(-1).toUpperCase();
    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${cuerpoFormateado}-${dv}`;
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return 'N/A';
    const date = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return date.toLocaleString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copiarTexto = (texto, etiqueta = 'Texto') => {
    if (!texto) return;
    navigator.clipboard.writeText(texto)
      .then(() => showToast(`${etiqueta} copiado al portapapeles`, "info"))
      .catch(() => showToast("Error al copiar", "error"));
  };

  const registrarLog = async (vacunatorioId, accion, detalles) => {
    try {
      const logsSubcollectionRef = collection(db, COL_BASE, vacunatorioId, "logs");
      await addDoc(logsSubcollectionRef, {
        accion,
        detalles,
        usuario: userData?.nombreCompleto || 'Usuario Desconocido',
        usuarioEmail: userData?.email || '',
        fecha: new Date(),
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Error al registrar log de auditoría:", err);
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.rut.trim()) {
      return showToast("Nombre y RUT son obligatorios", "error");
    }

    const rutFormateado = formatearRut(formData.rut);
    const nombreTrimmed = formData.nombre.trim().toLowerCase();

    const existeRut = vacunatorio.some(l => 
      l.rut === rutFormateado && l.id !== editingId
    );
    if (existeRut) {
      return showToast("Ya existe un vacunatorio registrado con este RUT", "error");
    }

    const existeNombre = vacunatorio.some(l => 
      l.nombre.trim().toLowerCase() === nombreTrimmed && l.id !== editingId
    );
    if (existeNombre) {
      return showToast("Ya existe un vacunatorio registrado con este Nombre", "error");
    }

    try {
      if (editingId) {
        const labExistente = vacunatorio.find(l => l.id === editingId);
        
        const dataAEnviar = {
          ...formData,
          rut: rutFormateado,
          fechaRegistro: labExistente?.fechaRegistro || new Date(),
          registradoPor: labExistente?.registradoPor || userData?.nombreCompleto || 'Usuario'
        };

        await updateDoc(doc(db, COL_BASE, editingId), dataAEnviar);

        await registrarLog(editingId, 'EDICION', {
          nombreAnterior: labExistente?.nombre,
          nombreNuevo: formData.nombre,
          rutAnterior: labExistente?.rut,
          rutNuevo: rutFormateado,
          estadoAnterior: labExistente?.estado,
          estadoNuevo: formData.estado
        });

        showToast("Vacunatorio actualizado correctamente", "success");
      } else {
        const dataAEnviar = {
          ...formData,
          rut: rutFormateado,
          fechaRegistro: new Date(),
          registradoPor: userData?.nombreCompleto || 'Usuario'
        };

        const docRef = await addDoc(collection(db, COL_BASE), dataAEnviar);

        await registrarLog(docRef.id, 'CREACION', {
          nombre: formData.nombre,
          rut: rutFormateado,
          estado: formData.estado
        });

        showToast("Vacunatorio registrado correctamente", "success");
      }
      setFormData({ nombre: '', rut: '', estado: 'ACTIVO' });
      setEditingId(null);
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    }
  };

  const handleDelete = (id) => {
    const labAEliminar = vacunatorio.find(l => l.id === id);

    confirmAction(
      "Eliminar Vacunatorio",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          await registrarLog(id, 'ELIMINACION', {
            nombre: labAEliminar?.nombre || '',
            rut: labAEliminar?.rut || ''
          });

          await deleteDoc(doc(db, COL_BASE, id));

          showToast("Vacunatorio eliminado correctamente", "info");
        } catch (error) {
          showToast("Error al eliminar", "error");
        }
      }
    );
  };

  const iniciarEdicion = (l) => {
    setEditingId(l.id);
    setFormData({ nombre: l.nombre, rut: l.rut, estado: l.estado || 'ACTIVO' });
  };

  const abrirHistorialLogs = async (lab) => {
    setSelectedLabForLog(lab);
    setShowLogModal(true);
    setLoadingLogs(true);

    try {
      const q = query(
        collection(db, COL_BASE, lab.id, "logs"),
        orderBy("fecha", "desc")
      );
      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogsList(logsData);
    } catch (error) {
      console.error("Error cargando logs:", error);
      showToast("Error al cargar el historial", "error");
    } finally {
      setLoadingLogs(false);
    }
  };

  const vacunatorioFiltrados = vacunatorio.filter(l =>
    l.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (l.rut && l.rut.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-secundario">
      <h2 className="text-titulo-seccion text-tinta-principal px-3 py-2 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <Microscope size={14} className="text-[#2383C2]" /> {editingId ? "Editar vacunatorio" : "Registro de vacunatorio"}
      </h2>

      {hasPermission(PATH_VISTA, "formulario_registro") && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          {hasPermission(PATH_VISTA, "formulario_registro", "input_nombre") && (
            <div className="w-[240px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Nombre Vacunatorio</label>
              <input required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] dark:focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: Vacunatorio Central" />
            </div>
          )}

          {hasPermission(PATH_VISTA, "formulario_registro", "input_rut") && (
            <div className="w-[150px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">RUT</label>
              <input required value={formData.rut} onChange={e => setFormData({ ...formData, rut: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] dark:focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: 123456789" />
            </div>
          )}

          {editingId && hasPermission(PATH_VISTA, "formulario_registro", "select_estado") && (
            <div className="w-[100px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Estado</label>
              <select value={formData.estado} onChange={e => setFormData({ ...formData, estado: e.target.value })} className="w-full h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal">
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>
          )}

          {((!editingId && hasPermission(PATH_VISTA, "formulario_registro", "btn_registrar")) ||
            (editingId && hasPermission(PATH_VISTA, "formulario_registro", "btn_actualizar"))) && (
              <button type="submit" className={`h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition`}>
                {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
              </button>
            )}

          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setFormData({ nombre: '', rut: '', estado: 'ACTIVO' }) }} className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded text-etiqueta text-tinta-secundaria flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition">
              <X size={13} /> Cancelar
            </button>
          )}
        </form>
      )}

      {hasPermission(PATH_VISTA, "barra_busqueda") && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
          {hasPermission(PATH_VISTA, "barra_busqueda", "input_buscar") && (
            <div className="relative w-60">
              <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2] dark:focus:border-[#2383C2]" placeholder="Buscar por nombre o rut..." />
            </div>
          )}
        </div>
      )}

      {hasPermission(PATH_VISTA, "tabla_datos") && (
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-secundario border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-tinta-secundaria uppercase text-pequeno">
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">#</th>
                {hasPermission(PATH_VISTA, "tabla_datos", "col_nombre") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Nombre</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_rut") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">RUT</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Estado</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Registrado por</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Fecha</th>}
                <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vacunatorioFiltrados.map((l, index) => (
                <tr key={l.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                  <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria text-etiqueta text-center">{index + 1}</td>
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_nombre") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-principal">{l.nombre}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_rut") && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">
                      <div className="flex items-center justify-between gap-2 group">
                        <span>{l.rut}</span>
                        <button 
                          onClick={() => copiarTexto(l.rut, "RUT")} 
                          title="Copiar RUT" 
                          className="text-tinta-atenuada opacity-60 group-hover:opacity-100 hover:text-[#2383C2] dark:hover:text-[#2383C2] transition shrink-0"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <span className={`text-pequeno px-1.5 py-0.2 rounded-full uppercase ${l.estado === 'INACTIVO' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'}`}>
                        {l.estado || 'ACTIVO'}
                      </span>
                    </td>
                  )}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">{l.registradoPor || 'N/A'}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">{formatearFecha(l.fechaRegistro)}</td>}

                  <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                    <div className="flex justify-center gap-2">
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_log") && (
                        <button onClick={() => abrirHistorialLogs(l)} title="Ver Historial / Logs" className="text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] transition">
                          <History size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_editar") && (
                        <button onClick={() => iniciarEdicion(l)} title="Editar" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition">
                          <Pencil size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_eliminar") && (
                        <button onClick={() => handleDelete(l.id)} title="Eliminar" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div 
        className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          showLogModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setShowLogModal(false)}
      />

      <aside 
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 ease-in-out text-secundario ${
          showLogModal ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/80 dark:bg-gray-900/80 shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 rounded-md bg-[#2383C2]/10 dark:bg-[#2383C2]/20 text-[#2383C2]">
              <History size={16} />
            </div>
            <div className="truncate">
              <h3 className="text-subtitulo text-tinta-principal truncate">
                Historial de cambios
              </h3>
              <p className="text-pequeno text-tinta-secundaria truncate">
                {selectedLabForLog?.nombre}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-pequeno bg-gray-200 dark:bg-gray-700 text-tinta-secundaria px-2 py-0.5 rounded-full">
              {logsList.length} logs
            </span>
            <button 
              onClick={() => setShowLogModal(false)} 
              className="p-1 rounded-md text-tinta-atenuada hover:text-tinta-principal hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center h-48 text-tinta-secundaria">
              <div className="w-6 h-6 border-2 border-[#2383C2] border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-pequeno">Cargando historial...</p>
            </div>
          ) : logsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-tinta-atenuada text-center px-4">
              <History size={32} className="mb-2 opacity-30" />
              <p className="text-secundario">Sin registros</p>
              <p className="text-pequeno">No hay actividad documentada para este vacunatorio.</p>
            </div>
          ) : (
            logsList.map((log) => (
              <div key={log.id} className="p-3 border border-gray-200 dark:border-gray-700/80 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 text-pequeno space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`px-2 py-0.5 rounded text-pequeno uppercase tracking-wider ${
                    log.accion === 'CREACION' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                    log.accion === 'EDICION' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' :
                    'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                  }`}>
                    {log.accion}
                  </span>
                  <span className="text-tinta-atenuada text-pequeno tabular-nums">
                    {formatearFecha(log.fecha)}
                  </span>
                </div>

                <p className="text-tinta-principal text-etiqueta">
                  Usuario: <span className="text-tinta-secundaria">{log.usuario}</span>
                </p>

                <div className="text-tinta-secundaria bg-white dark:bg-gray-800 p-2 rounded border border-gray-200/80 dark:border-gray-700 text-pequeno">
                  {log.accion === 'CREACION' && (
                    <div className="space-y-1">
                      <p><strong className="text-tinta-secundaria">Nombre:</strong> {log.detalles?.nombre}</p>
                      <p><strong className="text-tinta-secundaria">RUT:</strong> {log.detalles?.rut}</p>
                      <p><strong className="text-tinta-secundaria">Estado:</strong> {log.detalles?.estado}</p>
                    </div>
                  )}

                  {log.accion === 'EDICION' && (
                    <ul className="space-y-1">
                      {log.detalles?.nombreAnterior !== log.detalles?.nombreNuevo && (
                        <li className="flex flex-col gap-0.5">
                          <span className="text-tinta-atenuada text-pequeno">Nombre</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-red-500 dark:text-red-400">{log.detalles?.nombreAnterior}</span>
                            <span className="text-tinta-atenuada">→</span>
                            <span className="text-green-600 dark:text-green-400">{log.detalles?.nombreNuevo}</span>
                          </div>
                        </li>
                      )}
                      {log.detalles?.rutAnterior !== log.detalles?.rutNuevo && (
                        <li className="flex flex-col gap-0.5">
                          <span className="text-tinta-atenuada text-pequeno">RUT</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-red-500 dark:text-red-400">{log.detalles?.rutAnterior}</span>
                            <span className="text-tinta-atenuada">→</span>
                            <span className="text-green-600 dark:text-green-400">{log.detalles?.rutNuevo}</span>
                          </div>
                        </li>
                      )}
                      {log.detalles?.estadoAnterior !== log.detalles?.estadoNuevo && (
                        <li className="flex flex-col gap-0.5">
                          <span className="text-tinta-atenuada text-pequeno">Estado</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-red-500 dark:text-red-400">{log.detalles?.estadoAnterior}</span>
                            <span className="text-tinta-atenuada">→</span>
                            <span className="text-green-600 dark:text-green-400">{log.detalles?.estadoNuevo}</span>
                          </div>
                        </li>
                      )}
                    </ul>
                  )}

                  {log.accion === 'ELIMINACION' && (
                    <p className="text-red-500 dark:text-red-400">
                      Registro eliminado ({log.detalles?.nombre} - {log.detalles?.rut})
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900/80 shrink-0">
          <button 
            onClick={() => setShowLogModal(false)} 
            className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-tinta-principal rounded text-pequeno transition"
          >
            Cerrar
          </button>
        </div>
      </aside>
    </div>
  );
};

export default EmpresasVacunatorio;