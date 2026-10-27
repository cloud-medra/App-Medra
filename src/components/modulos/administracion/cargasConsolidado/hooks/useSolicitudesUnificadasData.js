import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collectionGroup,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  documentId,
  writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../../../../firebaseConfig';
import { usePeriodoAbiertoStore } from '../../../../../hooks/usePeriodoAbiertoStore';
import { onSnapshotVisible } from '../../../../../hooks/useVisibleSnapshot';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { refImputada as refImputadaImplantes, descomponerFecha } from '../../../operaciones/implantes/gestionImplantes/utils/imputadaSync';
import { registrarLogImplantes } from '../../../operaciones/implantes/gestionImplantes/utils/registrarLogImplantes';
import { registrarLogConsignacion } from '../../../operaciones/consignacion/utils/registrarLogConsignacion';
import { registrarLogHemodinamia } from '../../../operaciones/hemodinamia/gestionHemodinamia/utils/registrarLogHemodinamia';
import { consultaCandidatosSolicitudConsignacion, construirCandidatosSolicitudConsignacion } from '../../../operaciones/consignacion/solicitudConsignacion/utils/cargarCandidatosSolicitudConsignacion';
import { ORIGEN, normalizarSolicitudImplantes, normalizarSolicitudConsignacion, normalizarSolicitudHemodinamia, filtrarPorBusquedaYOrigen } from '../utils/normalizarFila';
import { construirHojasSolicitudUnificada, formatearFechaExcel } from '../utils/hojasExcelSolicitud';
import { limpiarParaFirestore, camposUndefined } from '../utils/limpiarParaFirestore';
import { camposPeriodoSolicitud } from '../../../operaciones/shared/periodoImputacion';
import { fotoItems } from '../../../operaciones/shared/solicitudModificaciones/modificacionesSolicitud';
import { fotoRegistroConsignacion } from '../../../operaciones/consignacion/utils/modificacionesConsignacion';

const RANGO_MIN_IMPLANTES = 'implantes_gestiones/0000';
const RANGO_MAX_IMPLANTES = 'implantes_gestiones/9999';
const RANGO_MIN_HEMODINAMIA = 'hemodinamia_gestiones/0000';
const RANGO_MAX_HEMODINAMIA = 'hemodinamia_gestiones/9999';

// Un mismo bloque de Implantes/Hemodinamia puede aparecer en varias filas
// (una por ítem) — al exportar, hay que deduplicar por refPath antes de
// iterar bloque por bloque, para no repetir 3 veces la escritura de un
// bloque de 3 ítems.
const dedupePorRefPath = (arr) => {
  const vistos = new Set();
  return arr.filter(f => (vistos.has(f.refPath) ? false : (vistos.add(f.refPath), true)));
};

const separarPorOrigen = (filas) => {
  const seleccionImplantes = filas.filter(f => f.origen === ORIGEN.IMPLANTES);
  const seleccionConsignacion = filas.filter(f => f.origen === ORIGEN.CONSIGNACION);
  const seleccionHemodinamia = filas.filter(f => f.origen === ORIGEN.HEMODINAMIA);
  return {
    // Las filas de desglose de guía (esFilaGuia) no tienen documento propio
    // (_raw.ref === null) — van al Excel igual que cualquier otra fila
    // seleccionada, pero se excluyen de las escrituras a Firestore
    // (mismo criterio que itemsConRef en la pantalla nativa de Consignación).
    seleccionConsignacionConRef: seleccionConsignacion.filter(f => !f._raw.esFilaGuia),
    seleccionImplantesUnica: dedupePorRefPath(seleccionImplantes),
    seleccionHemodinamiaUnica: dedupePorRefPath(seleccionHemodinamia)
  };
};

// Las filas de desglose de guía tienen id `guia-<delivery>-<idx>` (ver
// cargarCandidatosSolicitudConsignacion) — mismo parseo que la pantalla
// nativa de Consignación.
const deliveryDeFilaGuia = (fila) => {
  const id = fila._raw.id || '';
  return id.startsWith('guia-') ? id.slice('guia-'.length, id.lastIndexOf('-')) : null;
};

