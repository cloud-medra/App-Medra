import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Users, Copy, Pencil, SlidersHorizontal, Shield, CircleDot } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import MarcoEdicionUsuario, { Chip, ConfirmarSalida } from '../usuarios/MarcoEdicionUsuario';
import EditorPermisos from '../usuarios/EditorPermisos';
import { ROLES } from '../usuarios/roles';
import {
  completar, guardarPlantillaCentroCosto, mensajeError, excepcionesDe, contarExcepciones, tieneExcepciones, idPlantilla, labelRol,
  ROLES_CON_PLANTILLA, SIN_PERMISOS,
} from '../usuarios/permisosCentroCosto';
import { rolDeUsuario } from './resumenCentros';

// Configuración de los permisos de UN centro: una pestaña por rol que usa
// plantilla (Operador, Encargado de centro), cada una con el mismo editor
// que los usuarios. Guardar pasa por la Cloud Function
// guardarPlantillaCentroCosto (una llamada por rol cambiado), que recalcula
// solo a los usuarios de esa combinación centro + rol, conservando sus
// excepciones. "Copiar desde otro rol" / "desde otro centro" parten de otra
// configuración. Pestaña "Ver usuarios": quiénes pertenecen al centro, por
// rol, con enlace a su edición.

const estable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));
const clonar = (v) => JSON.parse(JSON.stringify(v));
const SELECT = 'h-8 max-w-[220px] px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-normal text-tinta-principal disabled:opacity-50';
const BOTON = 'h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-etiqueta text-tinta-principal inline-flex items-center gap-1.5 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40';

