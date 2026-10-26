import { useEffect, useMemo, useState } from 'react';
import { User, AtSign, Mail, Shield, UserCog, KeyRound, SlidersHorizontal, Layers, CircleDashed, Building2, X } from 'lucide-react';

import { COMPONENT_MAPS } from '../../../../config/componentMaps.jsx';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import CentroSelect from '../../../ui/CentroSelect';
import Spinner from '../../../ui/Spinner';
import MarcoEdicionUsuario, { Chip, ConfirmarSalida } from './MarcoEdicionUsuario';
import EditorPermisos from './EditorPermisos';
import { Tarjeta, Campo, CampoTexto, CampoSelect, CampoEstado } from './CamposFormulario';
import { esRolAccesoTotal, esRolSinPlantilla, labelRol, rolesAsignables } from './roles';
import { useUser } from '../../../../context/UserContext';
import { errorNombreUsuario } from '../../../../../functions/usuarios/nombreUsuario.mjs';
import { completarPermisosGranulares, completarVistasDelMenu, resumenRestricciones } from './permisosGranularesUtils';
import {
  usePlantillasPermisos, calcularExcepciones, completar, efectivo, crearOrigen, contarExcepciones, tieneExcepciones, excepcionesDe,
  plantillaDeUsuario, describirExcepciones,
  guardarPermisosUsuario, mensajeError, SIN_EXCEPCIONES, SIN_PERMISOS,
} from './permisosCentroCosto';
import BarraCentroCosto from './BarraCentroCosto';
import AvisoCentroSinConfigurar from './AvisoCentroSinConfigurar';
import { CentrosAdministrados, AdministradoresAsignados } from './AsignacionAdministradores';
import SelectorInstitucionesUsuario from './SelectorInstitucionesUsuario';
import { TIPOS_SOLICITUD } from '../../../../../functions/solicitudes/tipos.mjs';

// Edición de un usuario existente desde Listado Usuario, a pantalla completa
// (reemplaza al listado, igual que las vistas de detalle del sistema).
// Pestañas: Datos generales | Permisos (EditorPermisos, el mismo de Crear
// Usuario). Los permisos se completan igual que antes
// (completarPermisosGranulares / completarVistasDelMenu).
//
// Centro de costo: el editor muestra el permiso EFECTIVO (plantilla del
// centro + agregados − quitados) y cada casilla marca si es heredada,
// agregada o quitada. Lo que se guarda son solo las excepciones respecto de
// la plantilla; el permiso efectivo lo calcula y escribe la Cloud Function
// guardarPermisosUsuario (que también valida rol y "último administrador").

const clonar = (obj) => (obj ? JSON.parse(JSON.stringify(obj)) : {});
const completarGranulares = (g) => completarPermisosGranulares(g, COMPONENT_MAPS);

// JSON con claves ordenadas: quitar y volver a poner una pestaña cambia el
// orden de las claves, pero no es un cambio real.
const estable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));

// Lo que se edita son las excepciones del usuario respecto de la plantilla
// de su centro (el permiso efectivo se deriva de ellas: así, si la
// plantilla cambia mientras se edita, el cambio se ve y no se convierte en
// excepción). Un usuario anterior a las plantillas (sin centro ni
// excepciones) parte con todos sus permisos como propios ("agregados").
const estadoInicial = (usuario) => {
  const permisos = clonar(usuario.permisos);
  // Lo que el usuario puede hacer hoy queda marcado: acciones/columnas/
  // secciones nuevas en true y vistas del menú aún sin configuración
  // completadas (se marcan "pendiente de revisión").
  const { permisosGranulares, agregadas } = completarVistasDelMenu(permisos, completarGranulares(clonar(usuario.permisosGranulares)), COMPONENT_MAPS);
  return {
    datos: {
      nombreCompleto: usuario.nombreCompleto || '',
      nombreUsuario: usuario.nombreUsuario || '',
      email: usuario.email || '',
      rol: usuario.rol || 'operador',
      centrosAdministrados: usuario.centrosAdministrados || [],
      administradoresAsignados: usuario.administradoresAsignados || [],
      todosLosAdministradoresDelCentro: usuario.todosLosAdministradoresDelCentro === true,
      activo: usuario.activo !== false,
      centroCostoId: usuario.centroCostoId ?? null,
      instituciones: Array.isArray(usuario.instituciones) ? usuario.instituciones : [],
    },
    excepciones: usuario.excepciones !== undefined || usuario.centroCostoId
      ? excepcionesDe(usuario)
      : calcularExcepciones(SIN_PERMISOS, { permisos, permisosGranulares: completarGranulares(permisosGranulares) }),
    agregadas,
  };
};

