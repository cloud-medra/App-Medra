import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, collectionGroup, doc, documentId, getDocs, limit, orderBy, query, serverTimestamp,
  startAfter, where, writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../../../../firebaseConfig';
import { onSnapshotVisible } from '../../../../../hooks/useVisibleSnapshot';
import { moduloGestion, rangoGestiones } from '../modulosGestion';
import {
  fotoItems, diferenciasContraFoto, construirFilasModificaciones, libroModificaciones,
  nombreArchivoModificaciones, tituloModificaciones, textoPeriodoSolicitud
} from './modificacionesSolicitud';
import { CONFIG_MODIFICACIONES_CONSIGNACION } from '../../consignacion/utils/modificacionesConsignacion';

// Consignación no es un módulo de Gestión (no está en MODULOS_GESTION):
// trae su propia configuración con los mismos campos que usa esta pantalla.
export const configModificaciones = (modulo) => (
  modulo === CONFIG_MODIFICACIONES_CONSIGNACION.clave ? CONFIG_MODIFICACIONES_CONSIGNACION : moduloGestion(modulo)
);

// Historial de descargas de modificaciones (un documento por descarga, con
// las filas exactas del archivo para poder volver a descargarlo igual).
export const COLECCION_MODIFICACIONES_EXPORTADAS = 'modificaciones_exportadas';
export const TAMANO_PAGINA_HISTORIAL = 10;

// Opciones del Excel propias del módulo (por defecto, las de Implantes).
export const opcionesFilas = (config) => (config.columnaNumeroExcel ? { columnaNumero: config.columnaNumeroExcel } : {});

const fechaHoyISO = () => new Date().toISOString().slice(0, 10);
const fechaHoyTexto = () => {
  const [y, m, d] = fechaHoyISO().split('-');
  return `${d}-${m}-${y}`;
};

// Bloque de la pantalla a partir del documento de la gestión (en
// Consignación, del registro: un bloque de un solo ítem, ver config.itemsDe).
const bloqueDesdeDoc = (config, document) => {
  const data = document.data();
  const items = config.itemsDe ? config.itemsDe(document.id, data) : (data.cotizaciones?.[0]?.items || []);
  const bloque = {
    id: document.id,
    refPath: document.ref.path,
    gestionId: data.gestionId || data.agendaId || 'P',
    nombre: data.nombre || 'P',
    medico: data.medico || 'P',
    empresa: data.empresa || 'P',
    fecha: data.fecha || 'P',
    fechaSolicitud: data.fechaSolicitud || null,
    solicitadoPor: data.solicitadoPor || '',
    periodo: data.periodo || '',
    // Consignación guarda el período de la solicitud en periodoAnio/periodoMes.
    periodoSolicitudAnio: data.periodoSolicitudAnio || (config.itemsDe ? data.periodoAnio : '') || '',
    periodoSolicitudMes: data.periodoSolicitudMes || (config.itemsDe ? data.periodoMes : '') || '',
    numCotizacion: data.cotizaciones?.[0]?.numCotizacion || '',
    itemsSolicitados: data.itemsSolicitados || [],
    items,
    centro: config.centroDe(data),
  };
  const cambios = diferenciasContraFoto(bloque.itemsSolicitados, items);
  return {
    ...bloque,
    cambios,
    resumen: {
      agregados: cambios.filter((c) => c.movimiento === 'AGREGADO').length,
      modificados: cambios.filter((c) => c.movimiento === 'MODIFICADO').length,
      eliminados: cambios.filter((c) => c.movimiento === 'ELIMINADO').length,
    },
  };
};

/**
 * Solicitudes de modificaciones de un módulo de Gestión (Implantes,
 * Hemodinamia) o de Consignación. Lecturas: UN listener solo sobre los
 * bloques con modificacionPendiente == true del módulo (rango de __name__,
 * como la Solicitud). El historial se lee recién al abrir su pestaña, paginado.
 */
