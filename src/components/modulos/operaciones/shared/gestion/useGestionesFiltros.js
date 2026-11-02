import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { fechaISOEnChile, coincideRangoFecha, RANGO_FECHA_PREDETERMINADO } from './rangoFechaGestiones';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { ocsDeGestion } from '../ocIndex/indiceOC';
import { ANIO_RESPALDO_GESTIONES, MESES_DEL_ANIO } from './consultaGestiones';

export const TAMANO_PAGINA_TABLA = 50;

// Opciones de año y mes del selector. NO salen solo de las gestiones
// cargadas: con un mes elegido solo está cargado ese mes, y antes (con la
// ventana de las 150 más recientes) un mes con datos podía no aparecer.
//   - Con conteos (usePeriodosConDatos.js): solo años y meses con gestiones,
//     y `cantidades` por mes para mostrarlas ("Septiembre (116)"). La del mes
//     elegido sale de las gestiones cargadas (en vivo), si ya llegaron.
//   - Sin conteos (cargando o fallaron): años desde ANIO_RESPALDO_GESTIONES
//     al próximo y los 12 meses, para no esconder nunca un mes con datos.
// Siempre se incluyen el filtro activo y lo que traigan las gestiones
// cargadas. Años del más reciente al más antiguo; meses cronológicos.
export const opcionesPeriodoGestiones = (implantes, {
  filtroAnio = '', filtroMes = '', hoyISO = fechaISOEnChile(), conteoAnios = null, conteoMeses = null,
} = {}) => {
  const anioActual = Number(hoyISO.slice(0, 4));
  const anios = new Set(filtroAnio ? [filtroAnio] : []);
  if (conteoAnios) Object.entries(conteoAnios).forEach(([a, n]) => { if (n > 0) anios.add(a); });
  else for (let a = ANIO_RESPALDO_GESTIONES; a <= anioActual + 1; a++) anios.add(String(a));

  const usarConteoMeses = Boolean(filtroAnio && conteoMeses);
  const meses = new Set(filtroMes ? [filtroMes] : []);
  if (usarConteoMeses) MESES_DEL_ANIO.forEach((m) => { if ((conteoMeses[m] || 0) > 0) meses.add(m); });
  else MESES_DEL_ANIO.forEach((m) => meses.add(m));

  let cargadasMesElegido = 0;
  implantes.forEach(({ fecha }) => {
    const m = String(fecha || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return;
    anios.add(m[1]);
    if (m[1] === filtroAnio) meses.add(m[2]);
    if (m[1] === filtroAnio && m[2] === filtroMes) cargadasMesElegido++;
  });

  const cantidades = usarConteoMeses ? { ...conteoMeses } : {};
  if (usarConteoMeses && filtroMes && cargadasMesElegido > 0) cantidades[filtroMes] = cargadasMesElegido;
  return {
    anios: [...anios].sort().reverse(),
    meses: ordenarMeses([...meses]),
    cantidades
  };
};

// Año y mes del filtro. Están aparte porque también los necesita el hook de
// datos (la consulta escucha el mes elegido): useGestionesImplantes y
// useGestionesHemodinamia lo crean, se lo pasan a los dos y useGestionesFiltros
// lo recibe en `periodo`. Por defecto, el mes actual en hora de Chile.
// `fijarPeriodoInicial(anio, mes)`: lo usa useMesInicialConDatos para pasar
// al mes más reciente con gestiones; no hace nada si el usuario ya eligió
// año o mes (setFiltroAnio/setFiltroMes lo marcan).
// `sinPeriodo` y `filtroInicial`: ver useGestionesFiltros.
export const usePeriodoGestiones = ({ sinPeriodo = false, filtroInicial = null } = {}) => {
  const ini = filtroInicial || {};
  const [anioHoy, mesHoy] = fechaISOEnChile().split('-');
  const [filtroAnio, setAnio] = useState(ini.anio ?? (sinPeriodo ? '' : anioHoy));
  const [filtroMes, setMes] = useState(ini.mes ?? (sinPeriodo ? '' : mesHoy));
  const elegidoPorUsuario = useRef(false);
  const setFiltroAnio = useCallback((v) => { elegidoPorUsuario.current = true; setAnio(v); }, []);
  const setFiltroMes = useCallback((v) => { elegidoPorUsuario.current = true; setMes(v); }, []);
  const fijarPeriodoInicial = useCallback((anio, mes) => {
    if (elegidoPorUsuario.current) return;
    setAnio(anio);
    setMes(mes);
  }, []);
  return { filtroAnio, setFiltroAnio, filtroMes, setFiltroMes, fijarPeriodoInicial };
};

// `sinPeriodo`: arranca sin año/mes y con "Todos los días" (solo valor inicial).
// `filtroInicial` (opcional, del panel del Inicio vía filtroInicialStore):
// { anio, mes, dias, estados, rango } con que arranca la pantalla; manda
// sobre `sinPeriodo`. Solo valor inicial: después se cambia como siempre.
// `periodo` (opcional): el de usePeriodoGestiones, compartido con el hook de
// datos; sin él, el año/mes es propio de este hook.
// `conteos` (opcional): { conteoAnios, conteoMeses } de
// useConteosPeriodosGestiones, para mostrar solo años/meses con gestiones.
// Filtros, búsqueda y paginación de Gestión (Implantes y Hemodinamia).
export const useGestionesFiltros = (implantes, { sinPeriodo = false, filtroInicial = null, periodo = null, conteos = null } = {}) => {
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

  // Años/meses del selector (los conteos los lee useConteosPeriodosGestiones).
  // Ver opcionesPeriodoGestiones.
  const conteoAnios = conteos?.conteoAnios || null;
  const conteoMeses = conteos?.conteoMeses || null;
  const opcionesFechas = useMemo(
    () => opcionesPeriodoGestiones(implantes, { filtroAnio, filtroMes, conteoAnios, conteoMeses }),
    [implantes, filtroAnio, filtroMes, conteoAnios, conteoMeses]
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