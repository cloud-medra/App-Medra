import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import {
  SIN_BUSQUEDA, filtrarFilasDelMes, interpretarBusqueda, mesesConsultables,
  paginaLocal, periodoActualChile, totalPaginasDe,
} from './logicaHistorial';
import {
  buscarAdmisionEnAnio, descargarMes, invalidarHistorial, mesDescargado,
  obtenerConteoBusqueda, obtenerPagina, obtenerTotales,
} from './historialImputacionesStore';

const MS_DEBOUNCE = 400;

// Datos de una pestaña. Los efectos dependen de claves de texto: un arreglo
// `origenes` nuevo en cada render no vuelve a disparar consultas, y cada
// resultado guarda la clave que lo produjo, de donde se deriva `cargando`.
//
// Tres modos: "servidor" (paginado por cursor), "mes" (mes descargado con el
// botón; filtra sin lecturas) y "anio" (admisión exacta en todo el año). Los
// dos últimos solo se activan con su botón.
export const useHistorialImputacionesData = ({ origenes, anio, mes }) => {
  const claveOrigenes = origenes.join(',');
  const claveMes = `${claveOrigenes}|${anio}|${mes}`;
  const listo = Boolean(anio && mes && origenes.length);

  const [texto, setTexto] = useState('');
  const textoDebounced = useDebouncedValue(texto, MS_DEBOUNCE);
  const busqueda = useMemo(() => interpretarBusqueda(textoDebounced), [textoDebounced]);
  const busquedaActual = interpretarBusqueda(texto);

  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState({ clave: null });
  const [totales, setTotales] = useState({ clave: null });
  const [busquedaMes, setBusquedaMes] = useState(null);
  const [busquedaAnio, setBusquedaAnio] = useState(null);
  const [descargandoMes, setDescargandoMes] = useState(false);
  const [buscandoAnio, setBuscandoAnio] = useState(false);
  const [errorAccion, setErrorAccion] = useState(false);

  const claveAdmision = `${claveMes}|${busquedaActual.valor}`;
  const modoAnioActivo = busquedaActual.tipo === 'admision' && busquedaAnio?.clave === claveAdmision;
  const modoMesActivo = busquedaMes?.clave === claveMes;
  const modo = modoAnioActivo ? 'anio' : (modoMesActivo ? 'mes' : 'servidor');

  // Cambiar de filtro vuelve a la página 1, sin un efecto que lo sincronice.
  const claveFiltros = `${claveMes}|${modo}|${modo === 'servidor' ? `${busqueda.tipo}|${busqueda.valor}` : textoDebounced}`;
  const [estadoPagina, setEstadoPagina] = useState({ clave: claveFiltros, numero: 1 });
  const pagina = estadoPagina.clave === claveFiltros ? estadoPagina.numero : 1;
  const setPagina = (cambio) => setEstadoPagina((previo) => {
    const actual = previo.clave === claveFiltros ? previo.numero : 1;
    return { clave: claveFiltros, numero: typeof cambio === 'function' ? cambio(actual) : cambio };
  });

  const claveTotales = listo ? `${claveMes}|${version}` : null;
  useEffect(() => {
    if (!claveTotales) return undefined;
    let cancelado = false;
    obtenerTotales(claveOrigenes.split(','), anio, mes)
      .then((datos) => { if (!cancelado) setTotales({ clave: claveTotales, datos, error: false }); })
      .catch((error) => {
        console.error('Error al leer los totales del historial:', error);
        if (!cancelado) setTotales({ clave: claveTotales, datos: null, error: true });
      });
    return () => { cancelado = true; };
    // `claveTotales` resume origenes, año, mes y versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveTotales]);

  const claveServidor = listo && modo === 'servidor'
    ? `${claveMes}|${busqueda.tipo}|${busqueda.valor}|${pagina}|${version}`
    : null;
  useEffect(() => {
    if (!claveServidor) return undefined;
    let cancelado = false;
    const lista = claveOrigenes.split(',');
    Promise.all([
      obtenerPagina(lista, anio, mes, busqueda, pagina - 1),
      busqueda.tipo === SIN_BUSQUEDA.tipo ? null : obtenerConteoBusqueda(lista, anio, mes, busqueda),
    ])
      .then(([filas, conteo]) => { if (!cancelado) setResultado({ clave: claveServidor, filas, conteo, error: false }); })
      .catch((error) => {
        console.error('Error al leer el historial:', error);
        if (!cancelado) setResultado({ clave: claveServidor, filas: [], conteo: null, error: true });
      });
    return () => { cancelado = true; };
    // `claveServidor` resume todo lo que se consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveServidor]);

  const datosTotales = totales.clave === claveTotales ? totales.datos : null;
  const errorTotales = totales.clave === claveTotales && totales.error;

  const filasLocales = useMemo(() => {
    if (modo === 'anio') return busquedaAnio.filas;
    if (modo === 'mes') return filtrarFilasDelMes(busquedaMes.filas, textoDebounced);
    return null;
  }, [modo, busquedaAnio, busquedaMes, textoDebounced]);

  // Lo que todavía no está en caché: es lo que costaría "Buscar en este mes".
  const registrosPorCargar = () => origenes
    .filter((o) => !mesDescargado(o, anio, mes))
    .reduce((acc, o) => acc + (datosTotales?.porOrigen[o]?.cantidad || 0), 0);

  const activarBusquedaMes = async () => {
    setDescargandoMes(true);
    setErrorAccion(false);
    try {
      setBusquedaMes({ clave: claveMes, filas: await descargarMes(origenes, anio, mes) });
    } catch (error) {
      console.error('Error al cargar el mes:', error);
      setErrorAccion(true);
    } finally {
      setDescargandoMes(false);
    }
  };

  const buscarEnAnio = async () => {
    if (busquedaActual.tipo !== 'admision') return;
    const claveDeEstaBusqueda = claveAdmision;
    setBuscandoAnio(true);
    setErrorAccion(false);
    try {
      const encontrado = await buscarAdmisionEnAnio(origenes, anio, busquedaActual.valor, mesesConsultables(anio, periodoActualChile()));
      setBusquedaAnio({ clave: claveDeEstaBusqueda, admision: busquedaActual.valor, ...encontrado });
    } catch (error) {
      console.error('Error al buscar la admisión en el año:', error);
      setErrorAccion(true);
    } finally {
      setBuscandoAnio(false);
    }
  };

  const actualizar = () => {
    invalidarHistorial({ anio, mes, origenes });
    setBusquedaMes(null);
    setBusquedaAnio(null);
    setErrorAccion(false);
    setVersion((v) => v + 1);
  };

  const hayBusquedaEnServidor = busqueda.tipo !== SIN_BUSQUEDA.tipo;
  const resultadoServidor = resultado.clave === claveServidor ? resultado : null;
  const cargando = modo === 'servidor' && listo && !resultadoServidor;

  let totalFilas;
  let filasPagina;
  if (filasLocales) {
    totalFilas = filasLocales.length;
    filasPagina = paginaLocal(filasLocales, pagina);
  } else {
    totalFilas = hayBusquedaEnServidor ? (resultadoServidor?.conteo ?? 0) : (datosTotales?.cantidad ?? 0);
    filasPagina = resultadoServidor?.filas ?? [];
  }

  const sinTexto = modo === 'mes' ? !textoDebounced.trim() : !hayBusquedaEnServidor;

  return {
    texto,
    setTexto,
    modo,
    cargando,
    error: Boolean(resultadoServidor?.error) || errorTotales || errorAccion,
    filasPagina,
    totalFilas,
    pagina,
    setPagina,
    totalPaginas: totalPaginasDe(totalFilas),
    totales: datosTotales,
    // Los totales son del mes: durante una búsqueda no representarían lo listado.
    mostrarTotales: modo !== 'anio' && sinTexto,
    actualizar,
    puedeBuscarMes: Boolean(datosTotales?.cantidad) && !descargandoMes,
    descargandoMes,
    registrosPorCargar,
    activarBusquedaMes,
    salirBusquedaMes: () => setBusquedaMes(null),
    puedeBuscarAnio: listo && busquedaActual.tipo === 'admision' && !buscandoAnio,
    buscandoAnio,
    buscarEnAnio,
    salirBusquedaAnio: () => setBusquedaAnio(null),
    admisionAnio: modo === 'anio' ? busquedaAnio.admision : null,
    truncadoAnio: modo === 'anio' && busquedaAnio.truncado,
  };
};
