import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { leerConCache } from './cacheLecturasAnio';
import {
  aniosDisponiblesPorMarcador,
  aniosDisponiblesPorSondeo,
  construirQueryAnioGestion,
  calcularMesPorDefecto
} from './periodoQueryHelpers';
import { ordenarRegistrosCargas } from '../../../operaciones/consignacion/cargasConsignacion/utils/ordenarRegistrosCargas';
import { normalizarFilaGestionImplantes, normalizarFilaGestionConsignacion, normalizarFilaGestionHemodinamia, filtrarPorBusquedaYOrigen } from '../utils/normalizarFila';

const RAIZ_IMPLANTES = 'implantes_gestiones';
const RAIZ_CONSIGNACION = 'consignacion_registros';
const RAIZ_HEMODINAMIA = 'hemodinamia_gestiones';
export const TODOS_LOS_MESES = 'TODOS';
const PAGE_SIZE = 50;

const mesActualGestion = () => String(new Date().getMonth() + 1).padStart(2, '0');

// Filtro Año/Mes de Gestión actúa sobre el campo "fecha" (admisión /
// registro) — deliberadamente distinto del "Período" (periodoAño/Mes,
// contable) que se muestra como columna informativa en la fila, sin
// relación con este filtro (pueden no coincidir).
export const useGestionConsolidadaData = () => {
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState(TODOS_LOS_MESES);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [cargandoAnios, setCargandoAnios] = useState(true);

  const [bloquesImplantes, setBloquesImplantes] = useState([]);
  const [itemsConsignacion, setItemsConsignacion] = useState([]);
  const [bloquesHemodinamia, setBloquesHemodinamia] = useState([]);
  // Qué lectura (año + versión) terminó; `cargando` se deriva de ahí.
  const [lecturaLista, setLecturaLista] = useState({ anio: null, version: null });
  const [pagina, setPagina] = useState(1);
  const [version, setVersion] = useState(0);
  const forzarLecturaRef = useRef(false);
  const actualizar = () => {
    forzarLecturaRef.current = true;
    setVersion(v => v + 1);
  };

  const [busqueda, setBusqueda] = useState('');
  const [origenesSeleccionados, setOrigenesSeleccionados] = useState([]);
  const toggleOrigen = (origen) => setOrigenesSeleccionados(prev =>
    prev.includes(origen) ? prev.filter(o => o !== origen) : [...prev, origen]
  );
  const limpiarOrigenes = () => setOrigenesSeleccionados([]);

  // Al elegir un año hay que esperar a que lleguen sus datos para recién
  // ahí saber qué meses tienen registros y poder preseleccionar el mes
  // actual (o el más reciente disponible) — nunca "Todos los meses" por
  // defecto. Este flag evita que ese cálculo se repita cada vez que el
  // snapshot se actualiza en vivo (solo corre una vez por año elegido; un
  // cambio manual de mes por el usuario no lo vuelve a disparar).
  const necesitaMesPorDefectoRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoAnios(true);
      try {
        const [aniosConsignacion, aniosImplantes, aniosHemodinamia] = await Promise.all([
          aniosDisponiblesPorMarcador(RAIZ_CONSIGNACION),
          aniosDisponiblesPorSondeo(RAIZ_IMPLANTES),
          aniosDisponiblesPorSondeo(RAIZ_HEMODINAMIA)
        ]);
        if (cancelado) return;
        const union = Array.from(new Set([...aniosConsignacion, ...aniosImplantes, ...aniosHemodinamia])).sort((a, b) => b.localeCompare(a));
        setAniosDisponibles(union);
      } catch (err) {
        console.error('Error al obtener años disponibles de Gestión:', err);
      } finally {
        if (!cancelado) setCargandoAnios(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  // Sin año elegido: nada de datos cargados (ni una lectura), tal como se
  // pidió — las tablas quedan vacías hasta que el usuario elige.
  useEffect(() => {
    // Limpia de inmediato los datos del año anterior (si había) para no
    // calcular "meses disponibles" con datos viejos mientras llega el
    // snapshot del año nuevo.
    setBloquesImplantes([]);
    setItemsConsignacion([]);
    setBloquesHemodinamia([]);
    setPagina(1);
    necesitaMesPorDefectoRef.current = true;
  }, [anio]);

  // Lectura única por año (con caché de sesión, ver cacheLecturasAnio.js).
  // `version` la sube "Actualizar" para forzar una nueva lectura sin
  // resetear el mes elegido.
  useEffect(() => {
    if (!anio) return undefined;
    const forzar = forzarLecturaRef.current;
    forzarLecturaRef.current = false;
    let cancelado = false;

    const leer = (raiz, mapear) => leerConCache(
      `gestion|${raiz}|${anio}`,
      () => getDocs(construirQueryAnioGestion(raiz, anio)).then(snap => snap.docs.map(mapear)),
      { forzar }
    );

    Promise.allSettled([
      leer(RAIZ_IMPLANTES, d => ({ id: d.id, refPath: d.ref.path, ...d.data() })),
      leer(RAIZ_CONSIGNACION, d => ({ id: d.id, ref: d.ref, refPath: d.ref.path, ...d.data() })),
      leer(RAIZ_HEMODINAMIA, d => ({ id: d.id, refPath: d.ref.path, ...d.data() }))
    ]).then(([r0, r1, r2]) => {
      if (cancelado) return;
      if (r0.status === 'fulfilled') setBloquesImplantes(r0.value);
      else console.error('Error al leer Gestión de Implantes por año:', r0.reason);
      if (r1.status === 'fulfilled') setItemsConsignacion(r1.value);
      else console.error('Error al leer Gestión de Consignación por año:', r1.reason);
      if (r2.status === 'fulfilled') setBloquesHemodinamia(r2.value);
      else console.error('Error al leer Gestión de Hemodinamia por año:', r2.reason);
      setLecturaLista({ anio, version });
    });

    return () => { cancelado = true; };
  }, [anio, version]);

  // Consignación con el mismo orden que su pantalla de Cargas (por carga,
  // cada admisión junta y en el orden de la carga masiva): la consulta
  // ordena por ruta (mes alfabético, día, id aleatorio).
  const filasAnio = useMemo(() => [
    ...bloquesImplantes.map(normalizarFilaGestionImplantes),
    ...ordenarRegistrosCargas(itemsConsignacion).map(normalizarFilaGestionConsignacion),
    ...bloquesHemodinamia.map(normalizarFilaGestionHemodinamia)
  ], [bloquesImplantes, itemsConsignacion, bloquesHemodinamia]);

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    filasAnio.forEach(f => {
      if (f.fecha && f.fecha.includes('-')) set.add(f.fecha.split('-')[1]);
    });
    return Array.from(set).sort();
  }, [filasAnio]);

  useEffect(() => {
    if (!necesitaMesPorDefectoRef.current || !anio || mesesDisponibles.length === 0) return;
    setMes(calcularMesPorDefecto(anio, mesesDisponibles, mesActualGestion()) || TODOS_LOS_MESES);
    necesitaMesPorDefectoRef.current = false;
  }, [anio, mesesDisponibles]);

  useEffect(() => { setPagina(1); }, [mes, busqueda, origenesSeleccionados]);

  const filas = useMemo(() => {
    if (mes === TODOS_LOS_MESES) return filasAnio;
    return filasAnio.filter(f => f.fecha?.split('-')[1] === mes);
  }, [filasAnio, mes]);

  // Búsqueda por admisión/nombre + Origen se aplican sobre el mes ya
  // filtrado, y ANTES de paginar, para que la paginación siempre corte
  // sobre el conjunto ya reducido por los filtros (no al revés).
  const filasFiltradas = useMemo(
    () => filtrarPorBusquedaYOrigen(filas, { busqueda, origenesSeleccionados }),
    [filas, busqueda, origenesSeleccionados]
  );

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / PAGE_SIZE));
  const filasPagina = useMemo(
    () => filasFiltradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [filasFiltradas, pagina]
  );

  return {
    anio, setAnio,
    mes, setMes,
    aniosDisponibles,
    mesesDisponibles,
    cargandoAnios,
    cargando: Boolean(anio) && (lecturaLista.anio !== anio || lecturaLista.version !== version),
    actualizar,
    busqueda, setBusqueda,
    origenesSeleccionados, toggleOrigen, limpiarOrigenes,
    totalFilas: filasFiltradas.length,
    filasPagina,
    pagina, setPagina,
    totalPaginas
  };
};
