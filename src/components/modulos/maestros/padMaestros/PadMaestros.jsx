import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  getCountFromServer,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { cargarCatalogo } from '../../../../stores/catalogosStore';
import { useToast } from '../../../../context/ToastContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import Spinner from '../../../ui/Spinner';
import {
  Search,
  Plus,
  Trash2,
  Save,
  PackageCheck,
  RefreshCw,
  Info,
  ShieldAlert,
  Box,
  PlusCircle,
  XCircle
} from 'lucide-react';
import { claseBadgeCodigo } from '../shared/codigos/clasesCodigo';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';

const COL_PADS = "maestros_pad";
const PATH_VISTA = "/maestros/padMaestros";
const MIN_CARACTERES_BUSQUEDA = 2;
const DEBOUNCE_BUSQUEDA_MS = 300;
const MAX_RESULTADOS_COMPONENTES = 50;

// Mayúsculas, sin tildes y sin espacios sobrantes: los datos de maestros_codigos
// vienen de formularios, importaciones CSV y registros antiguos, y no siempre
// están normalizados (p. ej. clase "INSUMO", " insumos" o vacía).
const normalizarTexto = (valor) =>
  String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'receta_items' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'clase', label: 'Clase' },
  { key: 'codigoRef', label: 'Código Ref' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'referencia', label: 'Referencia' },
  { key: 'precioUnitario', label: 'Precio Un.' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'borrar', label: 'Borrar' }
];

