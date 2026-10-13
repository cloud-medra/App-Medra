import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, AtSign, Mail, Lock, Shield, UserPlus, KeyRound, CheckCircle2, CircleDashed, RotateCcw, Building2 } from 'lucide-react';

import { db } from '../../../../firebaseConfig';
import { COMPONENT_MAPS } from '../../../../config/componentMaps.jsx';
import { completarPermisosGranulares, vistasConfigurables } from './permisosGranularesUtils';
import { useToast } from '../../../../context/ToastContext';
import Spinner from '../../../../components/ui/Spinner';
import MarcoEdicionUsuario, { Chip, ConfirmarSalida } from './MarcoEdicionUsuario';
import EditorPermisos from './EditorPermisos';
import { Tarjeta, Campo, CampoTexto, CampoSelect } from './CamposFormulario';
import CentroSelect from '../../../ui/CentroSelect';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import {
  usePlantillasPermisos, calcularExcepciones, completar, efectivo, crearOrigen, contarExcepciones,
  guardarPermisosUsuario, crearUsuario, mensajeError, plantillaDeUsuario, SIN_PERMISOS as PERMISOS_VACIOS,
} from './permisosCentroCosto';
import BarraCentroCosto from './BarraCentroCosto';
import AvisoCentroSinConfigurar from './AvisoCentroSinConfigurar';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';
import { esRolAccesoTotal, esRolSinPlantilla, labelRol, rolesAsignables } from './roles';
import { errorNombreUsuario } from '../../../../../functions/usuarios/nombreUsuario.mjs';

// Crear Usuario, con el mismo marco y el mismo editor de permisos que
// Editar usuario (Listado Usuario):
//   Datos generales: crea la cuenta (Auth + documento base, con la Cloud
//                    Function crearUsuario: el nombre de usuario es único) — "paso 1".
//   Permisos:        EditorPermisos. "Guardar permisos" guarda la selección
//                    ("paso 2") y cada vista configurable se marca como
//                    revisada ("paso 3", itemsFinalizados). Al estar todo
//                    revisado la creación queda completa.
// usuarios/{uid}.estadoCreacion se mantiene igual que antes: Listado Usuario
// muestra las creaciones incompletas y permite retomarlas.
// Centro de costo (opcional, en Datos generales): al crear la cuenta el
// usuario hereda la plantilla de ese centro para su rol; en Permisos se
// ajustan sus excepciones. Los permisos se guardan con la Cloud Function
// guardarPermisosUsuario (solo las excepciones; ella calcula el efectivo).

const ESTADO_INICIAL = {
  nombreCompleto: '',
  nombreUsuario: '',
  email: '',
  password: '',
  confirmPassword: '',
  rol: 'operador',
  centroCostoId: null,
};

const ESTADO_CREACION_INICIAL = {
  paso1: false,
  paso2: false,
  itemsFinalizados: {}, // { '/ruta/subitem': true }
  completo: false,
};

const SIN_PERMISOS = { permisos: {}, permisosGranulares: {} };

