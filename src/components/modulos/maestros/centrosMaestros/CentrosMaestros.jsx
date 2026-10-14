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
import { Building2, Plus, Trash2, Search, Pencil, Save, X, History, Settings, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useToast } from '../../../../context/ToastContext';
import { unidadesEnTransitoCentro } from '../../bodega/shared/bodegaApi';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import Spinner from '../../../ui/Spinner';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './CentrosMaestrosDrawers';

// "Usar en gestiones": el centro se ofrece en el selector de las gestiones
// de Implantes y Consignación (CentroSelect). Sin la marca (centros
// anteriores a ella) cuenta como sí. Todos los centros activos sirven como
// centro de costo de un usuario (Administración → Usuarios).
const FORM_VACIO = { nombre: '', comentario: '', estado: 'ACTIVO', usarEnGestiones: true };
const usaEnGestiones = (c) => c?.usarEnGestiones !== false;
const MENSAJE_CENTRO_CON_TRANSITO = 'Este centro tiene stock en tránsito en Bodega, inactívalo en vez de borrarlo.';

const CentrosMaestros = () => {
  // Viene del catalogosStore (lectura única por sesión, compartida con los
  // selects/autocompletados). Las escrituras de esta pantalla se reflejan con
  // upsertLocal/removeLocal; "Actualizar" trae los cambios de otros usuarios.
  const { datos: centrosCatalogo, refrescar: refrescarCentros } = useCatalogo('centros');
  const centros = useMemo(() => [...centrosCatalogo].sort(ordenarPor('fechaRegistro')), [centrosCatalogo]);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [selectedCentroForLog, setSelectedCentroForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/maestros/centrosMaestros";
  const COL_BASE = "maestros_centros";

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

  const registrarLog = async (centroId, accion, detalles) => {
    try {
      const logsSubcollectionRef = collection(db, COL_BASE, centroId, "logs");
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
    if (!formData.nombre.trim()) {
      return showToast("El nombre del centro es obligatorio", "error");
    }

    const nombreTrimmed = formData.nombre.trim().toLowerCase();

    const existeNombre = centros.some(c =>
      c.nombre.trim().toLowerCase() === nombreTrimmed && c.id !== editingId
    );
    if (existeNombre) {
      return showToast("Ya existe un centro registrado con este Nombre", "error");
    }

    setCargando(true);
    try {
      if (editingId) {
        const centroExistente = centros.find(c => c.id === editingId);

        const dataAEnviar = {
          ...formData,
          fechaRegistro: centroExistente?.fechaRegistro || new Date(),
          registradoPor: centroExistente?.registradoPor || userData?.nombreCompleto || 'Usuario'
        };

        await updateDoc(doc(db, COL_BASE, editingId), dataAEnviar);
        upsertLocal('centros', editingId, dataAEnviar);

        await registrarLog(editingId, 'EDICION', {
          nombreAnterior: centroExistente?.nombre,
          nombreNuevo: formData.nombre,
          comentarioAnterior: centroExistente?.comentario,
          comentarioNuevo: formData.comentario,
          estadoAnterior: centroExistente?.estado,
          estadoNuevo: formData.estado,
          usarEnGestionesAnterior: usaEnGestiones(centroExistente),
          usarEnGestionesNuevo: formData.usarEnGestiones
        });

        showToast("Centro actualizado correctamente", "success");
      } else {
        const dataAEnviar = {
          ...formData,
          fechaRegistro: new Date(),
          registradoPor: userData?.nombreCompleto || 'Usuario'
        };

        const docRef = await addDoc(collection(db, COL_BASE), dataAEnviar);
        upsertLocal('centros', docRef.id, dataAEnviar);

        await registrarLog(docRef.id, 'CREACION', {
          nombre: formData.nombre,
          comentario: formData.comentario,
          estado: formData.estado,
          usarEnGestiones: formData.usarEnGestiones
        });

        showToast("Centro registrado correctamente", "success");
      }
      setFormData(FORM_VACIO);
      setEditingId(null);
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const handleDelete = (id) => {
    const centroAEliminar = centros.find(c => c.id === id);

    confirmAction(
      "Eliminar Centro",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          // Las reglas no dejan borrar un centro con stock en tránsito en
          // Bodega; se avisa antes (sin dejar el log de ELIMINACION).
          if (await unidadesEnTransitoCentro(id).catch(() => 0) > 0) {
            showToast(MENSAJE_CENTRO_CON_TRANSITO, "error");
            return;
          }
          await registrarLog(id, 'ELIMINACION', {
            nombre: centroAEliminar?.nombre || ''
          });

          await deleteDoc(doc(db, COL_BASE, id));
          removeLocal('centros', id);

          showToast("Centro eliminado correctamente", "info");
        } catch (error) {
          showToast(error?.code === 'permission-denied' ? MENSAJE_CENTRO_CON_TRANSITO : "Error al eliminar", "error");
        }
      }
    );
  };

  const iniciarEdicion = (c) => {
    setEditingId(c.id);
    setFormData({
      nombre: c.nombre,
      comentario: c.comentario || '',
      estado: c.estado || 'ACTIVO',
      usarEnGestiones: usaEnGestiones(c)
    });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setFormData(FORM_VACIO);
  };

  const abrirHistorialLogs = async (centro) => {
    setSelectedCentroForLog(centro);
    setShowLogDrawer(true);
    setLoadingLogs(true);

    try {
      const q = query(
        collection(db, COL_BASE, centro.id, "logs"),
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
    if (centros.length === 0) {
      return showToast("No hay datos para exportar", "error");
    }

    const dataExportar = centros.map(c => ({
      NOMBRE: c.nombre || '',
      COMENTARIO: c.comentario || '',
      ESTADO: c.estado || 'ACTIVO',
      USAR_EN_GESTIONES: usaEnGestiones(c) ? 'SI' : 'NO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Centros");
    XLSX.writeFile(workbook, `centros_maestros_${new Date().toISOString().slice(0,10)}.xlsx`);

    showToast("Archivo exportado correctamente", "success");
  };

  const handleDescargarPlantilla = () => {
    const headers = ["NOMBRE", "COMENTARIO", "ESTADO"];
    const ejemplo = ["Área de Urgencias", "Unidad principal", "ACTIVO"];

    const csvContent = "\uFEFF" + [headers.join(";"), ejemplo.join(";")].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_importacion_centros.csv");
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

      const registrosNuevos = filtrarDuplicados(registros);

      if (registrosNuevos.length === 0) {
        throw new Error("Todos los registros del archivo ya existen (Nombre duplicado)");
      }

      await guardarRegistrosMasivos(registrosNuevos);
      await refrescarCentros();

      const omitidos = registros.length - registrosNuevos.length;
      const mensaje = omitidos > 0
        ? `Se importaron ${registrosNuevos.length} registros con éxito (${omitidos} omitidos por duplicado)`
        : `Se importaron ${registrosNuevos.length} registros con éxito`;

      showToast(mensaje, "success");
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

      const nombre = String(getVal('NOMBRE') || '').trim();
      const comentario = String(getVal('COMENTARIO') || '').trim();
      const estadoRaw = String(getVal('ESTADO') || '').trim().toUpperCase();
      const estado = estadoRaw === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';
      // Columna opcional; vacía = sí.
      const usarEnGestiones = !['NO', 'N', 'FALSE', '0'].includes(String(getVal('USAR_EN_GESTIONES') || '').trim().toUpperCase());

      if (nombre) {
        mapeados.push({ nombre, comentario, estado, usarEnGestiones });
      }
    }

    return mapeados;
  };

  const filtrarDuplicados = (registros) => {
    const nombresExistentes = new Set(centros.map(c => c.nombre.trim().toLowerCase()));
    const nombresVistos = new Set();
    const resultado = [];

    for (const item of registros) {
      const nombreKey = item.nombre.trim().toLowerCase();
      if (
        nombresExistentes.has(nombreKey) ||
        nombresVistos.has(nombreKey)
      ) {
        continue;
      }
      nombresVistos.add(nombreKey);
      resultado.push(item);
    }

    return resultado;
  };

  const guardarRegistrosMasivos = async (registros) => {
    const BATCH_SIZE = 250;
    let index = 0;

    while (index < registros.length) {
      const chunk = registros.slice(index, index + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const centroRef = doc(collection(db, COL_BASE));
        batch.set(centroRef, {
          nombre: item.nombre,
          comentario: item.comentario,
          estado: item.estado,
          usarEnGestiones: item.usarEnGestiones,
          registradoPor: userData?.nombreCompleto || 'Importación Masiva',
          fechaRegistro: new Date()
        });

        const logRef = doc(collection(db, COL_BASE, centroRef.id, "logs"));
        batch.set(logRef, {
          accion: 'CREACION_MASIVA',
          detalles: {
            nombre: item.nombre,
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

  const centrosFiltrados = centros.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.comentario && c.comentario.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Procesando...</h3>
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <Building2 size={14} className="text-[#2383C2]" />
          {editingId ? "EDITAR CENTRO" : "REGISTRO DE CENTROS"}
        </h2>

        <div className="flex items-center gap-1">
          <button
            onClick={refrescarCentros}
            className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            title="Actualizar (traer cambios de otros usuarios)"
          >
            <RefreshCw size={15} />
          </button>
          {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
            <button
              onClick={handleAbrirConfiguracion}
              className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              title="Configuración de Centros (Importar/Exportar)"
            >
              <Settings size={15} />
            </button>
          )}
        </div>
      </div>

      {hasPermission(PATH_VISTA, "formulario_registro") && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          {hasPermission(PATH_VISTA, "formulario_registro", "input_nombre") && (
            <div className="w-[240px]">
              <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Nombre del Centro / Área</label>
              <input required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] dark:focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" placeholder="Ej: Área de Urgencias" />
            </div>
          )}

          {hasPermission(PATH_VISTA, "formulario_registro", "input_comentario") && (
            <div className="w-[220px]">
              <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Comentario</label>
              <input value={formData.comentario} onChange={e => setFormData({ ...formData, comentario: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] dark:focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" placeholder="Ej: Nota opcional" />
            </div>
          )}

          {editingId && hasPermission(PATH_VISTA, "formulario_registro", "select_estado") && (
            <div className="w-[90px]">
              <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Estado</label>
              <select value={formData.estado} onChange={e => setFormData({ ...formData, estado: e.target.value })} className="w-full h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>
          )}

          <label className="h-7 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 cursor-pointer select-none" title="Si está marcado, el centro aparece en el selector de las gestiones de Implantes y Consignación. Como centro de costo de usuarios se pueden usar todos los centros activos.">
            <input type="checkbox" checked={formData.usarEnGestiones} onChange={e => setFormData({ ...formData, usarEnGestiones: e.target.checked })} className="accent-[#2383C2]" />
            Usar en gestiones
          </label>

          {((!editingId && hasPermission(PATH_VISTA, "formulario_registro", "btn_registrar")) ||
            (editingId && hasPermission(PATH_VISTA, "formulario_registro", "btn_actualizar"))) && (
              <button type="submit" className={`h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition`}>
                {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
              </button>
            )}

          {editingId && (
            <button type="button" onClick={cancelarEdicion} className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded font-bold text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition">
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
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] dark:focus:border-[#2383C2]" placeholder="Buscar por nombre, comentario..." />
            </div>
          )}
        </div>
      )}

      {hasPermission(PATH_VISTA, "tabla_datos") && (
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">#</th>
                {hasPermission(PATH_VISTA, "tabla_datos", "col_nombre") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Nombre del Centro</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_comentario") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Comentario</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Estado</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Registrado por</th>}
                {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Fecha</th>}
                <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {centrosFiltrados.map((c, index) => (
                <tr key={c.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                  <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 font-bold text-center">{index + 1}</td>
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_nombre") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium">
                    {c.nombre}
                    {!usaEnGestiones(c) && <span title="No se ofrece en las gestiones de Implantes y Consignación (sí como centro de costo de usuarios)" className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Solo usuarios</span>}
                  </td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_comentario") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400">{c.comentario || '-'}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_estado") && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${c.estado === 'INACTIVO' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'}`}>
                        {c.estado || 'ACTIVO'}
                      </span>
                    </td>
                  )}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_registrador") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400">{c.registradoPor || 'N/A'}</td>}
                  {hasPermission(PATH_VISTA, "tabla_datos", "col_fecha") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400">{formatearFecha(c.fechaRegistro)}</td>}

                  <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                    <div className="flex justify-center gap-2">
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_log") && (
                        <button onClick={() => abrirHistorialLogs(c)} title="Ver Historial / Logs" className="text-gray-500 hover:text-[#2383C2] dark:hover:text-[#2383C2] transition">
                          <History size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_editar") && (
                        <button onClick={() => iniciarEdicion(c)} title="Editar" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition">
                          <Pencil size={13} />
                        </button>
                      )}
                      {hasPermission(PATH_VISTA, "tabla_datos", "action_eliminar") && (
                        <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
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
        selectedLab={selectedCentroForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
        formatearFecha={formatearFecha}
      />

      <ConfigDrawer
        show={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        totalLaboratorios={centros.length}
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

export default CentrosMaestros;