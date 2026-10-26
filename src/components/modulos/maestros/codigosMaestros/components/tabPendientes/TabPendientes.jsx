import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { useCatalogo } from '../../../../../../hooks/useCatalogo';
import { ordenarPor } from '../../../../../../stores/catalogosStore';
import { Clock, Plus, Trash2, Search, Save, X, ChevronDown, History, Settings, Tag, RotateCcw, Copy, Check } from 'lucide-react';
import { useToast } from '../../../../../../context/ToastContext';
import { useModal } from '../../../../../../context/ModalContext';
import { useUser } from '../../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../../ui/ManijaRedimension';
import { ThRelleno, TdRelleno } from '../../../../../ui/ThRedimensionable';
import Spinner from '../../../../../ui/Spinner';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './TabPendientesDrawers';
import AsignarCodigoDrawer from './AsignarCodigoDrawer';
import { useImportExportPendientes } from './useImportExportPendientes';
import { normalizarDescriptorEmpresa } from './normalizarDescriptorEmpresa';
import { CLASES_CODIGO } from '../../clasesCodigo';

const COL_BASE = "maestros_codigos";

// Granularidad por columna: `col_<key>` en la sección 'tabla_datos' del mapa de
// permisos (ver useColumnasPermitidas).
const COLUMNAS = [
  { key: 'numero', label: '#', ancho: 40, min: 28, align: 'center' },
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 80 },
  { key: 'descEmpresa', label: 'Desc. Empresa', ancho: 200, min: 80 },
  { key: 'empresa', label: 'Empresa', ancho: 200, min: 80 },
  { key: 'tipo', label: 'Tipo', ancho: 100, min: 60 },
  { key: 'segmento', label: 'Segmento', ancho: 110, min: 60 },
  { key: 'clase', label: 'Clase', ancho: 90, min: 60 },
  { key: 'descAuto', label: 'Desc. Auto', ancho: 250, min: 80 },
  { key: 'precioNeto', label: 'Precio Neto', ancho: 100, min: 70 },
  { key: 'copiar', label: 'Copiar', ancho: 50, min: 40, align: 'center' },
  { key: 'estado', label: 'Estado', ancho: 100, min: 70 },
  { key: 'registradoPor', label: 'Registrado por', ancho: 100, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 130, min: 90 },
  { key: 'acciones', label: 'Acciones', ancho: 90, min: 70, align: 'center' }
];

