// Datos de "Importar Detalles OC": año y mes en cascada (dinámicos, leídos
// de los documentos "marcador" que ya escribe procesarImportacionDetallesOC.js
// — documentos_sistema/{anio} y documentos_sistema/{anio}/meses/{mes}, ambos
// {active:true} — no de una lista fija ni de un escaneo de toda la colección),
// y las filas de UN período puntual. No se consulta "detalles" hasta que año
// Y mes están seleccionados: esta colección puede tener miles de documentos y
// sigue creciendo, así que traer todo (o un año completo) de una sola vez
// sería una lectura innecesariamente grande. La búsqueda por admisión/
// paciente/OC/factura/guía y la paginación se resuelven client-side sobre
// `filas` (ver useDetallesOCFiltros.js) — Firestore no soporta "contiene" ni
// OR entre campos distintos, y el volumen de UN mes es chico una vez acotado.
import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { ordenarMeses } from '../../../../../../utils/ordenarMeses';
import { COL_BASE, LIMITE_FILAS_PERIODO, consultaDetallesPeriodo } from '../utils/consultaDetallesPeriodo';

export { COL_BASE };

export const useDetallesOCData = () => {
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

  // Años disponibles: una sola lectura de los docs "marcador" de nivel año
  // (unos pocos documentos, no la colección completa) — mismo patrón que
  // aniosDisponiblesPorMarcador() en Cargas Consolidado
  // (administracion/cargasConsolidado/hooks/periodoQueryHelpers.js).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoAnios(true);
      try {
        const snap = await getDocs(collection(db, COL_BASE));
        const lista = snap.docs.map(d => d.id).filter(id => /^\d{4}$/.test(id)).sort((a, b) => b.localeCompare(a));
        if (!cancelado) setAnios(lista);
      } catch (err) {
        console.error('Error al cargar años de Detalles OC:', err);
      } finally {
        if (!cancelado) setCargandoAnios(false);
      }
    })();
    return () => { cancelado = true; };
  }, [refrescarKey]);

  // Meses disponibles del año elegido: mismo criterio (docs marcador de
  // nivel mes bajo ese año), se recargan cada vez que cambia `anio`.
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
        console.error('Error al cargar meses de Detalles OC:', err);
      } finally {
        if (!cancelado) setCargandoMeses(false);
      }
    })();
    return () => { cancelado = true; };
  }, [anio, refrescarKey]);

  // Filas del período: solo se dispara con año Y mes seleccionados. El
  // rango de documentId() acota el collectionGroup "detalles" al prefijo
  // exacto del mes elegido (documentos_sistema/{anio}/meses/{mes}...), mismo
  // truco ya usado en el resto de la app para collectionGroup compartidos
  // (ver useGestionesImplantesData.js). El shape de la query (rango + orderBy
  // sobre __name__, COLLECTION_GROUP) es idéntico al de antes de agregar el
  // filtro de período — el índice ya desplegado para "detalles" lo sigue
  // cubriendo sin necesitar uno nuevo.
  useEffect(() => {
    if (!anio || !mes) { setFilas([]); setHuboTope(false); return; }
    let cancelado = false;
    (async () => {
      setCargandoFilas(true);
      try {
        const snap = await getDocs(consultaDetallesPeriodo(anio, mes));
        if (cancelado) return;
        setFilas(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
        setHuboTope(snap.docs.length === LIMITE_FILAS_PERIODO);
      } catch (err) {
        console.error('Error al cargar Detalles OC del período:', err);
        if (!cancelado) { setFilas([]); setHuboTope(false); }
      } finally {
        if (!cancelado) setCargandoFilas(false);
      }
    })();
    return () => { cancelado = true; };
  }, [anio, mes, refrescarKey]);

  // Cambiar de año resetea el mes elegido (y, en cascada, las filas —
  // vía el efecto de arriba, que exige año Y mes).
  const setAnio = useCallback((nuevoAnio) => {
    setAnioState(nuevoAnio);
    setMesState('');
  }, []);

  const setMes = useCallback((nuevoMes) => {
    setMesState(nuevoMes);
  }, []);

  // Fuerza releer el período actual (ej. después de importar un Excel que
  // pudo haber modificado filas del mes que se está viendo). También relee
  // los años y meses (pocos docs marcador): la importación pudo crear
  // períodos nuevos.
  const recargarFilas = useCallback(() => {
    setRefrescarKey(k => k + 1);
  }, []);

  // Quita filas ya eliminadas de la tabla, sin volver a leer el período.
  const quitarFilas = useCallback((refPaths) => {
    const set = new Set(refPaths);
    setFilas(prev => prev.filter(f => !set.has(f.refPath)));
  }, []);

  return {
    anio, setAnio, anios, cargandoAnios,
    mes, setMes, meses, cargandoMeses,
    filas, cargandoFilas, huboTope,
    recargarFilas, quitarFilas
  };
};
