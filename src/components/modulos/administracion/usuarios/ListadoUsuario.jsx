import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

// ⚠️ Ajusta estas rutas según dónde ubiques finalmente este archivo dentro de
// components/modulos/... (mismo nivel de anidamiento que CrearUsuario.jsx).
import { db } from '../../../../firebaseConfig';
import { COMPONENT_MAPS } from '../../../../config/componentMaps.jsx';
import { MODULES } from '../../../../config/modulesConfig.jsx';

import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import Spinner from '../../../../components/ui/Spinner';
import EditarUsuario from './EditarUsuario';
import CentroSelect from '../../../ui/CentroSelect';
import AvatarUsuario from '../../../ui/AvatarUsuario';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useUser } from '../../../../context/UserContext';
import { motivoReasignar } from '../../../../../functions/solicitudes/destinatarios.mjs';
import { AdministradoresAsignados } from './AsignacionAdministradores';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { ROLES } from './roles';
import {
  excepcionesDe, contarExcepciones, tieneExcepciones, guardarPermisosUsuario, asignarCentroCostoMasivo, asignarAdministradoresMasivo, desbloquearUsuario, mensajeError,
} from './permisosCentroCosto';
import { vistasConfigurables, resumenRestricciones, completarVistasDelMenu } from './permisosGranularesUtils';

import {
  Users,
  Search,
  Shield,
  Power,
  Pencil,
  CircleCheck,
  CircleX,
  CircleDashed,
  PlayCircle,
  Trash2,
  Layers,
  SlidersHorizontal,
  X,
  Lock,
  LockOpen,
} from 'lucide-react';

// TODO: mantener sincronizado con la lista de roles de CrearUsuario.jsx.