const CrearUsuario = ({ resumeUsuarioId, onResumeConsumido, onIrAPermisosCentro }) => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { datos: centros } = useCatalogo('centros');
  const { plantillas, cargadas: plantillasCargadas } = usePlantillasPermisos();

  const [tab, setTab] = useState('datos');
  const [usuarioId, setUsuarioId] = useState(null);
  const [formData, setFormData] = useState(ESTADO_INICIAL);
  // permisos: { moduloKey: ['/ruta/subitem1', ...] }
  const [permisos, setPermisos] = useState({});
  // permisosGranulares: { '/ruta/vista': { seccionKey: { visible, elements: { elementoKey: bool } } } }
  const [permisosGranulares, setPermisosGranulares] = useState({});
  // Últimos permisos guardados en Firestore (para "cambios sin guardar").
  const [guardado, setGuardado] = useState(SIN_PERMISOS);
  const [estadoCreacion, setEstadoCreacion] = useState(ESTADO_CREACION_INICIAL);
  const [editorKey, setEditorKey] = useState(0);

  const [cargando, setCargando] = useState(false);
  const [cargandoResume, setCargandoResume] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);

  const resumeConsumidoRef = useRef(false);

  // Vistas y pestañas configurables incluidas (las que se marcan como revisadas).
  const configurables = vistasConfigurables(permisos, permisosGranulares, COMPONENT_MAPS);
  const itemsFinalizadosCount = configurables.filter((p) => estadoCreacion.itemsFinalizados[p]).length;

  const datosSinGuardar = !usuarioId && Object.entries(formData).some(([k, v]) => v !== ESTADO_INICIAL[k]);
  const permisosSinGuardar = useMemo(
    () => Boolean(usuarioId) && JSON.stringify({ permisos, permisosGranulares }) !== JSON.stringify(guardado),
    [usuarioId, permisos, permisosGranulares, guardado]
  );
  const hayCambios = datosSinGuardar || permisosSinGuardar;

  // Plantilla del centro + rol elegidos y excepciones respecto de ella.
  const plantillaElegida = plantillaDeUsuario(plantillas, formData.centroCostoId, formData.rol);
  const plantilla = useMemo(() => completar(plantillaElegida || PERMISOS_VACIOS), [plantillaElegida]);
  const excepciones = useMemo(() => calcularExcepciones(plantilla, { permisos, permisosGranulares }), [plantilla, permisos, permisosGranulares]);
  // Administrador y Desarrollador no usan la plantilla del centro.
  const sinPlantillaRol = esRolSinPlantilla(formData.rol);
  const origen = useMemo(() => (formData.centroCostoId && !sinPlantillaRol ? crearOrigen(plantilla, excepciones) : undefined), [formData.centroCostoId, sinPlantillaRol, plantilla, excepciones]);
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || 'centro sin nombre';
  const combinacion = formData.centroCostoId ? `${nombreCentro(formData.centroCostoId)} – ${labelRol(formData.rol)}` : null;
  const centroSinConfigurar = Boolean(formData.centroCostoId) && !sinPlantillaRol && plantillasCargadas && !plantillaElegida;
  // Ir a Permisos por centro (con confirmación si hay cambios sin guardar).
  const configurarCentro = onIrAPermisosCentro && (() => (hayCambios
    ? confirmAction('Cambios sin guardar', 'Se descartará lo que no hayas guardado de este usuario.', onIrAPermisosCentro, { confirmText: 'Salir sin guardar', type: 'warning' })
    : onIrAPermisosCentro()));

  useEffect(() => {
    if (!hayCambios) return undefined;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  // --- Retomar una creación en curso (viene de ListadoUsuario "Continuar creación") ---
  useEffect(() => {
    if (!resumeUsuarioId || resumeConsumidoRef.current) return;
    resumeConsumidoRef.current = true;

    (async () => {
      setCargandoResume(true);
      try {
        const snap = await getDoc(doc(db, 'usuarios', resumeUsuarioId));
        if (!snap.exists()) {
          showToast('El usuario a retomar ya no existe.', 'error');
          return;
        }
        const data = snap.data();
        const estado = { ...ESTADO_CREACION_INICIAL, ...(data.estadoCreacion || {}) };

        setUsuarioId(resumeUsuarioId);
        setFormData({
          nombreCompleto: data.nombreCompleto || '',
          nombreUsuario: data.nombreUsuario || '',
          email: data.email || '',
          password: '',
          confirmPassword: '',
          rol: data.rol || 'operador',
          centroCostoId: data.centroCostoId ?? null,
        });
        setPermisos(data.permisos || {});
        const granulares = completarPermisosGranulares(data.permisosGranulares || {}, COMPONENT_MAPS);
        setPermisosGranulares(granulares);
        setEstadoCreacion(estado);
        setGuardado({ permisos: data.permisos || {}, permisosGranulares: granulares });
        setTab('permisos');
        showToast('Retomando creación de usuario en curso.', 'info');
      } catch (error) {
        console.error('Error al retomar creación de usuario:', error);
        showToast('No se pudo cargar la creación en curso.', 'error');
      } finally {
        setCargandoResume(false);
        onResumeConsumido?.();
      }
    })();
  }, [resumeUsuarioId, onResumeConsumido, showToast]);


  const calcularCompleto = (itemsFinalizados, listaConfigurables) =>
    listaConfigurables.every((p) => itemsFinalizados[p]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Cambios del editor (lógica pura compartida): lo que se quita deja de
  // estar "revisado".
  const onCambiarPermisos = (nuevo, { quitadas = [] } = {}) => {
    setPermisos(nuevo.permisos);
    setPermisosGranulares(nuevo.permisosGranulares);
    if (quitadas.length) {
      setEstadoCreacion((prev) => {
        const quedan = { ...prev.itemsFinalizados };
        let cambio = false;
        quitadas.forEach((p) => { if (p in quedan) { delete quedan[p]; cambio = true; } });
        return cambio ? { ...prev, itemsFinalizados: quedan, completo: false } : prev;
      });
    }
  };

  const resetWizard = () => {
    setFormData(ESTADO_INICIAL);
    setPermisos({});
    setPermisosGranulares({});
    setGuardado(SIN_PERMISOS);
    setEstadoCreacion(ESTADO_CREACION_INICIAL);
    setUsuarioId(null);
    setTab('datos');
    setEditorKey((k) => k + 1);
  };

  const validarPaso1 = () => {
    if (!formData.nombreCompleto.trim()) return 'El nombre completo es obligatorio.';
    const errorNombre = errorNombreUsuario(formData.nombreUsuario);
    if (errorNombre) return errorNombre;
    if (!formData.email.trim()) return 'El correo es obligatorio.';
    if (formData.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (formData.password !== formData.confirmPassword) return 'Las contraseñas no coinciden.';
    return '';
  };

  // --- Paso 1: crea el usuario en Auth + el documento base en Firestore ---
  const handleGuardarPaso1 = async (e) => {
    e?.preventDefault();

    // Si ya existe (venimos de "Continuar creación" o ya se guardó este
    // paso en esta misma sesión), no se vuelve a crear: solo se avanza.
    if (usuarioId) {
      setTab('permisos');
      return;
    }

    const mensajeValidacion = validarPaso1();
    if (mensajeValidacion) {
      showToast(mensajeValidacion, 'error');
      return;
    }

    setCargando(true);
    try {
      const { uid } = await crearUsuario({
        nombreCompleto: formData.nombreCompleto.trim(),
        nombreUsuario: formData.nombreUsuario.trim(),
        email: formData.email.trim(),
        password: formData.password,
        rol: formData.rol,
      });
      const estadoInicial = { ...ESTADO_CREACION_INICIAL, paso1: true };

      // Con centro de costo: hereda su plantilla (la función calcula y
      // guarda el permiso efectivo).
      if (formData.centroCostoId) {
        await guardarPermisosUsuario({ uid, centroCostoId: formData.centroCostoId, excepciones: { agregados: [], quitados: [] } });
        const heredados = efectivo(plantillaElegida, null);
        setPermisos(heredados.permisos);
        setPermisosGranulares(heredados.permisosGranulares);
        setGuardado(heredados);
      }

      setUsuarioId(uid);
      setEstadoCreacion(estadoInicial);
      showToast(`Usuario "${formData.nombreCompleto}" creado. Continúa con los permisos.`, 'success');
      setTab('permisos');
    } catch (error) {
      console.error('Error al crear usuario:', error);
      showToast(mensajeError(error, 'Ocurrió un error al crear el usuario'), 'error');
    } finally {
      setCargando(false);
    }
  };

  // Guarda la selección de vistas y la configuración ("paso 2"), y
  // opcionalmente marca una vista como revisada ("paso 3").
  const guardarPermisos = async (revisada) => {
    if (!usuarioId) return false;
    if (!plantillasCargadas) {
      showToast('Aún se están cargando las plantillas de permisos. Intenta de nuevo en un momento.', 'error');
      return false;
    }
    setCargando(true);
    try {
      const itemsFinalizados = revisada
        ? { ...estadoCreacion.itemsFinalizados, [revisada]: true }
        : estadoCreacion.itemsFinalizados;
      const nuevoEstado = {
        ...estadoCreacion,
        paso2: true,
        itemsFinalizados,
        completo: calcularCompleto(itemsFinalizados, configurables),
      };
      await guardarPermisosUsuario({ uid: usuarioId, centroCostoId: formData.centroCostoId ?? null, excepciones });
      await updateDoc(doc(db, 'usuarios', usuarioId), { estadoCreacion: nuevoEstado });
      setEstadoCreacion(nuevoEstado);
      setGuardado({ permisos, permisosGranulares });
      showToast(revisada ? 'Vista marcada como revisada.' : 'Permisos guardados.', 'success');
      return true;
    } catch (error) {
      console.error('Error al guardar permisos:', error);
      showToast(mensajeError(error, 'No se pudieron guardar los permisos'), 'error');
      return false;
    } finally {
      setCargando(false);
    }
  };

  const handleFinalizarCreacion = () => {
    showToast(`Usuario "${formData.nombreCompleto}" creado y configurado completamente.`, 'success');
    resetWizard();
  };

  const cancelar = () => (hayCambios ? setConfirmarDescartar(true) : resetWizard());

  if (cargandoResume) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    );
  }

  const accesoTotal = esRolAccesoTotal(formData.rol);
  const estadoChip = !usuarioId
    ? <Chip tono="gris">Cuenta sin crear</Chip>
    : estadoCreacion.completo && estadoCreacion.paso2
      ? <Chip tono="verde" icon={CheckCircle2}>Configuración completa</Chip>
      : <Chip tono="ambar" icon={CircleDashed}>{itemsFinalizadosCount}/{configurables.length} vistas revisadas</Chip>;

  return (
    <>
      <ConfirmarSalida
        abierto={confirmarDescartar}
        guardando={cargando}
        onGuardarYSalir={usuarioId ? async () => { if (await guardarPermisos()) { setConfirmarDescartar(false); resetWizard(); } } : undefined}
        onSalir={() => { setConfirmarDescartar(false); resetWizard(); }}
        onSeguir={() => setConfirmarDescartar(false)}
      />
      <MarcoEdicionUsuario
        migas={<><span className="uppercase tracking-wider font-semibold">Usuarios</span><span>/</span><span>Crear usuario</span></>}
        nombre={formData.nombreCompleto}
        detalle={formData.email}
        chips={<><Chip tono="azul" icon={Shield}>{labelRol(formData.rol)}</Chip>{formData.centroCostoId && <Chip icon={Building2}>{nombreCentro(formData.centroCostoId)}</Chip>}{estadoChip}</>}
        hayCambios={hayCambios}
        guardando={cargando}
        onCancelar={cancelar}
        onGuardar={tab === 'datos' ? (usuarioId ? () => setTab('permisos') : handleGuardarPaso1) : () => guardarPermisos()}
        textoGuardar={tab === 'datos' ? (usuarioId ? 'Ir a permisos' : 'Crear cuenta') : 'Guardar permisos'}
        puedeGuardar={tab === 'datos' ? true : permisosSinGuardar || !estadoCreacion.paso2}
        accionesExtra={usuarioId && estadoCreacion.completo && estadoCreacion.paso2 && !permisosSinGuardar && (
          <button
            type="button"
            onClick={handleFinalizarCreacion}
            className="h-8 px-3.5 rounded-md border border-green-600 text-green-700 dark:text-green-400 text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-green-50 dark:hover:bg-green-950/30"
          >
            <RotateCcw size={13} /> Finalizar y crear otro
          </button>
        )}
        tabs={[
          { id: 'datos', label: 'Datos generales', icon: UserPlus },
          { id: 'permisos', label: 'Permisos', icon: KeyRound, deshabilitada: !usuarioId, motivo: 'Primero crea la cuenta en Datos generales' },
        ]}
        tabActiva={tab}
        onTab={setTab}
      >
        {tab === 'datos' ? (
          <div className="h-full overflow-y-auto">
            <form onSubmit={handleGuardarPaso1} className="max-w-3xl">
              <Tarjeta
                titulo="Datos de la cuenta"
                descripcion={usuarioId
                  ? 'La cuenta ya fue creada. Continúa en la pestaña Permisos (o retómala luego desde Listado Usuario).'
                  : 'Registra al usuario y define sus datos de acceso. Luego podrás asignar sus permisos.'}
              >
                <fieldset disabled={!!usuarioId} className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                  <CampoTexto id="nombreCompleto" name="nombreCompleto" label="Nombre completo" icon={User} value={formData.nombreCompleto} onChange={handleChange} placeholder="Ej: Juana Pérez Soto" />
                  <CampoTexto id="nombreUsuario" name="nombreUsuario" label="Nombre de usuario" icon={AtSign} value={formData.nombreUsuario} onChange={handleChange} placeholder="Ej: jperez" />
                  <CampoTexto id="email" name="email" type="email" label="Correo" icon={Mail} value={formData.email} onChange={handleChange} placeholder="ejemplo@medra.cl" ayuda="Será el correo de ingreso al sistema." />
                  <CampoSelect id="rol" name="rol" label="Rol" icon={Shield} opciones={rolesAsignables(userData, formData.rol)} value={formData.rol} onChange={handleChange}
                    ayuda={accesoTotal ? 'Acceso total: no se aplican los permisos granulares.' : 'Los permisos se asignan en la pestaña Permisos.'} />
                  <Campo id="centroCosto" label="Centro de costo"
                    ayuda={usuarioId
                      ? 'Para cambiarlo, edita el usuario desde Listado Usuario.'
                      : formData.centroCostoId
                        ? (sinPlantillaRol
                          ? `Su rol (${labelRol(formData.rol)}) no usa la plantilla del centro: solo los permisos que le asignes.`
                          : plantillaElegida ? `Heredará los permisos de ${combinacion}: queda configurado al crear la cuenta.` : undefined)
                        : 'Opcional. Sin centro de costo, el usuario tendrá solo los permisos que le asignes.'}>
                    <CentroSelect todos value={formData.centroCostoId} onChange={(c) => setFormData((prev) => ({ ...prev, centroCostoId: c.id }))}
                      placeholder="Sin centro de costo" disabled={!!usuarioId || !plantillasCargadas} />
                  </Campo>
                  {!usuarioId && (
                    <>
                      <CampoTexto id="password" name="password" type="password" label="Contraseña" icon={Lock} value={formData.password} onChange={handleChange} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
                      <CampoTexto id="confirmPassword" name="confirmPassword" type="password" label="Confirmar contraseña" icon={Lock} value={formData.confirmPassword} onChange={handleChange} placeholder="Repite la contraseña" autoComplete="new-password" />
                    </>
                  )}
                </fieldset>
                {centroSinConfigurar && (
                  <div className="mt-4">
                    <AvisoCentroSinConfigurar nombre={combinacion} onConfigurar={configurarCentro} />
                  </div>
                )}
                {/* Enter en el formulario crea la cuenta (igual que el botón del encabezado). */}
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
              </Tarjeta>
            </form>
          </div>
        ) : (
          <div className="h-full min-h-0 flex flex-col gap-3">
          <BarraCentroCosto
            centro={combinacion}
            conPlantilla={Boolean(plantillaElegida)}
            sinPlantilla={sinPlantillaRol}
            rol={labelRol(formData.rol)}
            excepciones={contarExcepciones(excepciones)}
            onRestablecer={() => { const p = efectivo(plantillaElegida, null); setPermisos(p.permisos); setPermisosGranulares(p.permisosGranulares); }}
            onConfigurarCentro={configurarCentro}
          />
          <div className="flex-1 min-h-0">
          <EditorPermisos
            key={editorKey}
            origen={origen}
            estado={{ permisos, permisosGranulares }}
            onCambiar={onCambiarPermisos}
            accesoTotalPorRol={accesoTotal}
            insigniaVista={(path) => (configurables.includes(path) ? (
              estadoCreacion.itemsFinalizados[path]
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0"><CheckCircle2 size={10} /> Revisada</span>
                : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0"><CircleDashed size={10} /> Por revisar</span>
            ) : null)}
            pieVista={(path) => (configurables.includes(path) && !estadoCreacion.itemsFinalizados[path] ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => guardarPermisos(path)}
                  disabled={cargando}
                  className="h-8 px-3.5 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Guardar y marcar como revisada
                </button>
              </div>
            ) : null)}
          />
          </div>
          </div>
        )}
      </MarcoEdicionUsuario>
    </>
  );
};

export default CrearUsuario;
