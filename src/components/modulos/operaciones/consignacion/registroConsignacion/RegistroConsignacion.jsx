import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collectionGroup,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  writeBatch,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { ClipboardList, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import Spinner from '../../../../ui/Spinner';
import { buscarReporteInfoPorAdmisionCacheado, invalidarReporteAdmision } from './utils/cacheMaestros';
import { registrarLogConsignacion } from '../utils/registrarLogConsignacion';
import {
  COL_BASE,
  NOMBRE_SUBCOL_DETALLES,
  CENTRO_FIJO,
  descomponerFecha,
  mapearDatosVinculados,
  construirDatosDoc,
  construirNuevoRegistro,
  agregarCarpetasFecha,
  agregarRegistroNuevoABatch,
  esRegistroEditable,
  mensajeRegistroNoEditable,
  guardarEdicionRegistroConsignacion,
  RegistroNoEditableError,
  camposOrdenManual
} from '../utils/registroConsignacionService';

import RegistroConsignacionForm from './components/RegistroConsignacionForm';
import ConsignacionFiltros from './components/ConsignacionFiltros';
import ConsignacionTable from './components/ConsignacionTable';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { ordenarRegistrosCargas } from '../cargasConsignacion/utils/ordenarRegistrosCargas';

const TAMANO_PAGINA = 150;

const obtenerAnioActual = () => String(new Date().getFullYear());
const obtenerMesActual = () => String(new Date().getMonth() + 1).padStart(2, '0');

const TAMANO_PAGINA_TABLA = 50;

const RegistroConsignacion = () => {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [registroEditando, setRegistroEditando] = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroAnio, setFiltroAnio] = useState(obtenerAnioActual);
  const [filtroMes, setFiltroMes] = useState(obtenerMesActual);
  const [filtroDia, setFiltroDia] = useState('');
  const [filtroDespachado, setFiltroDespachado] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  // Antes esto escuchaba TODO el collectionGroup "detalles" de la base de
  // datos (incluye, por ejemplo, las gestiones de Implantes, que usa una
  // subcolección con el mismo nombre) y el filtro where('centro','==',...)
  // no servía para distinguir el origen porque Implantes también usa
  // centro='PABELLON'. Ahora se filtra en el cliente por el prefijo real
  // de la ruta ('consignacion_registros/').
  //
  // OJO: no se puede acotar con un rango de documentId() como en Implantes
  // porque esta pantalla pagina con orderBy('fechaRegistro','desc') +
  // limit/startAfter, y Firestore exige que el PRIMER orderBy coincida con
  // el campo que tiene el filtro de rango (documentId() en ese caso) — eso
  // rompería el orden cronológico real de la paginación.
  const filtrarSoloConsignacion = (docs) =>
    docs.filter((d) => d.ref.path.startsWith(`${COL_BASE}/`));

  const cargarPrimeraPagina = useCallback(async () => {
    setCargandoLista(true);
    try {
      const q = query(
        collectionGroup(db, NOMBRE_SUBCOL_DETALLES),
        where('centro', '==', CENTRO_FIJO),
        orderBy('fechaRegistro', 'desc'),
        limit(TAMANO_PAGINA)
      );
      const snap = await getDocs(q);

      const docsConsignacion = filtrarSoloConsignacion(snap.docs);

      setRegistros(docsConsignacion.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })));
      setUltimoDoc(snap.docs[snap.docs.length - 1] || null);
      setHayMas(snap.docs.length === TAMANO_PAGINA);
    } catch (error) {
      console.error('Error al cargar consignacion_registros:', error);
      showToast('Error al cargar los registros', 'error');
    } finally {
      setCargandoLista(false);
    }
  }, []);

  const cargarMas = async () => {
    if (!ultimoDoc || cargandoMas) return;
    setCargandoMas(true);
    try {
      const q = query(
        collectionGroup(db, NOMBRE_SUBCOL_DETALLES),
        where('centro', '==', CENTRO_FIJO),
        orderBy('fechaRegistro', 'desc'),
        startAfter(ultimoDoc),
        limit(TAMANO_PAGINA)
      );
      const snap = await getDocs(q);

      const docsConsignacion = filtrarSoloConsignacion(snap.docs);

      setRegistros((prev) => [...prev, ...docsConsignacion.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))]);
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

  const handleRegistrar = async (payload) => {
    const clavesNuevas = descomponerFecha(payload.fecha);
    if (!clavesNuevas) {
      showToast('La fecha ingresada no es válida', 'error');
      return;
    }

    if (registroEditando && !esRegistroEditable(registroEditando)) {
      showToast(mensajeRegistroNoEditable(registroEditando), 'error');
      setRegistroEditando(null);
      return;
    }

    const datosDoc = construirDatosDoc(payload);

    setCargando(true);
    try {
      if (registroEditando) {
        // La transacción relee el estado en Firestore: si ya no está
        // INGRESADO (lo cargaron/solicitaron mientras tanto) se rechaza.
        const { ref, datos, movido } = await guardarEdicionRegistroConsignacion(
          db, registroEditando, datosDoc, clavesNuevas, userData
        );
        setRegistros((prev) =>
          movido
            ? [{ id: ref.id, ref, ...datos }, ...prev.filter((r) => r.id !== registroEditando.id)]
            : prev.map((r) => (r.id === registroEditando.id ? { ...r, ...datos } : r))
        );
        await registrarLogConsignacion(ref, 'EDICION', datos, userData);

        showToast('Registro actualizado correctamente', 'success');
        setRegistroEditando(null);
      } else {
        const batch = writeBatch(db);
        agregarCarpetasFecha(batch, db, clavesNuevas);
        const nuevoDoc = construirNuevoRegistro(datosDoc, userData);
        const detalleRef = agregarRegistroNuevoABatch(batch, db, clavesNuevas, nuevoDoc, userData);

        await batch.commit();

        setRegistros((prev) => [{ id: detalleRef.id, ref: detalleRef, ...nuevoDoc }, ...prev]);

        showToast('Ítem registrado correctamente', 'success');
      }
    } catch (error) {
      if (error instanceof RegistroNoEditableError) {
        showToast(error.message, 'error');
        setRegistroEditando(null);
        cargarPrimeraPagina(); // la lista mostraba un estado desactualizado
        return;
      }
      console.error('Error al guardar:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  const handleIniciarEdicion = (registro) => {
    if (!esRegistroEditable(registro)) {
      showToast(mensajeRegistroNoEditable(registro), 'error');
      return;
    }
    setRegistroEditando(registro);
  };

  const handleCancelarEdicion = () => {
    setRegistroEditando(null);
  };

  // Orden escrita a mano (ya validada y normalizada por la celda). Una orden
  // sincronizada desde OC no llega aquí (la celda es de solo lectura) y
  // firestore.rules rechaza cambiarla si la pantalla estaba desactualizada.
  const handleActualizarOrden = async (registro, valor) => {
    const campos = camposOrdenManual(valor);
    try {
      await updateDoc(registro.ref, campos);
      setRegistros((prev) =>
        prev.map((r) => (r.id === registro.id ? { ...r, ...campos } : r))
      );
      return true;
    } catch (error) {
      console.error('Error al actualizar la orden:', error);
      showToast(
        error?.code === 'permission-denied'
          ? 'No se guardó: la orden de este registro ya fue sincronizada desde OC. Actualiza la lista.'
          : 'Error al actualizar',
        'error'
      );
      return false; // la celda vuelve al valor guardado
    }
  };

  // Al ingresar/quitar el N° de Guía, "Despachado" se sincroniza solo:
  // con guía -> RECIBIDO, sin guía -> vuelve a PENDIENTE. Se escriben ambos
  // campos en un mismo update para que nunca queden desincronizados.
  const handleActualizarGuia = async (registro, valorGuia) => {
    const nuevoDespachado = valorGuia && String(valorGuia).trim() ? 'RECIBIDO' : 'PENDIENTE';
    try {
      await updateDoc(registro.ref, { guias: valorGuia, despachado: nuevoDespachado });
      setRegistros((prev) =>
        prev.map((r) => (r.id === registro.id ? { ...r, guias: valorGuia, despachado: nuevoDespachado } : r))
      );
    } catch (error) {
      console.error('Error al actualizar guía:', error);
      showToast('Error al actualizar', 'error');
    }
  };

  const handleActualizarVinculados = async (registro) => {
    if (!registro.gestionId) {
      showToast('Este registro no tiene ID (Admisión) para buscar en Reportes', 'error');
      return;
    }

    try {
      const datos = await buscarReporteInfoPorAdmisionCacheado(db, registro.gestionId, true);
      invalidarReporteAdmision(registro.gestionId);

      if (!datos) {
        showToast('Aún no hay información en Reportes para este ID', 'info');
        return;
      }

      const cambios = mapearDatosVinculados(datos);

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
          await registrarLogConsignacion(registro.ref, 'ELIMINACION', {
            gestionId: registro.gestionId || '',
            nombre: registro.nombre || '',
            referencia: registro.referencia || ''
          }, userData);
          await deleteDoc(registro.ref);
          setRegistros((prev) => prev.filter((r) => r.id !== registro.id));
          if (registroEditando?.id === registro.id) setRegistroEditando(null);
          showToast('Registro eliminado correctamente', 'info');
        } catch (error) {
          showToast('Error al eliminar', 'error');
        }
      }
    );
  };

  const opcionesFechas = useMemo(() => {
    const anios = new Set([obtenerAnioActual()]);
    const meses = new Set([obtenerMesActual()]);
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
  }, [registros]);

  const limpiarFiltros = () => {
    setFiltroAnio('');
    setFiltroMes('');
    setFiltroDia('');
    setFiltroDespachado('');
    setFiltroEstado('');
  };

  const registrosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    // Mismo orden que Cargas: carga masiva en el orden de ingreso, con cada
    // admisión junta (la consulta solo ordena por fechaRegistro).
    return ordenarRegistrosCargas(registros).filter(r => {
      if (termino) {
        const coincideTexto =
          (r.gestionId || '').toLowerCase().includes(termino) ||
          (r.nombre || '').toLowerCase().includes(termino) ||
          (r.medico || '').toLowerCase().includes(termino) ||
          (r.referencia || '').toLowerCase().includes(termino) ||
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

      // "Despachado" se deriva siempre de si hay N° de Guía cargado, así el
      // filtro nunca queda desincronizado del valor real (ver handleActualizarGuia).
      if (filtroDespachado) {
        const estadoGuiaActual = r.guias && String(r.guias).trim() ? 'RECIBIDO' : 'PENDIENTE';
        if (estadoGuiaActual !== filtroDespachado) return false;
      }
      if (filtroEstado && (r.estado || 'INGRESADO').toUpperCase() !== filtroEstado) return false;

      return true;
    });
  }, [registros, busqueda, filtroAnio, filtroMes, filtroDia, filtroDespachado, filtroEstado]);

  // Paginación de la tabla (50 filas por página) sobre los registros ya
  // filtrados. Se reinicia a la página 1 cada vez que cambian los filtros o
  // la búsqueda. No se reinicia al cargar más registros base (paginación de
  // Firestore vía "Cargar más"), para no devolver al usuario a la página 1
  // justo después de pedirlo.
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroAnio, filtroMes, filtroDia, filtroDespachado, filtroEstado]);

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
          <ClipboardList size={15} className="text-[#2383C2]" />
          {registroEditando ? 'EDITAR REGISTRO DE CONSIGNACIÓN' : 'REGISTRO DE CONSIGNACIÓN'}
        </h2>
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

      <RegistroConsignacionForm
        onRegistrar={handleRegistrar}
        valoresIniciales={registroEditando}
        onCancelar={handleCancelarEdicion}
      />

      <ConsignacionFiltros
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        filtroAnio={filtroAnio}
        setFiltroAnio={setFiltroAnio}
        filtroMes={filtroMes}
        setFiltroMes={setFiltroMes}
        filtroDia={filtroDia}
        setFiltroDia={setFiltroDia}
        opcionesFechas={opcionesFechas}
        filtroDespachado={filtroDespachado}
        setFiltroDespachado={setFiltroDespachado}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        limpiarFiltros={limpiarFiltros}
      />

      {cargandoLista ? (
        <div className="flex-grow flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 text-[11px]">
          <Loader2 size={14} className="animate-spin" /> Cargando registros...
        </div>
      ) : (
        <>
          <ConsignacionTable
            registros={registrosPagina}
            numeroInicial={(paginaSegura - 1) * TAMANO_PAGINA_TABLA}
            onEliminar={handleEliminar}
            onEditar={handleIniciarEdicion}
            onActualizarOrden={handleActualizarOrden}
            onOrdenInvalida={(mensaje) => showToast(mensaje, 'error')}
            onActualizarGuia={handleActualizarGuia}
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
    </div>
  );
};

export default RegistroConsignacion;