import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  BarChart3, CalendarDays, Clock, FileSpreadsheet, Stethoscope, ClipboardList, Building2, Users,
  AlertTriangle, RefreshCw, Loader2, Lock, Activity, Info, Barcode, Coins, RotateCcw,
} from 'lucide-react';
import { functions } from '../../../../firebaseConfig';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useUser } from '../../../../context/UserContext';
import { useModal } from '../../../../context/ModalContext';
import { useToast } from '../../../../context/ToastContext';
import {
  BLOQUES, DIMENSIONES, CRUCES, VERSION_MONTOS, periodoAnterior, etiquetaPeriodo, desdeClave, periodosDisponibles, aniosDe, mesesDe, nombreMes,
} from './estadisticasConfig';
import { obtenerIndice, obtenerPeriodo, obtenerCodigos, obtenerMontos, invalidarPeriodo } from './estadisticasStore';
import {
  unirDatos, unirCodigos, indicadores, filasComparadas, filasCruce, filasCodigos, filasCruceCodigo, codigosDe, filtrarFilas, ordenarFilas,
} from './agregados';
import { exportarEstadisticas, filasParaExcel, filasCodigosParaExcel } from './exportarEstadisticas';
import TarjetaIndicador from './components/TarjetaIndicador';
import TablaDimension from './components/TablaDimension';
import TablaCodigos from './components/TablaCodigos';
import BarrasTop from './components/BarrasTop';
import PanelDetalle from './components/PanelDetalle';
import { formatoNumero, formatoMonto } from './components/formato';

// Administración → Estadísticas. Bloque 1: Implantes, Consignación y
// Hemodinamia, por período de imputación (el de Período Actual y el cierre).
// Lee solo los documentos precalculados de la colección `estadisticas`, con
// getDoc y caché de sesión: el índice, el principal de cada módulo y período
// (+ el de montos con "Ver montos") y, solo al abrir Códigos o un detalle,
// el de códigos. Cambiar de pestaña, filtro, orden o métrica no lee nada.

const PATH_VISTA = '/administracion/estadisticas'; // = RUTA_VISTA_ESTADISTICAS
const BLOQUE = BLOQUES[0];
const ICONOS = { m: Stethoscope, c: ClipboardList, e: Building2, k: Barcode };
const CLAVES_TEXTO = ['nombre', 'codigo', 'descripcion'];
// Columnas de orden que no existen en el modo "Solo un mes".
const ORDEN_COMPARATIVO = ['anterior', 'diferencia', 'variacion', 'montoAnterior', 'montoDiferencia', 'montoVariacion'];
const MODOS = [
  { id: 'comparar', label: 'Comparar con mes anterior' },
  { id: 'solo', label: 'Solo un mes' },
];

const CLASE_SELECT = 'h-7 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] font-normal text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[#2383C2] disabled:opacity-60';

const fechaHora = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};

