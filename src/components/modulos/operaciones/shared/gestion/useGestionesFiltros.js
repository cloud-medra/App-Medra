import { useState, useMemo, useEffect } from 'react';
import { fechaISOEnChile, coincideRangoFecha, RANGO_FECHA_PREDETERMINADO } from './rangoFechaGestiones';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { ocsDeGestion } from '../ocIndex/indiceOC';

export const TAMANO_PAGINA_TABLA = 50;

// Primer año con gestiones (no hay rutas anteriores a 2026 en Implantes ni
// en Hemodinamia). Los años del selector van desde acá hasta el próximo
// (agendas de enero cargadas en diciembre).
export const ANIO_PRIMERAS_GESTIONES = 2026;

const MESES_DEL_ANIO = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

// Opciones de año y mes del selector. NO salen de las gestiones cargadas:
// con un mes elegido solo está cargado ese mes, y antes (con la ventana de
// las 150 más recientes) un mes con datos podía no aparecer. Meses: los 12,
// siempre. Años: de ANIO_PRIMERAS_GESTIONES al próximo, más los que traigan
// las gestiones cargadas y el filtro activo; del más reciente al más antiguo.
export const opcionesPeriodoGestiones = (implantes, { filtroAnio = '', hoyISO = fechaISOEnChile() } = {}) => {
  const anioActual = Number(hoyISO.slice(0, 4));
  const anios = new Set(filtroAnio ? [filtroAnio] : []);
  for (let a = ANIO_PRIMERAS_GESTIONES; a <= anioActual + 1; a++) anios.add(String(a));
  implantes.forEach(({ fecha }) => {
    const m = String(fecha || '').match(/^(\d{4})-\d{2}/);
    if (m) anios.add(m[1]);
  });
  return {
    anios: [...anios].sort().reverse(),
    meses: ordenarMeses(MESES_DEL_ANIO)
  };
};

// Año y mes del filtro. Están aparte porque también los necesita el hook de
// datos (la consulta escucha el mes elegido): useGestionesImplantes y
// useGestionesHemodinamia lo crean, se lo pasan a los dos y useGestionesFiltros
// lo recibe en `periodo`. Por defecto, el mes actual en hora de Chile.
// `sinPeriodo` y `filtroInicial`: ver useGestionesFiltros.
export const usePeriodoGestiones = ({ sinPeriodo = false, filtroInicial = null } = {}) => {
  const ini = filtroInicial || {};
  const [anioHoy, mesHoy] = fechaISOEnChile().split('-');
  const [filtroAnio, setFiltroAnio] = useState(ini.anio ?? (sinPeriodo ? '' : anioHoy));
  const [filtroMes, setFiltroMes] = useState(ini.mes ?? (sinPeriodo ? '' : mesHoy));
  return { filtroAnio, setFiltroAnio, filtroMes, setFiltroMes };
};

