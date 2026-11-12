import React, { useState, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { ordenarPor, upsertLocal, removeLocal } from '../../../../stores/catalogosStore';
import { Layers, Plus, Trash2, Search, Pencil, Save, X, History, Settings, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import Spinner from '../../../ui/Spinner';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './RecargosMaestrosDrawers';

const RecargosMaestros = () => {
  // Viene del catalogosStore (lectura única por sesión, compartida con los
  // selects/autocompletados). Las escrituras de esta pantalla se reflejan con
  // upsertLocal/removeLocal; "Actualizar" trae los cambios de otros usuarios.
  const { datos: recargosCatalogo, refrescar: refrescarRecargos } = useCatalogo('recargos');
  const recargos = useMemo(() => [...recargosCatalogo].sort(ordenarPor('desde')), [recargosCatalogo]);
  const [formData, setFormData] = useState({ desde: '', hasta: '', vecesCosto: '', comentario: '', estado: 'ACTIVO' });
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [selectedRecargoForLog, setSelectedRecargoForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/maestros/recargosMaestros";
  const COL_BASE = "maestros_recargos";

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

  const formatNumber = (num) => {
    if (num === '' || num === null || isNaN(num)) return '';
    return new Intl.NumberFormat('es-CL').format(num);
  };

  const registrarLog = async (recargoId, accion, detalles) => {
    try {
      const logsSubcollectionRef = collection(db, COL_BASE, recargoId, "logs");
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
    const desdeNum = parseFloat(formData.desde);
    const hastaNum = parseFloat(formData.hasta);
    const vecesNum = parseFloat(formData.vecesCosto);

    if (isNaN(desdeNum) || isNaN(hastaNum) || isNaN(vecesNum)) {
      return showToast("Por favor, completa los campos numéricos válidos (Desde, Hasta, Veces Costo)", "error");
    }

    if (desdeNum > hastaNum) {
      return showToast("El valor 'Desde' no puede ser mayor que 'Hasta'", "error");
    }

    setCargando(true);
    try {
      if (editingId) {
        const recargoExistente = recargos.find(r => r.id === editingId);

        const dataAEnviar = {
          desde: desdeNum,
          hasta: hastaNum,
          vecesCosto: vecesNum,
          comentario: formData.comentario.trim(),
          estado: formData.estado,
          fechaRegistro: recargoExistente?.fechaRegistro || new Date(),
          registradoPor: recargoExistente?.registradoPor || userData?.nombreCompleto || 'Usuario'
        };

        await updateDoc(doc(db, COL_BASE, editingId), dataAEnviar);
        upsertLocal('recargos', editingId, dataAEnviar);

        await registrarLog(editingId, 'EDICION', {
          desdeAnterior: recargoExistente?.desde,
          desdeNuevo: desdeNum,
          hastaAnterior: recargoExistente?.hasta,
          hastaNuevo: hastaNum,
          vecesCostoAnterior: recargoExistente?.vecesCosto,
          vecesCostoNuevo: vecesNum,
          estadoAnterior: recargoExistente?.estado,
          estadoNuevo: formData.estado
        });

        showToast("Regla de recargo actualizada correctamente", "success");
      } else {
        const dataAEnviar = {
          desde: desdeNum,
          hasta: hastaNum,
          vecesCosto: vecesNum,
          comentario: formData.comentario.trim(),
          estado: formData.estado,
          fechaRegistro: new Date(),
          registradoPor: userData?.nombreCompleto || 'Usuario'
        };

        const docRef = await addDoc(collection(db, COL_BASE), dataAEnviar);
        upsertLocal('recargos', docRef.id, dataAEnviar);

        await registrarLog(docRef.id, 'CREACION', {
          desde: desdeNum,
          hasta: hastaNum,
          vecesCosto: vecesNum,
          comentario: formData.comentario,
          estado: formData.estado
        });

        showToast("Regla de recargo registrada correctamente", "success");
      }
      setFormData({ desde: '', hasta: '', vecesCosto: '', comentario: '', estado: 'ACTIVO' });
      setEditingId(null);
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const handleDelete = (id) => {
    const recargoAEliminar = recargos.find(r => r.id === id);

    confirmAction(
      "Eliminar Regla de Recargo",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          await registrarLog(id, 'ELIMINACION', {
            desde: recargoAEliminar?.desde || '',
            hasta: recargoAEliminar?.hasta || ''
          });

          await deleteDoc(doc(db, COL_BASE, id));
          removeLocal('recargos', id);
          showToast("Regla eliminada correctamente", "info");
        } catch (error) {
          showToast("Error al eliminar", "error");
        }
      }
    );
  };

  const iniciarEdicion = (r) => {
    setEditingId(r.id);
    setFormData({
      desde: r.desde,
      hasta: r.hasta,
      vecesCosto: r.vecesCosto,
      comentario: r.comentario || '',
      estado: r.estado || 'ACTIVO'
    });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setFormData({ desde: '', hasta: '', vecesCosto: '', comentario: '', estado: 'ACTIVO' });
  };

  const abrirHistorialLogs = async (recargo) => {
    setSelectedRecargoForLog(recargo);
    setShowLogDrawer(true);
    setLoadingLogs(true);

    try {
      const q = query(
        collection(db, COL_BASE, recargo.id, "logs"),
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

  const handleAbrirConfiguracion = () => { setShowConfigDrawer(true); };

  const handleExportarDatos = () => {
    if (recargos.length === 0) {
      return showToast("No hay datos para exportar", "error");
    }

    const dataExportar = recargos.map(r => ({
      DESDE: r.desde,
      HASTA: r.hasta,
      'VECES COSTO': r.vecesCosto,
      COMENTARIO: r.comentario || '',
      ESTADO: r.estado || 'ACTIVO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recargos Maestros");
    XLSX.writeFile(workbook, `recargos_maestros_${new Date().toISOString().slice(0, 10)}.xlsx`);

    showToast("Archivo exportado correctamente", "success");
  };

  const handleDescargarPlantilla = () => {
    const headers = ["DESDE", "HASTA", "VECES COSTO", "COMENTARIO", "ESTADO"];
    const ejemplo = ["0", "351", "7.5", "Rango inicial", "ACTIVO"];

    const csvContent = "\uFEFF" + [headers.join(";"), ejemplo.join(";")].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_importacion_recargos.csv");
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Plantilla descargada correctamente", "success");
  };

  const handleEjecutarImportacion = async () => {
    if (!importFile) {
      return showToast("Por favor selecciona un archivo para importar", "error");
    }

    setImporting(true);
    const fileName = importFile.name.toLowerCase();

    try {
      let registros = [];

      if (fileName.endsWith('.csv')) {
        registros = await parsearCSV(importFile);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        registros = await parsearExcel(importFile);
      } else {
        throw new Error("Formato de archivo no soportado. Usa .csv o .xlsx");
      }

      if (registros.length === 0) {
        throw new Error("El archivo no contiene registros válidos para importar");
      }

      await guardarRegistrosMasivos(registros);
      await refrescarRecargos();

      showToast(`Se importaron ${registros.length} registros con éxito`, "success");
      setImportFile(null);
      setShowConfigDrawer(false);
    } catch (error) {
      console.error("Error durante la importación:", error);
      showToast("Error al importar: " + error.message, "error");
    } finally {
      setImporting(false);
    }
  };

  const parsearCSV = (file) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          const procesados = normalizarYValidarDatos(results.data);
          resolve(procesados);
        },
        error: (err) => reject(err)
      });
    });
  };

  const parsearExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.SheetNames[0];
          const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
          const procesados = normalizarYValidarDatos(rawData);
          resolve(procesados);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const normalizarYValidarDatos = (rows) => {
    const mapeados = [];

    for (const row of rows) {
      const keys = Object.keys(row);
      const getVal = (colName) => {
        const keyMatch = keys.find(k => k.trim().toUpperCase() === colName);
        return keyMatch ? row[keyMatch] : null;
      };

      const desde = parseFloat(getVal('DESDE'));
      const hasta = parseFloat(getVal('HASTA'));
      const vecesCosto = parseFloat(getVal('VECES COSTO') || getVal('VECESCOSTO'));
      const comentario = String(getVal('COMENTARIO') || '').trim();
      const estadoRaw = String(getVal('ESTADO') || '').trim().toUpperCase();
      const estado = estadoRaw === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';

      if (!isNaN(desde) && !isNaN(hasta) && !isNaN(vecesCosto)) {
        mapeados.push({ desde, hasta, vecesCosto, comentario, estado });
      }
    }

    return mapeados;
  };

  const guardarRegistrosMasivos = async (registros) => {
    const BATCH_SIZE = 250;
    let index = 0;

    while (index < registros.length) {
      const chunk = registros.slice(index, index + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const recargoRef = doc(collection(db, COL_BASE));
        batch.set(recargoRef, {
          desde: item.desde,
          hasta: item.hasta,
          vecesCosto: item.vecesCosto,
          comentario: item.comentario,
          estado: item.estado,
          registradoPor: userData?.nombreCompleto || 'Importación Masiva',
          fechaRegistro: new Date()
        });

        const logRef = doc(collection(db, COL_BASE, recargoRef.id, "logs"));
        batch.set(logRef, {
          accion: 'CREACION_MASIVA',
          detalles: {
            desde: item.desde,
            hasta: item.hasta,
            vecesCosto: item.vecesCosto,
            comentario: item.comentario,
            estado: item.estado
          },
          usuario: userData?.nombreCompleto || 'Importación Masiva',
          usuarioEmail: userData?.email || '',
          fecha: new Date(),
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      index += BATCH_SIZE;
    }
  };

  const recargosFiltrados = recargos.filter(r =>
    String(r.desde).includes(busqueda) ||
    String(r.hasta).includes(busqueda) ||
    String(r.vecesCosto).includes(busqueda) ||
    (r.comentario && r.comentario.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-secundario">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] text-subtitulo">Procesando...</h3>
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5">
          <Layers size={14} className="text-[#2383C2]" />
          {editingId ? "Editar regla de recargo" : "Recargos maestros (veces costo)"}
        </h2>

        <div className="flex items-center gap-1">
          <button
            onClick={refrescarRecargos}
            className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            title="Actualizar (traer cambios de otros usuarios)"
          >
            <RefreshCw size={15} />
          </button>
          {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
            <button
              onClick={handleAbrirConfiguracion}
              className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              title="Configuración (Importar/Exportar)"
            >
              <Settings size={15} />
            </button>
          )}
        </div>
      </div>

      {hasPermission(PATH_VISTA, "formulario_registro") && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          {hasPermission(PATH_VISTA, "formulario_registro", "input_desde") && (
            <div className="w-[120px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Desde ($)</label>
              <input type="number" step="any" required value={formData.desde} onChange={e => setFormData({ ...formData, desde: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: 0" />
            </div>
          )}

          {hasPermission(PATH_VISTA, "formulario_registro", "input_hasta") && (
            <div className="w-[120px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Hasta ($)</label>
              <input type="number" step="any" required value={formData.hasta} onChange={e => setFormData({ ...formData, hasta: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: 351" />
            </div>
          )}

          {hasPermission(PATH_VISTA, "formulario_registro", "input_veces_costo") && (
            <div className="w-[120px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Veces Costo</label>
              <input type="number" step="0.01" required value={formData.vecesCosto} onChange={e => setFormData({ ...formData, vecesCosto: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: 7.5" />
            </div>
          )}

          {hasPermission(PATH_VISTA, "formulario_registro", "input_comentario") && (
            <div className="w-[180px]">
              <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Comentario</label>
              <input value={formData.comentario} onChange={e => setFormData({ ...formData, comentario: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal" placeholder="Ej: Opcional" />
            </div>
          )}

          {editingId && hasPermission(PATH_VISTA, "formulario_registro", "select_estado") && (
            <div className="w-[90px]">
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
            <button type="button" onClick={cancelarEdicion} className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded text-etiqueta text-tinta-secundaria flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition">
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
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]" placeholder="Buscar por valor, comentario..." />
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
                {hasPermission(PATH_VISTA, "tabla_datos", "col_desde") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Desde ($)</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_hasta") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Hasta ($)</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_veces_costo") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-center">Veces Costo</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_comentario") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Comentario</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Estado</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Registrado por</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Fecha</th>}
                <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recargosFiltrados.map((r, index) => (
                <tr key={r.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                  <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria text-etiqueta text-center">{index + 1}</td>
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_desde") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-principal">{formatNumber(r.desde)}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_hasta") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-principal">{formatNumber(r.hasta)}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_veces_costo") && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center">
                      <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 text-etiqueta rounded">
                        {r.vecesCosto} x
                      </span>
                    </td>
                  )}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_comentario") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">{r.comentario || '-'}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <span className={`text-pequeno px-1.5 py-0.2 rounded-full uppercase ${r.estado === 'INACTIVO' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'}`}>
                        {r.estado || 'ACTIVO'}
                      </span>
                    </td>
                  )}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">{r.registradoPor || 'N/A'}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">{formatearFecha(r.fechaRegistro)}</td>}

                  <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                    <div className="flex justify-center gap-2">
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_log") && (
                        <button onClick={() => abrirHistorialLogs(r)} title="Ver Historial / Logs" className="text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] transition">
                          <History size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_editar") && (
                        <button onClick={() => iniciarEdicion(r)} title="Editar" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition">
                          <Pencil size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_eliminar") && (
                        <button onClick={() => handleDelete(r.id)} title="Eliminar" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
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

      <DrawersOverlay
        show={showLogDrawer || showConfigDrawer}
        onClick={() => {
          setShowLogDrawer(false);
          setShowConfigDrawer(false);
        }}
      />

      <LogDrawer
        show={showLogDrawer}
        onClose={() => setShowLogDrawer(false)}
        selectedLab={selectedRecargoForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
        formatearFecha={formatearFecha}
      />

      <ConfigDrawer
        show={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        totalLaboratorios={recargos.length}
        onExportar={handleExportarDatos}
        onDescargarPlantilla={handleDescargarPlantilla}
        importFile={importFile}
        onSelectFile={setImportFile}
        importing={importing}
        onEjecutarImportacion={handleEjecutarImportacion}
      />
    </div>
  );
};

export default RecargosMaestros;