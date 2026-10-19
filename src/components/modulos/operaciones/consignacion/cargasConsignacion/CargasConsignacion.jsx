import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collectionGroup,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { PackageSearch, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Loader2, Hash } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import Spinner from '../../../../ui/Spinner';
import { buscarReporteInfoPorAdmision } from '../registroConsignacion/utils/buscarReporteInfoPorAdmision';

import CargasConsignacionFiltros from './components/CargasConsignacionFiltros';
import CargasConsignacionTable from './components/CargasConsignacionTable';
import CargasConsignacionDetalleView from './components/CargasConsignacionDetalleView';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { ordenarRegistrosCargas } from './utils/ordenarRegistrosCargas';
import { combinarItemsActualizados } from './utils/combinarItemsActualizados';
import { useSincronizarOC } from '../../shared/ocIndex/useSincronizarOC';
import { SincronizarOCResumenModal } from '../../shared/ocIndex/SincronizarOCResumenModal';

const obtenerFechaHoyISO = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
};

const COL_BASE = 'consignacion_registros';
const NOMBRE_SUBCOL_DETALLES = 'detalles';
const ESTADO_POR_DEFECTO = 'INGRESADO';
const TAMANO_PAGINA = 150;
const TAMANO_PAGINA_TABLA = 50;

// Semilla del filtro de Estado: los únicos estados que Consignación escribe en
// un registro — INGRESADO (alta en Registro), PENDIENTE/CARGADO/REVISAR
// (selector de CargasTab) y SOLICITADO (export en Solicitud). Los estados
// reales encontrados en los datos se suman a esta lista.
const ESTADOS_SEMILLA = ['INGRESADO', 'PENDIENTE', 'CARGADO', 'REVISAR', 'SOLICITADO'];

