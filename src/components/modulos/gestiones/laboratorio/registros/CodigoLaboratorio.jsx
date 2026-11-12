import React, { useState, useEffect } from 'react';
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
import { db } from '../../../../../firebaseConfig';
import { onSnapshotVisible } from '../../../../../hooks/useVisibleSnapshot';
import { Package, Plus, Trash2, Search, Pencil, Save, X, History, Settings } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { filtrarFilasExport } from '../../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import Spinner from '../../../../ui/Spinner';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './CodigoLaboratorioDrawers';

const CodigoLaboratorio = () => {
  const [codigos, setCodigos] = useState([]);
  const [formData, setFormData] = useState({ referencia: '', codigo: '', precio: '', descripcion: '' });
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [selectedCodigoForLog, setSelectedCodigoForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/laboratorio/codigoLaboratorio";
  const COL_BASE = "laboratorio_codigos";

  useEffect(() => {
    const q = query(collection(db, COL_BASE), orderBy("referencia", "asc"));
    const unsubscribe = onSnapshotVisible(q, (snapshot) => {
      setCodigos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

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

  const registrarLog = async (codigoId, accion, detalles) => {
    try {
      const logsSubcollectionRef = collection(db, COL_BASE, codigoId, "logs");
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

  const iniciarEdicion = (item) => {
    setEditingId(item.id);
    setFormData({
      referencia: item.referencia || '',
      codigo: item.codigo || '',
      precio: item.precio || '',
      descripcion: item.descripcion || ''
    });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setFormData({ referencia: '', codigo: '', precio: '', descripcion: '' });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.referencia || !formData.codigo || !formData.precio) {
      return showToast("Referencia, código y precio son obligatorios", "error");
    }

    setCargando(true);
    const refUpper = formData.referencia.toUpperCase();
    const descUpper = formData.descripcion.toUpperCase();
    const precioNum = Number(formData.precio);

    try {
      if (editingId) {
        const codigoExistente = codigos.find(c => c.id === editingId);

        const dataAEnviar = {
          referencia: refUpper,
          codigo: formData.codigo,
          descripcion: descUpper,
          precio: precioNum
        };

        const cambios = {};
        if (codigoExistente?.referencia !== refUpper) cambios.referencia = refUpper;
        if (codigoExistente?.codigo !== formData.codigo) cambios.codigo = formData.codigo;
        if (Number(codigoExistente?.precio) !== precioNum) cambios.precio = precioNum;
        if ((codigoExistente?.descripcion || '') !== descUpper) cambios.descripcion = descUpper;

        await updateDoc(doc(db, COL_BASE, editingId), dataAEnviar);

        if (Object.keys(cambios).length > 0) {
          await registrarLog(editingId, 'EDICION', cambios);
        }

        showToast("Código actualizado correctamente", "success");
      } else {
        const dataAEnviar = {
          referencia: refUpper,
          codigo: formData.codigo,
          descripcion: descUpper,
          precio: precioNum,
          registradoPor: userData?.nombreCompleto || 'Usuario',
          fechaRegistro: new Date()
        };

        const docRef = await addDoc(collection(db, COL_BASE), dataAEnviar);

        await registrarLog(docRef.id, 'CREACION', {
          referencia: refUpper,
          codigo: formData.codigo,
          precio: precioNum,
          descripcion: descUpper
        });

        showToast("Código registrado correctamente", "success");
      }
      cancelarEdicion();
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const handleDelete = (id) => {
    const codigoAEliminar = codigos.find(c => c.id === id);

    confirmAction(
      "Eliminar Código",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          await registrarLog(id, 'ELIMINACION', {
            referencia: codigoAEliminar?.referencia || '',
            codigo: codigoAEliminar?.codigo || '',
            precio: codigoAEliminar?.precio || 0
          });

          await deleteDoc(doc(db, COL_BASE, id));

          showToast("Código eliminado correctamente", "info");
        } catch (error) {
          showToast("Error al eliminar", "error");
        }
      }
    );
  };

  const abrirHistorialLogs = async (item) => {
    setSelectedCodigoForLog(item);
    setShowLogDrawer(true);
    setLoadingLogs(true);

    try {
      const q = query(
        collection(db, COL_BASE, item.id, "logs"),
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
    if (codigos.length === 0) {
      return showToast("No hay datos para exportar", "error");
    }

    const dataExportar = codigos.map(c => ({
      REFERENCIA: c.referencia || '',
      CODIGO: c.codigo || '',
      PRECIO: c.precio || 0,
      DESCRIPCION: c.descripcion || ''
    }));

    // Solo las columnas que el usuario ve en la tabla (permisos col_*).
    const verColumna = (key) => hasPermission(PATH_VISTA, "tabla", `col_${key}`);
    const columnaDe = { REFERENCIA: 'referencia', CODIGO: 'codigo', PRECIO: 'precio', DESCRIPCION: 'descripcion' };
    const worksheet = XLSX.utils.json_to_sheet(filtrarFilasExport(dataExportar, columnaDe, verColumna));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Codigos");
    XLSX.writeFile(workbook, `codigos_laboratorio_${new Date().toISOString().slice(0,10)}.xlsx`);

    showToast("Archivo exportado correctamente", "success");
  };

  const handleDescargarPlantilla = () => {
    const headers = ["REFERENCIA", "CODIGO", "PRECIO", "DESCRIPCION"];
    const ejemplo = ["REF001", "LAB-101", "15000", "DESCRIPCION DE EJEMPLO"];

    const csvContent = "\uFEFF" + [headers.join(";"), ejemplo.join(";")].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_importacion_codigos.csv");
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

      const referencia = String(getVal('REFERENCIA') || '').trim().toUpperCase();
      const codigo = String(getVal('CODIGO') || '').trim();
      const rawPrecio = getVal('PRECIO');
      const descripcion = String(getVal('DESCRIPCION') || '').trim().toUpperCase();

      const precio = Number(String(rawPrecio || '0').replace(/[^0-9.]/g, ''));

      if (referencia && codigo && !isNaN(precio) && precio >= 0) {
        mapeados.push({
          referencia,
          codigo,
          precio,
          descripcion
        });
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
        const codigoRef = doc(collection(db, COL_BASE));
        batch.set(codigoRef, {
          referencia: item.referencia,
          codigo: item.codigo,
          precio: item.precio,
          descripcion: item.descripcion,
          registradoPor: userData?.nombreCompleto || 'Importación Masiva',
          fechaRegistro: new Date()
        });

        const logRef = doc(collection(db, COL_BASE, codigoRef.id, "logs"));
        batch.set(logRef, {
          accion: 'CREACION_MASIVA',
          detalles: {
            referencia: item.referencia,
            codigo: item.codigo,
            precio: item.precio,
            descripcion: item.descripcion
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

  const codigosFiltrados = codigos.filter(c =>
    c.referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const inputClass = "w-full h-7 px-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario outline-none focus:border-[#2383C2]";
  const labelClass = "block text-pequeno text-tinta-secundaria uppercase mb-0.5";

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
          <Package size={14} className="text-[#2383C2]" />
          {editingId ? "Editar código" : "Gestión de códigos"}
        </h2>

        {hasPermission(PATH_VISTA, "header", "btn_configuracion") && (
          <button
            onClick={handleAbrirConfiguracion}
            className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            title="Configuración de códigos (Importar/Exportar)"
          >
            <Settings size={15} />
          </button>
        )}
      </div>

      {hasPermission(PATH_VISTA, "formulario", "ver_seccion") && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          {hasPermission(PATH_VISTA, "formulario", "input_referencia") && (
            <div className="w-[120px]">
              <label className={labelClass}>Referencia</label>
              <input required value={formData.referencia} onChange={e => setFormData({ ...formData, referencia: e.target.value.toUpperCase() })} className={`${inputClass} uppercase`} />
            </div>
          )}
          {hasPermission(PATH_VISTA, "formulario", "input_codigo") && (
            <div className="w-[120px]">
              <label className={labelClass}>Código</label>
              <input required value={formData.codigo} onChange={e => setFormData({ ...formData, codigo: e.target.value })} className={inputClass} />
            </div>
          )}
          {hasPermission(PATH_VISTA, "formulario", "input_precio") && (
            <div className="w-[110px]">
              <label className={labelClass}>Precio</label>
              <input type="number" required value={formData.precio} onChange={e => setFormData({ ...formData, precio: e.target.value })} className={inputClass} />
            </div>
          )}
          {hasPermission(PATH_VISTA, "formulario", "input_descripcion") && (
            <div className="flex-1 min-w-[160px]">
              <label className={labelClass}>Descripción</label>
              <input value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value.toUpperCase() })} className={`${inputClass} uppercase`} />
            </div>
          )}
          {hasPermission(PATH_VISTA, "formulario", "btn_registrar") && (
            <button type="submit" className={`h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 whitespace-nowrap shrink-0 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition`}>
              {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
            </button>
          )}
          {editingId && hasPermission(PATH_VISTA, "formulario", "btn_cancelar") && (
            <button type="button" onClick={cancelarEdicion} className="h-7 px-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-etiqueta text-tinta-secundaria flex items-center gap-1.5 transition">
              <X size={13} /> Cancelar
            </button>
          )}
        </form>
      )}

      {hasPermission(PATH_VISTA, "busqueda", "barra_busqueda") && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
          {hasPermission(PATH_VISTA, "busqueda", "input_busqueda") && (
            <div className="relative w-60">
              <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className={`${inputClass} pl-7`}
                placeholder="Buscar código o referencia..."
              />
            </div>
          )}
        </div>
      )}

      {hasPermission(PATH_VISTA, "tabla", "ver_tabla") && (
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-secundario border-collapse table-fixed">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10 text-tinta-secundaria uppercase text-pequeno">
              <tr>
                {hasPermission(PATH_VISTA, "tabla", "col_referencia") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-[18%]">Referencia</th>}
                {hasPermission(PATH_VISTA, "tabla", "col_codigo") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-[15%]">Código</th>}
                {hasPermission(PATH_VISTA, "tabla", "col_descripcion") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-[42%]">Descripción</th>}
                {hasPermission(PATH_VISTA, "tabla", "col_precio") && <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-[15%] text-right">Precio</th>}
                {hasPermission(PATH_VISTA, "tabla", "col_acciones") && <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 w-[100px] text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {codigosFiltrados.map((c) => (
                <tr key={c.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                  {hasPermission(PATH_VISTA, "tabla", "col_referencia") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-etiqueta text-tinta-principal truncate">{c.referencia}</td>}
                  {hasPermission(PATH_VISTA, "tabla", "col_codigo") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria truncate">{c.codigo}</td>}
                  {hasPermission(PATH_VISTA, "tabla", "col_descripcion") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria truncate">{c.descripcion}</td>}
                  {hasPermission(PATH_VISTA, "tabla", "col_precio") && <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-etiqueta text-[#2383C2] text-right whitespace-nowrap">$ {Number(c.precio).toLocaleString('es-CL')}</td>}
                  {hasPermission(PATH_VISTA, "tabla", "col_acciones") && (
                    <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                      <div className="flex justify-center gap-2">
                        {hasPermission(PATH_VISTA, "tabla", "btn_log") && (
                          <button onClick={() => abrirHistorialLogs(c)} title="Ver Historial / Logs" className="text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] transition">
                            <History size={13} />
                          </button>
                        )}
                        {hasPermission(PATH_VISTA, "tabla", "btn_editar") && (
                          <button onClick={() => iniciarEdicion(c)} title="Editar" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition">
                            <Pencil size={13} />
                          </button>
                        )}
                        {hasPermission(PATH_VISTA, "tabla", "btn_eliminar") && (
                          <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
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
        selectedCodigo={selectedCodigoForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
        formatearFecha={formatearFecha}
      />

      <ConfigDrawer
        show={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        totalCodigos={codigos.length}
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

export default CodigoLaboratorio;