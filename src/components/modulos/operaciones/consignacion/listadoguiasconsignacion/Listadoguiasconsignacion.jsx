import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, query, where, orderBy, getDocs, documentId } from 'firebase/firestore';

// ⚠️ Ajusta estas rutas según dónde ubiques finalmente este archivo dentro de
// components/modulos/... (mismo patrón que EmpresasMaestros.jsx).
import { db } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import Spinner from '../../../../../components/ui/Spinner';

import {
  ClipboardList,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Package,
  AlertCircle,
} from 'lucide-react';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Las guías se guardan en IngresarGuiaDespacho.jsx bajo 'consignacion_guias'
// (no 'consignacion_registros', que es la colección de otro módulo). Con el
// prefijo equivocado, el filtro de abajo descartaba TODOS los documentos
// reales de guías, dejando el listado siempre vacío aunque sí existieran
// datos guardados.
const COL_BASE = 'consignacion_guias';

const TAMANO_PAGINA_TABLA = 50;

const ListadoGuiasConsignacion = () => {
  const { showToast } = useToast();

  // --- Calendario real: qué años/meses tienen registros en Firestore ---
  // Forma: { "2026": [8, 9], "2025": [12] }
  const [calendario, setCalendario] = useState({});
  const [cargandoCalendario, setCargandoCalendario] = useState(true);
  const [listo, setListo] = useState(false); // true cuando ya se calcularon los valores por defecto

  const [año, setAño] = useState('');
  const [mesNumero, setMesNumero] = useState('');

  const [cargando, setCargando] = useState(false);
  const [productos, setProductos] = useState([]); // documentos crudos de "detalles"
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [guiaExpandidaId, setGuiaExpandidaId] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);

  // --- Años disponibles (ordenados desc) y meses disponibles para el año actual ---
  const añosDisponibles = useMemo(
    () => Object.keys(calendario).sort((a, b) => Number(b) - Number(a)),
    [calendario]
  );

  const mesesDisponibles = useMemo(
    () => (calendario[año] ? ordenarMeses(calendario[año]) : []),
    [calendario, año]
  );

  // --- 1) Años/meses con registros, leídos de los documentos "marcador"
  // que IngresarGuiaDespacho escribe junto con cada guía:
  // consignacion_guias/{año} y consignacion_guias/{año}/mes/{NombreMes}
  // (campo `mes` numérico). Cuesta 1 lectura por año + 1 por mes, en vez del
  // collectionGroup('detalles') de TODO el histórico de todos los módulos. ---
  const cargarCalendario = async () => {
    setCargandoCalendario(true);
    try {
      const snapAnios = await getDocs(collection(db, COL_BASE));
      const anios = snapAnios.docs.map((d) => d.id).filter((id) => /^\d{4}$/.test(id));

      const resultado = {};
      await Promise.all(anios.map(async (y) => {
        const snapMeses = await getDocs(collection(db, COL_BASE, y, 'mes'));
        const meses = snapMeses.docs
          .map((d) => Number(d.data().mes) || NOMBRES_MESES.indexOf(d.id) + 1)
          .filter((m) => m >= 1 && m <= 12);
        if (meses.length > 0) resultado[y] = meses;
      }));

      setCalendario(resultado);
      return resultado;
    } catch (err) {
      console.error('Error al cargar el calendario de guías:', err);
      showToast('No se pudo determinar los años/meses con registros', 'error');
      return {};
    } finally {
      setCargandoCalendario(false);
    }
  };

  // --- 2) Cargar los productos del año y mes seleccionados. Se requieren
  // ambos: hasta que el usuario elija los dos, no se consulta nada (ver
  // efectos más abajo). ---
  const cargarMes = async (añoSel = año, mesSel = mesNumero) => {
    if (!añoSel || !mesSel) return;
    setCargando(true);
    setError('');
    try {
      const mesStr = String(mesSel).padStart(2, '0');
      const inicio = `${añoSel}-${mesStr}-01`;
      const fin =
        Number(mesSel) === 12
          ? `${Number(añoSel) + 1}-01-01`
          : `${añoSel}-${String(Number(mesSel) + 1).padStart(2, '0')}-01`;

      // Solo los "detalles" de consignacion_guias/{año}/mes/{NombreMes}/...
      // (rango sobre __name__). Antes era un collectionGroup('detalles') por
      // fecha que también traía los detalles de otros módulos y se filtraba
      // en el cliente.
      const rutaMes = `${COL_BASE}/${añoSel}/mes/${NOMBRES_MESES[Number(mesSel) - 1]}`;
      const q = query(
        collectionGroup(db, 'detalles'),
        where(documentId(), '>=', rutaMes),
        where(documentId(), '<', `${rutaMes}\uf8ff`),
        orderBy(documentId())
      );

      const snapshot = await getDocs(q);

      // Mismo filtro por fecha y orden (fechaEmision desc) que la consulta anterior.
      setProductos(
        snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.fechaEmision >= inicio && p.fechaEmision < fin)
          .sort((a, b) => String(b.fechaEmision || '').localeCompare(String(a.fechaEmision || '')))
      );
    } catch (err) {
      console.error('Error al cargar guías de consignación:', err);
      if (err?.code === 'failed-precondition') {
        setError(
          'Falta un índice de Firestore para esta consulta. Revisa la consola del navegador: el error trae un enlace para crearlo automáticamente (tarda 1-2 minutos en activarse).'
        );
      } else {
        setError('No se pudieron cargar las guías de este mes.');
      }
      showToast('No se pudieron cargar las guías', 'error');
    } finally {
      setCargando(false);
    }
  };

  // --- Al montar: solo calcular el calendario (qué años tienen datos). El
  // año/mes parten vacíos a propósito — el usuario debe elegir el año
  // manualmente en vez de que la pantalla arranque mostrando un período por
  // defecto (actual o "Todos").
  useEffect(() => {
    (async () => {
      await cargarCalendario();
      setListo(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- La consulta solo se ejecuta cuando año Y mes están seleccionados.
  // Si el mes elegido deja de ser válido para el año actual (p. ej. al
  // cambiar de año), se limpia para forzar al usuario a elegir uno nuevo. ---
  useEffect(() => {
    if (!listo || !año) {
      setProductos([]);
      return;
    }
    const meses = calendario[año] ? ordenarMeses(calendario[año]) : [];
    if (mesNumero && !meses.includes(Number(mesNumero))) {
      setMesNumero('');
      return; // este mismo efecto se vuelve a ejecutar con mesNumero=''
    }
    if (!mesNumero) {
      setProductos([]);
      return;
    }
    cargarMes(año, mesNumero);
    setGuiaExpandidaId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [año, mesNumero, listo, calendario]);

  const recargarTodo = async () => {
    await cargarCalendario();
    if (año && mesNumero) cargarMes(año, mesNumero);
  };

  // --- Agrupar los productos sueltos en guías (por número de documento) ---
  const guias = useMemo(() => {
    const grupos = {};
    productos.forEach((p) => {
      const clave = p.numeroDocumento || '(sin número)';
      if (!grupos[clave]) {
        grupos[clave] = {
          id: clave,
          numeroGuia: p.numeroGuia || '',
          numeroDocumento: p.numeroDocumento || '',
          fechaEmision: p.fechaEmision || '',
          descripcionPrimerItem: p.descripcionPrimerItem || '',
          productos: [],
        };
      }
      grupos[clave].productos.push(p);
      // Compatibilidad con guías guardadas antes de este campo: si no vino
      // grabado, se usa la descripción del primer producto del grupo.
      if (!grupos[clave].descripcionPrimerItem && grupos[clave].productos.length === 1) {
        grupos[clave].descripcionPrimerItem = p.descripcion || '';
      }
    });
    return Object.values(grupos).sort((a, b) => (b.fechaEmision || '').localeCompare(a.fechaEmision || ''));
  }, [productos]);

  // --- Filtro de búsqueda (por guía/documento o por contenido de algún producto) ---
  const guiasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return guias;
    return guias.filter((g) => {
      const coincideCabecera =
        g.numeroGuia.toLowerCase().includes(texto) || g.numeroDocumento.toLowerCase().includes(texto);
      const coincideProducto = g.productos.some(
        (p) =>
          p.codigo?.toLowerCase().includes(texto) ||
          p.descripcion?.toLowerCase().includes(texto) ||
          p.lote?.toLowerCase().includes(texto)
      );
      return coincideCabecera || coincideProducto;
    });
  }, [guias, busqueda]);

  // --- Paginación de la tabla (50 filas por página) sobre las guías ya
  // filtradas. Se reinicia a la página 1 cada vez que cambian el año, el
  // mes o la búsqueda. ---
  useEffect(() => {
    setPaginaActual(1);
  }, [año, mesNumero, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(guiasFiltradas.length / TAMANO_PAGINA_TABLA));
  const paginaSegura = Math.min(paginaActual, totalPaginas);

  const guiasPagina = useMemo(() => {
    const inicio = (paginaSegura - 1) * TAMANO_PAGINA_TABLA;
    return guiasFiltradas.slice(inicio, inicio + TAMANO_PAGINA_TABLA);
  }, [guiasFiltradas, paginaSegura]);

  const formatearFecha = (fechaISO) => {
    if (!fechaISO) return 'N/A';
    const [y, m, d] = fechaISO.split('-');
    return `${d}-${m}-${y}`;
  };

  const sinDatosEnAbsoluto = !cargandoCalendario && listo && añosDisponibles.length === 0;
  const faltaSeleccionarPeriodo = !cargandoCalendario && listo && añosDisponibles.length > 0 && (!año || !mesNumero);
  const mostrandoOverlay = cargando || (cargandoCalendario && !listo);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-secundario">
      {mostrandoOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] text-subtitulo">Cargando...</h3>
          </div>
        </div>
      )}

      {/* --- CABECERA --- */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5">
          <ClipboardList size={14} className="text-[#2383C2]" />
          Guías de consignación
        </h2>

        <button
          onClick={recargarTodo}
          disabled={mostrandoOverlay}
          className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
          title="Recargar"
        >
          <RefreshCw size={15} className={mostrandoOverlay ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* --- BARRA DE BÚSQUEDA / FILTROS --- */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap justify-between items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative w-60">
          <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            disabled={sinDatosEnAbsoluto}
            className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2] dark:focus:border-[#2383C2] disabled:opacity-50"
            placeholder="Buscar por N° de guía, documento, código, lote..."
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={mesNumero}
            onChange={(e) => setMesNumero(e.target.value ? Number(e.target.value) : '')}
            disabled={!año}
            className="h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal disabled:opacity-50"
          >
            <option value="">{año ? 'Selecciona mes' : 'Elige un año primero'}</option>
            {mesesDisponibles.map((m) => (
              <option key={m} value={m}>{NOMBRES_MESES[m - 1]}</option>
            ))}
          </select>

          <select
            value={año}
            onChange={(e) => setAño(e.target.value)}
            disabled={añosDisponibles.length === 0}
            className="h-7 px-1.5 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal disabled:opacity-50"
          >
            <option value="">{añosDisponibles.length === 0 ? 'Sin años' : 'Selecciona año'}</option>
            {añosDisponibles.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <span className="text-pequeno text-tinta-atenuada whitespace-nowrap">
            {guiasFiltradas.length} guías
          </span>
        </div>
      </div>

      {/* --- ERROR --- */}
      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 text-secundario text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* --- TABLA --- */}
      {sinDatosEnAbsoluto ? (
        <div className="flex-grow flex items-center justify-center text-secundario text-tinta-atenuada">
          Aún no hay ninguna guía de consignación ingresada.
        </div>
      ) : faltaSeleccionarPeriodo ? (
        <div className="flex-grow flex items-center justify-center text-secundario text-tinta-atenuada">
          Selecciona un año y un mes en los filtros para ver sus guías.
        </div>
      ) : (
        <>
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-secundario border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-tinta-secundaria uppercase text-pequeno">
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">#</th>
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8"></th>
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">N° Guía</th>
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">N° Documento</th>
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Descripción</th>
                <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Fecha Emisión</th>
                <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">N° Productos</th>
              </tr>
            </thead>
            <tbody>
              {!mostrandoOverlay && !error && guiasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-tinta-atenuada">
                    No hay guías ingresadas para {NOMBRES_MESES[mesNumero - 1]} de {año}
                    {busqueda && ' que coincidan con la búsqueda'}.
                  </td>
                </tr>
              )}

              {guiasPagina.map((guia, index) => {
                const expandida = guiaExpandidaId === guia.id;
                return (
                  <React.Fragment key={guia.id}>
                    <tr
                      onClick={() => setGuiaExpandidaId(expandida ? null : guia.id)}
                      className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
                    >
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria text-etiqueta text-center">
                        {(paginaSegura - 1) * TAMANO_PAGINA_TABLA + index + 1}
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-atenuada text-center">
                        {expandida ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-principal">
                        {guia.numeroGuia || 'N/A'}
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">
                        {guia.numeroDocumento || 'N/A'}
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria max-w-[220px]">
                        <span className="block truncate" title={guia.descripcionPrimerItem}>
                          {guia.descripcionPrimerItem || 'N/A'}
                        </span>
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria">
                        {formatearFecha(guia.fechaEmision)}
                      </td>
                      <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700/70 text-center">
                        <span className="inline-flex items-center gap-1 text-pequeno px-1.5 py-0.2 rounded-full bg-gray-100 dark:bg-gray-700 text-tinta-secundaria">
                          <Package size={10} />
                          {guia.productos.length}
                        </span>
                      </td>
                    </tr>

                    {expandida && (
                      <tr>
                        <td colSpan={7} className="p-0 border-b border-gray-200 dark:border-gray-700/70 bg-gray-50/60 dark:bg-gray-900/30">
                          <table className="w-full text-left text-secundario border-collapse">
                            <thead>
                              <tr className="text-tinta-secundaria uppercase text-pequeno">
                                <th className="py-1 px-2 pl-9 border-b border-gray-200 dark:border-gray-700">Código</th>
                                <th className="py-1 px-2 border-b border-gray-200 dark:border-gray-700">Descripción</th>
                                <th className="py-1 px-2 border-b border-gray-200 dark:border-gray-700">Lote</th>
                                <th className="py-1 px-2 border-b border-gray-200 dark:border-gray-700">Vencimiento</th>
                                <th className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 w-16">Cant.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {guia.productos.map((p) => (
                                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                                  <td className="py-1 px-2 pl-9 text-tinta-principal text-numero-tabla">
                                    {p.codigo || 'N/A'}
                                  </td>
                                  <td className="py-1 px-2 text-tinta-secundaria">
                                    {p.descripcion || 'N/A'}
                                  </td>
                                  <td className="py-1 px-2 text-tinta-secundaria">
                                    {p.lote || 'N/A'}
                                  </td>
                                  <td className="py-1 px-2 text-tinta-secundaria">
                                    {p.vencimiento || 'N/A'}
                                  </td>
                                  <td className="py-1 px-2 text-tinta-secundaria">
                                    {p.cantidad ?? 'N/A'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {guiasFiltradas.length > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/40 text-pequeno">
            <span className="text-tinta-atenuada">
              {guiasFiltradas.length} guía{guiasFiltradas.length === 1 ? '' : 's'} · Página {paginaSegura} de {totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura <= 1}
                className="flex items-center gap-1 px-2 py-1 rounded text-etiqueta text-tinta-secundaria hover:text-[#2383C2] hover:bg-white dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} /> Anterior
              </button>
              <button
                type="button"
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura >= totalPaginas}
                className="flex items-center gap-1 px-2 py-1 rounded text-etiqueta text-tinta-secundaria hover:text-[#2383C2] hover:bg-white dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default ListadoGuiasConsignacion;