// usuarios: todos (para ofrecer los administradores de su centro).
const EditarUsuario = ({ usuario, usuarios = [], onVolver, onIrAPermisosCentro }) => {
  // Rol Desarrollador: solo lo asigna otro Desarrollador (lo vuelve a exigir
  // guardarPermisosUsuario, igual que no editarse a sí mismo).
  const { userData } = useUser();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { datos: centros } = useCatalogo('centros');
  const { plantillas, cargadas: plantillasCargadas, error: errorPlantillas } = usePlantillasPermisos();
  const [inicial, setInicial] = useState(() => estadoInicial(usuario));
  const [datos, setDatos] = useState(inicial.datos);
  const [excepciones, setExcepciones] = useState(inicial.excepciones);
  const [pendientes, setPendientes] = useState(() => new Set(inicial.agregadas));
  const [tab, setTab] = useState('permisos');
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [errores, setErrores] = useState({});

  const hayCambios = useMemo(
    () => estable(datos) !== estable(inicial.datos) || estable(excepciones) !== estable(inicial.excepciones),
    [datos, excepciones, inicial]
  );

  useEffect(() => {
    if (!hayCambios) return undefined;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  // Plantilla del centro + rol elegidos (completa, como el editor) y
  // excepciones del usuario respecto de ella.
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || 'centro sin nombre';
  // Acceso total: solo Desarrollador. Sin plantilla: Administrador y
  // Desarrollador (sus permisos son solo los propios).
  const accesoTotal = esRolAccesoTotal(datos.rol);
  const sinPlantilla = esRolSinPlantilla(datos.rol);
  const plantillaElegida = plantillaDeUsuario(plantillas, datos.centroCostoId, datos.rol);
  const combinacion = datos.centroCostoId ? `${nombreCentro(datos.centroCostoId)} – ${labelRol(datos.rol)}` : null;
  const plantilla = useMemo(() => completar(plantillaElegida || SIN_PERMISOS), [plantillaElegida]);
  // Permiso efectivo = plantilla + agregados − quitados (vista previa; el
  // que vale lo calcula la función al guardar).
  const permisos = useMemo(() => efectivo(plantilla, excepciones), [plantilla, excepciones]);
  const origen = useMemo(() => (datos.centroCostoId && !sinPlantilla ? crearOrigen(plantilla, excepciones) : undefined), [datos.centroCostoId, sinPlantilla, plantilla, excepciones]);
  const nExcepciones = contarExcepciones(excepciones);

  // Al cambiar de centro o de rol, el permiso se recalcula al instante con
  // la plantilla de la nueva combinación y se conservan las excepciones; si
  // tiene, se muestran y se ofrece limpiarlas.
  const ofrecerLimpiar = (titulo, centroId, rol) => {
    if (!tieneExcepciones(excepciones)) return;
    const destino = !centroId
      ? 'sus permisos propios (sin centro de costo)'
      : esRolSinPlantilla(rol)
        ? `el rol ${labelRol(rol)} (sin plantilla de centro)`
        : `la plantilla de ${nombreCentro(centroId)} – ${labelRol(rol)}`;
    confirmAction(
      titulo,
      `${datos.nombreCompleto || 'El usuario'} tiene permisos personalizados: ${describirExcepciones(excepciones)}. `
        + `Se mantendrán sobre ${destino}. ¿Quieres limpiarlos y dejar solo la plantilla?`,
      () => setExcepciones(SIN_EXCEPCIONES),
      { confirmText: 'Limpiar excepciones', cancelText: 'Mantenerlas', type: 'warning' }
    );
  };
  const cambiarCentro = (centroId) => {
    if (centroId === datos.centroCostoId) return;
    // Otro centro: sus administradores asignados ya no corresponden.
    setDatos((d) => ({ ...d, centroCostoId: centroId, administradoresAsignados: [] }));
    ofrecerLimpiar('Cambiar centro de costo', centroId, datos.rol);
  };
  const cambiarRol = (rol) => {
    if (rol === datos.rol) return;
    setDatos((d) => ({ ...d, rol }));
    if (datos.centroCostoId) ofrecerLimpiar('Cambiar rol', datos.centroCostoId, rol);
  };

  const restablecerPlantilla = () => confirmAction(
    'Restablecer a la plantilla',
    `Se quitarán sus permisos personalizados (${describirExcepciones(excepciones)}) y quedarán solo los de la plantilla de ${combinacion}. Se aplica al guardar.`,
    () => setExcepciones(SIN_EXCEPCIONES),
    { confirmText: 'Restablecer', type: 'warning' }
  );

  // Ir a Permisos por centro (con confirmación si hay cambios sin guardar).
  const configurarCentro = onIrAPermisosCentro && (() => (hayCambios
    ? confirmAction('Cambios sin guardar', 'Se descartarán los cambios de este usuario.', onIrAPermisosCentro, { confirmText: 'Salir sin guardar', type: 'warning' })
    : onIrAPermisosCentro()));
  const centroSinConfigurar = Boolean(datos.centroCostoId) && !sinPlantilla && plantillasCargadas && !plantillaElegida;

  const validar = () => {
    const e = {};
    if (!datos.nombreCompleto.trim()) e.nombreCompleto = 'El nombre completo es obligatorio.';
    // Obligatorio; el formato (sin "@" ni espacios) se exige si cambia, igual
    // que la función: un nombre antiguo fuera de formato no impide editar lo demás.
    const nombre = datos.nombreUsuario.trim();
    const errorNombre = (!nombre || nombre !== inicial.datos.nombreUsuario) && errorNombreUsuario(nombre);
    if (errorNombre) e.nombreUsuario = errorNombre;
    const email = datos.email.trim();
    if (email.toLowerCase() !== (inicial.datos.email || '').toLowerCase()) {
      const errorEmail = TIPOS_SOLICITUD.email.validar(TIPOS_SOLICITUD.email.normalizar(email));
      if (errorEmail) e.email = errorEmail;
    }
    if (datos.rol === 'operador' && !datos.centroCostoId) e.centroCostoId = 'El centro de costo es obligatorio para un Operador.';
    setErrores(e);
    if (Object.keys(e).length) setTab('datos');
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return false;
    // Sin las plantillas cargadas no se pueden calcular las excepciones.
    if (!plantillasCargadas) {
      showToast('Aún se están cargando las plantillas de permisos. Intenta de nuevo en un momento.', 'error');
      return false;
    }
    setGuardando(true);
    try {
      const datosLimpios = { ...datos, nombreCompleto: datos.nombreCompleto.trim(), nombreUsuario: datos.nombreUsuario.trim(), email: datos.email.trim() };
      const cambioEmail = datosLimpios.email.toLowerCase() !== (inicial.datos.email || '').toLowerCase();
      const conAdministradores = ['operador', 'encargado'].includes(datosLimpios.rol);
      await guardarPermisosUsuario({
        uid: usuario.id,
        datos: {
          nombreCompleto: datosLimpios.nombreCompleto, nombreUsuario: datosLimpios.nombreUsuario, activo: datosLimpios.activo,
          ...(cambioEmail ? { email: datosLimpios.email } : {}),
        },
        rol: datosLimpios.rol,
        centroCostoId: datosLimpios.centroCostoId,
        excepciones,
        // La función solo lo aplica (y audita) si la lista cambió.
        instituciones: datosLimpios.instituciones,
        ...(datosLimpios.rol === 'admin' ? { centrosAdministrados: datosLimpios.centrosAdministrados } : {}),
        ...(conAdministradores ? {
          administradoresAsignados: datosLimpios.todosLosAdministradoresDelCentro ? [] : datosLimpios.administradoresAsignados,
          todosLosAdministradoresDelCentro: datosLimpios.todosLosAdministradoresDelCentro,
        } : {}),
      });
      setInicial({ datos: datosLimpios, excepciones, agregadas: [] });
      setDatos(datosLimpios);
      showToast('Cambios guardados correctamente', 'success');
      return true;
    } catch (error) {
      console.error('Error al guardar cambios del usuario:', error);
      if (error?.code === 'functions/already-exists') {
        setErrores(/correo/i.test(error.message) ? { email: error.message } : { nombreUsuario: error.message });
        setTab('datos');
      }
      showToast(mensajeError(error, 'No se pudieron guardar los cambios'), 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const salir = () => (hayCambios ? setConfirmarSalida(true) : onVolver());
  const cancelar = () => {
    if (!hayCambios) return onVolver();
    setConfirmarSalida(true);
  };

  const onCambiarPermisos = (nuevo, { quitadas = [], agregadas = [] } = {}) => {
    setExcepciones(calcularExcepciones(plantilla, nuevo));
    if (quitadas.length || agregadas.length) {
      setPendientes((prev) => {
        const next = new Set(prev);
        quitadas.forEach((p) => next.delete(p));
        agregadas.forEach((p) => next.add(p));
        return next;
      });
    }
  };
  const marcarRevisada = (path) => setPendientes((prev) => {
    if (!prev.has(path)) return prev;
    const next = new Set(prev);
    next.delete(path);
    return next;
  });

  // Vistas del menú que estaban sin configuración se completan al abrir: hay
  // que guardar para que el usuario recupere el acceso a ellas.
  const hayVistasPorPersistir = inicial.agregadas.length > 0;
  const resumen = resumenRestricciones(permisos.permisos, permisos.permisosGranulares, COMPONENT_MAPS);
  const modulosConAcceso = Object.values(permisos.permisos || {}).filter((v) => v?.length).length;
  const vistasConAcceso = new Set(Object.values(permisos.permisos || {}).flat()).size;

  return (
    <>
      <ConfirmarSalida
        abierto={confirmarSalida}
        guardando={guardando}
        onGuardarYSalir={async () => { if (await guardar()) { setConfirmarSalida(false); onVolver(); } }}
        onSalir={() => { setConfirmarSalida(false); onVolver(); }}
        onSeguir={() => setConfirmarSalida(false)}
      />
      <MarcoEdicionUsuario
        migas={<><span className="uppercase tracking-wider font-semibold">Usuarios</span><span>/</span><span>Editar acceso</span></>}
        nombre={datos.nombreCompleto || usuario.nombreCompleto}
        fotoUrl={usuario.fotoPerfilUrl}
        detalle={usuario.email}
        chips={(
          <>
            <Chip tono="azul" icon={Shield}>{labelRol(datos.rol)}</Chip>
            <Chip tono={datos.activo ? 'verde' : 'gris'}>{datos.activo ? 'Activo' : 'Inactivo'}</Chip>
            {datos.centroCostoId && <Chip icon={Building2}>{nombreCentro(datos.centroCostoId)}</Chip>}
          </>
        )}
        hayCambios={hayCambios}
        guardando={guardando}
        onVolver={salir}
        onCancelar={cancelar}
        onGuardar={guardar}
        puedeGuardar={hayCambios || hayVistasPorPersistir}
        tabs={[
          { id: 'datos', label: 'Datos generales', icon: UserCog },
          {
            id: 'permisos',
            label: 'Permisos',
            icon: KeyRound,
            badge: pendientes.size > 0 && (
              <span className="ml-1 text-[10px] font-bold px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Vistas pendientes de revisión">
                {pendientes.size}
              </span>
            ),
          },
        ]}
        tabActiva={tab}
        onTab={setTab}
      >
        {tab === 'datos' ? (
          <div className="h-full overflow-y-auto">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5 max-w-6xl">
              <Tarjeta titulo="Información del usuario" descripcion="Datos de identificación y acceso al sistema.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                  <CampoTexto
                    id="nombreCompleto" label="Nombre completo" icon={User}
                    value={datos.nombreCompleto} error={errores.nombreCompleto}
                    onChange={(e) => setDatos((d) => ({ ...d, nombreCompleto: e.target.value }))}
                  />
                  <CampoTexto
                    id="nombreUsuario" label="Nombre de usuario" icon={AtSign}
                    value={datos.nombreUsuario} error={errores.nombreUsuario}
                    onChange={(e) => setDatos((d) => ({ ...d, nombreUsuario: e.target.value }))}
                  />
                  <CampoTexto
                    id="email" label="Correo" icon={Mail} type="email" value={datos.email} error={errores.email}
                    onChange={(e) => setDatos((d) => ({ ...d, email: e.target.value }))}
                    ayuda="Es el correo de ingreso. Si lo cambias aquí, cambia al guardar y queda en la auditoría."
                  />
                  <CampoSelect
                    id="rol" label="Rol" icon={Shield} opciones={rolesAsignables(userData, datos.rol)} value={datos.rol}
                    ayuda={accesoTotal ? 'Acceso total: no se aplican los permisos granulares.' : 'Los permisos se configuran en la pestaña Permisos.'}
                    onChange={(e) => cambiarRol(e.target.value)}
                  />
                  <CampoEstado activo={datos.activo} onChange={(v) => setDatos((d) => ({ ...d, activo: v }))} />
                  <Campo id="centroCosto" label="Centro de costo" error={errores.centroCostoId}
                    ayuda={!datos.centroCostoId
                      ? 'Sin centro de costo: el usuario tiene solo sus permisos propios.'
                      : sinPlantilla
                        ? `Su rol (${labelRol(datos.rol)}) no usa la plantilla del centro: solo sus permisos propios.`
                        : plantillaElegida
                          ? `Hereda los permisos de ${combinacion} (ver pestaña Permisos).`
                          : undefined}>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0"><CentroSelect todos value={datos.centroCostoId} onChange={(c) => cambiarCentro(c.id)} placeholder="Sin centro de costo" disabled={!plantillasCargadas} /></div>
                      {datos.centroCostoId && (
                        <button type="button" onClick={() => cambiarCentro(null)} title="Quitar centro de costo" aria-label="Quitar centro de costo"
                          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-red-600 hover:border-red-300">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </Campo>
                  {centroSinConfigurar && (
                    <div className="md:col-span-2">
                      <AvisoCentroSinConfigurar nombre={combinacion} onConfigurar={configurarCentro} />
                    </div>
                  )}
                  {datos.rol === 'admin' && (
                    <div className="md:col-span-2">
                      <CentrosAdministrados centros={centros} seleccionados={datos.centrosAdministrados}
                        onCambiar={(lista) => setDatos((d) => ({ ...d, centrosAdministrados: lista }))} />
                    </div>
                  )}
                  {['operador', 'encargado'].includes(datos.rol) && (
                    <div className="md:col-span-2">
                      <AdministradoresAsignados usuarios={usuarios} centroId={datos.centroCostoId}
                        asignados={datos.administradoresAsignados} todos={datos.todosLosAdministradoresDelCentro}
                        onCambiar={(cambio) => setDatos((d) => ({ ...d, ...cambio }))} />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <SelectorInstitucionesUsuario seleccionadas={datos.instituciones}
                      onCambiar={(lista) => setDatos((d) => ({ ...d, instituciones: lista }))} />
                  </div>
                </div>
              </Tarjeta>

              <Tarjeta titulo="Resumen de acceso" descripcion="Según los permisos actuales (incluye cambios sin guardar).">
                {accesoTotal ? (
                  <p className="text-[12px] text-gray-600 dark:text-gray-300">Este rol tiene acceso total al sistema.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Módulos', valor: modulosConAcceso, icon: Layers },
                      { label: 'Vistas', valor: vistasConAcceso, icon: SlidersHorizontal },
                      { label: 'Restricciones', valor: resumen.total, icon: Shield, tono: resumen.total ? 'text-amber-600' : '' },
                      { label: 'Pendientes de revisión', valor: pendientes.size, icon: CircleDashed, tono: pendientes.size ? 'text-amber-600' : '' },
                      ...(datos.centroCostoId ? [{ label: 'Personalizados', valor: `+${nExcepciones.agregados} / −${nExcepciones.quitados}`, icon: SlidersHorizontal, tono: nExcepciones.agregados + nExcepciones.quitados ? 'text-amber-600' : '' }] : []),
                    ].map((k) => (
                      <div key={k.label} className="rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 px-3 py-2.5">
                        <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          <k.icon size={12} /> {k.label}
                        </dt>
                        <dd className={`text-[20px] font-semibold tabular-nums text-gray-800 dark:text-gray-100 ${k.tono || ''}`}>{k.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Tarjeta>
            </div>
          </div>
        ) : !plantillasCargadas ? (
          <div className="h-full flex items-center justify-center text-[12px] text-gray-500 gap-2">
            {errorPlantillas ? 'No se pudieron cargar las plantillas de permisos.' : <><Spinner size="sm" /> Cargando plantillas de permisos…</>}
          </div>
        ) : (
          <div className="h-full min-h-0 flex flex-col gap-3">
          <BarraCentroCosto
            centro={combinacion}
            conPlantilla={Boolean(plantillaElegida)}
            sinPlantilla={sinPlantilla}
            rol={labelRol(datos.rol)}
            excepciones={nExcepciones}
            onRestablecer={restablecerPlantilla}
            onConfigurarCentro={configurarCentro}
          />
          <div className="flex-1 min-h-0">
          <EditorPermisos
            estado={permisos}
            onCambiar={onCambiarPermisos}
            onAbrirVista={marcarRevisada}
            accesoTotalPorRol={accesoTotal}
            origen={origen}
            insigniaVista={(path) => (pendientes.has(path) ? (
              <span title="Recién habilitada con acceso total: revisa sus permisos" className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0">
                <CircleDashed size={10} /> Pendiente de revisión
              </span>
            ) : null)}
          />
          </div>
          </div>
        )}
      </MarcoEdicionUsuario>
    </>
  );
};

export default EditarUsuario;