const ConfigurarCentro = ({ centro, filas, plantillas, usuarios, onVolver, onEditarUsuario }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const [tab, setTab] = useState(ROLES_CON_PLANTILLA[0]);
  const [borradores, setBorradores] = useState({}); // { rol: permisos editados }
  const [editorKey, setEditorKey] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [salida, setSalida] = useState(null); // acción pendiente si se confirma salir sin guardar
  const [copiarRol, setCopiarRol] = useState('');
  const [copiarCentro, setCopiarCentro] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');

  const rolActivo = ROLES_CON_PLANTILLA.includes(tab) ? tab : null;
  const configurada = (rol) => Boolean(plantillas[idPlantilla(centro.id, rol)]);
  const originales = useMemo(
    () => Object.fromEntries(ROLES_CON_PLANTILLA.map((rol) => [rol, completar(plantillas[idPlantilla(centro.id, rol)] || SIN_PERMISOS)])),
    [plantillas, centro.id]
  );
  const estadoDe = (rol) => borradores[rol] || originales[rol];
  const conCambios = ROLES_CON_PLANTILLA.filter((rol) => borradores[rol] && estable(borradores[rol]) !== estable(originales[rol]));
  const hayCambios = conCambios.length > 0;
  const usuariosDelCentro = usuarios.filter((u) => u.centroCostoId === centro.id);
  const usuariosDe = (rol) => usuariosDelCentro.filter((u) => rolDeUsuario(u) === rol);
  const otrosRoles = rolActivo ? ROLES_CON_PLANTILLA.filter((r) => r !== rolActivo) : [];
  // Combinaciones configuradas de otros centros (para copiar).
  const otrasCombinaciones = filas.filter((f) => f.id !== centro.id).flatMap((f) => ROLES_CON_PLANTILLA
    .filter((rol) => f.roles[rol].configurada)
    .map((rol) => ({ id: idPlantilla(f.id, rol), label: `${f.nombre} – ${labelRol(rol)}` })));

  useEffect(() => {
    if (!hayCambios) return undefined;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const guardar = async () => {
    setGuardando(true);
    const guardados = []; // roles ya guardados
    const detalle = [];
    try {
      for (const rol of conCambios) {
        const { usuarios: n } = await guardarPlantillaCentroCosto({ centroId: centro.id, rol, plantilla: estadoDe(rol) });
        guardados.push(rol);
        detalle.push(`${labelRol(rol)}${n ? ` (${n} usuario(s))` : ''}`);
      }
      setBorradores({});
      showToast(`Permisos de ${centro.nombre} guardados: ${detalle.join(', ')}.`, 'success');
      return true;
    } catch (err) {
      console.error('Error al guardar los permisos del centro:', err);
      // Lo ya guardado deja de estar pendiente.
      setBorradores((prev) => Object.fromEntries(Object.entries(prev).filter(([rol]) => !guardados.includes(rol))));
      showToast(mensajeError(err, 'No se pudieron guardar los permisos del centro'), 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  // Siempre se avisa a cuántos usuarios afecta cada combinación antes de guardar.
  const pedirGuardar = (despues) => confirmAction(
    'Guardar permisos del centro',
    `${conCambios.map((rol) => `Afectará a ${usuariosDe(rol).length} usuario(s) de ${centro.nombre} con rol ${labelRol(rol)}.`).join(' ')} `
      + 'Sus permisos personalizados (agregados y quitados) se conservan.',
    async () => { if (await guardar()) despues?.(); },
    { confirmText: 'Guardar', type: 'warning' }
  );

  // Salir o cancelar con cambios pide confirmación.
  const conConfirmacion = (accion) => (hayCambios ? setSalida(() => accion) : accion());
  const descartar = () => { setBorradores({}); setEditorKey((k) => k + 1); };

  const reemplazar = (estado, origen) => {
    setBorradores((prev) => ({ ...prev, [rolActivo]: clonar(estado) }));
    setEditorKey((k) => k + 1);
    showToast(`Se copiaron los permisos de ${origen} a ${labelRol(rolActivo)}. Ajústalos y guarda para aplicarlos.`, 'info');
  };
  const copiarDeRol = () => {
    if (!copiarRol) return;
    reemplazar(estadoDe(copiarRol), `${labelRol(copiarRol)}`);
    setCopiarRol('');
  };
  const copiarDeCentro = () => {
    const origen = otrasCombinaciones.find((c) => c.id === copiarCentro);
    if (!origen) return;
    reemplazar(completar(plantillas[origen.id]), origen.label);
    setCopiarCentro('');
  };

  const usuariosFiltrados = usuariosDelCentro.filter((u) => filtroRol === 'todos' || rolDeUsuario(u) === filtroRol);

  return (
    <>
      <ConfirmarSalida
        abierto={Boolean(salida)}
        guardando={guardando}
        onGuardarYSalir={() => { const accion = salida; setSalida(null); pedirGuardar(accion); }}
        onSalir={() => { const accion = salida; setSalida(null); descartar(); accion(); }}
        onSeguir={() => setSalida(null)}
      />
      <MarcoEdicionUsuario
        migas={<><span className="uppercase tracking-wider text-etiqueta">Permisos por centro</span><span>/</span><span>Configurar</span></>}
        nombre={centro.nombre}
        detalle="Cada rol tiene su plantilla. Los usuarios reciben la de su rol (más sus excepciones); admin y dev tienen acceso total."
        chips={(
          <>
            {ROLES_CON_PLANTILLA.map((rol) => (
              <Chip key={rol} tono={configurada(rol) ? 'verde' : 'ambar'} icon={KeyRound}>{labelRol(rol)}: {configurada(rol) ? 'Configurada' : 'Sin configurar'}</Chip>
            ))}
            <Chip icon={Users}>{usuariosDelCentro.length} usuario(s)</Chip>
          </>
        )}
        hayCambios={hayCambios}
        guardando={guardando}
        onVolver={() => conConfirmacion(onVolver)}
        onCancelar={() => conConfirmacion(onVolver)}
        onGuardar={() => pedirGuardar()}
        textoGuardar="Guardar"
        puedeGuardar={hayCambios}
        accionesExtra={rolActivo && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <select value={copiarRol} onChange={(e) => setCopiarRol(e.target.value)} aria-label="Copiar desde otro rol" disabled={guardando} className={SELECT}>
              <option value="">Copiar desde otro rol…</option>
              {otrosRoles.map((rol) => <option key={rol} value={rol}>{labelRol(rol)}{configurada(rol) || borradores[rol] ? '' : ' (sin configurar)'}</option>)}
            </select>
            <button type="button" onClick={copiarDeRol} disabled={!copiarRol || guardando} className={BOTON} aria-label="Copiar rol"><Copy size={13} /> Copiar</button>
            <select value={copiarCentro} onChange={(e) => setCopiarCentro(e.target.value)} aria-label="Copiar desde otro centro"
              disabled={otrasCombinaciones.length === 0 || guardando}
              title={otrasCombinaciones.length ? 'Partir de la configuración de otro centro y rol' : 'No hay otros centros configurados'} className={SELECT}>
              <option value="">Copiar desde otro centro…</option>
              {otrasCombinaciones.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button type="button" onClick={copiarDeCentro} disabled={!copiarCentro || guardando} className={BOTON} aria-label="Copiar centro"><Copy size={13} /> Copiar</button>
          </span>
        )}
        tabs={[
          ...ROLES_CON_PLANTILLA.map((rol) => ({
            id: rol,
            label: `${labelRol(rol)} (${usuariosDe(rol).length})`,
            icon: KeyRound,
            badge: conCambios.includes(rol)
              ? <CircleDot size={11} className="ml-1 text-amber-500" aria-label="Con cambios sin guardar" />
              : !configurada(rol) && <span className="ml-1 text-pequeno px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Sin configurar</span>,
          })),
          { id: 'usuarios', label: `Ver usuarios (${usuariosDelCentro.length})`, icon: Users },
        ]}
        tabActiva={tab}
        onTab={setTab}
      >
        {rolActivo ? (
          <EditorPermisos
            key={`${centro.id}-${rolActivo}-${editorKey}`}
            estado={estadoDe(rolActivo)}
            onCambiar={(nuevo) => setBorradores((prev) => ({ ...prev, [rolActivo]: nuevo }))}
          />
        ) : (
          <div className="h-full min-h-0 flex flex-col gap-2">
            <label className="shrink-0 flex items-center gap-2 text-etiqueta text-tinta-secundaria">
              Rol
              <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} aria-label="Filtrar usuarios por rol"
                className="h-7 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-secundario text-tinta-principal">
                <option value="todos">Todos</option>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {usuariosFiltrados.length === 0 ? (
                <p className="py-10 text-center text-normal text-tinta-secundaria">
                  {usuariosDelCentro.length ? 'Ningún usuario de este centro tiene ese rol.' : 'Ningún usuario tiene asignado este centro.'}
                </p>
              ) : (
                <table className="w-full text-left text-secundario border-separate border-spacing-0">
                  <thead className="text-pequeno uppercase text-tinta-secundaria">
                    <tr>
                      {['Nombre', 'Usuario', 'Rol', 'Permisos personalizados', ''].map((h, i, arr) => (
                        <th key={h || 'acciones'} className={`sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-etiqueta border-b border-gray-200 dark:border-gray-700 ${i < arr.length - 1 ? 'border-r' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosFiltrados.map((u) => {
                      const n = contarExcepciones(excepcionesDe(u));
                      const celda = 'px-3 py-1.5 border-b border-r border-gray-100 dark:border-gray-700/60';
                      return (
                        <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className={`${celda} text-tinta-principal`}>{u.nombreCompleto || u.email}</td>
                          <td className={`${celda} text-tinta-secundaria`}>@{u.nombreUsuario}</td>
                          <td className={celda}><span className="inline-flex items-center gap-1"><Shield size={11} className="text-[#2383C2]" />{labelRol(rolDeUsuario(u))}</span></td>
                          <td className={celda}>
                            {tieneExcepciones(u.excepciones)
                              ? <span className="inline-flex items-center gap-1 text-pequeno px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"><SlidersHorizontal size={10} /> +{n.agregados} / −{n.quitados}</span>
                              : <span className="text-tinta-atenuada">No</span>}
                          </td>
                          <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/60 text-center">
                            <button type="button" onClick={() => conConfirmacion(() => onEditarUsuario?.(u.id))} title={`Editar a ${u.nombreCompleto}`}
                              className="inline-flex items-center gap-1 text-etiqueta text-[#2383C2] hover:underline">
                              <Pencil size={12} /> Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </MarcoEdicionUsuario>
    </>
  );
};

export default ConfigurarCentro;