// Protección contra doble exportación: relee en Firestore el estado ACTUAL
// de cada documento de origen seleccionado (no el de la tabla, que podría
// estar desactualizado) y descarta los que ya no están pendientes —
// Implantes/Hemodinamia: solicitud !== 'SOLICITAR'; Consignación:
// estado !== 'CARGADO'. Son los mismos criterios con que cada origen entra
// a esta tabla. Las filas de guía de un ítem descartado se descartan con él.
const descartarYaSolicitados = async (filasSeleccionadas) => {
  const { seleccionImplantesUnica, seleccionConsignacionConRef, seleccionHemodinamiaUnica } = separarPorOrigen(filasSeleccionadas);
  const unidades = [...seleccionImplantesUnica, ...seleccionConsignacionConRef, ...seleccionHemodinamiaUnica];

  const pendientes = await Promise.all(unidades.map(async (fila) => {
    if (fila.origen === ORIGEN.CONSIGNACION) {
      const snap = await getDoc(fila._raw.ref);
      return snap.exists() && snap.data().estado === 'CARGADO';
    }
    const snap = await getDoc(doc(db, fila.refPath));
    return snap.exists() && snap.data().solicitud === 'SOLICITAR';
  }));

  const descartadas = unidades.filter((_, i) => !pendientes[i]);
  const selectIdsDescartados = new Set(descartadas.map(f => f.selectId));
  const deliveriesDescartados = new Set(
    descartadas.filter(f => f.origen === ORIGEN.CONSIGNACION).map(f => f._raw.delivery).filter(Boolean)
  );

  const vigentes = filasSeleccionadas.filter(f => {
    if (selectIdsDescartados.has(f.selectId)) return false;
    if (f.origen === ORIGEN.CONSIGNACION && f._raw.esFilaGuia) return !deliveriesDescartados.has(deliveryDeFilaGuia(f));
    return true;
  });
  return { vigentes, descartadas };
};

// Período activo de un módulo desde el listener compartido de
// cierres_periodos (src/stores/periodosStore.js).
const usePeriodoActivo = (modulo) => {
  const { periodo } = usePeriodoAbiertoStore(modulo);
  return useMemo(() => (periodo ? { anio: periodo.anio, mes: periodo.mes } : null), [periodo]);
};

