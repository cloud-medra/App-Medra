import { useState, useEffect, useRef } from 'react';
import {
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  getDocs,
  where,
  documentId,
  limit,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { onSnapshotVisible } from '../../../../../../hooks/useVisibleSnapshot';
import { CENTRO_HEMODINAMIA } from '../utils/constantesHemodinamia';
import { useToast } from '../../../../../../context/ToastContext';
import { useModal } from '../../../../../../context/ModalContext';
import { useUser } from '../../../../../../context/UserContext';
import { exportarGestionesAExcel, descargarPlantillaCSV, parsearArchivoImportacion } from '../utils/gestionesImportExport';
import { periodoEstaAbierto } from '../components/Cargastab/verificacionPeriodoBloque';
import { periodoImputacion, bloqueParaImputacion, camposSolicitudDe } from '../../../shared/periodoImputacion';
import { refImputada, construirPayloadImputada } from '../utils/imputadaSync';
import { registrarLogHemodinamia } from '../utils/registrarLogHemodinamia';
import { calcularOcPendiente, itemsDeGestion } from '../../../shared/ocIndex/indiceOC';
import { existeGestionEnColeccion, extraerDatosBase, MENSAJE_DUPLICADO } from '../../../shared/empresaFechaDesdeDetalle';
import { calcularFechaRegistroAdmision } from '../../../shared/fechaRegistroAdmision';

const getFechaActualISO = () => {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const getInitialFormState = () => ({
  gestionId: '',
  nombre: '',
  fecha: getFechaActualISO(),
  empresa: '',
  informe: 'PENDIENTE',
  observacion: '',
  convenio: 'P',
  prevision: 'P',
  medico: 'P',
  descripcion: 'P',
  centro: CENTRO_HEMODINAMIA,
  atributo: 'HEMODINAMIA',
  estado: 'AGENDANDO',
  costo: 0,
  active: true
});

const getDetallesRef = (fechaString, admisionId, empresaNombre) => {
  let year = "0000";
  let month = "00";
  let day = "00";

  if (fechaString && fechaString.includes("-")) {
    const partes = fechaString.split("-");
    if (partes.length === 3) {
      year = partes[0];
      month = partes[1];
      day = partes[2];
    }
  } else if (fechaString) {
    const d = new Date();
    if (!isNaN(d.getTime())) {
      year = d.getFullYear().toString();
      month = String(d.getMonth() + 1).padStart(2, '0');
      day = String(d.getDate()).padStart(2, '0');
    }
  }

  const admisionClean = (admisionId && admisionId.trim() !== '' && admisionId !== 'P')
    ? admisionId.trim().replace(/\//g, '_')
    : 'SIN_ADMISION';

  const empresaClean = (empresaNombre || 'SIN_EMPRESA').trim().replace(/\//g, '_');

  return collection(
    db,
    'hemodinamia_gestiones', year,
    'mes', month,
    'dia', day,
    'admision', admisionClean,
    'empresa', empresaClean,
    'detalles'
  );
};

// Normalización de una gestión a partir de los campos del formulario
// (vacíos → 'P'). Compartida por el formulario principal y el alta rápida
// Empresa/Fecha del detalle, para que ambos registros queden iguales.
const normalizarGestion = (formData) => {
  const gestionIdLimpio = (formData.gestionId || formData.agendaId)?.trim() || 'P';
  const admisionValor = (gestionIdLimpio !== '' && gestionIdLimpio !== 'P') ? gestionIdLimpio : 'SIN_ADMISION';

  return {
    gestionId: gestionIdLimpio,
    agendaId: gestionIdLimpio,
    admision: admisionValor,
    nombre: formData.nombre?.trim() || 'P',
    fecha: formData.fecha || 'P',
    empresa: formData.empresa?.trim() || 'P',
    informe: formData.informe || 'PENDIENTE',
    observacion: formData.observacion?.trim() || '',
    convenio: formData.convenio === 'Cargando...' ? 'P' : (formData.convenio || 'P'),
    prevision: formData.prevision === 'Cargando...' ? 'P' : (formData.prevision || 'P'),
    medico: formData.medico === 'Cargando...' ? 'P' : (formData.medico || 'P'),
    descripcion: formData.descripcion === 'Cargando...' ? 'P' : (formData.descripcion || 'P'),
    centro: CENTRO_HEMODINAMIA,
    atributo: formData.atributo || 'HEMODINAMIA',
    estado: formData.estado || 'AGENDANDO',
    costo: Number(formData.costo) || 0,
    solicitud: 'PENDIENTE',
    active: true
  };
};

// `admision` (opcional): modo detalle. En vez de la ventana de las
// gestiones más recientes, escucha solo las de esa admisión (lo que
// necesita el detalle abierto desde Cargas Consolidado). Sigue en tiempo
// real: es la gestión en edición. `refPath` (opcional): si la admisión aún
// no tiene código, se escucha solo ese documento.
export const useGestionesHemodinamiaData = ({ admision, refPath } = {}) => {
  const [implantes, setImplantes] = useState([]);
  const [formData, setFormData] = useState(getInitialFormState);

  const [editingId, setEditingId] = useState(null);
  const [editingRefPath, setEditingRefPath] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [selectedImplanteForLog, setSelectedImplanteForLog] = useState(null);
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  const [sincronizando, setSincronizando] = useState(false);
  const idChangeTimeoutRef = useRef(null);
  const idChangeTokenRef = useRef(0);

  const RANGO_MIN_GESTIONES = "hemodinamia_gestiones/0000";
  const RANGO_MAX_GESTIONES = "hemodinamia_gestiones/9999";

  // Igual que Implantes: antes el listener no tenía límite y leía (y quedaba
  // escuchando) el histórico COMPLETO de gestiones. Ahora escucha las
  // TAMANO_PAGINA más recientes (orden por __name__ desc: el path lleva
  // año/mes/día con ceros a la izquierda) y "Cargar más" amplía la ventana.
  const TAMANO_PAGINA = 150;
  const [limiteGestiones, setLimiteGestiones] = useState(TAMANO_PAGINA);
  const [hayMasGestiones, setHayMasGestiones] = useState(false);
  const cargarMasGestiones = () => setLimiteGestiones(l => l + TAMANO_PAGINA);

  useEffect(() => {
    const mapearYOrdenar = (docs) => {
      const mapeados = docs.map(document => ({
        id: document.id,
        refPath: document.ref.path,
        active: true,
        ...document.data()
      }));
      mapeados.sort((a, b) => {
        const millisA = a.fechaRegistro?.toMillis ? a.fechaRegistro.toMillis() : new Date(a.fechaRegistro || 0).getTime();
        const millisB = b.fechaRegistro?.toMillis ? b.fechaRegistro.toMillis() : new Date(b.fechaRegistro || 0).getTime();
        return millisB - millisA;
      });
      return mapeados;
    };

    if (!admision && refPath) {
      return onSnapshotVisible(
        doc(db, refPath),
        (snap) => { setImplantes(snap.exists() ? mapearYOrdenar([snap]) : []); setHayMasGestiones(false); },
        (error) => console.error(`Error al escuchar la gestión ${refPath}:`, error)
      );
    }

    if (admision) {
      // gestionId/agendaId pueden estar guardados como texto o número.
      const texto = String(admision).trim();
      const valores = Number.isFinite(Number(texto)) && texto !== '' ? [texto, Number(texto)] : [texto];
      const porCampo = { gestionId: [], agendaId: [] };
      const publicar = () => {
        const unicos = new Map();
        [...porCampo.gestionId, ...porCampo.agendaId]
          .filter(d => d.ref.path.startsWith('hemodinamia_gestiones/'))
          .forEach(d => unicos.set(d.ref.path, d));
        setImplantes(mapearYOrdenar([...unicos.values()]));
        setHayMasGestiones(false);
      };
      const unsubs = Object.keys(porCampo).map(campo => onSnapshotVisible(
        query(collectionGroup(db, "detalles"), where(campo, "in", valores)),
        (snapshot) => { porCampo[campo] = snapshot.docs; publicar(); },
        (error) => console.error(`Error al escuchar gestiones de la admisión ${texto} (${campo}):`, error)
      ));
      return () => unsubs.forEach(u => u());
    }

    const q = query(
      collectionGroup(db, "detalles"),
      where(documentId(), ">=", RANGO_MIN_GESTIONES),
      where(documentId(), "<", RANGO_MAX_GESTIONES),
      orderBy(documentId(), "desc"),
      limit(limiteGestiones)
    );
    const unsubscribe = onSnapshotVisible(q, (snapshot) => {
      setImplantes(mapearYOrdenar(snapshot.docs));
      setHayMasGestiones(snapshot.size >= limiteGestiones);
    }, (error) => {
      console.error("Error al escuchar gestiones:", error);
    });
    return () => unsubscribe();
  }, [limiteGestiones, admision, refPath]);

  const registrarLog = (docRef, accion, detalles) => registrarLogHemodinamia(docRef, accion, detalles, userData);

  const handleSincronizarVinculados = async () => {
    setSincronizando(true);
    try {
      const candidatos = implantes.filter(i => {
        const idValido = (i.gestionId || i.agendaId) && !isNaN(Number(i.gestionId || i.agendaId));
        const tienePendientes = [i.convenio, i.prevision, i.medico, i.descripcion]
          .some(v => v === 'P' || !v);
        return idValido && tienePendientes && i.refPath;
      });

      if (candidatos.length === 0) {
        showToast("No hay gestiones pendientes de sincronizar", "info");
        return;
      }

      const admisionesUnicas = [...new Set(candidatos.map(c => Number(c.gestionId || c.agendaId)))];

      const CHUNK_SIZE = 30;
      const mapaDatos = new Map();

      for (let i = 0; i < admisionesUnicas.length; i += CHUNK_SIZE) {
        const chunk = admisionesUnicas.slice(i, i + CHUNK_SIZE);
        const q = query(
          collectionGroup(db, "registros"),
          where("Admisión", "in", chunk)
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const data = d.data();
          const admisionKey = data["Admisión"];
          if (!mapaDatos.has(admisionKey)) {
            mapaDatos.set(admisionKey, data);
          }
        });
      }

      let actualizados = 0;
      const BATCH_SIZE = 400;
      let batch = writeBatch(db);
      let opsEnBatch = 0;

      for (const item of candidatos) {
        const admisionNum = Number(item.gestionId || item.agendaId);
        const datosReporte = mapaDatos.get(admisionNum);
        if (!datosReporte) continue;

        const docRef = doc(db, item.refPath);
        const nuevosDatos = {
          convenio: (item.convenio === 'P' || !item.convenio) ? (datosReporte["Convenio"] || 'P') : item.convenio,
          prevision: (item.prevision === 'P' || !item.prevision) ? (datosReporte["Isapre"] || 'P') : item.prevision,
          medico: (item.medico === 'P' || !item.medico) ? (datosReporte["1° Cirujano"] || 'P') : item.medico,
          descripcion: (item.descripcion === 'P' || !item.descripcion) ? (datosReporte["Descripción"] || 'P') : item.descripcion,
        };

        batch.update(docRef, nuevosDatos);
        opsEnBatch++;
        actualizados++;

        await registrarLog(docRef, 'SINCRONIZACION', {
          ...nuevosDatos,
          idGestion: item.gestionId || item.agendaId,
          nombre: item.nombre || ''
        });

        if (opsEnBatch >= BATCH_SIZE) {
          await batch.commit();
          batch = writeBatch(db);
          opsEnBatch = 0;
        }
      }

      if (opsEnBatch > 0) {
        await batch.commit();
      }

      showToast(`Sincronización completa: ${actualizados} gestión(es) actualizadas`, "success");
    } catch (error) {
      console.error("Error al sincronizar:", error);
      showToast("Error al sincronizar: " + error.message, "error");
    } finally {
      setSincronizando(false);
    }
  };

  const handleCopiarTexto = (texto) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    showToast("Texto copiado al portapapeles", "success");
  };

  const handleIdChange = (val) => {
    const cleanId = val ? val.trim() : '';

    if (idChangeTimeoutRef.current) {
      clearTimeout(idChangeTimeoutRef.current);
      idChangeTimeoutRef.current = null;
    }
    const miToken = ++idChangeTokenRef.current;

    if (!cleanId) {
      setFormData(prev => ({
        ...prev,
        gestionId: '',
        agendaId: '',
        convenio: 'P',
        prevision: 'P',
        medico: 'P',
        descripcion: 'P',
        active: true
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      gestionId: val,
      agendaId: val,
      convenio: 'Cargando...',
      prevision: 'Cargando...',
      medico: 'Cargando...',
      descripcion: 'Cargando...',
      active: true
    }));

    const admisionNum = Number(cleanId);

    if (isNaN(admisionNum)) {
      setFormData(prev => ({
        ...prev,
        convenio: 'P',
        prevision: 'P',
        medico: 'P',
        descripcion: 'P',
        active: true
      }));
      return;
    }

    idChangeTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query(
          collectionGroup(db, "registros"),
          where("Admisión", "==", admisionNum)
        );
        const snapshot = await getDocs(q);
        if (miToken !== idChangeTokenRef.current) return;

        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          setFormData(prev => ({
            ...prev,
            convenio: docData["Convenio"] || 'P',
            prevision: docData["Isapre"] || 'P',
            medico: docData["1° Cirujano"] || 'P',
            descripcion: docData["Descripción"] || 'P',
            active: true
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            convenio: 'P',
            prevision: 'P',
            medico: 'P',
            descripcion: 'P',
            active: true
          }));
        }
      } catch (error) {
        console.error("Error al buscar datos vinculados:", error);
        if (miToken !== idChangeTokenRef.current) return;
        setFormData(prev => ({
          ...prev,
          convenio: 'P',
          prevision: 'P',
          medico: 'P',
          descripcion: 'P',
          active: true
        }));
      }
    }, 400);
  };

  // Crea una gestión nueva en su colección por fecha/admisión/empresa y
  // deja el log de CREACION. `detallesLogExtra` se suma a los detalles del log.
  const crearGestion = async (dataNormalizada, detallesLogExtra = {}) => {
    const detallesColRef = getDetallesRef(dataNormalizada.fecha, dataNormalizada.admision, dataNormalizada.empresa);

    const dataAEnviar = {
      ...dataNormalizada,
      // Ver "Sincronizar OC": el flag debe existir en todos los registros
      // (Firestore no puede consultar "campo inexistente"). Igual que Implantes.
      ocPendiente: calcularOcPendiente(itemsDeGestion(dataNormalizada), {}),
      fechaRegistro: new Date(),
      fechaRegistroAdmision: calcularFechaRegistroAdmision({ idNuevo: dataNormalizada.gestionId }),
      registradoPor: userData?.nombreCompleto || 'Usuario'
    };

    const docRef = await addDoc(detallesColRef, dataAEnviar);
    await registrarLog(docRef, 'CREACION', { ...dataNormalizada, ...detallesLogExtra });
    return { id: docRef.id, refPath: docRef.path, ...dataAEnviar };
  };

  // Registros guardados o creados desde el detalle (alta rápida y guardado
  // automático previo). guardarDesdeDetalle los busca aquí si todavía no están
  // en `implantes` (la ventana en vivo solo trae las gestiones más recientes,
  // y en modo { refPath } el doc movido a su nueva ruta deja de escucharse):
  // si no los encontrara, trataría la card como nueva y crearía un duplicado.
  const guardadosDesdeDetalleRef = useRef(new Map());
  const buscarOriginal = (id) =>
    implantes.find(i => i.id === id) || guardadosDesdeDetalleRef.current.get(id) || null;

  // Antes del guardado automático: si un bloque cambia de ruta (nuevo ID de
  // admisión, empresa o fecha) y en la ruta destino ya hay un registro,
  // guardarDesdeDetalle crearía un duplicado. Se omite para SIN_ADMISION
  // (esa ruta la comparten pacientes distintos sin ID).
  const buscarConflictoDeRuta = async ({ admisionId, registrosActualizados }) => {
    const gestionIdLimpio = admisionId?.trim() || 'P';
    const admisionValor = (gestionIdLimpio !== '' && gestionIdLimpio !== 'P') ? gestionIdLimpio : 'SIN_ADMISION';
    if (admisionValor === 'SIN_ADMISION') return null;

    for (const registro of registrosActualizados) {
      const original = registro.id ? buscarOriginal(registro.id) : null;
      const empresa = registro.empresa?.trim() || 'P';
      const cambiaRuta = !original ||
        original.fecha !== registro.fecha ||
        (original.empresa || '') !== empresa ||
        ((original.gestionId || original.agendaId) || '') !== gestionIdLimpio;
      if (!cambiaRuta) continue;
      if (await existeGestionEnColeccion(getDetallesRef(registro.fecha, admisionValor, empresa))) {
        return `No se guardó: ya existe un registro de la admisión ${gestionIdLimpio} para ${empresa} – ${registro.fecha}.`;
      }
    }
    return null;
  };

  // Alta rápida Empresa/Fecha desde el detalle. Solo cambian fecha y empresa;
  // cotizaciones/cargas/imputación no se copian: el bloque parte pendiente,
  // igual que desde el formulario.
  //  - Sin cambios pendientes: `base` = registro guardado de la card activa.
  //  - Con `cambiosPendientes` (payload de guardarDesdeDetalle): primero se
  //    guardan —el ID es parte de la ruta, así que el original y el nuevo
  //    deben quedar en la misma admisión— y la base pasa a ser el registro
  //    recién guardado en `indiceBase`. Si el guardado falla, no se crea nada.
  // Devuelve { creado?, guardado?, error? } (error: mensaje para el formulario).
  const agregarEmpresaFechaDesdeDetalle = async ({ base, fecha, empresa, cambiosPendientes, indiceBase }) => {
    const empresaLimpia = empresa?.trim();
    if (!fecha || !empresaLimpia) return { error: 'La fecha y la empresa son obligatorias.' };

    const gestionIdDestino = cambiosPendientes ? cambiosPendientes.admisionId : base?.gestionId;
    const { admision } = normalizarGestion({ gestionId: gestionIdDestino });
    if (admision === 'SIN_ADMISION') {
      return { error: 'La admisión no tiene ID: ingrésalo en Información antes de agregar empresa/fecha.' };
    }

    let guardado = null;
    try {
      if (await existeGestionEnColeccion(getDetallesRef(fecha, admision, empresaLimpia))) {
        return { error: MENSAJE_DUPLICADO };
      }

      let datosBase = base;
      if (cambiosPendientes) {
        const conflicto = await buscarConflictoDeRuta(cambiosPendientes);
        if (conflicto) return { error: conflicto };

        guardado = await guardarDesdeDetalle(cambiosPendientes, { toastExito: false });
        if (!guardado?.ok) {
          return { error: `No se agregó: ${guardado?.error || 'no se pudieron guardar los cambios pendientes.'}` };
        }
        datosBase = guardado.registros[indiceBase] || guardado.registros[0];
      }

      const dataNormalizada = normalizarGestion({ ...extraerDatosBase(datosBase), fecha, empresa: empresaLimpia });
      const creado = await crearGestion(dataNormalizada, {
        origen: 'DETALLE',
        mensaje: `Se agregó empresa/fecha: ${empresaLimpia} – ${fecha}`
      });
      guardadosDesdeDetalleRef.current.set(creado.id, creado);
      showToast(
        guardado
          ? 'Se guardaron los cambios y se agregó la nueva empresa/fecha'
          : `Se agregó ${empresaLimpia} – ${fecha}`,
        'success'
      );
      return { creado, guardado };
    } catch (error) {
      console.error('Error al agregar empresa/fecha:', error);
      showToast('Error al agregar empresa/fecha: ' + error.message, 'error');
      return {
        guardado,
        error: guardado
          ? 'Se guardaron los cambios, pero no se pudo agregar la empresa/fecha: ' + error.message
          : 'No se pudo agregar: ' + error.message
      };
    }
  };

  const handleGuardar = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!formData.fecha) {
      showToast("La fecha es requerida para organizar la gestión", "error");
      return;
    }

    setCargando(true);
    try {
      const gestionIdLimpio = (formData.gestionId || formData.agendaId)?.trim() || 'P';
      const dataNormalizada = normalizarGestion(formData);

      const idEsReal = gestionIdLimpio !== '' && gestionIdLimpio !== 'P';

      const existeDuplicado = idEsReal && implantes.some(item =>
        (item.gestionId === dataNormalizada.gestionId || item.agendaId === dataNormalizada.agendaId) &&
        item.fecha === dataNormalizada.fecha &&
        item.empresa === dataNormalizada.empresa &&
        item.id !== editingId
      );

      if (existeDuplicado) {
        showToast("Ya existe un registro con el mismo ID, Fecha y Empresa.", "error");
        setCargando(false);
        return;
      }

      if (editingId && editingRefPath) {
        const docRef = doc(db, editingRefPath);
        const implanteExistente = implantes.find(i => i.id === editingId);

        const dataAEnviar = {
          ...dataNormalizada,
          fechaRegistro: implanteExistente?.fechaRegistro || new Date(),
          fechaRegistroAdmision: calcularFechaRegistroAdmision({
            idAnterior: implanteExistente?.gestionId || implanteExistente?.agendaId,
            idNuevo: dataNormalizada.gestionId,
            fechaAnterior: implanteExistente?.fechaRegistroAdmision
          }),
          registradoPor: implanteExistente?.registradoPor || userData?.nombreCompleto || 'Usuario'
        };
        // Gestión anterior a "Sincronizar OC" sin el flag: se agrega al
        // editarla (este formulario no toca los ítems ni ocPorItem).
        if (implanteExistente && typeof implanteExistente.ocPendiente !== 'boolean') {
          dataAEnviar.ocPendiente = calcularOcPendiente(itemsDeGestion(implanteExistente), implanteExistente.ocPorItem || {});
        }

        await updateDoc(docRef, dataAEnviar);
        await registrarLog(docRef, 'EDICION', { ...dataNormalizada });
        showToast("Gestión actualizada correctamente", "success");
      } else {
        await crearGestion(dataNormalizada);
        showToast("Gestión registrada correctamente", "success");
      }

      cancelarEdicion();
    } catch (error) {
      console.error("Error al guardar:", error);
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  // Devuelve { ok: true, registros } (registros guardados, en el mismo orden
  // que registrosActualizados) o { ok: false, error }. toastExito: false omite
  // el aviso genérico de éxito (el alta rápida muestra el suyo).
  const guardarDesdeDetalle = async (payload, { toastExito = true } = {}) => {
    const { admisionId, paciente, registrosActualizados } = payload;

    if (!registrosActualizados || registrosActualizados.length === 0) {
      showToast("No hay registros para guardar", "error");
      return { ok: false, error: 'No hay registros para guardar.' };
    }

    const sinFecha = registrosActualizados.find(r => !r.fecha || String(r.fecha).trim() === '');
    if (sinFecha) {
      showToast("La fecha es requerida en todos los bloques", "error");
      return { ok: false, error: 'La fecha es requerida en todos los bloques.' };
    }

    setCargando(true);
    try {
      const gestionIdLimpio = admisionId?.trim() || 'P';
      const admisionValor = (gestionIdLimpio !== '' && gestionIdLimpio !== 'P') ? gestionIdLimpio : 'SIN_ADMISION';

      const batch = writeBatch(db);
      const logsAAgregar = [];

      let periodoAbiertoFallback = null;
      let periodoAbiertoFallbackCargado = false;
      const obtenerPeriodoAbiertoFallback = async () => {
        if (periodoAbiertoFallbackCargado) return periodoAbiertoFallback;
        periodoAbiertoFallbackCargado = true;
        const qFallback = query(
          collection(db, 'cierres_periodos'),
          where('modulo', '==', 'hemodinamia'),
          where('estado', 'in', ['ABIERTO', 'REABIERTO'])
        );
        const snapFallback = await getDocs(qFallback);
        if (!snapFallback.empty) {
          const d = snapFallback.docs[0].data();
          periodoAbiertoFallback = { anio: d.anio, mes: d.mes };
        }
        return periodoAbiertoFallback;
      };

      let totalImputadasActualizadas = 0;
      const itemsNoSincronizados = [];
      const registrosGuardados = [];

      for (const registro of registrosActualizados) {
        const dataNormalizada = {
          gestionId: gestionIdLimpio,
          agendaId: gestionIdLimpio,
          admision: admisionValor,
          nombre: paciente.nombre?.trim() || 'P',
          fecha: registro.fecha || 'P',
          empresa: registro.empresa?.trim() || 'P',
          informe: paciente.informe || 'PENDIENTE',
          convenio: paciente.convenio || 'P',
          prevision: paciente.prevision || 'P',
          medico: paciente.medico || 'P',
          descripcion: paciente.descripcion || 'P',
          observacion: (paciente.observacion || '').toString().trim(),
          centro: CENTRO_HEMODINAMIA,
          atributo: paciente.atributo || 'HEMODINAMIA',
          estado: registro.estado || 'AGENDADO',
          costo: Number(registro.costo) || 0,
          cotizaciones: registro.cotizaciones || [],
          solicitud: registro.solicitud || 'PENDIENTE',
          active: true
        };

        const original = registro.id ? buscarOriginal(registro.id) : null;

        // Viaja también cuando el doc se mueve de ruta (cambio de ID/fecha/empresa).
        dataNormalizada.fechaRegistroAdmision = calcularFechaRegistroAdmision({
          idAnterior: original?.gestionId || original?.agendaId,
          idNuevo: dataNormalizada.gestionId,
          fechaAnterior: original?.fechaRegistroAdmision
        });
        dataNormalizada.fechaInicioCarga = registro.fechaInicioCarga || original?.fechaInicioCarga || null;
        dataNormalizada.fechaCarga = registro.fechaCarga || original?.fechaCarga || null;

        // OC por ítem (Sincronizar OC): se toma del registro EN VIVO (no de la
        // foto del detalle) para no pisar una sincronización hecha mientras el
        // detalle estaba abierto. En un update normal ocPorItem no se escribe
        // (queda intacto); solo se recalcula ocPendiente con los ítems nuevos.
        const ocPorItemActual = original?.ocPorItem || {};
        dataNormalizada.ocPendiente = calcularOcPendiente(itemsDeGestion(dataNormalizada), ocPorItemActual);

        const rutaCambio = !original || (
          original.fecha !== dataNormalizada.fecha ||
          (original.empresa || '') !== dataNormalizada.empresa ||
          ((original.gestionId || original.agendaId) || '') !== dataNormalizada.gestionId
        );

        let docRefFinal;
        let datosGuardados;

        if (original && !rutaCambio) {
          const docRef = doc(db, original.refPath);
          docRefFinal = docRef;
          datosGuardados = {
            ...dataNormalizada,
            fechaRegistro: original.fechaRegistro || new Date(),
            registradoPor: original.registradoPor || userData?.nombreCompleto || 'Usuario'
          };
          batch.update(docRef, datosGuardados);
          logsAAgregar.push({ docRef, accion: 'EDICION', detalles: dataNormalizada });
        } else {
          const detallesColRef = getDetallesRef(dataNormalizada.fecha, dataNormalizada.admision, dataNormalizada.empresa);
          const nuevoDocRef = doc(detallesColRef);
          docRefFinal = nuevoDocRef;
          datosGuardados = {
            ...dataNormalizada,
            fechaRegistro: original?.fechaRegistro || new Date(),
            registradoPor: original?.registradoPor || userData?.nombreCompleto || 'Usuario'
          };
          // El documento se mueve de ruta: las OC ya asignadas viajan con él
          // (solo las de ítems que siguen existiendo).
          const idsItems = new Set(itemsDeGestion(dataNormalizada).map(it => it.id));
          const ocPorItemVigente = Object.fromEntries(Object.entries(ocPorItemActual).filter(([id]) => idsItems.has(id)));
          if (Object.keys(ocPorItemVigente).length > 0) datosGuardados.ocPorItem = ocPorItemVigente;
          // Si estaba solicitado, conserva la solicitud (período incluido).
          if (original) Object.assign(datosGuardados, camposSolicitudDe(original));
          batch.set(nuevoDocRef, datosGuardados);
          logsAAgregar.push({ docRef: nuevoDocRef, accion: original ? 'EDICION' : 'CREACION', detalles: dataNormalizada });

          if (original) {
            const oldDocRef = doc(db, original.refPath);
            batch.delete(oldDocRef);
          }
        }

        registrosGuardados.push({ id: docRefFinal.id, refPath: docRefFinal.path, ocPorItem: ocPorItemActual, ...datosGuardados });

        const itemsAntes = original?.cotizaciones?.[0]?.items || [];
        const itemsDespues = registro.cotizaciones?.[0]?.items || [];
        const mapaAntes = new Map(itemsAntes.map(it => [it.id, it]));
        const mapaDespues = new Map(itemsDespues.map(it => [it.id, it]));

        itemsDespues.forEach(it => {
          const anterior = mapaAntes.get(it.id);
          const infoBase = {
            referencia: it.referencia,
            cantidad: it.cantidad,
            lote: it.lote,
            vencimiento: it.vencimiento,
            estadoCarga: it.estadoCarga,
            esPad: !!it.esPad,
            contenidoDePad: !!it.padPadreId,
            paciente: dataNormalizada.nombre,
            admision: dataNormalizada.gestionId
          };

          if (!anterior) {
            logsAAgregar.push({ docRef: docRefFinal, accion: 'ITEM_CREADO', detalles: infoBase });
            return;
          }

          const cambios = {};
          if (anterior.referencia !== it.referencia) cambios.referenciaAnterior = anterior.referencia;
          if (Number(anterior.cantidad) !== Number(it.cantidad)) cambios.cantidadAnterior = anterior.cantidad;
          if ((anterior.lote || '') !== (it.lote || '')) cambios.loteAnterior = anterior.lote;
          if ((anterior.vencimiento || '') !== (it.vencimiento || '')) cambios.vencimientoAnterior = anterior.vencimiento;
          if ((anterior.estadoCarga || '') !== (it.estadoCarga || '')) cambios.estadoCargaAnterior = anterior.estadoCarga;

          if (Object.keys(cambios).length > 0) {
            logsAAgregar.push({
              docRef: docRefFinal,
              accion: 'ITEM_EDITADO',
              detalles: { ...infoBase, ...cambios }
            });
          }
        });

        itemsAntes.forEach(it => {
          if (!mapaDespues.has(it.id)) {
            logsAAgregar.push({
              docRef: docRefFinal,
              accion: 'ITEM_ELIMINADO',
              detalles: {
                referencia: it.referencia,
                cantidad: it.cantidad,
                paciente: dataNormalizada.nombre,
                admision: dataNormalizada.gestionId
              }
            });
          }
        });

        const bloqueEstaSolicitado = (registro.solicitud || '').toUpperCase() === 'SOLICITADO';
        const bloqueImputacion = bloqueParaImputacion(registro, original);

        if (bloqueEstaSolicitado) {
          const itemsActuales = registro.cotizaciones?.[0]?.items || [];
          const itemsResincronizados = [];
          const itemsNoSincronizadosBloque = [];

          for (const it of itemsActuales) {
            // Bloque ya solicitado: el período de SOLICITUD (donde está
            // imputado), no el de carga del ítem (ver periodoImputacion).
            const periodoItem = periodoImputacion(bloqueImputacion, it);
            let periodoAnioItem = periodoItem?.anio;
            let periodoMesItem = periodoItem?.mes;

            if (!periodoAnioItem || !periodoMesItem) {
              const fallback = await obtenerPeriodoAbiertoFallback();
              if (!fallback) {
                const noSync = { itemId: it.id, referencia: it.referencia, motivo: 'SIN_PERIODO' };
                itemsNoSincronizados.push(noSync);
                itemsNoSincronizadosBloque.push(noSync);
                continue;
              }
              periodoAnioItem = fallback.anio;
              periodoMesItem = fallback.mes;
            }

            const abierto = await periodoEstaAbierto(periodoAnioItem, periodoMesItem);
            if (!abierto) {
              const noSync = { itemId: it.id, referencia: it.referencia, motivo: 'PERIODO_CERRADO' };
              itemsNoSincronizados.push(noSync);
              itemsNoSincronizadosBloque.push(noSync);
              continue;
            }

            itemsResincronizados.push(it.id);
            totalImputadasActualizadas++;

            batch.set(
              refImputada(periodoAnioItem, periodoMesItem, it.id),
              construirPayloadImputada(it, dataNormalizada, periodoAnioItem, periodoMesItem, userData?.nombreCompleto),
              { merge: true }
            );
          }

          if (itemsResincronizados.length > 0 || itemsNoSincronizadosBloque.length > 0) {
            logsAAgregar.push({
              docRef: docRefFinal,
              accion: 'IMPUTACION_RESINCRONIZADA',
              detalles: {
                itemsActualizados: itemsResincronizados,
                itemsNoSincronizados: itemsNoSincronizadosBloque
              }
            });
          }
        }

        (registro.itemsEliminados || []).forEach(itEliminado => {
          const periodoEliminado = periodoImputacion(bloqueImputacion, itEliminado);
          if (!periodoEliminado) return;

          const imputadaRef = doc(
            db,
            'hemodinamia_imputadas', String(periodoEliminado.anio),
            'meses', periodoEliminado.mes,
            'documentos', itEliminado.id
          );

          batch.delete(imputadaRef);
        });
      }

      await batch.commit();

      await Promise.all(
        logsAAgregar.map(({ docRef, accion, detalles }) => registrarLog(docRef, accion, detalles))
      );

      if (totalImputadasActualizadas > 0) {
        const sufijoNoSincronizados = itemsNoSincronizados.length > 0
          ? ` (${itemsNoSincronizados.length} ítem${itemsNoSincronizados.length === 1 ? '' : 's'} no se pudo sincronizar: período cerrado)`
          : '';
        showToast(
          `Gestión actualizada correctamente. ${totalImputadasActualizadas} ítem${totalImputadasActualizadas === 1 ? '' : 's'} actualizado${totalImputadasActualizadas === 1 ? '' : 's'} también en Resumen${sufijoNoSincronizados}`,
          "success"
        );
      } else if (itemsNoSincronizados.length > 0) {
        showToast(
          `Gestión actualizada, pero ${itemsNoSincronizados.length} ítem${itemsNoSincronizados.length === 1 ? '' : 's'} no se pudo sincronizar con Resumen: período cerrado`,
          "info"
        );
      } else if (toastExito) {
        showToast("Gestión actualizada correctamente", "success");
      }

      registrosGuardados.forEach(r => guardadosDesdeDetalleRef.current.set(r.id, r));
      return { ok: true, registros: registrosGuardados };
    } catch (error) {
      console.error("Error al guardar:", error);
      showToast("Error al guardar: " + error.message, "error");
      return { ok: false, error: error.message };
    } finally {
      setCargando(false);
    }
  };

  const handleDelete = (id) => {
    const implanteAEliminar = implantes.find(i => i.id === id);
    if (!implanteAEliminar || !implanteAEliminar.refPath) return;

    confirmAction(
      "Eliminar Gestión",
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      async () => {
        try {
          const docRef = doc(db, implanteAEliminar.refPath);
          await registrarLog(docRef, 'ELIMINACION', {
            idGestion: implanteAEliminar?.gestionId || implanteAEliminar?.agendaId || '',
            nombre: implanteAEliminar?.nombre || ''
          });

          await deleteDoc(docRef);
          showToast("Gestión eliminada correctamente", "info");
        } catch (error) {
          console.error("Error al eliminar:", error);
          showToast("Error al eliminar", "error");
        }
      }
    );
  };

  const iniciarEdicion = (i) => {
    setEditingId(i.id);
    setEditingRefPath(i.refPath);
    setFormData({
      gestionId: i.gestionId || i.agendaId || '',
      agendaId: i.gestionId || i.agendaId || '',
      nombre: i.nombre || '',
      fecha: i.fecha || '',
      empresa: i.empresa || '',
      informe: i.informe || 'PENDIENTE',
      observacion: i.observacion || '',
      convenio: i.convenio || 'P',
      prevision: i.prevision || 'P',
      medico: i.medico || 'P',
      descripcion: i.descripcion || 'P',
      centro: CENTRO_HEMODINAMIA,
      atributo: i.atributo || 'HEMODINAMIA',
      estado: i.estado || 'AGENDANDO',
      costo: i.costo ?? 0,
      active: i.active !== undefined ? i.active : true
    });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setEditingRefPath(null);
    setFormData(getInitialFormState());
  };

  const cargarLogsDeImplante = async (implante) => {
    if (!implante || !implante.refPath) return;
    setSelectedImplanteForLog(implante);
    setLoadingLogs(true);

    try {
      const docRef = doc(db, implante.refPath);
      const logsRef = collection(docRef, "logs");
      const q = query(logsRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      setLogsList(snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
    } catch (error) {
      console.error("Error cargando logs:", error);
      showToast("Error al cargar el historial", "error");
    } finally {
      setLoadingLogs(false);
    }
  };

  const abrirHistorialLogs = async (implante) => {
    setShowLogDrawer(true);
    await cargarLogsDeImplante(implante);
  };

  const handleEjecutarImportacion = async () => {
    if (!importFile) return showToast("Por favor selecciona un archivo para importar", "error");

    setImporting(true);
    try {
      const registros = await parsearArchivoImportacion(importFile);
      if (registros.length === 0) throw new Error("El archivo no contiene registros válidos");

      const BATCH_SIZE = 250;
      let index = 0;

      while (index < registros.length) {
        const chunk = registros.slice(index, index + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const gestionIdLimpio = (item.gestionId || item.agendaId)?.trim() || 'P';
          const admisionValor = (gestionIdLimpio !== '' && gestionIdLimpio !== 'P') ? gestionIdLimpio : 'SIN_ADMISION';

          const detallesColRef = getDetallesRef(item.fecha, admisionValor, item.empresa);
          const implanteRef = doc(detallesColRef);
          const logRef = doc(collection(implanteRef, "logs"));

          const dataRegistro = {
            gestionId: gestionIdLimpio,
            agendaId: gestionIdLimpio,
            admision: admisionValor,
            nombre: item.nombre || 'P',
            fecha: item.fecha || 'P',
            empresa: item.empresa || 'P',
            informe: item.informe || 'PENDIENTE',
            convenio: item.convenio || 'P',
            prevision: item.prevision || 'P',
            medico: item.medico || 'P',
            descripcion: item.descripcion || 'P',
            centro: CENTRO_HEMODINAMIA,
            atributo: item.atributo || 'HEMODINAMIA',
            estado: item.estado || 'AGENDANDO',
            costo: Number(item.costo) || 0,
            solicitud: 'PENDIENTE',
            active: true,
            ocPendiente: false, // sin ítems todavía: nada que sincronizar
            registradoPor: userData?.nombreCompleto || 'Importación Masiva',
            fechaRegistro: new Date(),
            fechaRegistroAdmision: calcularFechaRegistroAdmision({ idNuevo: gestionIdLimpio })
          };

          batch.set(implanteRef, dataRegistro);

          batch.set(logRef, {
            accion: 'IMPORTACION',
            detalles: dataRegistro,
            active: true,
            usuario: userData?.nombreCompleto || 'Importación Masiva',
            usuarioEmail: userData?.email || '',
            timestamp: serverTimestamp()
          });
        }
        await batch.commit();
        index += BATCH_SIZE;
      }

      showToast(`Se importaron ${registros.length} gestiones con éxito`, "success");
      setImportFile(null);
      setShowConfigDrawer(false);
    } catch (error) {
      console.error("Error al importar:", error);
      showToast("Error al importar: " + error.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return {
    implantes,
    hayMasGestiones,
    cargarMasGestiones,
    formData,
    setFormData,
    editingId,
    cargando,
    showLogDrawer,
    setShowLogDrawer,
    selectedImplanteForLog,
    logsList,
    loadingLogs,
    showConfigDrawer,
    setShowConfigDrawer,
    sincronizando,
    handleSincronizarVinculados,
    importFile,
    setImportFile,
    importing,
    handleCopiarTexto,
    handleIdChange,
    handleGuardar,
    guardarDesdeDetalle,
    agregarEmpresaFechaDesdeDetalle,
    handleDelete,
    iniciarEdicion,
    cancelarEdicion,
    abrirHistorialLogs,
    cargarLogsDeImplante,
    handleExportarDatos: () => exportarGestionesAExcel(implantes, showToast),
    handleDescargarPlantilla: () => descargarPlantillaCSV(showToast),
    handleEjecutarImportacion
  };
};
