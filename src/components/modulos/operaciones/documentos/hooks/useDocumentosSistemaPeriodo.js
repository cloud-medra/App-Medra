// Base de datos compartida por las pantallas de "documentos_sistema" que
// necesitan año (obligatorio) + mes (opcional, en cascada) + un filtro de
// campo opcional a nivel de servidor — Seguimiento de Facturas/Guías e
// Ingreso de Órdenes. Año/mes se leen de los mismos documentos "marcador"
// que ya usa Importar Detalles OC (documentos_sistema/{anio} y
// .../meses/{mes}, ambos {active:true}); no se duplica ese mismo hook
// (useDetallesOCData.js) para no arriesgar la lectura de Detalles OC ya
// probada — acá el requisito es distinto (mes es opcional, no obligatorio).
//
// A diferencia de Detalles OC, acá el año solo ya dispara la consulta (el
// mes es opcional) — así que sin mes elegido el rango cubre el año completo.
// `filtroServidor` ({campo, operador, valor}, o {o: [...]} para un or()) agrega un where(...) del lado
// del servidor en vez de traer todo el período y descartar casi todo
// client-side (ej. "Pendiente factura" o "sin número de guía" son una
// fracción chica del total) — cada combinación de campo/operador nueva
// puede exigir su propio índice compuesto (campo + __name__, COLLECTION_GROUP).
import { useCallback, useEffect, useState } from 'react';
import { collection, collectionGroup, query, where, and, orderBy, limit, documentId, getDocs } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { restriccionDeFiltro } from '../resumenFacturacion/resumenFacturacionService';

export const COL_BASE = 'documentos_sistema';
// Tope defensivo: un mes es chico, pero un año completo sin filtro de estado
// (Ingreso de Órdenes) puede ser bastante más grande — se avisa en vez de
// truncar en silencio (ver `huboTope`).
const LIMITE_FILAS_PERIODO = 5000;

// Filtros de la consulta de un período (año, o año + mes) + el filtro de
// servidor opcional + `extras` (where(...) adicionales). Lo comparten la
// tabla y los conteos de useMesesConPendientes, así ambos usan exactamente
// la misma condición.
export const filtrosPeriodo = (anio, mes, filtroServidor = null, extras = []) => {
  const min = mes ? `${COL_BASE}/${anio}/meses/${mes}` : `${COL_BASE}/${anio}`;
  const max = `${min}`;
  const restricciones = [
    where(documentId(), '>=', min),
    where(documentId(), '<', max),
    ...extras
  ];
  if (filtroServidor) restricciones.push(restriccionDeFiltro(filtroServidor));
  // Con un or(...) Firestore exige un solo filtro de nivel superior: se
  // envuelve todo en and(...).
  return filtroServidor?.o ? [and(...restricciones)] : restricciones;
};

// `requiereMes`: sin mes elegido no se consulta nada (Seguimiento de
// Facturas, para no leer el año completo); por defecto el año solo ya
// consulta el año entero. `activo: false` no consulta filas (pantalla sin
// lista visible, ej. el selector de tipo de Seguimiento).
export const useDocumentosSistemaPeriodo = (filtroServidor = null, { requiereMes = false, activo = true } = {}) => {
  const [anio, setAnioState] = useState('');
  const [mes, setMesState] = useState('');

  const [anios, setAnios] = useState([]);
  const [cargandoAnios, setCargandoAnios] = useState(true);

  const [meses, setMeses] = useState([]);
  const [cargandoMeses, setCargandoMeses] = useState(false);

  const [filas, setFilas] = useState([]);
  const [cargandoFilas, setCargandoFilas] = useState(false);
  const [huboTope, setHuboTope] = useState(false);
  const [refrescarKey, setRefrescarKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoAnios(true);
      try {
        const snap = await getDocs(collection(db, COL_BASE));
        const lista = snap.docs.map(d => d.id).filter(id => /^\d{4}$/.test(id)).sort((a, b) => b.localeCompare(a));
        if (!cancelado) setAnios(lista);
      } catch (err) {
        console.error('Error al cargar años de documentos_sistema:', err);
      } finally {
        if (!cancelado) setCargandoAnios(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!anio) { setMeses([]); return; }
    let cancelado = false;
    (async () => {
      setCargandoMeses(true);
      try {
        const snap = await getDocs(collection(db, COL_BASE, anio, 'meses'));
        const lista = snap.docs.map(d => d.id).filter(id => /^\d{2}$/.test(id));
        if (!cancelado) setMeses(ordenarMeses(lista));
      } catch (err) {
        console.error('Error al cargar meses de documentos_sistema:', err);
      } finally {
        if (!cancelado) setCargandoMeses(false);
      }
    })();
    return () => { cancelado = true; };
  }, [anio]);

  // Año es obligatorio; mes es opcional — sin mes, el rango cubre el año
  // completo (mismo truco de prefijo de documentId() ya usado en el resto
  // de la app, solo que acotado a un segmento menos de ruta).
  useEffect(() => {
    if (!activo || !anio || (requiereMes && !mes)) { setFilas([]); setHuboTope(false); return; }
    let cancelado = false;
    (async () => {
      setCargandoFilas(true);
      try {
        const q = query(collectionGroup(db, 'detalles'), ...filtrosPeriodo(anio, mes, filtroServidor), orderBy(documentId(), 'desc'), limit(LIMITE_FILAS_PERIODO));
        const snap = await getDocs(q);
        if (cancelado) return;
        setFilas(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
        setHuboTope(snap.docs.length === LIMITE_FILAS_PERIODO);
      } catch (err) {
        console.error('Error al cargar documentos_sistema del período:', err);
        if (!cancelado) { setFilas([]); setHuboTope(false); }
      } finally {
        if (!cancelado) setCargandoFilas(false);
      }
    })();
    return () => { cancelado = true; };
    // `filtroServidor` es un objeto — se serializa para la dependencia en vez
    // de compararlo por referencia, así el llamador no tiene que memoizarlo
    // (si no se hiciera esto y alguien pasara un objeto literal inline en
    // cada render, el efecto se dispararía sin parar — mismo tipo de loop
    // infinito ya corregido una vez en useDetallesOCData.js).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, JSON.stringify(filtroServidor), requiereMes, activo, refrescarKey]);

  // Los meses del año anterior se descartan en el mismo render: así nadie
  // (ej. useMesesConPendientes) los usa con el año nuevo mientras cargan.
  const setAnio = useCallback((nuevoAnio) => {
    setAnioState(nuevoAnio);
    setMesState('');
    setMeses([]);
    setCargandoMeses(!!nuevoAnio);
  }, []);

  const setMes = useCallback((nuevoMes) => {
    setMesState(nuevoMes);
  }, []);

  const recargarFilas = useCallback(() => {
    setRefrescarKey(k => k + 1);
  }, []);

  return {
    anio, setAnio, anios, cargandoAnios,
    mes, setMes, meses, cargandoMeses,
    filas, cargandoFilas, huboTope,
    recargarFilas
  };
};