const CargasConsignacion = () => {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  // Por defecto parte en el año y mes actuales (filtro del lado del cliente).
  const [filtroAnio, setFiltroAnio] = useState(() => new Date().getFullYear().toString());
  const [filtroMes, setFiltroMes] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [filtroDia, setFiltroDia] = useState('');
  const [filtrosEstados, setFiltrosEstados] = useState([ESTADO_POR_DEFECTO]);
  const [filtroSoloHastaHoy, setFiltroSoloHastaHoy] = useState(true);
  // Estados vistos en cualquier carga de datos (unión acumulada): como la
  // consulta filtra por estado en el servidor, `registros` solo trae los
  // seleccionados; acumular evita que las demás opciones desaparezcan.
  const [estadosVistos, setEstadosVistos] = useState(() => new Set());

  const [registroSeleccionado, setRegistroSeleccionado] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);

  const { showToast } = useToast();
  const { confirmAction } = useModal();

  const procesarSnap = (snap) => {
    const lista = snap.docs
      .filter((d) => d.ref.path.startsWith(`${COL_BASE}/`))
      .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

    const nuevos = lista.map(r => (r.estado || '').toUpperCase().trim()).filter(Boolean);
    setEstadosVistos(prev => (nuevos.every(e => prev.has(e)) ? prev : new Set([...prev, ...nuevos])));
    return lista;
  };

  // Sin estados seleccionados = todos. 1 estado usa '==' y varios usan 'in'
  // (mismo índice compuesto estado + fechaRegistro; 'in' admite hasta 30).
  const agregarRestriccionEstados = (restricciones) => {
    if (filtrosEstados.length === 1) restricciones.push(where('estado', '==', filtrosEstados[0]));
    else if (filtrosEstados.length > 1) restricciones.push(where('estado', 'in', filtrosEstados));
  };

  const cargarPrimeraPagina = useCallback(async () => {
    setCargandoLista(true);
    try {
      const restricciones = [];
      agregarRestriccionEstados(restricciones);
      restricciones.push(orderBy('fechaRegistro', 'desc'));
      restricciones.push(limit(TAMANO_PAGINA));

      const q = query(collectionGroup(db, NOMBRE_SUBCOL_DETALLES), ...restricciones);
      const snap = await getDocs(q);

      setRegistros(procesarSnap(snap));
      setUltimoDoc(snap.docs[snap.docs.length - 1] || null);
      setHayMas(snap.docs.length === TAMANO_PAGINA);
    } catch (error) {
      console.error('Error al cargar consignacion_registros:', error);
      showToast('Error al cargar los registros', 'error');
    } finally {
      setCargandoLista(false);
    }
  }, [filtrosEstados]);

  const cargarMas = async () => {
    if (!ultimoDoc || cargandoMas) return;
    setCargandoMas(true);
    try {
      const restricciones = [];
      agregarRestriccionEstados(restricciones);
      restricciones.push(orderBy('fechaRegistro', 'desc'));
      restricciones.push(startAfter(ultimoDoc));
      restricciones.push(limit(TAMANO_PAGINA));

      const q = query(collectionGroup(db, NOMBRE_SUBCOL_DETALLES), ...restricciones);
      const snap = await getDocs(q);

      setRegistros((prev) => [...prev, ...procesarSnap(snap)]);
      setUltimoDoc(snap.docs[snap.docs.length - 1] || null);
      setHayMas(snap.docs.length === TAMANO_PAGINA);
    } catch (error) {
      console.error('Error al cargar más registros:', error);
      showToast('Error al cargar más registros', 'error');
    } finally {
      setCargandoMas(false);
    }
  };

  useEffect(() => {
    cargarPrimeraPagina();
  }, [cargarPrimeraPagina]);

  // "Sincronizar OC": llena `orden` (columna ORDEN de Registro) desde
  // Importar Detalles OC, con el mismo cruce que Gestión de Implantes.
  const { sincronizandoOC, handleSincronizarOC, resumenOC, cerrarResumenOC } = useSincronizarOC({
    modulo: 'consignacion',
    onSincronizado: cargarPrimeraPagina
  });

  const handleActualizarVinculados = async (registro) => {
    if (!registro.gestionId) {
      showToast('Este registro no tiene ID (Admisión) para buscar en Reportes', 'error');
      return;
    }

    try {
      const datos = await buscarReporteInfoPorAdmision(db, registro.gestionId);

      if (!datos) {
        showToast('Aún no hay información en Reportes para este ID', 'info');
        return;
      }

      const cambios = {
        prevision: datos['Isapre'] || '',
        convenio: datos['Convenio'] || '',
        descripcionPabellon: datos['Descripción'] || ''
      };

      await updateDoc(registro.ref, cambios);

      setRegistros((prev) =>
        prev.map((r) => (r.id === registro.id ? { ...r, ...cambios } : r))
      );

      showToast('Datos vinculados actualizados correctamente', 'success');
    } catch (error) {
      console.error('Error al actualizar vinculados:', error);
      showToast('Error al actualizar los datos vinculados', 'error');
    }
  };

  const handleEliminar = (registro) => {
    confirmAction(
      'Eliminar Registro',
      '¿Estás seguro de eliminar este registro de consignación? Esta acción no se puede deshacer.',
      async () => {
        try {
          await deleteDoc(registro.ref);
          setRegistros((prev) => prev.filter((r) => r.id !== registro.id));
          if (registroSeleccionado?.id === registro.id) setRegistroSeleccionado(null);
          showToast('Registro eliminado correctamente', 'info');
        } catch (error) {
          showToast('Error al eliminar', 'error');
        }
      }
    );
  };

  const handleAbrirDetalle = (registro) => {
    setRegistroSeleccionado(registro);
  };

  // El detalle escucha en vivo todas las filas de la admisión: al volver
  // entrega esas filas y se actualizan en la tabla (ej. "Cargado" marcado
  // en varias), sin volver a leer de Firestore.
  const handleVolverDeDetalle = (itemsActualizados = []) => {
    setRegistroSeleccionado(null);
    setRegistros((prev) => combinarItemsActualizados(prev, itemsActualizados));
  };

  const anioActual = new Date().getFullYear().toString();
  const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');

  const opcionesFechas = useMemo(() => {
    // Año/mes actuales siempre son opción, aunque aún no haya registros cargados,
    // para que el select nunca quede en blanco con el valor por defecto.
    const anios = new Set([anioActual]);
    const meses = new Set([mesActual]);
    const dias = new Set();

    registros.forEach(r => {
      if (r.fecha && r.fecha.includes('-')) {
        const [yyyy, mm, dd] = r.fecha.split('-');
        if (yyyy) anios.add(yyyy);
        if (mm) meses.add(mm);
        if (dd) dias.add(dd);
      }
    });

    return {
      anios: [...anios].sort((a, b) => b.localeCompare(a)),
      meses: ordenarMeses(meses),
      dias: [...dias].sort((a, b) => a.localeCompare(b))
    };
  }, [registros, anioActual, mesActual]);

  const opcionesEstados = useMemo(
    () => [...new Set([...ESTADOS_SEMILLA, ...estadosVistos, ...filtrosEstados])].sort(),
    [estadosVistos, filtrosEstados]
  );

  const toggleFiltroEstado = (estado) => {
    setFiltrosEstados(prev =>
      prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]
    );
  };

  const limpiarFiltroEstados = () => setFiltrosEstados([]);

  const limpiarFiltros = () => {
    setFiltroAnio(anioActual);
    setFiltroMes(mesActual);
    setFiltroDia('');
    setFiltrosEstados([ESTADO_POR_DEFECTO]);
    setFiltroSoloHastaHoy(true);
  };

  const hayFiltrosActivos = !!(
    filtroAnio !== anioActual || filtroMes !== mesActual || filtroDia || !filtroSoloHastaHoy ||
    filtrosEstados.length !== 1 || filtrosEstados[0] !== ESTADO_POR_DEFECTO
  );

  const registrosFiltrados = useMemo(() => {
    const hoyISO = obtenerFechaHoyISO();
    const termino = busqueda.trim().toLowerCase();

    return ordenarRegistrosCargas(registros).filter(r => {
      if (termino) {
        const coincideTexto =
          (r.gestionId || '').toLowerCase().includes(termino) ||
          (r.nombre || '').toLowerCase().includes(termino) ||
          (r.medico || '').toLowerCase().includes(termino) ||
          (r.empresa || '').toLowerCase().includes(termino) ||
          (r.descripcion || '').toLowerCase().includes(termino) ||
          String(r.orden || '').toLowerCase().includes(termino);
        if (!coincideTexto) return false;
      }

      if (r.fecha && r.fecha.includes('-')) {
        const [yyyy, mm, dd] = r.fecha.split('-');
        if (filtroAnio && yyyy !== filtroAnio) return false;
        if (filtroMes && mm !== filtroMes) return false;
        if (filtroDia && dd !== filtroDia) return false;
      } else if (filtroAnio || filtroMes || filtroDia) {
        return false;
      }

      if (filtroSoloHastaHoy && !(r.fecha && r.fecha.includes('-') && r.fecha <= hoyISO)) return false;

      return true;
    });
  }, [registros, busqueda, filtroAnio, filtroMes, filtroDia, filtroSoloHastaHoy]);

  // Paginación de la tabla (50 filas por página) sobre los registros ya
  // filtrados. Se reinicia a la página 1 cada vez que cambian los filtros o
  // la búsqueda. No se reinicia al cargar más registros base (paginación de
  // Firestore vía "Cargar más"), para no devolver al usuario a la página 1
  // justo después de pedirlo.
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroAnio, filtroMes, filtroDia, filtroSoloHastaHoy, filtrosEstados]);

  const totalPaginas = Math.max(1, Math.ceil(registrosFiltrados.length / TAMANO_PAGINA_TABLA));
  const paginaSegura = Math.min(paginaActual, totalPaginas);

  const registrosPagina = useMemo(() => {
    const inicio = (paginaSegura - 1) * TAMANO_PAGINA_TABLA;
    return registrosFiltrados.slice(inicio, inicio + TAMANO_PAGINA_TABLA);
  }, [registrosFiltrados, paginaSegura]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Procesando...</h3>
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <PackageSearch size={15} className="text-[#2383C2]" />
          CARGAS DE CONSIGNACIÓN
        </h2>
        {!registroSeleccionado && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSincronizarOC}
              disabled={sincronizandoOC}
              title={sincronizandoOC ? 'Sincronizando OC...' : 'Sincronizar OC desde Importar Detalles OC'}
              aria-label="Sincronizar OC"
              className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-wait"
            >
              {sincronizandoOC ? <Loader2 size={14} className="animate-spin" /> : <Hash size={14} />}
            </button>
            <button
              type="button"
              onClick={cargarPrimeraPagina}
              disabled={cargandoLista}
              title="Actualizar lista"
              className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40"
            >
              <RefreshCw size={14} className={cargandoLista ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {registroSeleccionado ? (
        <CargasConsignacionDetalleView
          registro={registroSeleccionado}
          onVolver={handleVolverDeDetalle}
          setCargando={setCargando}
        />
      ) : (
        <>
          <CargasConsignacionFiltros
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            filtroAnio={filtroAnio}
            setFiltroAnio={setFiltroAnio}
            filtroMes={filtroMes}
            setFiltroMes={setFiltroMes}
            filtroDia={filtroDia}
            setFiltroDia={setFiltroDia}
            opcionesFechas={opcionesFechas}
            filtrosEstados={filtrosEstados}
            toggleFiltroEstado={toggleFiltroEstado}
            limpiarFiltroEstados={limpiarFiltroEstados}
            opcionesEstados={opcionesEstados}
            filtroSoloHastaHoy={filtroSoloHastaHoy}
            setFiltroSoloHastaHoy={setFiltroSoloHastaHoy}
            hayFiltrosActivos={hayFiltrosActivos}
            limpiarFiltros={limpiarFiltros}
          />

          {cargandoLista ? (
            <div className="flex-grow flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 text-[11px]">
              <Loader2 size={14} className="animate-spin" /> Cargando registros...
            </div>
          ) : (
            <>
              <CargasConsignacionTable
                registros={registrosPagina}
                numeroInicial={(paginaSegura - 1) * TAMANO_PAGINA_TABLA}
                onAbrirDetalle={handleAbrirDetalle}
                onEliminar={handleEliminar}
                onActualizarVinculados={handleActualizarVinculados}
              />

              {registrosFiltrados.length > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/40 text-[10.5px]">
                  <span className="text-gray-400 dark:text-gray-500 font-medium">
                    {registrosFiltrados.length} registro{registrosFiltrados.length === 1 ? '' : 's'} · Página {paginaSegura} de {totalPaginas}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                      disabled={paginaSegura <= 1}
                      className="flex items-center gap-1 px-2 py-1 rounded font-bold text-gray-500 dark:text-gray-400 hover:text-[#2383C2] hover:bg-white dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={12} /> Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                      disabled={paginaSegura >= totalPaginas}
                      className="flex items-center gap-1 px-2 py-1 rounded font-bold text-gray-500 dark:text-gray-400 hover:text-[#2383C2] hover:bg-white dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Siguiente <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}

              {hayMas && (
                <div className="flex justify-center py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/40">
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={cargandoMas}
                    className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#2383C2] hover:underline disabled:opacity-50"
                  >
                    {cargandoMas ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
                    Cargar más registros
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <SincronizarOCResumenModal resumen={resumenOC} onClose={cerrarResumenOC} modulo="Consignación" unidad="registro(s)" />
    </div>
  );
};

export default CargasConsignacion;