const PadMaestros = () => {
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'receta_items', COLUMNAS_TABLA);
  const { showToast } = useToast();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const tieneAcceso = hasPermission(PATH_VISTA, "navegacion", "ver_pad_maestros");
  // Acciones sobre el PAD y su receta de ítems (claves en componentMaps/maestros.js).
  const puede = {
    registrarNuevo: hasPermission(PATH_VISTA, "acciones_pad", "btn_registrar_nuevo"),
    guardar: hasPermission(PATH_VISTA, "acciones_pad", "btn_guardar"),
    agregarItem: hasPermission(PATH_VISTA, "receta_items", "btn_agregar_item"),
    cambiarCantidad: hasPermission(PATH_VISTA, "receta_items", "input_cantidad"),
    quitarItem: hasPermission(PATH_VISTA, "receta_items", "btn_quitar_item"),
  };

  const [modo, setModo] = useState('VER_EXISTENTES');
  const [cargandoPads, setCargandoPads] = useState(false);
  const [cargandoComponentes, setCargandoComponentes] = useState(false);
  const [cargandoDetallePad, setCargandoDetallePad] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [listaPads, setListaPads] = useState([]);
  const [listaInsumosImplantes, setListaInsumosImplantes] = useState([]);

  // Catálogo de códigos con clase "PAD" en maestros_codigos, para autocompletar el nuevo registro
  const [listaCodigosPad, setListaCodigosPad] = useState([]);
  const [mostrarSugerenciasPad, setMostrarSugerenciasPad] = useState(false);

  const [busquedaPad, setBusquedaPad] = useState('');
  const [selectedPadId, setSelectedPadId] = useState('');
  const [padSeleccionado, setPadSeleccionado] = useState(null);

  const FORM_PAD_INICIAL = {
    codigo: '',
    referencia: '',
    descriptorEmpresa: '',
    empresa: '',
    clasificacion: 'RODILLA',
    tipo: 'PAD',
    segmento: 'GENERAL',
    precioNeto: 0
  };

  const [nuevoPadForm, setNuevoPadForm] = useState(FORM_PAD_INICIAL);

  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [cantidadInput, setCantidadInput] = useState(1);
  const [busquedaComponente, setBusquedaComponente] = useState('');
  const [terminoComponente, setTerminoComponente] = useState('');
  const [errorComponentes, setErrorComponentes] = useState(false);
  const [mostrarSugerenciasComponente, setMostrarSugerenciasComponente] = useState(false);
  const [itemsPad, setItemsPad] = useState([]);

  // 1. CARGAR PADS CON LECTURA DEFENSIVA DE CAMPOS DE TEXTO
  const cargarPads = async () => {
    setCargandoPads(true);
    try {
      const snap = await getDocs(collection(db, COL_PADS));

      const padsPromesas = snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        // Solo se necesita la cantidad de ítems: un conteo en el servidor evita
        // descargar la subcolección completa de cada PAD al abrir la pantalla.
        const conteo = await getCountFromServer(collection(db, COL_PADS, docSnap.id, "items_pad"));
        const itemsCount = conteo.data().count;

        // Normalizamos la referencia buscando en los distintos nombres posibles del documento
        const textoDescripcion = data.referencia || data.descriptorEmpresa || data.descripcion || data.descriptorAuto || 'SIN DESCRIPCIÓN';

        return {
          id: docSnap.id,
          ...data,
          referencia: textoDescripcion, // Asegura que 'referencia' siempre tenga un valor legible
          itemsCount,
          tieneComposicion: itemsCount > 0
        };
      });

      const padsConMetadata = await Promise.all(padsPromesas);
      setListaPads(padsConMetadata);
    } catch (error) {
      console.error("Error al cargar colección maestros_pad:", error);
      showToast("Error al sincronizar el catálogo de PADs", "error");
    } finally {
      setCargandoPads(false);
    }
  };

  // 2. CARGAR CATÁLOGO maestros_codigos (una sola lectura)
  // Se separa en memoria: clase "PAD" → autocompletado del nuevo registro;
  // clase "KIT" → se excluye (un KIT no puede ir dentro de un PAD);
  // todo lo demás → componentes que se pueden añadir al PAD. Antes se usaba
  // where("clase", "in", ["INSUMOS", "IMPLANTE", "IMPLANTES"]), que es una
  // igualdad exacta en Firestore y dejaba fuera, sin ningún error, los códigos
  // con clase vacía, en minúsculas, con espacios o escrita distinto.
  const cargarCatalogoMaestros = async () => {
    setCargandoComponentes(true);
    setErrorComponentes(false);
    try {
      // Desde el catalogosStore: sin lecturas si otra pantalla ya lo cargó.
      const codigos = await cargarCatalogo('codigos');
      const codigosPad = [];
      const componentes = [];
      codigos.forEach(item => {
        const clase = normalizarTexto(item.clase);
        if (clase === 'PAD') codigosPad.push(item);
        else if (clase !== 'KIT') componentes.push(item);
      });
      setListaCodigosPad(codigosPad);
      setListaInsumosImplantes(componentes);
    } catch (error) {
      console.error("Error al cargar catálogo maestros_codigos:", error);
      setErrorComponentes(true);
      showToast("Error al obtener catálogo de componentes", "error");
    } finally {
      setCargandoComponentes(false);
    }
  };

  useEffect(() => {
    cargarPads();
    cargarCatalogoMaestros();
  }, []);

  // Debounce del buscador de componentes
  useEffect(() => {
    const timeoutId = setTimeout(() => setTerminoComponente(busquedaComponente.trim()), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(timeoutId);
  }, [busquedaComponente]);

  const handleSelectPadExistente = async (pad) => {
    setModo('VER_EXISTENTES');
    if (selectedPadId === pad.id) return;
    setSelectedPadId(pad.id);
    setPadSeleccionado(pad);
    setCargandoDetallePad(true);

    try {
      const qSub = query(
        collection(db, COL_PADS, pad.id, "items_pad"),
        orderBy("fechaAgregado", "asc")
      );
      const snapSub = await getDocs(qSub);
      if (!snapSub.empty) {
        const itemsPrevios = snapSub.docs.map(d => ({
          subId: d.id,
          ...d.data()
        }));
        setItemsPad(itemsPrevios);
      } else {
        setItemsPad([]);
      }
    } catch (error) {
      console.error("Error al cargar subcolección items_pad:", error);
      setItemsPad([]);
    } finally {
      setCargandoDetallePad(false);
    }
  };

  const handleIniciarNuevoPad = () => {
    if (!puede.registrarNuevo) return;
    setModo('REGISTRAR_NUEVO');
    setSelectedPadId('');
    setPadSeleccionado(null);
    setItemsPad([]);
    setNuevoPadForm(FORM_PAD_INICIAL);
    setMostrarSugerenciasPad(false);
  };

  // Cancela el registro de un nuevo PAD y vuelve al modo de visualización
  const handleCancelarNuevoPad = () => {
    setModo('VER_EXISTENTES');
    setNuevoPadForm(FORM_PAD_INICIAL);
    setItemsPad([]);
    setMostrarSugerenciasPad(false);
    setSelectedComponentId('');
    setCantidadInput(1);
    setBusquedaComponente('');
  };

  // FILTRO CORREGIDO CON CONDICIONALES SEGURAS (Evita descartar registros)
  const padsFiltrados = useMemo(() => {
    if (!busquedaPad.trim()) return listaPads;
    const term = busquedaPad.toLowerCase();
    return listaPads.filter(p => {
      const cod = (p.codigo || p.id || '').toLowerCase();
      const ref = (p.referencia || p.descriptorEmpresa || p.descripcion || '').toLowerCase();
      const emp = (p.empresa || '').toLowerCase();
      const clas = (p.clasificacion || '').toLowerCase();
      return cod.includes(term) || ref.includes(term) || emp.includes(term) || clas.includes(term);
    });
  }, [listaPads, busquedaPad]);

  // Coincidencia parcial por código, referencia o descripción (OR), sin
  // distinguir mayúsculas ni tildes. Las coincidencias que empiezan por la
  // referencia o el código van primero.
  const componentesFiltrados = useMemo(() => {
    const term = normalizarTexto(terminoComponente);
    if (term.length < MIN_CARACTERES_BUSQUEDA) return [];
    const coincidencias = [];
    listaInsumosImplantes.forEach(item => {
      const cod = normalizarTexto(item.codigo);
      const ref = normalizarTexto(item.referencia);
      const campos = [cod, ref, normalizarTexto(item.descriptorEmpresa), normalizarTexto(item.descriptorAuto), normalizarTexto(item.descripcion)];
      if (!campos.some(c => c.includes(term))) return;
      const prioridad = ref.startsWith(term) || cod.startsWith(term) ? 0 : 1;
      coincidencias.push({ item, prioridad });
    });
    coincidencias.sort((a, b) => a.prioridad - b.prioridad);
    return coincidencias.map(c => c.item);
  }, [listaInsumosImplantes, terminoComponente]);

  const terminoCorto = busquedaComponente.trim().length < MIN_CARACTERES_BUSQUEDA;
  const buscandoComponente = !terminoCorto && (cargandoComponentes || busquedaComponente.trim() !== terminoComponente);

  // Sugerencias del autocompletado de "Referencia / Descripción del PAD"
  // Filtra por clase === "PAD" en maestros_codigos; si el input está vacío, muestra el listado completo
  const sugerenciasPad = useMemo(() => {
    const term = nuevoPadForm.referencia.trim().toLowerCase();
    if (!term) return listaCodigosPad;
    return listaCodigosPad.filter(item => {
      const desc = (item.descriptorEmpresa || item.referencia || item.descriptorAuto || '').toLowerCase();
      const cod = (item.codigo || '').toLowerCase();
      return desc.includes(term) || cod.includes(term);
    });
  }, [listaCodigosPad, nuevoPadForm.referencia]);

  const handleSeleccionarSugerenciaPad = (item) => {
    setNuevoPadForm(prev => ({
      ...prev,
      codigo: item.codigo || prev.codigo,
      referencia: item.descriptorEmpresa || item.referencia || item.descriptorAuto || '',
      empresa: item.empresa || prev.empresa,
      precioNeto: item.precioNeto != null ? item.precioNeto : prev.precioNeto
    }));
    setMostrarSugerenciasPad(false);
  };

  const handleAgregarItemAReceta = () => {
    if (!puede.agregarItem) return;
    if (!selectedComponentId) {
      showToast("Seleccione un Insumo o Implante del catálogo", "warning");
      return;
    }
    const cant = Number(cantidadInput);
    if (isNaN(cant) || cant <= 0) {
      showToast("Ingrese una cantidad válida", "warning");
      return;
    }

    const compObj = listaInsumosImplantes.find(c => c.id === selectedComponentId);
    if (!compObj) return;

    const indexExistente = itemsPad.findIndex(i => i.idRef === compObj.id);
    if (indexExistente !== -1) {
      const actualizados = [...itemsPad];
      actualizados[indexExistente].cantidad += cant;
      actualizados[indexExistente].subtotalNeto =
        actualizados[indexExistente].cantidad * (actualizados[indexExistente].precioNeto || 0);
      setItemsPad(actualizados);
    } else {
      const nuevoItem = {
        idRef: compObj.id,
        codigo: compObj.codigo || 'S/C',
        referencia: compObj.referencia || compObj.descriptorEmpresa || compObj.descriptorAuto || 'N/A',
        descriptorEmpresa: compObj.descriptorEmpresa || compObj.descriptorAuto || 'N/A',
        empresa: compObj.empresa || 'N/A',
        tipo: compObj.tipo || 'N/A',
        segmento: compObj.segmento || 'N/A',
        clase: compObj.clase || 'N/A',
        precioNeto: Number(compObj.precioNeto || 0),
        cantidad: cant,
        subtotalNeto: cant * Number(compObj.precioNeto || 0)
      };
      setItemsPad(prev => [...prev, nuevoItem]);
    }

    setSelectedComponentId('');
    setCantidadInput(1);
    setBusquedaComponente('');
  };

  const handleCambiarCantidad = (index, nuevaCantidad) => {
    if (!puede.cambiarCantidad) return;
    const cant = Number(nuevaCantidad);
    if (isNaN(cant) || cant <= 0) return;

    const actualizados = [...itemsPad];
    actualizados[index].cantidad = cant;
    actualizados[index].subtotalNeto = cant * actualizados[index].precioNeto;
    setItemsPad(actualizados);
  };

  const handleRemoverItem = (index) => {
    if (!puede.quitarItem) return;
    setItemsPad(prev => prev.filter((_, idx) => idx !== index));
  };

  const totalItemsCount = useMemo(() => itemsPad.reduce((acc, item) => acc + item.cantidad, 0), [itemsPad]);
  const totalPrecioAcumulado = useMemo(() => itemsPad.reduce((acc, item) => acc + item.subtotalNeto, 0), [itemsPad]);

  // 3. GUARDAR EN LA COLECCIÓN 'maestros_pad'
  const handleGuardarPadCompleto = async () => {
    if (!puede.guardar) return;
    if (modo === 'REGISTRAR_NUEVO') {
      if (!nuevoPadForm.codigo.trim()) {
        showToast("El Código del PAD es obligatorio", "warning");
        return;
      }
      if (!nuevoPadForm.referencia.trim()) {
        showToast("La Referencia/Descripción del PAD es obligatoria", "warning");
        return;
      }
    } else if (!padSeleccionado) {
      showToast("Seleccione un PAD para guardar su composición", "warning");
      return;
    }

    setGuardando(true);
    try {
      let padDocId = modo === 'REGISTRAR_NUEVO'
        ? nuevoPadForm.codigo.trim().toUpperCase().replace(/\s+/g, '_')
        : selectedPadId;

      const docPadRef = doc(db, COL_PADS, padDocId);

      if (modo === 'REGISTRAR_NUEVO') {
        const payloadCabecera = {
          codigo: nuevoPadForm.codigo.trim().toUpperCase(),
          referencia: nuevoPadForm.referencia.trim(),
          descriptorEmpresa: nuevoPadForm.referencia.trim(),
          descripcion: nuevoPadForm.referencia.trim(), // Se guardan variaciones por compatibilidad
          empresa: nuevoPadForm.empresa.trim(),
          clasificacion: nuevoPadForm.clasificacion,
          tipo: nuevoPadForm.tipo,
          segmento: nuevoPadForm.segmento,
          precioNeto: Number(nuevoPadForm.precioNeto) || totalPrecioAcumulado,
          fechaCreacion: serverTimestamp(),
          creadoPor: userData?.nombre || userData?.email || 'Sistema'
        };
        await setDoc(docPadRef, payloadCabecera);
      } else {
        await setDoc(docPadRef, {
          clasificacion: padSeleccionado.clasificacion || 'RODILLA',
          referencia: padSeleccionado.referencia,
          descriptorEmpresa: padSeleccionado.referencia,
          descripcion: padSeleccionado.referencia,
          empresa: padSeleccionado.empresa || '',
          precioNeto: Number(padSeleccionado.precioNeto || 0),
          fechaActualizacion: serverTimestamp(),
          actualizadoPor: userData?.nombre || userData?.email || 'Sistema'
        }, { merge: true });
      }

      // GUARDAR SUBCOLECCIÓN 'items_pad'
      const subColRef = collection(docPadRef, "items_pad");
      const snapExistentes = await getDocs(subColRef);
      const deletePromises = snapExistentes.docs.map(d => deleteDoc(doc(subColRef, d.id)));
      await Promise.all(deletePromises);

      const promesasGuardado = itemsPad.map((item) => {
        const docSubRef = doc(subColRef, item.idRef || doc(subColRef).id);
        return setDoc(docSubRef, {
          ...item,
          fechaAgregado: serverTimestamp(),
          agregadoPor: userData?.nombre || userData?.email || 'Sistema'
        });
      });

      await Promise.all(promesasGuardado);

      showToast(modo === 'REGISTRAR_NUEVO' ? "¡PAD registrado en maestros_pad!" : "¡Detalle de receta actualizado!", "success");

      await cargarPads();
      setModo('VER_EXISTENTES');
      setSelectedPadId(padDocId);
    } catch (error) {
      console.error("Error al guardar en maestros_pad:", error);
      showToast("Error al guardar en la colección maestros_pad", "error");
    } finally {
      setGuardando(false);
    }
  };

  if (!tieneAcceso) {
    return (
      <div className="w-full h-80 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 text-center text-[10px]">
        <ShieldAlert size={24} className="text-amber-500 mb-1.5" />
        <h3 className="font-bold text-slate-800 dark:text-gray-100">Acceso Insuficiente</h3>
        <p className="text-slate-500 dark:text-gray-400 max-w-xs">
          No posee credenciales para la gestión de PAD Maestros.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-100/70 dark:bg-gray-900 text-[10px] font-sans overflow-hidden border border-slate-200 dark:border-gray-800 rounded-lg">
      
      {/* Header Compacto */}
      <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#2383C2]/10 text-[#2383C2] flex items-center justify-center border border-[#2383C2]/20">
            <Box size={15} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-[11px] font-bold text-slate-900 dark:text-gray-100 tracking-tight">
                Gestión de PADs
              </h1>
              <span className="text-[8.5px] bg-slate-100 dark:bg-gray-700 font-num text-slate-600 dark:text-gray-300 px-1.5 py-0.2 rounded border border-slate-200 dark:border-gray-600 font-medium">
                MAESTROS / PAD
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {modo === 'REGISTRAR_NUEVO' ? (
            <button
              onClick={handleCancelarNuevoPad}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[9.5px] font-bold transition cursor-pointer bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50"
            >
              <XCircle size={12} />
              <span>Cancelar</span>
            </button>
          ) : puede.registrarNuevo && (
            <button
              onClick={handleIniciarNuevoPad}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[9.5px] font-bold transition cursor-pointer bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
            >
              <PlusCircle size={12} />
              <span>+ Registrar Nuevo PAD</span>
            </button>
          )}

          <button
            onClick={() => { cargarPads(); cargarCatalogoMaestros(); }}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 rounded text-[9.5px] font-semibold transition cursor-pointer border border-slate-200 dark:border-gray-600"
          >
            <RefreshCw size={11} className={(cargandoPads || cargandoComponentes) ? "animate-spin" : ""} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Main Workstation */}
      <div className="flex-grow flex overflow-hidden">

        {/* LISTADO DE PADS IZQUIERDA */}
        <div className="w-64 shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col">
          <div className="p-2 border-b border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={busquedaPad}
                onChange={(e) => setBusquedaPad(e.target.value)}
                placeholder="Buscar por código, ref, empresa..."
                className="w-full h-6 pl-7 pr-1.5 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] text-slate-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 px-0.5 text-[8.5px] text-slate-500">
              <span>PADs encontrados: <strong>{padsFiltrados.length}</strong></span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Con detalle: {listaPads.filter(p => p.tieneComposicion).length}
              </span>
            </div>
          </div>

          <div className="flex-grow overflow-auto divide-y divide-slate-100 dark:divide-gray-700/60">
            {cargandoPads ? (
              <div className="h-full min-h-32 p-4 flex flex-col items-center justify-center text-slate-400 gap-1.5">
                <Spinner size="sm" color="#2383C2" />
                <span>Cargando PADs…</span>
              </div>
            ) : padsFiltrados.length === 0 ? (
              <div className="p-4 text-center text-slate-400">
                No se encontraron registros.
              </div>
            ) : (
              padsFiltrados.map((pad) => {
                const isSelected = modo === 'VER_EXISTENTES' && selectedPadId === pad.id;
                return (
                  <div
                    key={pad.id}
                    onClick={() => handleSelectPadExistente(pad)}
                    className={`p-2 cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-blue-50/60 dark:bg-blue-950/30 border-[#2383C2]'
                        : 'hover:bg-slate-50 dark:hover:bg-gray-700/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-num font-bold text-emerald-600 dark:text-emerald-400 text-[9.5px]">
                        {pad.codigo || pad.id}
                      </span>
                      <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 uppercase">
                        {pad.clasificacion || 'RODILLA'}
                      </span>
                    </div>
                    {/* Render de la Referencia/Descripción garantizado */}
                    <div className="font-semibold text-slate-800 dark:text-gray-100 text-[9.5px] leading-tight line-clamp-2">
                      {pad.referencia}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[8.5px] text-slate-400">
                      <span className="truncate max-w-[110px]">{pad.empresa || 'S/E'}</span>
                      {pad.tieneComposicion ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓ {pad.itemsCount} ítems</span>
                      ) : (
                        <span className="text-amber-500 shrink-0">Sin detalle</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* WORKSPACE DERECHA */}
        <div className="flex-grow flex flex-col overflow-auto bg-slate-50/40 dark:bg-gray-900/40 p-2.5 space-y-2">
          
          {modo === 'REGISTRAR_NUEVO' ? (
            <div className="bg-white dark:bg-gray-800 rounded border border-emerald-300 dark:border-emerald-700 p-2 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-gray-700 pb-1">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                  <PlusCircle size={13} />
                  <span>Nuevo Registro de PAD</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelarNuevoPad}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                >
                  <XCircle size={11} />
                  <span>Cancelar</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
                <div>
                  <label className="block text-[8.5px] font-bold text-slate-500 uppercase mb-0.5">Código PAD (ID) *</label>
                  <input
                    type="text"
                    placeholder="Ej: PAD-ROD-01"
                    value={nuevoPadForm.codigo}
                    onChange={(e) => setNuevoPadForm({ ...nuevoPadForm, codigo: e.target.value })}
                    className="w-full h-6 px-1.5 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] font-num font-bold outline-none focus:border-[#2383C2]"
                  />
                </div>

                {/* CAMPO CON AUTOCOMPLETADO: Referencia / Descripción del PAD */}
                <div className="sm:col-span-2 relative">
                  <label className="block text-[8.5px] font-bold text-slate-500 uppercase mb-0.5">Referencia / Descripción del PAD *</label>
                  <input
                    type="text"
                    placeholder="Ej: PAQUETE DE ARTROPLASTIA DE RODILLA COMPLETO"
                    value={nuevoPadForm.referencia}
                    onChange={(e) => setNuevoPadForm({ ...nuevoPadForm, referencia: e.target.value })}
                    onFocus={() => setMostrarSugerenciasPad(true)}
                    onBlur={() => setTimeout(() => setMostrarSugerenciasPad(false), 150)}
                    autoComplete="off"
                    className="w-full h-6 px-1.5 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] font-semibold outline-none focus:border-[#2383C2]"
                  />

                  {mostrarSugerenciasPad && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-0.5 max-h-40 overflow-auto bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded shadow-lg">
                      {sugerenciasPad.length === 0 ? (
                        <div className="px-2 py-1.5 text-[9px] text-slate-400">
                          Sin coincidencias (clase = PAD en maestros_codigos)
                        </div>
                      ) : (
                        sugerenciasPad.map(item => (
                          <div
                            key={item.id}
                            onMouseDown={() => handleSeleccionarSugerenciaPad(item)}
                            className="px-2 py-1 border-b border-slate-100 dark:border-gray-700 last:border-0 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-num font-bold text-emerald-600 dark:text-emerald-400 text-[8.5px]">
                                {item.codigo || 'S/C'}
                              </span>
                              <span className="text-[8px] text-slate-400">
                                {item.empresa || 'S/E'} · ${Number(item.precioNeto || 0).toLocaleString('es-ES')}
                              </span>
                            </div>
                            <div className="text-[9px] font-semibold text-slate-800 dark:text-gray-200 leading-tight">
                              {item.descriptorEmpresa || item.referencia || item.descriptorAuto}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[8.5px] font-bold text-slate-500 uppercase mb-0.5">Clasificación *</label>
                  <select
                    value={nuevoPadForm.clasificacion}
                    onChange={(e) => setNuevoPadForm({ ...nuevoPadForm, clasificacion: e.target.value })}
                    className="w-full h-6 px-1.5 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] font-bold text-[#2383C2] outline-none cursor-pointer"
                  >
                    <option value="RODILLA">Rodilla</option>
                    <option value="CADERA">Cadera</option>
                    <option value="HOMBRO">Hombro</option>
                    <option value="BARIATRICA">Bariátrica</option>
                    <option value="COLUMNA">Columna</option>
                    <option value="BRAZO">Brazo</option>
                    <option value="MANO">Mano</option>
                    <option value="PIE">Pie</option>
                    <option value="TRAUMATOLOGIA">Traumatología</option>
                    <option value="OTRO">Otro / General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8.5px] font-bold text-slate-500 uppercase mb-0.5">Empresa / Clínica</label>
                  <input
                    type="text"
                    placeholder="Ej: CLINICA ALEMANA"
                    value={nuevoPadForm.empresa}
                    onChange={(e) => setNuevoPadForm({ ...nuevoPadForm, empresa: e.target.value })}
                    className="w-full h-6 px-1.5 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] outline-none focus:border-[#2383C2]"
                  />
                </div>
                <div>
                  <label className="block text-[8.5px] font-bold text-slate-500 uppercase mb-0.5">Precio Venta Net ($)</label>
                  <input
                    type="number"
                    value={nuevoPadForm.precioNeto}
                    onChange={(e) => setNuevoPadForm({ ...nuevoPadForm, precioNeto: e.target.value })}
                    className="w-full h-6 px-1.5 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] font-bold text-emerald-600 outline-none"
                  />
                </div>
              </div>
            </div>
          ) : padSeleccionado ? (
            <div className="bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 p-2 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-[#2383C2] font-bold text-[8.5px]">
                    PAD
                  </span>
                  <input
                    type="text"
                    value={padSeleccionado.referencia}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPadSeleccionado(prev => ({ ...prev, referencia: val }));
                      setListaPads(prev => prev.map(p => p.id === padSeleccionado.id ? { ...p, referencia: val } : p));
                    }}
                    className="text-[10.5px] font-bold text-slate-900 dark:text-gray-100 bg-transparent border-b border-dashed border-slate-300 hover:border-[#2383C2] focus:border-[#2383C2] outline-none w-80"
                  />
                </div>
                <span className="font-num text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">
                  ID: {padSeleccionado.codigo || padSeleccionado.id}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[9.5px]">
                <div className="bg-slate-50 dark:bg-gray-900/60 p-1 rounded border border-slate-200/50 dark:border-gray-700/50">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Empresa</span>
                  <input
                    type="text"
                    value={padSeleccionado.empresa || ''}
                    onChange={(e) => setPadSeleccionado({ ...padSeleccionado, empresa: e.target.value })}
                    className="w-full bg-transparent font-semibold text-slate-800 dark:text-gray-200 outline-none text-[9.5px]"
                  />
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/60 p-1 rounded border border-slate-200/50 dark:border-gray-700/50">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Clasificación</span>
                  <select
                    value={padSeleccionado.clasificacion || 'RODILLA'}
                    onChange={(e) => setPadSeleccionado({ ...padSeleccionado, clasificacion: e.target.value })}
                    className="w-full bg-transparent font-bold text-[#2383C2] outline-none cursor-pointer text-[9.5px]"
                  >
                    <option value="RODILLA">Rodilla</option>
                    <option value="CADERA">Cadera</option>
                    <option value="BARIATRICA">Bariátrica</option>
                    <option value="COLUMNA">Columna</option>
                    <option value="TRAUMATOLOGIA">Traumatología</option>
                    <option value="OTRO">Otro / General</option>
                  </select>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/60 p-1 rounded border border-slate-200/50 dark:border-gray-700/50">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Precio Base</span>
                  <span className="font-bold text-slate-900 dark:text-gray-100">${Number(padSeleccionado.precioNeto || 0).toLocaleString('es-ES')}</span>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/60 p-1 rounded border border-slate-200/50 dark:border-gray-700/50">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Suma Detalle Ítems</span>
                  <span className="font-bold text-[#2383C2]">${totalPrecioAcumulado.toLocaleString('es-ES')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded text-slate-400">
              Seleccione un PAD en la lista o haga clic en "+ Registrar Nuevo PAD".
            </div>
          )}

          {/* VINCULAR DETALLES */}
          {(modo === 'REGISTRAR_NUEVO' || padSeleccionado) && puede.agregarItem && (
            <div className="bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 p-2 shadow-2xs space-y-1">
              <span className="block text-[9.5px] font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wider">
                Añadir componentes al PAD
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 items-center">
                <div className="sm:col-span-8 relative">
                  <Search size={11} className="absolute left-2 top-2 text-slate-400" />
                  <input
                    type="text"
                    value={busquedaComponente}
                    onChange={(e) => {
                      setBusquedaComponente(e.target.value);
                      setSelectedComponentId('');
                      setMostrarSugerenciasComponente(true);
                    }}
                    onFocus={() => setMostrarSugerenciasComponente(true)}
                    onBlur={() => setTimeout(() => setMostrarSugerenciasComponente(false), 150)}
                    autoComplete="off"
                    placeholder="Buscar por código, referencia o descripción..."
                    className="w-full h-6 pl-7 pr-6 bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] text-slate-800 dark:text-gray-100 outline-none focus:border-[#2383C2]"
                  />
                  {buscandoComponente && (
                    <span className="absolute right-1.5 top-1">
                      <Spinner size="xs" color="#2383C2" />
                    </span>
                  )}

                  {mostrarSugerenciasComponente && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-0.5 max-h-40 overflow-auto bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded shadow-lg">
                      {errorComponentes ? (
                        <div role="alert" className="px-2 py-1.5 text-[9px] text-red-600 dark:text-red-400">
                          No se pudo cargar el catálogo de componentes. Pulse "Sincronizar" para reintentar.
                        </div>
                      ) : terminoCorto ? (
                        <div className="px-2 py-1.5 text-[9px] text-slate-400">
                          Escriba al menos {MIN_CARACTERES_BUSQUEDA} caracteres para buscar.
                        </div>
                      ) : buscandoComponente ? (
                        <div className="px-2 py-1.5 text-[9px] text-slate-400">
                          Buscando…
                        </div>
                      ) : componentesFiltrados.length === 0 ? (
                        <div className="px-2 py-1.5 text-[9px] text-slate-400">
                          No se encontraron componentes para «{terminoComponente}»
                        </div>
                      ) : (
                        componentesFiltrados.slice(0, MAX_RESULTADOS_COMPONENTES).map(comp => (
                          <div
                            key={comp.id}
                            onMouseDown={() => {
                              setSelectedComponentId(comp.id);
                              setBusquedaComponente(`${comp.referencia || comp.descriptorAuto || 'N/A'} / ${comp.descriptorEmpresa || 'N/A'}`);
                              setMostrarSugerenciasComponente(false);
                            }}
                            className="px-2 py-1 border-b border-slate-100 dark:border-gray-700 last:border-0 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-num font-bold text-emerald-600 dark:text-emerald-400 text-[8.5px]">
                                {comp.codigo || 'S/C'}
                              </span>
                              <span className="text-[8px] text-slate-400">
                                {comp.clase || 'SIN CLASE'} · ${Number(comp.precioNeto || 0).toLocaleString('es-ES')}
                              </span>
                            </div>
                            <div className="text-[9px] font-semibold text-slate-800 dark:text-gray-200 leading-tight">
                              <span className="text-slate-400 font-normal">Ref:</span> {comp.referencia || 'N/A'}
                            </div>
                            <div className="text-[9px] text-slate-600 dark:text-gray-400 leading-tight">
                              <span className="text-slate-400">Desc:</span> {comp.descriptorEmpresa || comp.descriptorAuto || comp.descripcion || 'N/A'}
                            </div>
                          </div>
                        ))
                      )}
                      {!errorComponentes && !terminoCorto && !buscandoComponente && componentesFiltrados.length > MAX_RESULTADOS_COMPONENTES && (
                        <div className="px-2 py-1 text-[8.5px] text-slate-400 bg-slate-50 dark:bg-gray-900/60">
                          Mostrando {MAX_RESULTADOS_COMPONENTES} de {componentesFiltrados.length} resultados. Afine la búsqueda para ver más.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 flex items-center gap-1">
                  <span className="text-[8.5px] font-bold text-slate-500">Cant:</span>
                  <input
                    type="number"
                    min="1"
                    value={cantidadInput}
                    onChange={(e) => setCantidadInput(e.target.value)}
                    className="w-full h-6 px-1 text-center bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-[9.5px] font-bold outline-none focus:border-[#2383C2]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAgregarItemAReceta}
                    className="w-full h-6 bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-bold rounded flex items-center justify-center gap-1 transition cursor-pointer text-[9.5px]"
                  >
                    <Plus size={11} />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TABLA SUBCOLECCIÓN DETALLE */}
          {(modo === 'REGISTRAR_NUEVO' || padSeleccionado) && (
            <div className="bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 shadow-2xs overflow-hidden flex flex-col flex-grow">
              <div className="px-2.5 py-1.5 bg-slate-50/80 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <PackageCheck size={13} className="text-[#2383C2]" />
                  <h3 className="text-[9.5px] font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wide">
                    Detalle de Componentes ({itemsPad.length} líneas)
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-[9px]">
                  <span className="text-slate-500">
                    Unidades: <strong className="text-slate-800 dark:text-gray-200">{totalItemsCount}</strong>
                  </span>
                  <span className="px-2 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                    Monto Total: ${totalPrecioAcumulado.toLocaleString('es-ES')}
                  </span>
                </div>
              </div>

              <div className="flex-grow overflow-auto max-h-52">
                {cargandoDetallePad ? (
                  <div className="p-4 flex items-center justify-center gap-1.5 text-slate-400">
                    <Spinner size="xs" color="#2383C2" />
                    <span>Cargando subcolección...</span>
                  </div>
                ) : (
                  <table className="w-full text-left text-[9px] border-collapse">
                    <thead className="bg-slate-100/70 dark:bg-gray-900 text-slate-600 dark:text-gray-400 uppercase font-bold text-[8.5px] sticky top-0">
                      <tr>
                        {verColumna('linea') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-5 text-center">#</th>
                        )}
                        {verColumna('clase') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700">Clase</th>
                        )}
                        {verColumna('codigoRef') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700">Código Ref</th>
                        )}
                        {verColumna('descripcion') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700">Descripción</th>
                        )}
                        {verColumna('referencia') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700">Referencia</th>
                        )}
                        {verColumna('precioUnitario') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-right">Precio Un.</th>
                        )}
                        {verColumna('cantidad') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-center w-14">Cant.</th>
                        )}
                        {verColumna('subtotal') && (
                          <th className="py-1 px-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-right">Subtotal</th>
                        )}
                        {verColumna('borrar') && (
                          <th className="py-1 px-1.5 border-b border-slate-200 dark:border-gray-700 text-center w-8">Borrar</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {itemsPad.length === 0 ? (
                        <tr>
                          <td colSpan={columnasTabla.length} className="text-center py-5 text-slate-400">
                            <Info size={15} className="mx-auto mb-0.5 opacity-40" />
                            Sin componentes vinculados en este PAD.
                          </td>
                        </tr>
                      ) : (
                        itemsPad.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 dark:border-gray-700/60 hover:bg-slate-50/80 dark:hover:bg-gray-700/30 transition">
                            {verColumna('linea') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 text-center text-slate-400 font-bold">{idx + 1}</td>
                            )}
                            {verColumna('clase') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700">
                                <span className={`px-1 py-0.2 rounded text-[7.5px] font-bold ${claseBadgeCodigo(item.clase)}`}>
                                  {item.clase}
                                </span>
                              </td>
                            )}
                            {verColumna('codigoRef') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 font-num font-bold text-emerald-600 dark:text-emerald-400">{item.codigo}</td>
                            )}
                            {verColumna('descripcion') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 font-semibold text-slate-800 dark:text-gray-200">
                                {item.descriptorEmpresa}
                              </td>
                            )}
                            {verColumna('referencia') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400">
                                {item.referencia}
                              </td>
                            )}
                            {verColumna('precioUnitario') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 text-right font-medium">
                                ${item.precioNeto.toLocaleString('es-ES')}
                              </td>
                            )}
                            {verColumna('cantidad') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.cantidad}
                                  onChange={(e) => handleCambiarCantidad(idx, e.target.value)}
                                  disabled={!puede.cambiarCantidad}
                                  className="disabled:opacity-60 w-10 h-4 px-0.5 text-center bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded font-bold outline-none focus:border-[#2383C2] text-[9px]"
                                />
                              </td>
                            )}
                            {verColumna('subtotal') && (
                              <td className="py-1 px-1.5 border-r border-slate-200 dark:border-gray-700 text-right font-bold text-slate-900 dark:text-gray-100">
                                ${item.subtotalNeto.toLocaleString('es-ES')}
                              </td>
                            )}
                            {verColumna('borrar') && (
                              <td className="py-1 px-1.5 text-center">
                                {puede.quitarItem && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoverItem(idx)}
                                    className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="p-2 bg-slate-50 dark:bg-gray-900/60 border-t border-slate-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-[8.5px] text-slate-400">
                  Guarda los datos del PAD junto con su detalle de componentes.
                </span>
                <div className="flex items-center gap-1.5">
                  {modo === 'REGISTRAR_NUEVO' && (
                    <button
                      type="button"
                      onClick={handleCancelarNuevoPad}
                      className="px-3.5 py-1 bg-white hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-bold rounded border border-red-200 dark:border-red-800 flex items-center gap-1.5 transition cursor-pointer text-[9.5px]"
                    >
                      <XCircle size={12} />
                      <span>Cancelar</span>
                    </button>
                  )}
                  {puede.guardar && (
                  <button
                    type="button"
                    onClick={handleGuardarPadCompleto}
                    disabled={guardando}
                    className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-2xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 text-[9.5px]"
                  >
                    {guardando ? <Spinner size="xs" color="#ffffff" /> : <Save size={12} />}
                    <span>{modo === 'REGISTRAR_NUEVO' ? 'Guardar PAD' : 'Actualizar PAD'}</span>
                  </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

export default PadMaestros;