// `sinPeriodo`: arranca sin año/mes y con "Todos los días" (solo valor inicial).
// `filtroInicial` (opcional, del panel del Inicio vía filtroInicialStore):
// { anio, mes, dias, estados, rango } con que arranca la pantalla; manda
// sobre `sinPeriodo`. Solo valor inicial: después se cambia como siempre.
// `periodo` (opcional): el de usePeriodoGestiones, compartido con el hook de
// datos; sin él, el año/mes es propio de este hook.
// Filtros, búsqueda y paginación de Gestión (Implantes y Hemodinamia).
export const useGestionesFiltros = (implantes, { sinPeriodo = false, filtroInicial = null, periodo = null } = {}) => {
  const ini = filtroInicial || {};
  const [busqueda, setBusqueda] = useState('');

  const periodoPropio = usePeriodoGestiones({ sinPeriodo, filtroInicial });
  const { filtroAnio, setFiltroAnio, filtroMes, setFiltroMes } = periodo || periodoPropio;
  const [filtrosDias, setFiltrosDias] = useState(ini.dias || []);
  const [filtrosEstados, setFiltrosEstados] = useState(ini.estados || []);
  const [pagina, setPagina] = useState(1);

  // Filtro de rango de fecha (rangoFechaGestiones.js), independiente y
  // combinable con año/mes/día y estados: Hasta ayer (predeterminado), Hasta
  // hoy, Solo hoy, Desde mañana o Todos los días. "Hoy" es en hora de Chile.
  // No se recuerda entre visitas: cada entrada arranca en el predeterminado.
  const [filtroRangoFecha, setFiltroRangoFecha] = useState(ini.rango || (sinPeriodo ? 'todos' : RANGO_FECHA_PREDETERMINADO));

  // Años/meses del selector (0 lecturas). Ver opcionesPeriodoGestiones.
  const opcionesFechas = useMemo(
    () => opcionesPeriodoGestiones(implantes, { filtroAnio }),
    [implantes, filtroAnio]
  );

  // Filtrado en cascada: primero se aplican todos los filtros EXCEPTO
  // "Día" (búsqueda, año, mes, rango de fecha, estados). Las opciones del
  // filtro de Día se calculan sobre este resultado intermedio — así
  // siempre reflejan los días que efectivamente existen dado el resto de
  // filtros ya activos, nunca el universo completo sin filtrar (que era
  // el bug: opcionesFechas.dias se calculaba antes sobre `implantes`
  // crudo, ignorando año/mes/estado/rango de fecha).
  const implantesFiltradosSinDia = useMemo(() => {
    const hoyISO = fechaISOEnChile();

    return implantes.filter(i => {
      const idParaBuscar = i.gestionId || i.agendaId || '';
      const coincideBusqueda =
        !busqueda ||
        idParaBuscar.toLowerCase().includes(busqueda.toLowerCase()) ||
        (i.nombre && i.nombre.toLowerCase().includes(busqueda.toLowerCase())) ||
        (i.empresa && i.empresa.toLowerCase().includes(busqueda.toLowerCase())) ||
        ocsDeGestion(i).some(oc => String(oc).toLowerCase().includes(busqueda.toLowerCase()));

      let coincideAnio = true;
      let coincideMes = true;

      if (i.fecha && i.fecha.includes('-')) {
        const [yyyy, mm] = i.fecha.split('-');
        if (filtroAnio) coincideAnio = yyyy === filtroAnio;
        if (filtroMes) coincideMes = mm === filtroMes;
      } else if (filtroAnio || filtroMes) {
        return false;
      }

      const coincideFechaRango = coincideRangoFecha(i.fecha, filtroRangoFecha, hoyISO);

      let coincideEstado = true;
      if (filtrosEstados.length > 0) {
        const estadoClean = (i.estado || '').toUpperCase().trim();
        coincideEstado = filtrosEstados.includes(estadoClean);
      }

      return coincideBusqueda && coincideAnio && coincideMes && coincideFechaRango && coincideEstado;
    });
  }, [implantes, busqueda, filtroAnio, filtroMes, filtroRangoFecha, filtrosEstados]);

  const opcionesDias = useMemo(() => {
    const diasSet = new Set();
    implantesFiltradosSinDia.forEach(item => {
      if (item.fecha && item.fecha.includes('-')) {
        const dd = item.fecha.split('-')[2];
        if (dd) diasSet.add(dd);
      }
    });
    return Array.from(diasSet).sort((a, b) => a - b);
  }, [implantesFiltradosSinDia]);

  // Si un día que estaba seleccionado deja de existir en `opcionesDias`
  // (porque el usuario cambió año/mes/estado/rango de fecha y ese día ya no
  // tiene registros), se deselecciona automáticamente en vez de quedar
  // "elegido" pero sin resultados — evita la confusión de un filtro que
  // parece activo pero no filtra nada visible. Sin gestiones todavía (cargando)
  // no se recorta: borraría el día de un filtro inicial (ej. "mañana" desde
  // el Inicio) antes de que lleguen los datos.
  useEffect(() => {
    if (implantes.length === 0) return;
    setFiltrosDias(prev => {
      const disponibles = new Set(opcionesDias);
      const siguenValidos = prev.filter(d => disponibles.has(d));
      return siguenValidos.length === prev.length ? prev : siguenValidos;
    });
  }, [opcionesDias, implantes.length]);

  const implantesFiltrados = useMemo(() => {
    if (filtrosDias.length === 0) return implantesFiltradosSinDia;
    return implantesFiltradosSinDia.filter(i => {
      if (!i.fecha || !i.fecha.includes('-')) return false;
      const dd = i.fecha.split('-')[2];
      return filtrosDias.includes(dd);
    });
  }, [implantesFiltradosSinDia, filtrosDias]);

  // Paginación de la tabla (50 filas por página) sobre `implantesFiltrados`,
  // que ya viene ordenado (useGestionesImplantesData ordena por fecha
  // desc, nombre y empresa — utils/ordenGestiones.js) — acá solo se corta en
  // trozos de 50, sin volver a ordenar. Es 100% client-side: los datos del
  // mes ya están en memoria (el listener escucha el mes elegido o, sin mes,
  // las más recientes),
  // así que no hace falta una consulta nueva a Firestore por cada página.
  // Se reinicia a la página 1 cada vez que cambia cualquier filtro.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtroAnio, filtroMes, filtrosDias, filtroRangoFecha, filtrosEstados]);

  const totalPaginas = Math.max(1, Math.ceil(implantesFiltrados.length / TAMANO_PAGINA_TABLA));
  const paginaSegura = Math.min(pagina, totalPaginas);

  const implantesPagina = useMemo(() => {
    const inicio = (paginaSegura - 1) * TAMANO_PAGINA_TABLA;
    return implantesFiltrados.slice(inicio, inicio + TAMANO_PAGINA_TABLA);
  }, [implantesFiltrados, paginaSegura]);

  const limpiarFiltrosFecha = () => {
    const [anioHoy, mesHoy] = fechaISOEnChile().split('-');
    setFiltroAnio(anioHoy);
    setFiltroMes(mesHoy);
    setFiltrosDias([]);
  };

  const toggleFiltroDia = (dia) => {
    setFiltrosDias(prev =>
      prev.includes(dia)
        ? prev.filter(d => d !== dia)
        : [...prev, dia]
    );
  };

  const limpiarFiltroDias = () => setFiltrosDias([]);

  const opcionesEstados = useMemo(() => {
    const estadosSet = new Set();
    implantes.forEach(item => {
      const estadoClean = (item.estado || '').toUpperCase().trim();
      if (estadoClean) estadosSet.add(estadoClean);
    });
    return Array.from(estadosSet).sort();
  }, [implantes]);

  const toggleFiltroEstado = (estado) => {
    setFiltrosEstados(prev =>
      prev.includes(estado)
        ? prev.filter(e => e !== estado)
        : [...prev, estado]
    );
  };

  const limpiarFiltroEstados = () => setFiltrosEstados([]);

  return {
    implantesFiltrados,
    implantesPagina,
    pagina: paginaSegura,
    setPagina,
    totalPaginas,
    busqueda,
    setBusqueda,
    filtroAnio,
    setFiltroAnio,
    filtroMes,
    setFiltroMes,
    filtrosDias,
    toggleFiltroDia,
    limpiarFiltroDias,
    opcionesDias,
    filtroRangoFecha,
    setFiltroRangoFecha,
    opcionesFechas,
    limpiarFiltrosFecha,
    opcionesEstados,
    filtrosEstados,
    toggleFiltroEstado,
    limpiarFiltroEstados
  };
};