// `rutaVista`: la pestaña en Maestros → Códigos (por defecto) o en
// Implantes → Códigos; los permisos granulares son los de esa ruta.
const TabPendientes = ({ rutaVista = '/maestros/codigosMaestros/pendientes' } = {}) => {
  // Pendientes = códigos sin `codigo`, filtrados en memoria desde el
  // catalogosStore (el mismo listener compartido de maestros_codigos que usan
  // Vista General y los autocompletados). Antes esta pestaña abría su propio
  // listener sobre toda la colección (~3.000 lecturas por entrada). Sigue en
  // tiempo real: el store se actualiza con cada cambio.
  const { datos: codigosCatalogo } = useCatalogo('codigos');
  const registros = useMemo(
    () => codigosCatalogo
      .filter(item => !item.codigo || String(item.codigo).trim() === '')
      .sort(ordenarPor('fechaRegistro', 'desc')),
    [codigosCatalogo]
  );
  // Empresas desde el catalogosStore (lectura única por sesión, compartida).
  // Sin las que no tienen nombre, igual que el orderBy('nombre') original.
  const { datos: empresasCatalogo } = useCatalogo('empresas');
  const empresasMaestro = useMemo(
    () => empresasCatalogo.filter(e => e.nombre).sort(ordenarPor('nombre')),
    [empresasCatalogo]
  );
  const [formData, setFormData] = useState({
    referencia: '',
    descriptorEmpresa: '',
    empresa: '',
    tipo: '',
    segmento: '',
    clase: '',
    descriptorAuto: '',
    precioNeto: '',
    cx: '',
    observacion: ''
  });
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);

  // Estado para controlar la visibilidad del desplegable de empresas
  const [mostrarDropdownEmpresa, setMostrarDropdownEmpresa] = useState(false);

  // Estado para el drawer de historial / logs
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [selectedPendienteForLog, setSelectedPendienteForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Estados para el drawer de asignar código definitivo
  const [showAsignarCodigoDrawer, setShowAsignarCodigoDrawer] = useState(false);
  const [selectedItemParaCodigo, setSelectedItemParaCodigo] = useState(null);

  // Fila cuyo ícono de copiar muestra el check (feedback temporal)
  const [copiadoId, setCopiadoId] = useState(null);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = rutaVista;

  // Acciones (claves en componentMaps/maestros.js). Sin la acción, el botón
  // no se muestra y el handler no hace nada.
  const puede = {
    registrar: hasPermission(PATH_VISTA, "formulario_registro", "btn_registrar"),
    asignarCodigo: hasPermission(PATH_VISTA, "tabla_datos", "action_asignar_codigo"),
    eliminar: hasPermission(PATH_VISTA, "tabla_datos", "action_eliminar"),
    exportar: hasPermission(PATH_VISTA, "btn_configuracion", "btn_exportar"),
    plantilla: hasPermission(PATH_VISTA, "btn_configuracion", "btn_descargar_plantilla"),
    importar: hasPermission(PATH_VISTA, "btn_configuracion", "btn_importar"),
  };

  // Toda la lógica de importar / exportar / plantilla vive en este hook
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const {
    showConfigDrawer,
    setShowConfigDrawer,
    importFile,
    setImportFile,
    importing,
    handleAbrirConfiguracion,
    handleExportarDatos,
    handleDescargarPlantilla,
    handleEjecutarImportacion
  } = useImportExportPendientes({ registros, userData, showToast, colBase: COL_BASE, ver });


  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(columnasVisibles);

  const formatearMiles = (valor) => {
    if (valor === null || valor === undefined || valor === '') return '';
    const num = valor.toString().replace(/\D/g, '');
    if (num === '') return '';
    return new Intl.NumberFormat('es-ES').format(num);
  };

  useEffect(() => {
    const parts = [formData.referencia, formData.descriptorEmpresa].filter(Boolean);
    if (parts.length > 0) {
      setFormData(prev => ({ ...prev, descriptorAuto: parts.join(' ').toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, descriptorAuto: '' }));
    }
  }, [formData.referencia, formData.descriptorEmpresa]);

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

  const registrarLog = async (pendienteId, accion, detalles) => {
    try {
      const logsSubcollectionRef = collection(db, COL_BASE, pendienteId, "logs");
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
    if (!puede.registrar) return;
    if (!formData.referencia.trim() || !formData.empresa.trim()) {
      return showToast("Referencia y Empresa son obligatorios", "error");
    }

    setCargando(true);
    try {
      const dataUpper = Object.keys(formData).reduce((acc, key) => {
        acc[key] = typeof formData[key] === 'string' ? formData[key].toUpperCase() : formData[key];
        return acc;
      }, {});

      const precioLimpio = parseFloat(dataUpper.precioNeto.toString().replace(/\./g, '')) || 0;

      const dataAEnviar = {
        ...dataUpper,
        precioNeto: precioLimpio,
        codigo: '',
        fechaRegistro: serverTimestamp(),
        registradoPor: userData?.nombreCompleto || 'Usuario'
      };

      const docRef = await addDoc(collection(db, COL_BASE), dataAEnviar);

      await registrarLog(docRef.id, 'CREACION', {
        referencia: dataUpper.referencia,
        descriptorEmpresa: dataUpper.descriptorEmpresa,
        empresa: dataUpper.empresa,
        tipo: dataUpper.tipo,
        segmento: dataUpper.segmento,
        clase: dataUpper.clase,
        precioNeto: precioLimpio,
        cx: dataUpper.cx,
        observacion: dataUpper.observacion,
        metodoRegistro: 'MANUAL'
      });

      showToast("Registro pendiente guardado correctamente", "success");

      setFormData({
        referencia: '',
        descriptorEmpresa: '',
        empresa: '',
        tipo: '',
        segmento: '',
        clase: '',
        descriptorAuto: '',
        precioNeto: '',
        cx: '',
        observacion: ''
      });
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const handleGuardarCodigoDefinitivo = async (id, datosActualizados) => {
    if (!puede.asignarCodigo) return;
    setCargando(true);
    try {
      const precioLimpio = parseFloat(datosActualizados.precioNeto.toString().replace(/\./g, '')) || 0;
      
      const dataAEnviar = {
        ...datosActualizados,
        precioNeto: precioLimpio,
        fechaAsignacionCodigo: serverTimestamp(),
        asignadoPor: userData?.nombreCompleto || 'Usuario'
      };

      await updateDoc(doc(db, COL_BASE, id), dataAEnviar);
      await registrarLog(id, 'ASIGNACION_CODIGO', { codigoAsignado: datosActualizados.codigo });

      showToast("Código asignado correctamente", "success");
      setShowAsignarCodigoDrawer(false);
      setSelectedItemParaCodigo(null);
    } catch (error) {
      showToast("Error al asignar código: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const handleDelete = (id) => {
    if (!puede.eliminar) return;
    const pendienteAEliminar = registros.find(l => l.id === id);

    confirmAction(
      "Eliminar Pendiente",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          await registrarLog(id, 'ELIMINACION', {
            referencia: pendienteAEliminar?.referencia || '',
            empresa: pendienteAEliminar?.empresa || '',
            precioNeto: pendienteAEliminar?.precioNeto || 0
          });

          await deleteDoc(doc(db, COL_BASE, id));
          showToast("Registro eliminado correctamente", "info");
        } catch (error) {
          showToast("Error al eliminar", "error");
        }
      }
    );
  };

  // Copia "Desc. Auto<TAB>Precio Neto" para pegar en dos celdas de Excel.
  // El precio va como número limpio (sin $ ni separador de miles).
  const handleCopiarFila = async (item) => {
    const descAuto = String(item.descriptorAuto || '').replace(/[\t\r\n]+/g, ' ').trim();
    const precio = Number(item.precioNeto) || 0;
    try {
      await navigator.clipboard.writeText(`${descAuto}\t${precio}`);
      setCopiadoId(item.id);
      setTimeout(() => setCopiadoId(actual => (actual === item.id ? null : actual)), 1500);
    } catch (error) {
      showToast("No se pudo copiar al portapapeles", "error");
    }
  };

  const abrirHistorialLogs = async (item) => {
    setSelectedPendienteForLog(item);
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

  const empresasFiltradasLista = empresasMaestro.filter(emp =>
    emp.nombre.toLowerCase().includes((formData.empresa || '').toLowerCase())
  );

  const registrosFiltrados = registros.filter(item =>
    (item.referencia && item.referencia.toLowerCase().includes(busqueda.toLowerCase())) ||
    (item.empresa && item.empresa.toLowerCase().includes(busqueda.toLowerCase())) ||
    (item.descriptorEmpresa && item.descriptorEmpresa.toLowerCase().includes(busqueda.toLowerCase()))
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

      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <Clock size={14} className="text-[#2383C2]" />
          REGISTROS SIN CÓDIGO (PENDIENTES)
        </h2>

        {hasPermission(PATH_VISTA, "btn_configuracion") && (
          <button
            onClick={handleAbrirConfiguracion}
            className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            title="Configuración de Pendientes (Importar/Exportar)"
          >
            <Settings size={15} />
          </button>
        )}
      </div>

      {/* Formulario (Exclusivo para creación de nuevos registros) */}
      {hasPermission(PATH_VISTA, "formulario_registro") && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          <div className="w-[150px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Referencia</label>
            <input required value={formData.referencia} onChange={e => setFormData({ ...formData, referencia: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" placeholder="Referencia" />
          </div>

          <div className="w-[170px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Descriptor Empresa</label>
            <input
              value={formData.descriptorEmpresa}
              onChange={e => setFormData({ ...formData, descriptorEmpresa: e.target.value })}
              onBlur={e => setFormData(prev => ({ ...prev, descriptorEmpresa: normalizarDescriptorEmpresa(e.target.value) }))}
              className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              placeholder="Descriptor empresa"
            />
          </div>

          {/* Campo Empresa Autocompletable / Buscador */}
          <div className="w-[160px] relative">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Empresa</label>
            <div className="relative flex items-center">
              <input
                required
                type="text"
                value={formData.empresa}
                onChange={e => {
                  setFormData({ ...formData, empresa: e.target.value.toUpperCase() });
                  setMostrarDropdownEmpresa(true);
                }}
                onFocus={() => setMostrarDropdownEmpresa(true)}
                onBlur={() => setTimeout(() => setMostrarDropdownEmpresa(false), 200)}
                className="w-full h-7 pl-2 pr-6 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
                placeholder="Buscar empresa..."
              />
              <ChevronDown size={12} className="absolute right-2 text-gray-400 pointer-events-none" />
            </div>

            {/* Lista Desplegable de Autocompletado */}
            {mostrarDropdownEmpresa && (
              <ul className="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded shadow-lg">
                {empresasFiltradasLista.length > 0 ? (
                  empresasFiltradasLista.map(emp => (
                    <li
                      key={emp.id}
                      onMouseDown={() => {
                        setFormData({ ...formData, empresa: emp.nombre.toUpperCase() });
                        setMostrarDropdownEmpresa(false);
                      }}
                      className="px-2 py-1.5 hover:bg-[#2383C2]/10 dark:hover:bg-gray-800 cursor-pointer text-gray-800 dark:text-gray-100 text-[11px] uppercase truncate"
                    >
                      {emp.nombre}
                    </li>
                  ))
                ) : (
                  <li className="px-2 py-1.5 text-gray-400 text-[10px] italic">No hay resultados</li>
                )}
              </ul>
            )}
          </div>

          <div className="w-[130px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Tipo</label>
            <select value={formData.tipo} onChange={e => setFormData({ ...formData, tipo: e.target.value })} className="w-full h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
              <option value="">Seleccione...</option>
              <option value="COTIZACION">COTIZACION</option>
              <option value="CONSIGNACION">CONSIGNACION</option>
            </select>
          </div>

          <div className="w-[150px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Segmento</label>
            <select value={formData.segmento} onChange={e => setFormData({ ...formData, segmento: e.target.value })} className="w-full h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
              <option value="">Seleccione...</option>
              <option value="IMPLANTES">IMPLANTES</option>
              <option value="CONSIGNACION">CONSIGNACION</option>
              <option value="HEMODINAMIA">HEMODINAMIA</option>
            </select>
          </div>

          <div className="w-[130px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Clase</label>
            <select value={formData.clase} onChange={e => setFormData({ ...formData, clase: e.target.value })} className="w-full h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
              <option value="">Seleccione...</option>
              {CLASES_CODIGO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="w-[190px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Descriptor Auto (Maestro)</label>
            <input readOnly value={formData.descriptorAuto} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 outline-none" placeholder="Autogenerado" />
          </div>

          <div className="w-[110px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Precio Neto</label>
            <input
              type="text"
              value={formData.precioNeto}
              onChange={e => {
                const valorRaw = e.target.value.replace(/\D/g, '');
                setFormData({ ...formData, precioNeto: formatearMiles(valorRaw) });
              }}
              className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              placeholder="0"
            />
          </div>

          <div className="w-[110px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">CX</label>
            <input value={formData.cx} onChange={e => setFormData({ ...formData, cx: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" placeholder="CX" />
          </div>

          <div className="w-[180px]">
            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Observación</label>
            <input value={formData.observacion} onChange={e => setFormData({ ...formData, observacion: e.target.value })} className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" placeholder="Observación" />
          </div>

          <div className="flex items-center gap-1.5 mt-1">
            {puede.registrar && (
            <button type="submit" className="h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 bg-[#2383C2] hover:bg-[#369BCE] text-white transition">
              <Plus size={13} /> Registrar
            </button>
            )}
          </div>
        </form>
      )}

      {/* Barra de Búsqueda */}
      {hasPermission(PATH_VISTA, "barra_busqueda") && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
          <div className="relative w-60">
            <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]" placeholder="Buscar por referencia o empresa..." />
          </div>
        </div>
      )}

      {/* Tabla */}
      {hasPermission(PATH_VISTA, "tabla_datos") && (
        <div className="flex-grow min-h-0 overflow-auto relative">
          <div className="sticky top-0 z-20 flex justify-end px-1 py-0.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={restablecerAnchos}
              title="Restablecer ancho de columnas"
              className="flex items-center gap-1 text-[9px] font-medium text-gray-400 hover:text-[#2383C2] dark:text-gray-500 dark:hover:text-[#2383C2] transition px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800"
            >
              <RotateCcw size={10} /> Restablecer columnas
            </button>
          </div>
          <table
            className="text-left text-[11px] border-collapse"
            style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
          >
            <colgroup>
              {columnasVisibles.map(col => (
                <col key={col.key} style={{ width: anchos[col.key] }} />
              ))}
              <col />
            </colgroup>
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-[22px] z-10">
              <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                {columnasVisibles.map(col => (
                  <th
                    key={col.key}
                    className={`relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden ${col.align === 'center' ? 'text-center' : ''}`}
                    title={col.label}
                  >
                    <span className="block truncate">{col.label}</span>
                    <ManijaRedimension
                      colKey={col.key}
                      anchoActual={anchos[col.key]}
                      anchoMin={col.min}
                      onResize={handleResize}
                    />
                  </th>
                ))}
                <ThRelleno className="border-b border-gray-200 dark:border-gray-700" />
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((item, index) => (
                <tr key={item.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                  {ver('numero') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 font-bold text-center overflow-hidden text-ellipsis whitespace-nowrap">{index + 1}</td>
                  )}
                  {ver('referencia') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={item.referencia}>{item.referencia}</td>
                  )}
                  {ver('descEmpresa') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap" title={item.descriptorEmpresa}>{item.descriptorEmpresa}</td>
                  )}
                  {ver('empresa') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap" title={item.empresa}>{item.empresa}</td>
                  )}
                  {ver('tipo') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{item.tipo}</td>
                  )}
                  {ver('segmento') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{item.segmento}</td>
                  )}
                  {ver('clase') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{item.clase}</td>
                  )}
                  {ver('descAuto') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap" title={item.descriptorAuto}>{item.descriptorAuto}</td>
                  )}
                  {ver('precioNeto') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">
                      ${new Intl.NumberFormat('es-ES').format(item.precioNeto || 0)}
                    </td>
                  )}
                  {ver('copiar') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleCopiarFila(item)}
                        title={copiadoId === item.id ? "Copiado" : "Copiar Desc. Auto y Precio Neto"}
                        className={copiadoId === item.id ? "text-emerald-600 dark:text-emerald-400 transition" : "text-gray-500 hover:text-[#2383C2] dark:hover:text-[#2383C2] transition"}
                      >
                        {copiadoId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </td>
                  )}
                  {ver('estado') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center gap-1 w-max">
                        <Clock size={10} /> Sin Código
                      </span>
                    </td>
                  )}
                  {ver('registradoPor') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap" title={item.registradoPor}>{item.registradoPor || 'N/A'}</td>
                  )}
                  {ver('fecha') && (
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">{formatearFecha(item.fechaRegistro)}</td>
                  )}
                  {ver('acciones') && (
                    <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                      <div className="flex justify-center gap-2">
                        {hasPermission(PATH_VISTA, "btn_log") && (
                          <button onClick={() => abrirHistorialLogs(item)} title="Ver Historial / Logs" className="text-gray-500 hover:text-[#2383C2] dark:hover:text-[#2383C2] transition">
                            <History size={13} />
                          </button>
                        )}
                        {puede.asignarCodigo && (
                          <button
                            onClick={() => {
                              setSelectedItemParaCodigo(item);
                              setShowAsignarCodigoDrawer(true);
                            }}
                            title="Asignar Código Definitivo"
                            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 transition"
                          >
                            <Tag size={13} />
                          </button>
                        )}
                        {puede.eliminar && (
                          <button onClick={() => handleDelete(item.id)} title="Eliminar" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  <TdRelleno className="border-b border-gray-200 dark:border-gray-700/70" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DrawersOverlay
        show={showLogDrawer || showConfigDrawer || showAsignarCodigoDrawer}
        onClick={() => {
          setShowLogDrawer(false);
          setShowConfigDrawer(false);
          setShowAsignarCodigoDrawer(false);
        }}
      />

      <LogDrawer
        show={showLogDrawer}
        onClose={() => setShowLogDrawer(false)}
        selectedPendiente={selectedPendienteForLog}
        logsList={logsList}
        loadingLogs={loadingLogs}
        formatearFecha={formatearFecha}
      />

      <ConfigDrawer
        show={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        totalPendientes={registros.length}
        onExportar={puede.exportar ? handleExportarDatos : undefined}
        onDescargarPlantilla={puede.plantilla ? handleDescargarPlantilla : undefined}
        importFile={importFile}
        onSelectFile={setImportFile}
        importing={importing}
        onEjecutarImportacion={puede.importar ? handleEjecutarImportacion : undefined}
      />

      <AsignarCodigoDrawer
        show={showAsignarCodigoDrawer}
        onClose={() => {
          setShowAsignarCodigoDrawer(false);
          setSelectedItemParaCodigo(null);
        }}
        itemSeleccionado={selectedItemParaCodigo}
        empresasMaestro={empresasMaestro}
        onGuardarCodigo={handleGuardarCodigoDefinitivo}
        cargando={cargando}
      />
    </div>
  );
};

export default TabPendientes;