// abrirUsuarioId (opcional): abre ese usuario en edición al cargar el
// listado (viene de Permisos por centro → "Ver usuarios").
const ListadoUsuarios = ({ onContinuarCreacion, abrirUsuarioId, onAbrirUsuarioConsumido, onIrAPermisosCentro }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const { userData } = useUser();
  // Un Administrador no edita ni inactiva a un Desarrollador ni a sí mismo
  // (anti-escalada; lo vuelve a exigir guardarPermisosUsuario).
  const protegido = (usuario) => userData?.rol !== 'dev' && (usuario.rol === 'dev' || usuario.id === userData?.uid);
  const puedeDesbloquear = hasPermission('/administracion/listadoUsuario', 'tabla_usuarios', 'btn_desbloquear');

  const [usuarios, setUsuarios] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  // 'todos' | 'sin' (sin centro de costo) | id del centro.
  const [filtroCentro, setFiltroCentro] = useState('todos');
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [asignando, setAsignando] = useState(false);
  // Asignar administradores a varios (mismo centro): { administradoresAsignados, todosLosAdministradoresDelCentro } o null.
  const [asignacionAdmins, setAsignacionAdmins] = useState(null);
  const { datos: centros } = useCatalogo('centros');
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || 'Centro eliminado';

  const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);

  const [actualizandoEstadoId, setActualizandoEstadoId] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [desbloqueandoId, setDesbloqueandoId] = useState(null);

  // --- Suscripción en tiempo real a la colección de usuarios ---
  useEffect(() => {
    const q = query(collection(db, 'usuarios'), orderBy('nombreCompleto'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setUsuarios(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCargandoLista(false);
      },
      (error) => {
        console.error('Error al escuchar usuarios:', error);
        showToast('No se pudo cargar el listado de usuarios', 'error');
        setCargandoLista(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se aplica una sola vez por pedido, con el listado ya cargado (ajuste de
  // estado durante el render, como en useColumnResize).
  const [abrirAplicado, setAbrirAplicado] = useState(null);
  if (abrirUsuarioId && !cargandoLista && abrirAplicado !== abrirUsuarioId) {
    setAbrirAplicado(abrirUsuarioId);
    if (usuarios.some((u) => u.id === abrirUsuarioId)) setUsuarioEditandoId(abrirUsuarioId);
  }
  useEffect(() => {
    if (abrirUsuarioId && abrirAplicado === abrirUsuarioId) onAbrirUsuarioConsumido?.();
  }, [abrirUsuarioId, abrirAplicado, onAbrirUsuarioConsumido]);

  const estaActivo = (usuario) => usuario.activo !== false;
  // Bloqueo por intentos fallidos de login (lo escribe la función
  // iniciarSesion): fecha de fin si sigue vigente, si no null.
  const bloqueadoHasta = (usuario) => {
    const fin = usuario.bloqueoLoginHasta?.toDate?.();
    return fin && fin.getTime() > Date.now() ? fin : null;
  };
  const formatoBloqueo = (fecha) => fecha.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  // La creación de un usuario se hace en 3 pasos (ver CrearUsuario.jsx). Los
  // usuarios creados ANTES de este wizard no tienen "estadoCreacion" y se
  // consideran completos (legado). Solo se marca incompleta una creación que
  // tiene "estadoCreacion" y aún no llegó a completo:true.
  const creacionIncompleta = (usuario) =>
    !!usuario.estadoCreacion && usuario.estadoCreacion.completo !== true;

  const labelPasoIncompleto = (usuario) => {
    const estado = usuario.estadoCreacion || {};
    if (!estado.paso2) return 'Paso 2 pendiente';
    // Mismo conteo que el paso 3 de CrearUsuario (vistas con configuración y
    // sus pestañas incluidas).
    const configurables = vistasConfigurables(usuario.permisos, usuario.permisosGranulares, COMPONENT_MAPS);
    const finalizados = configurables.filter((path) => estado.itemsFinalizados?.[path]).length;
    return `Paso 3: ${finalizados}/${configurables.length} ítems`;
  };

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      const coincideTexto =
        !texto ||
        u.nombreCompleto?.toLowerCase().includes(texto) ||
        u.nombreUsuario?.toLowerCase().includes(texto) ||
        u.email?.toLowerCase().includes(texto);

      const coincideRol = filtroRol === 'todos' || u.rol === filtroRol;

      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' && estaActivo(u)) ||
        (filtroEstado === 'inactivos' && !estaActivo(u));

      const coincideCentro =
        filtroCentro === 'todos' ||
        (filtroCentro === 'sin' && !u.centroCostoId) ||
        u.centroCostoId === filtroCentro;

      return coincideTexto && coincideRol && coincideEstado && coincideCentro;
    });
  }, [usuarios, busqueda, filtroRol, filtroEstado, filtroCentro]);

  // Centros con usuarios (para el filtro), por nombre.
  const centrosConUsuarios = useMemo(
    () => [...new Set(usuarios.map((u) => u.centroCostoId).filter(Boolean))]
      .map((id) => ({ id, nombre: nombreCentro(id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuarios, centros]
  );

  // --- Selección y asignación masiva de centro de costo ---
  const seleccionables = usuariosFiltrados.filter((u) => !creacionIncompleta(u));
  const todosSeleccionados = seleccionables.length > 0 && seleccionables.every((u) => seleccionados.has(u.id));
  const alternarSeleccion = (id) => setSeleccionados((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const alternarTodos = () => setSeleccionados(todosSeleccionados ? new Set() : new Set(seleccionables.map((u) => u.id)));

  const asignarCentro = (centro) => {
    const uids = [...seleccionados];
    const destino = centro ? `el centro de costo ${centro.nombre}` : 'ningún centro de costo';
    confirmAction(
      'Asignar centro de costo',
      `Se asignará ${destino} a ${uids.length} usuario(s). Heredarán ${centro ? 'su plantilla' : 'solo sus permisos propios'} y conservarán sus permisos personalizados.`,
      async () => {
        setAsignando(true);
        try {
          const { actualizados } = await asignarCentroCostoMasivo({ uids, centroCostoId: centro?.id ?? null });
          setSeleccionados(new Set());
          showToast(`Centro de costo asignado a ${actualizados} usuario(s).`, 'success');
        } catch (error) {
          console.error('Error en la asignación masiva:', error);
          showToast(mensajeError(error, 'No se pudo asignar el centro de costo'), 'error');
        } finally {
          setAsignando(false);
        }
      },
      { confirmText: 'Asignar', type: 'warning' }
    );
  };

  // Asignación masiva de administradores: solo Operadores/Encargados de un
  // mismo centro de costo.
  const seleccionUsuarios = usuarios.filter((u) => seleccionados.has(u.id));
  const centrosSeleccion = new Set(seleccionUsuarios.map((u) => u.centroCostoId || null));
  const centroComun = centrosSeleccion.size === 1 && !centrosSeleccion.has(null) ? [...centrosSeleccion][0] : null;
  const puedeAsignarAdmins = Boolean(centroComun) && seleccionUsuarios.every((u) => ['operador', 'encargado'].includes(u.rol || 'operador'));
  const guardarAsignacionAdmins = async () => {
    setAsignando(true);
    try {
      const { actualizados } = await asignarAdministradoresMasivo({ uids: seleccionUsuarios.map((u) => u.id), ...asignacionAdmins });
      setAsignacionAdmins(null);
      setSeleccionados(new Set());
      showToast(`Administradores asignados a ${actualizados} usuario(s).`, 'success');
    } catch (error) {
      console.error('Error al asignar administradores:', error);
      showToast(mensajeError(error, 'No se pudieron asignar los administradores'), 'error');
    } finally {
      setAsignando(false);
    }
  };

  // --- Activar / Inactivar (acción rápida, sin entrar a modo edición) ---
  const toggleActivoUsuario = async (usuario) => {
    setActualizandoEstadoId(usuario.id);
    try {
      // Por la función: no deja inactivar al último administrador.
      await guardarPermisosUsuario({ uid: usuario.id, datos: { activo: !estaActivo(usuario) } });
      showToast(
        `Usuario "${usuario.nombreCompleto}" ${estaActivo(usuario) ? 'inactivado' : 'activado'}`,
        'success'
      );
    } catch (error) {
      console.error('Error al cambiar estado del usuario:', error);
      showToast(mensajeError(error, 'No se pudo cambiar el estado del usuario'), 'error');
    } finally {
      setActualizandoEstadoId(null);
    }
  };

  // --- Desbloquear (bloqueo por intentos fallidos de login) ---
  const desbloquear = async (usuario) => {
    setDesbloqueandoId(usuario.id);
    try {
      await desbloquearUsuario({ uid: usuario.id });
      showToast(`Usuario "${usuario.nombreCompleto}" desbloqueado`, 'success');
    } catch (error) {
      console.error('Error al desbloquear usuario:', error);
      showToast(mensajeError(error, 'No se pudo desbloquear el usuario'), 'error');
    } finally {
      setDesbloqueandoId(null);
    }
  };

  // --- Cancelar una creación incompleta (borra solo el documento en Firestore) ---
  const cancelarCreacionUsuario = (usuario) => {
    confirmAction(
      'Cancelar creación de usuario',
      `Se eliminará el registro de "${usuario.nombreCompleto || usuario.email}" y todo el progreso del asistente. ` +
        'La cuenta de acceso (correo/contraseña) podría seguir existiendo en el sistema de autenticación, ' +
        'ya que no puede eliminarse automáticamente desde aquí.',
      async () => {
        setCancelandoId(usuario.id);
        try {
          await deleteDoc(doc(db, 'usuarios', usuario.id));
          showToast('Creación cancelada.', 'success');
        } catch (error) {
          console.error('Error al cancelar creación de usuario:', error);
          showToast('No se pudo cancelar la creación', 'error');
        } finally {
          setCancelandoId(null);
        }
      },
      { confirmText: 'Cancelar creación', type: 'danger' }
    );
  };

  // --- Abrir / cerrar la edición del usuario (pantalla completa) ---
  const abrirEdicion = (usuario) => {
    setUsuarioEditandoId((actual) => (actual === usuario.id ? null : usuario.id));
  };

  const usuarioEditando = usuarios.find((u) => u.id === usuarioEditandoId) || null;

  // Resumen de permisos granulares para la tabla: restricciones dentro de
  // sus vistas y vistas del menú sin configuración (bloqueadas hasta
  // configurarlas o correr la migración).
  const resumenGranular = (usuario) => {
    if (usuario.rol === 'dev') return null;
    const restricciones = resumenRestricciones(usuario.permisos, usuario.permisosGranulares, COMPONENT_MAPS);
    const sinConfigurar = completarVistasDelMenu(usuario.permisos, usuario.permisosGranulares, COMPONENT_MAPS)
      .agregadas.filter((p) => Object.values(usuario.permisos || {}).flat().includes(p));
    const detalle = [
      restricciones.pestanas && `${restricciones.pestanas} pestaña(s) quitada(s)`,
      restricciones.secciones && `${restricciones.secciones} sección(es) oculta(s)`,
      restricciones.acciones && `${restricciones.acciones} acción(es) sin permiso`,
      restricciones.columnas && `${restricciones.columnas} columna(s) oculta(s)`,
    ].filter(Boolean);
    return { restricciones, detalle, sinConfigurar };
  };

  const modulosAsignados = (usuario) => {
    const claves = Object.keys(usuario.permisos || {}).filter((k) => (usuario.permisos[k] || []).length > 0);
    const labels = claves.map((k) => MODULES[k]?.label || k);
    return { cantidad: claves.length, labels };
  };



  // Edición a pantalla completa: reemplaza al listado (mismo patrón que las
  // vistas de detalle del sistema). `key` reinicia el estado al cambiar de usuario.
  if (usuarioEditando) {
    return <EditarUsuario key={usuarioEditando.id} usuario={usuarioEditando} usuarios={usuarios} onVolver={() => setUsuarioEditandoId(null)} onIrAPermisosCentro={onIrAPermisosCentro} />;
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* --- CABECERA / FILTROS --- */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2">
        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-1.5 shrink-0">
          <Users size={15} className="text-[#2383C2]" />
          Usuarios
          <span className="text-[10px] font-normal normal-case text-gray-400">
            ({usuariosFiltrados.length})
          </span>
        </h3>

        <div className="flex flex-1 flex-col sm:flex-row gap-1.5 sm:ml-2">
          <div className="relative flex items-center flex-1 min-w-[160px]">
            <Search className="absolute ml-2 text-gray-400" size={13} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, usuario o correo..."
              className="w-full text-xs py-1.5 pl-7 pr-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
            />
          </div>

          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="text-xs py-1.5 px-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
          >
            <option value="todos">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="text-xs py-1.5 px-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>

          <select
            value={filtroCentro}
            onChange={(e) => setFiltroCentro(e.target.value)}
            aria-label="Filtrar por centro de costo"
            className="text-xs py-1.5 px-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
          >
            <option value="todos">Todos los centros de costo</option>
            <option value="sin">Sin centro de costo</option>
            {centrosConUsuarios.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* --- ASIGNACIÓN MASIVA --- */}
      {seleccionados.size > 0 && (
        <div className="bg-[#2383C2]/5 dark:bg-blue-950/30 border border-[#2383C2]/30 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-[11.5px]" role="region" aria-label="Asignación masiva">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{seleccionados.size} seleccionado(s)</span>
          <span className="text-gray-500 dark:text-gray-400">· Asignar centro de costo:</span>
          <div className="w-56"><CentroSelect todos value={null} onChange={asignarCentro} placeholder="Elegir centro…" disabled={asignando} /></div>
          <button type="button" onClick={() => asignarCentro(null)} disabled={asignando}
            className="h-7 px-2.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 font-semibold text-gray-600 dark:text-gray-300 hover:text-red-600 disabled:opacity-50">
            Quitar centro
          </button>
          <button type="button" onClick={() => setAsignacionAdmins({ administradoresAsignados: [], todosLosAdministradoresDelCentro: true })}
            disabled={asignando || !puedeAsignarAdmins}
            title={puedeAsignarAdmins ? '' : 'Elige solo Operadores o Encargados de un mismo centro de costo'}
            className="h-7 px-2.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 font-semibold text-gray-600 dark:text-gray-300 hover:text-[#2383C2] disabled:opacity-50">
            Asignar administradores…
          </button>
          {asignando && <Spinner size="sm" />}
          <button type="button" onClick={() => setSeleccionados(new Set())} className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
            <X size={13} /> Limpiar selección
          </button>
        </div>
      )}

      {asignacionAdmins && puedeAsignarAdmins && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-w-md flex flex-col gap-2" role="region" aria-label="Asignar administradores">
          <p className="text-[11.5px] text-gray-600 dark:text-gray-300">{seleccionUsuarios.length} usuario(s) de {nombreCentro(centroComun)}:</p>
          <AdministradoresAsignados usuarios={usuarios} centroId={centroComun}
            asignados={asignacionAdmins.administradoresAsignados} todos={asignacionAdmins.todosLosAdministradoresDelCentro}
            onCambiar={(cambio) => setAsignacionAdmins((a) => ({ ...a, ...cambio }))} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAsignacionAdmins(null)} className="text-[11px] px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600">Cancelar</button>
            <button type="button" onClick={guardarAsignacionAdmins} disabled={asignando}
              className="text-[11px] font-bold px-3 py-1.5 rounded bg-[#2383C2] text-white disabled:opacity-50">Guardar</button>
          </div>
        </div>
      )}

      {/* --- LISTADO --- */}
      {cargandoLista ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-10">
          No se encontraron usuarios con estos filtros.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
                <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">
                    <input type="checkbox" checked={todosSeleccionados} onChange={alternarTodos} aria-label="Seleccionar todos" className="accent-[#2383C2]" />
                  </th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">#</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Nombre Completo</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Usuario</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Email</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Rol</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Centro de costo</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Módulos asignados</th>
                  <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Estado</th>
                  <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((usuario, index) => {
                  const activo = estaActivo(usuario);
                  const bloqueo = bloqueadoHasta(usuario);
                  const enEdicion = usuarioEditandoId === usuario.id;
                  const rolLabel = ROLES.find((r) => r.value === usuario.rol)?.label || usuario.rol;
                  const incompleta = creacionIncompleta(usuario);
                  const soloLectura = protegido(usuario);
                  const { cantidad: cantidadModulos, labels: labelsModulos } = modulosAsignados(usuario);

                  return (
                    <tr
                      key={usuario.id}
                      onClick={() => (incompleta || soloLectura ? null : abrirEdicion(usuario))}
                      className={`border-l-2 transition-colors ${
                        incompleta || soloLectura
                          ? 'border-transparent bg-amber-50/60 dark:bg-amber-900/10'
                          : `cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-700/40 ${
                              enEdicion ? 'border-[#2383C2] bg-[#2383C2]/5' : 'border-transparent'
                            }`
                      }`}
                    >
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center" onClick={(e) => e.stopPropagation()}>
                        {!incompleta && !soloLectura && (
                          <input type="checkbox" checked={seleccionados.has(usuario.id)} onChange={() => alternarSeleccion(usuario.id)}
                            aria-label={`Seleccionar ${usuario.nombreCompleto || usuario.email}`} className="accent-[#2383C2]" />
                        )}
                      </td>
                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-500 dark:text-gray-400 font-bold text-center">
                        {index + 1}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium">
                        <div className="flex items-center gap-2">
                          <AvatarUsuario nombre={usuario.nombreCompleto} fotoUrl={usuario.fotoPerfilUrl} className="w-5 h-5 bg-[#2383C2]/10 text-[#2383C2] text-[9px] font-bold" />
                          <span className="truncate">{usuario.nombreCompleto || 'Sin nombre'}</span>
                        </div>
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300">
                        @{usuario.nombreUsuario}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300">
                        {usuario.email}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <span className="flex items-center gap-1 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          <Shield size={10} className="text-[#2383C2]" />
                          {rolLabel}
                        </span>
                        {(() => {
                          const motivo = motivoReasignar(usuario, usuarios);
                          return motivo && (
                            <span title={motivo} className="mt-0.5 flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                              Por reasignar
                            </span>
                          );
                        })()}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                        {usuario.centroCostoId ? (
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="text-gray-700 dark:text-gray-200">{nombreCentro(usuario.centroCostoId)}</span>
                            {tieneExcepciones(usuario.excepciones) && (() => {
                              const n = contarExcepciones(excepcionesDe(usuario));
                              return (
                                <span title={`Permisos personalizados: ${n.agregados} agregado(s) y ${n.quitados} quitado(s) respecto de la plantilla`}
                                  className="flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                  <SlidersHorizontal size={10} /> Personalizado +{n.agregados}/−{n.quitados}
                                </span>
                              );
                            })()}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Sin centro</span>
                        )}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                        <span
                          title={labelsModulos.join(', ') || 'Sin módulos asignados'}
                          className="flex items-center gap-1 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        >
                          <Layers size={10} className="text-[#2383C2]" />
                          {cantidadModulos}
                        </span>
                        {(() => {
                          const resumen = resumenGranular(usuario);
                          if (!resumen) return null;
                          return (
                            <span className="flex flex-wrap gap-1 mt-0.5">
                              {resumen.restricciones.total > 0 && (
                                <span
                                  title={resumen.detalle.join(' · ')}
                                  className="flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                >
                                  <SlidersHorizontal size={10} />
                                  {resumen.restricciones.total} restricción{resumen.restricciones.total === 1 ? '' : 'es'}
                                </span>
                              )}
                              {resumen.sinConfigurar.length > 0 && (
                                <span
                                  title={`Sin configuración de permisos (bloqueadas para el usuario): ${resumen.sinConfigurar.join(', ')}. Ábrelas en "Editar acceso" y guarda.`}
                                  className="flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                >
                                  <CircleDashed size={10} />
                                  {resumen.sinConfigurar.length} sin configurar
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>

                      <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                        {incompleta ? (
                          <span className="flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            <CircleDashed size={10} />
                            Incompleta · {labelPasoIncompleto(usuario)}
                          </span>
                        ) : (
                          <span
                            className={`flex items-center gap-1 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              activo
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {activo ? <CircleCheck size={10} /> : <CircleX size={10} />}
                            {activo ? 'Activo' : 'Inactivo'}
                          </span>
                        )}
                        {bloqueo && (
                          <span className="mt-0.5 flex items-center gap-1 w-fit text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            <Lock size={10} />
                            Bloqueado hasta {formatoBloqueo(bloqueo)}
                          </span>
                        )}
                      </td>

                      <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {incompleta ? (
                            <>
                              <button
                                type="button"
                                title="Continuar creación"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onContinuarCreacion?.(usuario.id);
                                }}
                                className="text-[#2383C2] hover:text-[#1d6fa5] transition"
                              >
                                <PlayCircle size={13} />
                              </button>
                              <button
                                type="button"
                                title="Cancelar creación"
                                disabled={cancelandoId === usuario.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelarCreacionUsuario(usuario);
                                }}
                                className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition disabled:opacity-50"
                              >
                                {cancelandoId === usuario.id ? <Spinner size="sm" /> : <Trash2 size={13} />}
                              </button>
                            </>
                          ) : (
                            <>
                              {bloqueo && puedeDesbloquear && (
                                <button
                                  type="button"
                                  title="Desbloquear usuario"
                                  disabled={desbloqueandoId === usuario.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    desbloquear(usuario);
                                  }}
                                  className="text-red-500 dark:text-red-400 hover:text-green-600 transition disabled:opacity-50"
                                >
                                  {desbloqueandoId === usuario.id ? <Spinner size="sm" /> : <LockOpen size={13} />}
                                </button>
                              )}
                              {soloLectura ? (
                                <span title={usuario.rol === 'dev' ? 'Solo otro Desarrollador puede modificar a un Desarrollador' : 'No puedes modificar tu propio acceso'}
                                  className="text-gray-400 dark:text-gray-500"><Lock size={13} /></span>
                              ) : (<>
                              <button
                                type="button"
                                title={activo ? 'Inactivar usuario' : 'Activar usuario'}
                                disabled={actualizandoEstadoId === usuario.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleActivoUsuario(usuario);
                                }}
                                className={`transition disabled:opacity-50 ${
                                  activo
                                    ? 'text-gray-500 hover:text-red-500 dark:text-gray-400'
                                    : 'text-gray-500 hover:text-green-600 dark:text-gray-400'
                                }`}
                              >
                                {actualizandoEstadoId === usuario.id ? <Spinner size="sm" /> : <Power size={13} />}
                              </button>

                              <button
                                type="button"
                                title="Editar acceso"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirEdicion(usuario);
                                }}
                                className={`transition ${
                                  enEdicion
                                    ? 'text-[#2383C2]'
                                    : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                                }`}
                              >
                                <Pencil size={13} />
                              </button>
                              </>)}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer de edición de rol / módulos / configuración detallada */}
    </div>
  );
};

export default ListadoUsuarios;