const Estadisticas = () => {
  const { hasPermission } = useGranularPermission();
  const { userData } = useUser();
  const { confirmAction } = useModal();
  const { showToast } = useToast();

  const modulosPermitidos = BLOQUE.modulos.filter((m) => hasPermission(PATH_VISTA, 'filtros', m.permiso));
  const dimensionesPermitidas = BLOQUE.dimensiones.filter((d) => hasPermission(PATH_VISTA, 'pestanas', DIMENSIONES[d].permiso));
  const puede = {
    elegirPeriodo: hasPermission(PATH_VISTA, 'filtros', 'select_periodo'),
    exportar: hasPermission(PATH_VISTA, 'acciones', 'btn_exportar'),
    // Las reglas de Firestore también lo exigen para leer los montos.
    verMontos: hasPermission(PATH_VISTA, 'acciones', 'ver_montos'),
    // El servidor vuelve a exigir rol, ítem y acción (denegada por defecto).
    recalcular: ['admin', 'dev'].includes(userData?.rol) && hasPermission(PATH_VISTA, 'acciones', 'btn_recalcular'),
  };

  const [indice, setIndice] = useState(null);
  const [errorIndice, setErrorIndice] = useState(null);
  // null = el período por defecto (en curso más reciente). Siempre se entra
  // comparando el mes en curso con el anterior.
  const [periodo, setPeriodo] = useState(null);
  const [modo, setModo] = useState('comparar');
  const [filtro, setFiltro] = useState('todos');
  const [tab, setTab] = useState(null);
  const [datos, setDatos] = useState({ clave: null, actual: [], anterior: [], montosActual: [], montosAnterior: [] });
  const [codigosDatos, setCodigosDatos] = useState({ clave: null, actual: [], anterior: [] });
  const [metricas, setMetricas] = useState({});
  const [error, setError] = useState(null);
  const [busquedas, setBusquedas] = useState({});
  const [ordenes, setOrdenes] = useState({});
  const [seleccion, setSeleccion] = useState(null);
  const [recalculando, setRecalculando] = useState(null);
  const [version, setVersion] = useState(0);
  const cerrarDetalle = useCallback(() => setSeleccion(null), []);

  const idsPermitidos = modulosPermitidos.map((m) => m.id).join(',');
  const modulosVista = filtro === 'todos' ? idsPermitidos.split(',').filter(Boolean) : [filtro];
  const dimension = tab && dimensionesPermitidas.includes(tab) ? tab : dimensionesPermitidas[0];

  // Índice de períodos (1 lectura por sesión).
  useEffect(() => {
    let activo = true;
    obtenerIndice()
      .then((d) => { if (activo) setIndice(d || { periodos: {} }); })
      .catch((err) => { console.error('Error al leer el índice de estadísticas:', err); if (activo) setErrorIndice('No se pudo cargar la lista de períodos.'); });
    return () => { activo = false; };
  }, [version]);

  // Períodos con estadísticas de los módulos a la vista (Todos o el filtro
  // elegido), según el índice (más reciente primero): de ahí salen los años
  // y meses de los selectores.
  const periodos = indice ? periodosDisponibles(indice, modulosVista) : [];

  // Por defecto: el período en curso más reciente; si no hay, el último.
  const periodoVista = periodo && periodos.some((p) => p.clave === periodo)
    ? periodo
    : (periodos.find((p) => !p.definitivo) || periodos[0])?.clave || null;
  const comparar = modo === 'comparar';
  // Modo "Solo un mes": no hay período anterior (ni se lee).
  const anterior = periodoVista && comparar ? periodoAnterior(periodoVista) : null;
  const claveDatos = periodoVista ? `${periodoVista}|${anterior}|${modulosVista.join(',')}|${puede.verMontos}|${version}` : null;
  const anioVista = periodoVista ? periodoVista.slice(0, 4) : '';
  const anios = aniosDe(periodos);
  const mesesAnio = mesesDe(periodos, anioVista);
  const periodoPorDefecto = (periodos.find((p) => !p.definitivo) || periodos[0])?.clave || null;
  const esEstadoInicial = comparar && periodoVista === periodoPorDefecto;

  // Documentos del período elegido y del anterior (caché de sesión): el
  // principal y, con "Ver montos", el de montos.
  useEffect(() => {
    if (!claveDatos) return undefined;
    let activo = true;
    const leer = async (clave) => {
      const bases = await Promise.all(modulosVista.map((m) => obtenerPeriodo(m, clave)));
      const montos = puede.verMontos
        ? await Promise.all(bases.map((b) => (b && (b.version || 1) >= VERSION_MONTOS ? obtenerMontos(b) : null)))
        : [];
      return { bases, montos };
    };
    const sinAnterior = Promise.resolve({ bases: [], montos: [] });
    Promise.all([leer(periodoVista), anterior ? leer(anterior) : sinAnterior])
      .then(([a, b]) => {
        if (activo) {
          setDatos({ clave: claveDatos, actual: a.bases, anterior: b.bases, montosActual: a.montos, montosAnterior: b.montos });
          setError(null);
        }
      })
      .catch((err) => { console.error('Error al leer estadísticas:', err); if (activo) { setDatos({ clave: claveDatos, actual: [], anterior: [], montosActual: [], montosAnterior: [] }); setError('No se pudieron cargar las estadísticas de este período.'); } });
    return () => { activo = false; };
    // claveDatos resume período + anterior (o ninguno) + módulos + permiso de montos + versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDatos]);

  // Códigos: solo al abrir la pestaña Códigos o un detalle (1 lectura por
  // módulo y período, una vez por sesión).
  const necesitaCodigos = Boolean(dimension === 'k' || seleccion);
  const claveCodigos = necesitaCodigos && datos.clave === claveDatos ? claveDatos : null;
  useEffect(() => {
    // Ya cargados para estos documentos (p. ej. al cerrar y abrir otro detalle).
    if (!claveCodigos || codigosDatos.clave === claveCodigos) return undefined;
    let activo = true;
    const leer = (bases) => Promise.all(bases.map((b) => (b && (b.version || 1) >= VERSION_MONTOS ? obtenerCodigos(b) : null)));
    Promise.all([leer(datos.actual), leer(datos.anterior)])
      .then(([a, b]) => { if (activo) setCodigosDatos({ clave: claveCodigos, actual: a, anterior: b }); })
      .catch((err) => { console.error('Error al leer los códigos:', err); if (activo) { setCodigosDatos({ clave: claveCodigos, actual: [], anterior: [] }); setError('No se pudieron cargar los códigos de este período.'); } });
    return () => { activo = false; };
    // claveCodigos resume los documentos ya cargados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCodigos]);

  const cargando = !errorIndice && (!indice || (claveDatos && datos.clave !== claveDatos));
  const actual = useMemo(() => unirDatos(datos.actual, datos.montosActual), [datos.actual, datos.montosActual]);
  const previo = useMemo(() => unirDatos(datos.anterior, datos.montosAnterior), [datos.anterior, datos.montosAnterior]);
  const codigosListos = Boolean(claveCodigos) && codigosDatos.clave === claveCodigos;
  const codActual = useMemo(() => unirCodigos(codigosDatos.actual, datos.montosActual), [codigosDatos.actual, datos.montosActual]);
  const codPrevio = useMemo(() => unirCodigos(codigosDatos.anterior, datos.montosAnterior), [codigosDatos.anterior, datos.montosAnterior]);
  const kActual = indicadores(actual.tuplas);
  const kPrevio = indicadores(previo.tuplas);
  const docsActuales = datos.actual.filter(Boolean);
  const formatoAntiguo = docsActuales.filter((d) => (d.version || 1) < VERSION_MONTOS);
  const conMontos = puede.verMontos && datos.montosActual.some(Boolean);
  const etiquetaActual = periodoVista ? etiquetaPeriodo(periodoVista) : '';
  const etiquetaAnterior = anterior ? etiquetaPeriodo(anterior) : '';

  const esCodigos = dimension === 'k';
  const filasBase = !dimension ? [] : esCodigos ? (codigosListos ? filasCodigos(codActual, codPrevio) : []) : filasComparadas(dimension, actual, previo);
  // "Solo un mes": sin filas en 0 en el mes elegido.
  const filasTodas = comparar ? filasBase : filasBase.filter((f) => f.actual > 0);
  const orden = ordenes[dimension] || { columna: 'actual', sentido: 'desc' };
  const busqueda = busquedas[dimension] || '';
  const filasVisibles = ordenarFilas(filtrarFilas(filasTodas, busqueda), orden.columna, orden.sentido);
  const filaSeleccionada = seleccion && seleccion.dimension === dimension ? filasTodas.find((f) => f.clave === seleccion.clave) : null;
  const sinVacias = (filas) => filas.filter((f) => f.actual > 0 || f.anterior > 0);
  const cruces = !filaSeleccionada ? [] : CRUCES[dimension].map((otra) => ({
    titulo: DIMENSIONES[otra].nombre,
    dim: otra,
    filas: ordenarFilas(sinVacias(esCodigos
      ? filasCruceCodigo(filaSeleccionada.clave, otra, codActual, codPrevio, actual.nombres, previo.nombres)
      : filasCruce(dimension, filaSeleccionada.clave, otra, actual, previo))),
  }));
  // Detalle de un médico, cirugía o empresa: códigos que usó (por monto).
  const codigosDetalle = filaSeleccionada && !esCodigos && codigosListos
    ? ordenarFilas(sinVacias(codigosDe(dimension, filaSeleccionada.clave, codActual, codPrevio)).filter((f) => f.actual > 0), conMontos ? 'monto' : 'actual')
    : null;
  const totalCodigos = esCodigos && codigosListos ? {
    cantidad: codActual.lineas.reduce((t, l) => t + (l.q || 0), 0),
    cantidadAnterior: codPrevio.lineas.reduce((t, l) => t + (l.q || 0), 0),
    admisiones: new Set(codActual.lineas.map((l) => l.a)).size,
    monto: codActual.lineas.reduce((t, l) => t + (l.$ || 0), 0),
    montoAnterior: codPrevio.lineas.reduce((t, l) => t + (l.$ || 0), 0),
  } : null;

  // Top 10: por admisiones (o cantidad, en Códigos) o por monto.
  const metrica = conMontos && metricas[dimension] === 'monto' ? 'monto' : 'actual';
  const opcionesMetrica = [
    { id: 'actual', label: esCodigos ? 'Cantidad' : 'Admisiones' },
    ...(conMontos ? [{ id: 'monto', label: 'Monto' }] : []),
  ];
  const nombreTop = (f) => (esCodigos ? `${f.codigo}${f.descripcion ? ` · ${f.descripcion}` : ''}` : f.nombre);

  const ordenar = (columna) => setOrdenes((prev) => {
    const o = prev[dimension] || { columna: 'actual', sentido: 'desc' };
    const sentido = o.columna === columna ? (o.sentido === 'desc' ? 'asc' : 'desc') : (CLAVES_TEXTO.includes(columna) ? 'asc' : 'desc');
    return { ...prev, [dimension]: { columna, sentido } };
  });

  const nombreFiltro = filtro === 'todos' ? 'Todos' : BLOQUE.modulos.find((m) => m.id === filtro)?.nombre;
  const contexto = `Período: ${etiquetaActual} ${comparar ? `(vs. ${etiquetaAnterior})` : '(solo este mes)'} · Módulo: ${nombreFiltro}${busqueda ? ` · Búsqueda: "${busqueda}"` : ''}`;
  const sufijoArchivo = `${periodoVista}_${comparar ? `vs_${anterior}` : 'solo'}_${filtro}`;

  // Excel: lo que se ve, con montos solo si el usuario puede verlos (sin
  // `anterior`, en "Solo un mes", no lleva columnas comparativas).
  const opcionesExcel = { periodo: periodoVista, anterior, conMontos };
  const exportarTabla = () => exportarEstadisticas({
    archivo: `estadisticas_${DIMENSIONES[dimension].nombre.toLowerCase()}_${sufijoArchivo}`,
    contexto,
    hojas: [{
      titulo: DIMENSIONES[dimension].nombre,
      filas: esCodigos
        ? filasCodigosParaExcel(filasVisibles, opcionesExcel)
        : filasParaExcel(filasVisibles, { ...opcionesExcel, singular: DIMENSIONES[dimension].singular }),
    }],
  });
  const exportarDetalle = () => exportarEstadisticas({
    archivo: `estadisticas_${DIMENSIONES[dimension].singular.toLowerCase()}_${sufijoArchivo}`,
    contexto: `${DIMENSIONES[dimension].singular}: ${filaSeleccionada.nombre} · ${contexto}`,
    hojas: [
      ...cruces.map((c) => ({
        titulo: c.titulo,
        filas: filasParaExcel(c.filas, { ...opcionesExcel, singular: DIMENSIONES[c.dim].singular, unidad: esCodigos ? 'Cantidad' : 'Admisiones' }),
      })),
      ...(codigosDetalle ? [{ titulo: 'Códigos', filas: filasCodigosParaExcel(codigosDetalle, opcionesExcel) }] : []),
    ],
  });

  const elegirPeriodo = (clave) => { setPeriodo(clave); setSeleccion(null); };
  // Al cambiar de año se mantiene el mes si existe; si no, el más reciente de ese año.
  const elegirAnio = (anio) => {
    const meses = mesesDe(periodos, anio);
    const mismoMes = meses.find((p) => p.clave.slice(5) === periodoVista?.slice(5));
    elegirPeriodo((mismoMes || meses[0])?.clave || null);
  };
  const elegirModo = (nuevo) => {
    if (nuevo === modo) return;
    setModo(nuevo);
    setSeleccion(null);
    // Las columnas comparativas desaparecen: su orden vuelve al de por defecto.
    if (nuevo === 'solo') {
      setOrdenes((prev) => Object.fromEntries(Object.entries(prev).filter(([, o]) => !ORDEN_COMPARATIVO.includes(o.columna))));
    }
  };
  const restablecer = () => { setPeriodo(null); setModo('comparar'); setSeleccion(null); };

  const recalcular = (doc) => {
    const p = desdeClave(periodoVista);
    const nombre = BLOQUE.modulos.find((m) => m.id === doc.modulo)?.nombre;
    confirmAction(
      'Recalcular período cerrado',
      `Se volverán a calcular las estadísticas de ${nombre} para ${etiquetaActual} con los datos actuales, incluidos los ${doc.cambiosTrasCierre || 0} cambio(s) posteriores al cierre. El período seguirá cerrado.`,
      async () => {
        setRecalculando(doc.modulo);
        try {
          await httpsCallable(functions, 'recalcularEstadisticasPeriodo')({ modulo: doc.modulo, anio: p.anio, mes: p.mes });
          invalidarPeriodo(doc.modulo, periodoVista);
          setVersion((v) => v + 1);
          showToast(`Estadísticas de ${nombre} recalculadas.`, 'success');
        } catch (err) {
          console.error(err);
          showToast(err?.code === 'functions/permission-denied' ? 'Solo un administrador puede recalcular un período.' : 'No se pudo recalcular el período.', 'error');
        } finally {
          setRecalculando(null);
        }
      },
      { confirmText: 'Recalcular', type: 'warning' }
    );
  };

  const ultimaActualizacion = docsActuales.reduce((max, d) => (d.actualizadoEl?.toMillis?.() > (max?.toMillis?.() || 0) ? d.actualizadoEl : max), null);
  const conCambios = docsActuales.filter((d) => d.definitivo && d.cambiosTrasCierre > 0);
  const sinDatos = modulosVista.filter((m, i) => !datos.actual[i]);

  if (modulosPermitidos.length === 0) {
    return <div className="p-8 text-center text-[13px] text-gray-500">No tienes permiso para ver las estadísticas de ningún módulo.</div>;
  }

  const estadoModulos = !cargando && docsActuales.length > 0 && (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {docsActuales.map((d) => (
        <span key={d.modulo} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${d.definitivo ? 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300' : 'bg-[#2383C2]/10 border-[#2383C2]/30 text-[#1d6fa5] dark:text-blue-300'}`}>
          {d.definitivo ? <Lock size={11} /> : <Activity size={11} />}
          {BLOQUE.modulos.find((m) => m.id === d.modulo)?.nombre}: {d.definitivo ? 'Definitivo (período cerrado)' : 'En curso'}
        </span>
      ))}
    </div>
  );

  const hayContenido = !cargando && periodos.length > 0;
  const conPestanas = hayContenido && dimensionesPermitidas.length > 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      {/* Desde 1024 px la página no se desplaza: la tabla y el Top 10
          ocupan el alto que queda y hacen scroll por dentro. Si la ventana es
          muy baja (menos del mínimo de la tabla), se desplaza el conjunto. */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:flex lg:flex-col">
        {/* Parte superior fija (desde 1024 px; en celular ocuparía media pantalla): encabezado, estado, indicadores y pestañas */}
        <div className="lg:sticky lg:top-0 lg:shrink-0 z-20 bg-white dark:bg-gray-800 px-4 pt-3 shadow-[0_1px_0_0_rgb(229_231_235)] dark:shadow-[0_1px_0_0_rgb(55_65_81)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-8 h-8 rounded-lg bg-[#2383C2] text-white flex items-center justify-center shrink-0"><BarChart3 size={16} /></span>
            <div className="min-w-0 mr-auto">
              <h2 className="text-[14px] font-bold leading-tight text-gray-800 dark:text-gray-100">Estadísticas</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{BLOQUE.nombre} · admisiones distintas por período de imputación</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              <CalendarDays size={14} className="text-[#2383C2]" /> Período
              {/* Solo años y meses con estadísticas (índice de períodos) de los módulos a la vista */}
              <select aria-label="Año" value={anioVista} onChange={(e) => elegirAnio(e.target.value)} disabled={!puede.elegirPeriodo || anios.length === 0}
                className={CLASE_SELECT}>
                {anios.length === 0 && <option value="">—</option>}
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select aria-label="Mes" value={periodoVista || ''} onChange={(e) => elegirPeriodo(e.target.value)} disabled={!puede.elegirPeriodo || mesesAnio.length === 0}
                className={CLASE_SELECT}>
                {mesesAnio.length === 0 && <option value="">Sin períodos</option>}
                {mesesAnio.map((p) => <option key={p.clave} value={p.clave}>{nombreMes(p.clave)}{p.definitivo ? '' : ' (en curso)'}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:flex gap-px w-full sm:w-auto rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 bg-gray-300 dark:bg-gray-600 text-[11.5px] font-semibold" role="group" aria-label="Modo de comparación">
              {MODOS.map((m) => (
                <button key={m.id} type="button" onClick={() => elegirModo(m.id)} aria-pressed={modo === m.id}
                  className={`h-7 px-3 whitespace-nowrap ${modo === m.id ? 'bg-[#2383C2] text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:text-[#2383C2]'}`}>
                  {m.label}
                </button>
              ))}
            </div>

            <button type="button" onClick={restablecer} disabled={esEstadoInicial || !periodoPorDefecto} title="Volver al mes en curso comparado con el mes anterior"
              className="h-7 px-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] font-semibold text-gray-600 dark:text-gray-300 hover:border-[#2383C2] hover:text-[#2383C2] inline-flex items-center gap-1 disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600">
              <RotateCcw size={12} /> Mes actual
            </button>

            {modulosPermitidos.length > 0 && (
              <div className="grid grid-cols-2 sm:flex gap-px w-full sm:w-auto rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 bg-gray-300 dark:bg-gray-600 text-[11.5px] font-semibold" role="group" aria-label="Filtrar por módulo">
                {[...(modulosPermitidos.length > 1 ? [{ id: 'todos', nombre: 'Todos' }] : []), ...modulosPermitidos].map((m) => (
                  <button key={m.id} type="button" onClick={() => { setFiltro(m.id); setSeleccion(null); }} aria-pressed={filtro === m.id || (modulosPermitidos.length === 1)}
                    className={`h-7 px-3 whitespace-nowrap ${filtro === m.id || modulosPermitidos.length === 1 ? 'bg-[#2383C2] text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:text-[#2383C2]'}`}>
                    {m.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <Clock size={13} /> Última actualización: <b className="text-gray-700 dark:text-gray-200">{fechaHora(ultimaActualizacion)}</b>
            </span>
            {estadoModulos}
          </div>

          {hayContenido && (
            <div className={`mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${conMontos ? 'lg:grid-cols-3 xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
              <TarjetaIndicador comparar={comparar} titulo="Admisiones" icono={Users} actual={kActual.admisiones} anterior={kPrevio.admisiones} etiquetaAnterior={etiquetaAnterior}
                pie={kActual.sinId > 0 ? <span className="text-amber-700 dark:text-amber-400" title="Gestiones sin ID / N° de Admisión: cada una cuenta como una admisión (se identifican por paciente y fecha)">Sin ID: <b>{formatoNumero(kActual.sinId)}</b></span> : null} />
              <TarjetaIndicador comparar={comparar} titulo="Médicos activos" icono={Stethoscope} actual={kActual.m} anterior={kPrevio.m} etiquetaAnterior={etiquetaAnterior} />
              <TarjetaIndicador comparar={comparar} titulo="Cirugías distintas" icono={ClipboardList} actual={kActual.c} anterior={kPrevio.c} etiquetaAnterior={etiquetaAnterior} />
              <TarjetaIndicador comparar={comparar} titulo="Empresas" icono={Building2} actual={kActual.e} anterior={kPrevio.e} etiquetaAnterior={etiquetaAnterior} />
              {conMontos && (
                <TarjetaIndicador comparar={comparar} titulo="Monto total" icono={Coins} actual={kActual.monto} anterior={kPrevio.monto} etiquetaAnterior={etiquetaAnterior} formato={formatoMonto}
                  pie={kActual.sinPrecio > 0 ? <span className="text-amber-700 dark:text-amber-400" title="Ítems con precio 0 o vacío: se cuentan en cantidades y admisiones, pero no suman monto">Sin precio: <b>{formatoNumero(kActual.sinPrecio)}</b></span> : null} />
              )}
            </div>
          )}

          {conPestanas ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="flex gap-1" role="tablist">
                {dimensionesPermitidas.map((d) => {
                  const Icono = ICONOS[d];
                  return (
                    <button key={d} type="button" role="tab" aria-selected={dimension === d} onClick={() => { setTab(d); setSeleccion(null); }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border-b-2 ${dimension === d ? 'border-[#2383C2] text-[#2383C2]' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                      <Icono size={14} /> {DIMENSIONES[d].nombre}
                      {kActual[d] != null && <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${dimension === d ? 'bg-[#2383C2]/10' : 'bg-gray-100 dark:bg-gray-700'}`}>{formatoNumero(kActual[d])}</span>}
                    </button>
                  );
                })}
              </div>
              {puede.exportar && (
                <button type="button" onClick={exportarTabla} disabled={filasVisibles.length === 0}
                  className="ml-auto mb-1.5 h-7 px-3 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[11.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                  <FileSpreadsheet size={13} /> Exportar Excel
                </button>
              )}
            </div>
          ) : <div className="h-3" />}
        </div>

        {/* Contenido */}
        <div className="px-4 py-3 flex flex-col gap-3 lg:flex-1 lg:min-h-[340px]">
          {conCambios.map((d) => (
            <div key={d.modulo} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200 text-[11.5px]" role="status">
              <AlertTriangle size={15} className="shrink-0" />
              <span className="flex-1 min-w-0">
                Hay <b>{d.cambiosTrasCierre}</b> {d.cambiosTrasCierre === 1 ? 'cambio posterior' : 'cambios posteriores'} al cierre en {BLOQUE.modulos.find((m) => m.id === d.modulo)?.nombre}. Las estadísticas muestran los datos al momento del cierre.
              </span>
              {puede.recalcular && (
                <button type="button" onClick={() => recalcular(d)} disabled={recalculando === d.modulo}
                  className="h-7 px-3 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                  {recalculando === d.modulo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Recalcular período
                </button>
              )}
            </div>
          ))}

          {formatoAntiguo.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200 text-[11.5px]" role="status">
              <Info size={15} className="shrink-0" />
              <span>
                {formatoAntiguo.map((d) => BLOQUE.modulos.find((m) => m.id === d.modulo)?.nombre).join(', ')}: este período aún no tiene montos ni códigos calculados.
                Un administrador debe ejecutar <code className="px-1 rounded bg-white/70 dark:bg-gray-900">generarEstadisticas.js --version-antigua</code>.
              </span>
            </div>
          )}

          {(errorIndice || error) && <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11.5px]">{errorIndice || error}</div>}

          {cargando ? (
            <div className="py-20 text-center text-gray-400 text-[12px]"><Loader2 size={18} className="inline animate-spin mr-2" />Cargando estadísticas…</div>
          ) : periodos.length === 0 ? (
            <div className="py-16 text-center text-[12px] text-gray-500">
              Aún no hay estadísticas calculadas. Se generan al imputar ítems en un período abierto (o con el script inicial para los períodos anteriores).
            </div>
          ) : (
            <>
              {sinDatos.length > 0 && filtro === 'todos' && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Info size={13} /> Sin estadísticas en {etiquetaActual} para: {sinDatos.map((m) => BLOQUE.modulos.find((x) => x.id === m)?.nombre).join(', ')}.</p>
              )}

              {!conPestanas ? (
                <p className="py-10 text-center text-[12px] text-gray-400">No tienes permiso para ver el detalle por médico, cirugía o empresa.</p>
              ) : (
                <div className="flex flex-col lg:flex-row gap-3 lg:flex-1 lg:min-h-0">
                  {esCodigos && !codigosListos ? (
                    <div className="flex-1 min-w-0 py-16 text-center text-gray-400 text-[12px] border border-gray-200 dark:border-gray-700 rounded-lg"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando códigos…</div>
                  ) : esCodigos ? (
                    <TablaCodigos
                      key={`${periodoVista}|${filtro}|${busqueda}|${orden.columna}|${orden.sentido}`}
                      filas={filasVisibles}
                      total={totalCodigos}
                      conMontos={conMontos}
                      comparar={comparar}
                      etiquetaActual={etiquetaActual}
                      etiquetaAnterior={etiquetaAnterior}
                      busqueda={busqueda}
                      onBuscar={(v) => setBusquedas((prev) => ({ ...prev, [dimension]: v }))}
                      orden={orden}
                      onOrdenar={ordenar}
                      seleccionada={filaSeleccionada?.clave}
                      onSeleccionar={(f) => setSeleccion({ dimension, clave: f.clave })}
                    />
                  ) : (
                  <TablaDimension
                    key={`${dimension}|${periodoVista}|${filtro}|${busqueda}|${orden.columna}|${orden.sentido}`}
                    singular={DIMENSIONES[dimension].singular}
                    filas={filasVisibles}
                    total={{ actual: kActual.admisiones, anterior: kPrevio.admisiones, monto: kActual.monto, montoAnterior: kPrevio.monto }}
                    conMontos={conMontos}
                    comparar={comparar}
                    etiquetaActual={etiquetaActual}
                    etiquetaAnterior={etiquetaAnterior}
                    busqueda={busqueda}
                    onBuscar={(v) => setBusquedas((prev) => ({ ...prev, [dimension]: v }))}
                    orden={orden}
                    onOrdenar={ordenar}
                    seleccionada={filaSeleccionada?.clave}
                    onSeleccionar={(f) => setSeleccion({ dimension, clave: f.clave })}
                  />
                  )}
                  {/* Top 10: columna derecha de ancho fijo, con el alto de la tabla y su propio scroll */}
                  <div className="min-w-0 lg:w-[340px] lg:shrink-0 lg:min-h-0 flex flex-col">
                    <BarrasTop filas={filasTodas}
                      titulo={`Top 10 ${DIMENSIONES[dimension].nombre.toLowerCase()} por ${opcionesMetrica.find((o) => o.id === metrica).label.toLowerCase()}`}
                      etiquetaActual={etiquetaActual} etiquetaAnterior={etiquetaAnterior}
                      metrica={metrica} opciones={opcionesMetrica} onMetrica={(m) => setMetricas((prev) => ({ ...prev, [dimension]: m }))}
                      nombreDe={nombreTop}
                      comparar={comparar}
                      onSeleccionar={(f) => setSeleccion({ dimension, clave: f.clave })} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {filaSeleccionada && (
        <PanelDetalle
          singular={DIMENSIONES[dimension].singular}
          fila={filaSeleccionada}
          esCodigo={esCodigos}
          cruces={cruces}
          codigos={codigosDetalle}
          cargandoCodigos={!esCodigos && !codigosListos}
          conMontos={conMontos}
          comparar={comparar}
          etiquetaActual={etiquetaActual}
          etiquetaAnterior={etiquetaAnterior}
          puedeExportar={puede.exportar}
          onExportar={exportarDetalle}
          onCerrar={cerrarDetalle}
        />
      )}
    </div>
  );
};

export default Estadisticas;