export const useSolicitudModificacionesData = (modulo, { userData, showToast }) => {
  const config = configModificaciones(modulo);
  const { min, max } = rangoGestiones(config);
  const [bloques, setBloques] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  // El aviso de error no debe volver a suscribir el listener.
  const avisarRef = useRef(showToast);
  avisarRef.current = showToast;

  useEffect(() => {
    const q = query(
      collectionGroup(db, 'detalles'),
      where('modificacionPendiente', '==', true),
      where(documentId(), '>=', min),
      where(documentId(), '<', max),
      orderBy(documentId())
    );
    return onSnapshotVisible(q, (snap) => {
      // Un bloque cuyos cambios volvieron a como estaba (sin diferencias) no se muestra.
      setBloques(snap.docs.map((d) => bloqueDesdeDoc(config, d)).filter((b) => b.cambios.length > 0));
      setCargando(false);
    }, (error) => {
      console.error('Error al escuchar modificaciones pendientes:', error);
      avisarRef.current?.('Error al cargar las modificaciones pendientes', 'error');
      setCargando(false);
    });
  }, [min, max, config]);

  // Descarga las modificaciones de los bloques elegidos. NO vuelve a imputar
  // (la imputación ya se actualizó al guardar cada edición). Por bloque: 1
  // escritura (foto = lo actual, sin marca) + su log; más 1 documento de
  // historial con las filas exactas del archivo.
  const exportar = async (seleccion) => {
    const elegidos = bloques.filter((b) => seleccion.has(b.refPath));
    if (!elegidos.length) return { ok: false };
    const fechaIngreso = fechaHoyTexto();
    const filas = construirFilasModificaciones(elegidos, fechaIngreso, opcionesFilas(config));
    if (!filas.length) return { ok: false };

    setExportando(true);
    try {
      const nombreArchivo = nombreArchivoModificaciones(config.archivoSolicitud, fechaHoyISO());
      const titulo = tituloModificaciones(config.etiqueta);
      const subtitulo = `Generado el ${fechaIngreso} por ${userData?.nombreCompleto || 'Usuario'} · ${elegidos.length} bloque(s), ${filas.length} cambio(s). Cada fila indica la fecha de su solicitud original.`;
      XLSX.writeFile(libroModificaciones({ filas, titulo, subtitulo }), nombreArchivo);

      const batch = writeBatch(db);
      const historialRef = doc(collection(db, COLECCION_MODIFICACIONES_EXPORTADAS));
      batch.set(historialRef, {
        modulo,
        fecha: serverTimestamp(),
        usuario: userData?.nombreCompleto || 'Usuario',
        usuarioUid: userData?.uid || '',
        nombreArchivo,
        subtitulo,
        totalFilas: filas.length,
        bloques: elegidos.map((b) => ({
          refPath: b.refPath, gestionId: b.gestionId, nombre: b.nombre, empresa: b.empresa, fecha: b.fecha,
          periodo: textoPeriodoSolicitud(b), ...b.resumen,
        })),
        filas,
      });
      elegidos.forEach((b) => {
        const ref = doc(db, b.refPath);
        batch.update(ref, {
          itemsSolicitados: fotoItems(b.items),
          modificacionPendiente: false,
          ultimaModificacionExportadaEl: new Date(),
        });
        batch.set(doc(collection(ref, 'logs')), {
          accion: 'MODIFICACION_EXPORTADA',
          detalles: {
            exportacionId: historialRef.id,
            gestionId: b.gestionId,
            empresa: b.empresa,
            fecha: b.fecha,
            periodo: textoPeriodoSolicitud(b),
            ...b.resumen,
          },
          active: true,
          usuario: userData?.nombreCompleto || 'Usuario Desconocido',
          usuarioEmail: userData?.email || '',
          timestamp: serverTimestamp(),
        });
      });
      await batch.commit();
      return { ok: true, bloques: elegidos.length, filas: filas.length };
    } finally {
      setExportando(false);
    }
  };

  return { config, bloques, cargando, exportando, exportar };
};

// --- Historial (solo al abrir su pestaña) ------------------------------------
export const listarHistorialModificaciones = async (modulo, cursor = null) => {
  const partes = [where('modulo', '==', modulo), orderBy('fecha', 'desc'), limit(TAMANO_PAGINA_HISTORIAL + 1)];
  if (cursor) partes.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, COLECCION_MODIFICACIONES_EXPORTADAS), ...partes));
  const docs = snap.docs.slice(0, TAMANO_PAGINA_HISTORIAL);
  return {
    entradas: docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: docs[docs.length - 1] || null,
    hayMas: snap.docs.length > TAMANO_PAGINA_HISTORIAL,
  };
};

// Vuelve a descargar exactamente las mismas filas, marcado como COPIA. No
// cambia ningún estado ni escribe nada.
export const descargarCopia = (config, entrada) => {
  const fechaOriginal = entrada.nombreArchivo?.match(/(\d{4}-\d{2}-\d{2})\.xlsx$/)?.[1] || fechaHoyISO();
  const libro = libroModificaciones({
    filas: entrada.filas || [],
    titulo: tituloModificaciones(config.etiqueta, { copia: true }),
    subtitulo: `COPIA de la descarga original (${entrada.subtitulo || ''}). Descargada de nuevo el ${fechaHoyTexto()}; no cambia ningún estado.`,
  });
  XLSX.writeFile(libro, nombreArchivoModificaciones(config.archivoSolicitud, fechaOriginal, { copia: true }));
};

// Resumen total de una lista de bloques (para la cabecera).
export const useTotalesModificaciones = (bloques) => useMemo(() => bloques.reduce((t, b) => ({
  agregados: t.agregados + b.resumen.agregados,
  modificados: t.modificados + b.resumen.modificados,
  eliminados: t.eliminados + b.resumen.eliminados,
}), { agregados: 0, modificados: 0, eliminados: 0 }), [bloques]);