export const useSolicitudesUnificadasData = () => {
  const [bloquesImplantes, setBloquesImplantes] = useState([]);
  const [itemsConsignacion, setItemsConsignacion] = useState([]);
  const [docsHemodinamia, setDocsHemodinamia] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());

  const [busqueda, setBusqueda] = useState('');
  const [origenesSeleccionados, setOrigenesSeleccionados] = useState([]);
  const toggleOrigen = (origen) => setOrigenesSeleccionados(prev =>
    prev.includes(origen) ? prev.filter(o => o !== origen) : [...prev, origen]
  );
  const limpiarOrigenes = () => setOrigenesSeleccionados([]);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  const periodoImplantes = usePeriodoActivo('implantes');
  const periodoConsignacion = usePeriodoActivo('consignacion');
  const periodoHemodinamia = usePeriodoActivo('hemodinamia');

  useEffect(() => {
    const q = query(
      collectionGroup(db, 'detalles'),
      where('solicitud', '==', 'SOLICITAR'),
      where(documentId(), '>=', RANGO_MIN_IMPLANTES),
      where(documentId(), '<', RANGO_MAX_IMPLANTES),
      orderBy(documentId())
    );
    const unsub = onSnapshotVisible(q, (snap) => {
      setBloquesImplantes(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
    }, (err) => console.error('Error al escuchar solicitudes de Implantes:', err));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collectionGroup(db, 'detalles'),
      where('solicitud', '==', 'SOLICITAR'),
      where(documentId(), '>=', RANGO_MIN_HEMODINAMIA),
      where(documentId(), '<', RANGO_MAX_HEMODINAMIA),
      orderBy(documentId())
    );
    const unsub = onSnapshotVisible(q, (snap) => {
      setDocsHemodinamia(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
    }, (err) => console.error('Error al escuchar solicitudes de Hemodinamia:', err));
    return () => unsub();
  }, []);

  // Consignación usa la MISMA consulta y el mismo armado de filas (ítems +
  // desglose de guía por delivery) que la pantalla nativa
  // (cargarCandidatosSolicitudConsignacion), pero escuchada en vivo con
  // igual que Implantes y Hemodinamia arriba. Antes era una
  // lectura puntual (getDocs): al exportar, los ítems pasaban a
  // SOLICITADO en Firestore pero la tabla nunca se enteraba, y seguían
  // visibles (y re-seleccionables) hasta recargar la página.
  // El armado es asíncrono (resuelve guías/maestros, con caché), así que
  // se descarta el resultado de un snapshot si ya llegó uno más nuevo.
  useEffect(() => {
    let ultimoSnapshot = 0;
    const unsub = onSnapshotVisible(consultaCandidatosSolicitudConsignacion(), async (snap) => {
      const numero = ++ultimoSnapshot;
      try {
        // ordenCarga: mismo orden que la pantalla nativa (carga masiva en el
        // orden de ingreso, cada admisión junta). Solo afecta a estas filas.
        const lista = await construirCandidatosSolicitudConsignacion(snap.docs, false, { ordenCarga: true });
        if (numero === ultimoSnapshot) setItemsConsignacion(lista);
      } catch (err) {
        console.error('Error al armar solicitudes de Consignación:', err);
      } finally {
        if (numero === ultimoSnapshot) setCargando(false);
      }
    }, (err) => {
      console.error('Error al escuchar solicitudes de Consignación:', err);
      setCargando(false);
    });
    return () => unsub();
  }, []);

  // flatMap (no map): cada bloque de Implantes/Hemodinamia se expande a una
  // fila POR ÍTEM, para que la tabla combinada muestre la misma estructura
  // fila-por-ítem que las pantallas nativas de Solicitud.
  const filasCombinadas = [
    ...bloquesImplantes.flatMap(normalizarSolicitudImplantes),
    ...itemsConsignacion.flatMap(normalizarSolicitudConsignacion),
    ...docsHemodinamia.flatMap(normalizarSolicitudHemodinamia)
  ];

  // Búsqueda por admisión/nombre + Origen se aplican sobre el conjunto
  // COMPLETO ya combinado (sin límite ni recorte previo) — ver comentario
  // arriba sobre por qué Consignación ahora trae el total real.
  const filas = filtrarPorBusquedaYOrigen(filasCombinadas, { busqueda, origenesSeleccionados });

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // "Seleccionar todos" cuenta unidades exportables (selectId), no filas
  // visuales — un bloque de Implantes/Hemodinamia con 3 ítems son 3 filas
  // pero 1 sola unidad seleccionable (el checkbox de todas esas filas
  // comparte el mismo selectId, igual que en las pantallas nativas).
  const selectIdsUnicos = [...new Set(filas.map(f => f.selectId))];
  const toggleSeleccionarTodos = () => {
    setSeleccionados(prev => (prev.size === selectIdsUnicos.length ? new Set() : new Set(selectIdsUnicos)));
  };

  // Bloqueo síncrono contra doble ejecución (doble clic en "Confirmar"
  // del modal): `exportando` es estado de React y no alcanza a
  // actualizarse entre dos clics seguidos; el ref sí.
  const exportandoRef = useRef(false);

  const handleExportarYMarcarSolicitado = () => {
    if (exportandoRef.current) return;
    const filasSeleccionadas = filas.filter(f => seleccionados.has(f.selectId));
    if (filasSeleccionadas.length === 0) {
      showToast('Selecciona al menos un registro para exportar', 'error');
      return;
    }

    const seleccion = separarPorOrigen(filasSeleccionadas);

    if (seleccion.seleccionImplantesUnica.length > 0 && !periodoImplantes) {
      showToast('No hay un período abierto para Implantes en Control Mensual. Ábrelo antes de exportar.', 'error');
      return;
    }
    if (seleccion.seleccionConsignacionConRef.length > 0 && !periodoConsignacion) {
      showToast('No hay un período abierto para Consignación en Control Mensual. Ábrelo antes de exportar.', 'error');
      return;
    }

    if (seleccion.seleccionHemodinamiaUnica.length > 0 && !periodoHemodinamia) {
      showToast('No hay un período abierto para Hemodinamia en Control Mensual. Ábrelo antes de exportar.', 'error');
      return;
    }

    confirmAction(
      'Exportar y Marcar como Solicitado',
      `Se exportarán ${filasSeleccionadas.length} fila(s) a un único Excel: ${seleccion.seleccionImplantesUnica.length} gestión(es) de Implantes, ${seleccion.seleccionConsignacionConRef.length} ítem(s) reales de Consignación (las filas de desglose de guía son informativas y no tienen documento propio) y ${seleccion.seleccionHemodinamiaUnica.length} gestión(es) de Hemodinamia quedarán marcados como SOLICITADO. Cada uno se copiará a la colección de imputadas de su propio módulo. ¿Continuar?`,
      async () => {
        if (exportandoRef.current) return;
        exportandoRef.current = true;
        setExportando(true);
        try {
          const { vigentes, descartadas } = await descartarYaSolicitados(filasSeleccionadas);
          if (descartadas.length > 0) {
            console.warn(
              '[Solicitud unificada] Se omiten registros que en Firestore ya no están pendientes (ya fueron solicitados):',
              descartadas.map(f => `${f.origen} · ${f._raw.ref?.path || f.refPath}`)
            );
          }
          if (vigentes.length === 0) {
            showToast('Los registros seleccionados ya habían sido solicitados; no se exportó nada.', 'error');
            setSeleccionados(new Set());
            return;
          }
          const { seleccionImplantesUnica, seleccionConsignacionConRef, seleccionHemodinamiaUnica } = separarPorOrigen(vigentes);

          const fechaHoy = new Date().toISOString().slice(0, 10);
          const fechaHoyFormato = formatearFechaExcel(fechaHoy);

          // `vigentes` ya viene a nivel de ítem (ver normalizarSolicitud*
          // en normalizarFila.js), así que cada fila es exactamente una
          // fila de detalle del Excel.
          const workbook = XLSX.utils.book_new();
          construirHojasSolicitudUnificada(vigentes, fechaHoyFormato).forEach(({ nombre, filas: filasHoja }) => {
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filasHoja), nombre);
          });
          XLSX.writeFile(workbook, `solicitud_unificada_${fechaHoy}.xlsx`);

          // Un solo pool de batches compartido — cada write apunta a la ruta
          // de SU PROPIA colección (implantes_gestiones/implantes_imputadas
          // vs. consignacion_registros/consignacion_imputadas), así que un
          // batch puede mezclar operaciones de ambos módulos sin problema:
          // lo que decide el destino es la ruta del doc, no el batch.
          //
          // Toda escritura pasa por agregarEscritura: sanea `undefined`
          // (Firestore lo rechaza y un solo campo así tumbaba el batch
          // entero) y, si algo falla, el error dice origen + documento.
          // Cada batch guarda qué documentos lleva, para poder informar
          // qué quedó escrito si falla un commit intermedio.
          let opsEnBatch = 0;
          let batchActual = { batch: writeBatch(db), docs: [] };
          const batches = [batchActual];
          const agregarEscritura = ({ origen, tipo, ref, datos }) => {
            const faltantes = camposUndefined(datos);
            if (faltantes.length > 0) {
              console.warn(`[Solicitud unificada] ${origen} · ${ref.path}: campos sin dato, no se guardan: ${faltantes.join(', ')}`);
            }
            const limpio = limpiarParaFirestore(datos);
            if (opsEnBatch >= 400) {
              batchActual = { batch: writeBatch(db), docs: [] };
              batches.push(batchActual);
              opsEnBatch = 0;
            }
            try {
              if (tipo === 'set') batchActual.batch.set(ref, limpio, { merge: true });
              else batchActual.batch.update(ref, limpio);
            } catch (err) {
              throw new Error(`[${origen}] ${ref.path}: ${err.message}`, { cause: err });
            }
            batchActual.docs.push(`${origen} · ${ref.path}`);
            opsEnBatch++;
          };

          const logsAEjecutar = [];

          // Implantes: mismo criterio que su Solicitud nativa
          // (shared/solicitud/useSolicitudGestionesData.js) — el ítem SIEMPRE se imputa al
          // período actualmente abierto (periodoImplantes), nunca al
          // período que tenía guardado de cuando fue cargado. Antes acá se
          // usaba `it.periodoAnio || periodoImplantes.anio` (preferir el
          // período de carga del ítem), lo que hacía que la misma acción
          // de "Solicitar" imputara en un mes distinto según si se
          // ejecutaba desde Implantes nativo o desde Cargas Consolidado —
          // y además dejaba a Implantes inconsistente con Consignación y
          // Hemodinamia acá mismo, que sí siempre usan el período abierto.
          // El período de carga original se conserva solo como dato
          // informativo en periodoAnioCarga/periodoMesCarga (igual que en
          // la pantalla nativa), sin afectar a qué documento se escribe.
          const periodoTextoImplantes = periodoImplantes
            ? `${periodoImplantes.mes.charAt(0).toUpperCase()}${periodoImplantes.mes.slice(1).toLowerCase()} ${periodoImplantes.anio}`
            : '';

          seleccionImplantesUnica.forEach(fila => {
            const raw = fila._raw;
            // OJO: el doc crudo de implantes_gestiones anida los ítems en
            // cotizaciones[0].items, no en bloque.items — leer bloque.items
            // acá (como hacía la versión anterior) siempre daba un arreglo
            // vacío, así que las gestiones de Implantes exportadas desde
            // Cargas Consolidado nunca escribían sus ítems en
            // implantes_imputadas (solo el bloque quedaba marcado
            // SOLICITADO, sin ningún ítem imputado).
            const itemsBloque = raw.cotizaciones?.[0]?.items || [];
            // `_raw` es el doc CRUDO de implantes_gestiones: no tiene
            // `numCotizacion` en la raíz (vive en cotizaciones[0]) ni los
            // valores por defecto que sí arma la Solicitud nativa
            // (shared/solicitud/useSolicitudGestionesData.js). Se reconstruye el bloque con
            // esos mismos defaults, para que lo imputado sea idéntico a lo
            // que imputa la pantalla nativa. Antes `bloque.numCotizacion`
            // era siempre undefined y cualquier ítem sin numCotizacion
            // propio hacía fallar el batch.
            const bloque = {
              refPath: raw.refPath,
              gestionId: raw.gestionId || raw.agendaId || 'P',
              agendaId: raw.agendaId || raw.gestionId || 'P',
              admision: raw.admision || 'P',
              nombre: raw.nombre || 'P',
              medico: raw.medico || 'P',
              empresa: raw.empresa || 'P',
              fecha: raw.fecha || 'P',
              informe: raw.informe || 'PENDIENTE',
              convenio: raw.convenio || 'P',
              prevision: raw.prevision || 'P',
              descripcion: raw.descripcion || 'P',
              centro: raw.centro || 'PABELLON',
              atributo: raw.atributo || 'IMPLANTES',
              estado: raw.estado || 'AGENDANDO',
              costo: raw.costo || 0,
              numCotizacion: raw.cotizaciones?.[0]?.numCotizacion || 'P'
            };
            const docRef = doc(db, bloque.refPath);
            agregarEscritura({ origen: 'Implantes', tipo: 'update', ref: docRef, datos: {
              solicitud: 'SOLICITADO',
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodo: periodoTextoImplantes,
              ...camposPeriodoSolicitud(periodoImplantes),
              // Foto de lo solicitado (base de Solicitudes de modificaciones,
              // igual que la Solicitud de Implantes).
              itemsSolicitados: fotoItems(itemsBloque),
              modificacionPendiente: false
            } });

            const { anio, mes, dia } = descomponerFecha(bloque.fecha);

            itemsBloque.forEach(it => {
              agregarEscritura({
                origen: 'Implantes',
                tipo: 'set',
                ref: refImputadaImplantes(periodoImplantes.anio, periodoImplantes.mes, it.id),
                datos: {
                  gestionId: bloque.gestionId,
                  agendaId: bloque.agendaId,
                  admision: bloque.admision,
                  paciente: bloque.nombre,
                  medico: bloque.medico,
                  fecha: bloque.fecha,
                  anio,
                  mes,
                  dia,
                  empresa: bloque.empresa,
                  informe: bloque.informe,
                  convenio: bloque.convenio,
                  prevision: bloque.prevision,
                  descripcion: bloque.descripcion,
                  centro: bloque.centro,
                  atributo: bloque.atributo,
                  estado: bloque.estado,
                  costoGestion: bloque.costo,

                  numCotizacion: it.numCotizacion || bloque.numCotizacion,
                  itemId: it.id,
                  referencia: it.referencia || 'P',
                  codigo: it.codigo || 'P',
                  descriptorAuto: it.descriptorAuto || 'P',
                  clase: it.clase || 'P',
                  tipoVinculado: it.tipoVinculado || 'P',
                  detalle: it.detalle || 'P',
                  empresaVinculada: it.empresaVinculada || 'P',
                  precio: Number(it.precio) || 0,
                  cantidad: Number(it.cantidad) || 0,
                  vecesCosto: Number(it.vecesCosto) || 1,
                  recargoEncontrado: !!it.recargoEncontrado,
                  venta: Number(it.venta) || 0,
                  total: Number(it.totalItem) || 0,
                  lote: it.lote || 'P',
                  vencimiento: it.vencimiento || '',
                  sinCodigo: !!it.sinCodigo,
                  estadoCarga: it.estadoCarga || 'PENDIENTE',

                  periodoAnio: periodoImplantes.anio,
                  periodoMes: periodoImplantes.mes,
                  periodo: periodoTextoImplantes,
                  periodoAnioCarga: it.periodoAnio || null,
                  periodoMesCarga: it.periodoMes || null,

                  registradoPor: userData?.nombreCompleto || 'Usuario',
                  actualizadoEn: new Date()
                }
              });
            });

            logsAEjecutar.push(() => registrarLogImplantes(docRef, 'SOLICITUD_EXPORTADA', {
              gestionId: fila.gestionId,
              empresa: fila.empresa,
              fecha: fila.fecha,
              cantidadItems: itemsBloque.length,
              periodoAnio: periodoImplantes.anio,
              periodoMes: periodoImplantes.mes
            }, userData));
          });

          seleccionConsignacionConRef.forEach(fila => {
            const it = fila._raw;
            agregarEscritura({ origen: 'Consignación', tipo: 'update', ref: it.ref, datos: {
              estado: 'SOLICITADO',
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodoAnio: periodoConsignacion.anio,
              periodoMes: periodoConsignacion.mes,
              // Foto de lo solicitado (base de Solicitudes de modificaciones).
              itemsSolicitados: fotoRegistroConsignacion(it.id, it.datosOriginales),
              modificacionPendiente: false
            } });

            const imputadaRef = doc(
              db,
              'consignacion_imputadas', String(periodoConsignacion.anio),
              'meses', periodoConsignacion.mes,
              'documentos', it.id
            );
            // eslint-disable-next-line no-unused-vars
            const { ref: _ref, refPath: _refPath, numeroGuiaParaImputar, ...datosItemLimpios } = it;
            agregarEscritura({ origen: 'Consignación', tipo: 'set', ref: imputadaRef, datos: {
              ...datosItemLimpios,
              numeroGuia: numeroGuiaParaImputar ?? it.numeroGuia,
              filasGuia: it.filasGuia || [],
              estado: 'SOLICITADO',
              total: (Number(it.costo) || 0) * (Number(it.cantidad) || 1),
              fechaIngreso: fechaHoyFormato,
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodoAnio: periodoConsignacion.anio,
              periodoMes: periodoConsignacion.mes,
              modulo: 'CONSIGNACION',
              actualizadoEn: new Date()
            } });

            logsAEjecutar.push(() => registrarLogConsignacion(it.ref, 'SOLICITUD_EXPORTADA', {
              gestionId: fila.gestionId,
              codigo: it.codigo,
              cantidad: it.cantidad,
              costo: it.costo,
              periodoAnio: periodoConsignacion.anio,
              periodoMes: periodoConsignacion.mes
            }, userData));
          });

          // Hemodinamia: mismo criterio que su Solicitud nativa — todos los
          // ítems se imputan al período abierto (periodoAnioCarga/MesCarga
          // conservan el de la carga original).
          const periodoTextoHemodinamia = periodoHemodinamia
            ? `${periodoHemodinamia.mes.charAt(0).toUpperCase()}${periodoHemodinamia.mes.slice(1).toLowerCase()} ${periodoHemodinamia.anio}`
            : '';

          seleccionHemodinamiaUnica.forEach(fila => {
            const bloque = fila._raw;
            const docRef = doc(db, bloque.refPath);
            agregarEscritura({ origen: 'Hemodinamia', tipo: 'update', ref: docRef, datos: {
              solicitud: 'SOLICITADO',
              fechaSolicitud: new Date(),
              solicitadoPor: userData?.nombreCompleto || 'Usuario',
              periodo: periodoTextoHemodinamia,
              ...camposPeriodoSolicitud(periodoHemodinamia),
              itemsSolicitados: fotoItems(bloque.items),
              modificacionPendiente: false
            } });

            const [anioF, mesF, diaF] = bloque.fecha && bloque.fecha.includes('-')
              ? bloque.fecha.split('-')
              : ['0000', '00', '00'];

            bloque.items.forEach(it => {
              const imputadaRef = doc(
                db,
                'hemodinamia_imputadas', String(periodoHemodinamia.anio),
                'meses', periodoHemodinamia.mes,
                'documentos', it.id
              );
              agregarEscritura({ origen: 'Hemodinamia', tipo: 'set', ref: imputadaRef, datos: {
                gestionId: bloque.gestionId,
                agendaId: bloque.agendaId,
                admision: bloque.admision,
                paciente: bloque.nombre,
                medico: bloque.medico,
                fecha: bloque.fecha,
                anio: anioF,
                mes: mesF,
                dia: diaF,
                empresa: bloque.empresa,
                informe: bloque.informe,
                convenio: bloque.convenio,
                prevision: bloque.prevision,
                descripcion: bloque.descripcion,
                centro: bloque.centro,
                atributo: bloque.atributo,
                estado: bloque.estado,
                costoGestion: bloque.costo,

                numCotizacion: it.numCotizacion || bloque.numCotizacion,
                itemId: it.id,
                referencia: it.referencia || 'P',
                codigo: it.codigo || 'P',
                descriptorAuto: it.descriptorAuto || 'P',
                clase: it.clase || 'P',
                tipoVinculado: it.tipoVinculado || 'P',
                detalle: it.detalle || 'P',
                empresaVinculada: it.empresaVinculada || 'P',
                precio: Number(it.precio) || 0,
                cantidad: Number(it.cantidad) || 0,
                vecesCosto: Number(it.vecesCosto) || 1,
                recargoEncontrado: !!it.recargoEncontrado,
                venta: Number(it.venta) || 0,
                total: Number(it.totalItem) || 0,
                lote: it.lote || 'P',
                vencimiento: it.vencimiento || '',
                sinCodigo: !!it.sinCodigo,
                estadoCarga: it.estadoCarga || 'PENDIENTE',

                periodoAnio: periodoHemodinamia.anio,
                periodoMes: periodoHemodinamia.mes,
                periodo: periodoTextoHemodinamia,
                periodoAnioCarga: it.periodoAnio || null,
                periodoMesCarga: it.periodoMes || null,

                registradoPor: userData?.nombreCompleto || 'Usuario',
                actualizadoEn: new Date()
              } });
            });

            logsAEjecutar.push(() => registrarLogHemodinamia(docRef, 'SOLICITUD_EXPORTADA', {
              gestionId: fila.gestionId,
              empresa: fila.empresa,
              fecha: fila.fecha,
              cantidadItems: bloque.items.length,
              periodoAnio: periodoHemodinamia.anio,
              periodoMes: periodoHemodinamia.mes,
              periodo: periodoTextoHemodinamia
            }, userData));
          });

          // Los batches se confirman en orden; si falla uno que no es el
          // primero, los anteriores YA quedaron escritos — se deja en
          // consola exactamente qué documentos para revisarlos.
          for (let i = 0; i < batches.length; i++) {
            try {
              await batches[i].batch.commit();
            } catch (err) {
              const yaEscritos = batches.slice(0, i).flatMap(b => b.docs);
              console.error(
                `[Solicitud unificada] Falló el commit del batch ${i + 1}/${batches.length}. ` +
                (yaEscritos.length > 0
                  ? `Quedaron escritos ${yaEscritos.length} documento(s) de batches anteriores:`
                  : 'No se escribió ningún documento.'),
                yaEscritos,
                '\nDocumentos del batch fallido:', batches[i].docs
              );
              throw err;
            }
          }

          await Promise.all(logsAEjecutar.map(fn => fn()));

          setSeleccionados(new Set());
          const avisoOmitidos = descartadas.length > 0 ? ` (${descartadas.length} omitido(s): ya estaban solicitados)` : '';
          showToast(`Se exportaron y marcaron como SOLICITADO ${vigentes.length} registro(s)${avisoOmitidos}`, 'success');
        } catch (error) {
          console.error('Error al exportar solicitud unificada:', error);
          showToast('Error al exportar: ' + error.message, 'error');
        } finally {
          exportandoRef.current = false;
          setExportando(false);
        }
      }
    );
  };

  return {
    filas,
    totalFilas: filas.length,
    cargando,
    exportando,
    seleccionados,
    toggleSeleccion,
    toggleSeleccionarTodos,
    busqueda, setBusqueda,
    origenesSeleccionados, toggleOrigen, limpiarOrigenes,
    periodoImplantes,
    periodoConsignacion,
    periodoHemodinamia,
    handleExportarYMarcarSolicitado
  };
};
