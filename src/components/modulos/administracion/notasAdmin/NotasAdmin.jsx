import React, { useState } from 'react';
import { db, auth } from '../../../../firebaseConfig';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, 
  serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { removeLocal } from '../../../../stores/catalogosStore';
import { useNotasPanel } from './useNotasPanel';
import {
  ROLES_NOTA, VALORES_ROLES_NOTA, SOLO_DEV, labelRolNota, rolesDeNota, esSoloDev, veTodasLasNotas,
  normalizarEstilo, estiloVisualNota,
} from './notasConfig';
import SelectorEstiloNota from './SelectorEstiloNota';
import { 
  Send, PlusCircle, CheckSquare, AlignLeft, 
  Trash2, Edit2, Plus, X, ArrowUp, ArrowDown, Users, Code2 
} from 'lucide-react';

import { useToast } from '../../../../context/ToastContext';
import { useUser } from '../../../../context/UserContext';
import ModalConfirm from '../../../../components/ui/ModalConfirm';
import Spinner from '../../../../components/ui/Spinner';

const ESTILO_VACIO = normalizarEstilo(null);

const NotasAdmin = () => {
  const { showToast } = useToast();
  const { userData } = useUser();

  const [tipo, setTipo] = useState('texto');
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [items, setItems] = useState(['']);
  const [cargando, setCargando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [errorRoles, setErrorRoles] = useState(false);
  const [estilo, setEstilo] = useState(ESTILO_VACIO);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [idParaEliminar, setIdParaEliminar] = useState(null);
  const { notas, cargando: cargandoNotas, refrescar: refrescarNotas } = useNotasPanel();

  const handleItemChange = (index, value) => {
    const nuevosItems = [...items];
    nuevosItems[index] = value;
    setItems(nuevosItems);
  };

  // Marcar un rol quita "Solo desarrolladores" y viceversa (el Desarrollador
  // ve todas: combinarlo con otros roles no cambiaría nada).
  const soloDev = esSoloDev(roles);
  const toggleRol = (rol) => {
    setErrorRoles(false);
    setRoles((prev) => {
      const base = esSoloDev(prev) ? [] : prev;
      return base.includes(rol) ? base.filter((r) => r !== rol) : [...base, rol];
    });
  };
  const toggleTodos = () => {
    setErrorRoles(false);
    setRoles((prev) => (prev.length === VALORES_ROLES_NOTA.length ? [] : [...VALORES_ROLES_NOTA]));
  };
  const toggleSoloDev = () => {
    setErrorRoles(false);
    setRoles((prev) => (esSoloDev(prev) ? [] : [...SOLO_DEV]));
  };

  const agregarItem = () => setItems([...items, '']);
  const eliminarItem = (index) => setItems(items.filter((_, i) => i !== index));

  const resetFormulario = () => {
    setTitulo('');
    setContenido('');
    setItems(['']);
    setTipo('texto');
    setEditandoId(null);
    setRoles([]);
    setErrorRoles(false);
    setEstilo(ESTILO_VACIO);
  };

  const moverNota = async (index, direccion) => {
    const nuevoIndex = direccion === 'arriba' ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= notas.length) return;

    const notaActual = notas[index];
    const notaDestino = notas[nuevoIndex];

    const ordenActual = typeof notaActual.orden === 'number' ? notaActual.orden : index;
    const ordenDestino = typeof notaDestino.orden === 'number' ? notaDestino.orden : nuevoIndex;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'administracion_notas', notaActual.id), { orden: ordenDestino });
      batch.update(doc(db, 'administracion_notas', notaDestino.id), { orden: ordenActual });
      await batch.commit();
      await refrescarNotas();
    } catch (error) {
      console.error('Error al reordenar:', error);
      showToast('Error al cambiar la posición', 'error');
    }
  };

  const handleGuardarNota = async (e) => {
    e.preventDefault();

    const autorNombre =
      userData?.nombreCompleto ||
      userData?.nombre ||
      userData?.displayName ||
      auth.currentUser?.displayName ||
      auth.currentUser?.nombreCompleto ||
      'Administrador';

    if (tipo === 'texto' && !contenido.trim()) return;
    if (tipo === 'checklist' && items.filter((i) => i.trim()).length === 0) return;
    if (roles.length === 0) {
      setErrorRoles(true);
      showToast('Elige al menos un rol que verá la nota', 'error');
      return;
    }

    // Mismo orden que ROLES_NOTA, sin duplicados; solo desarrolladores = ['dev'].
    const rolesVisibles = soloDev ? [...SOLO_DEV] : VALORES_ROLES_NOTA.filter((r) => roles.includes(r));
    const estiloGuardar = normalizarEstilo(estilo);
    // Quien no está entre los destinatarios deja de ver la nota al guardarla
    // (salvo el Desarrollador, que ve todas).
    const dejaDeVerla = !veTodasLasNotas(userData) && !rolesVisibles.includes(userData?.rol || 'operador');

    setCargando(true);

    try {
      if (editandoId) {
        const payloadActualizacion = {
          titulo: titulo.trim(),
          tipo,
          rolesVisibles,
          estilo: estiloGuardar,
          ...(tipo === 'texto'
            ? { contenido: contenido.trim(), items: [] }
            : {
                contenido: '',
                items: items
                  .filter((i) => i.trim())
                  .map((texto) => ({ texto: texto.trim(), completado: false })),
              }),
        };
        await updateDoc(doc(db, 'administracion_notas', editandoId), payloadActualizacion);
        if (dejaDeVerla) removeLocal('notas', editandoId);
        else await refrescarNotas();
        showToast(dejaDeVerla
          ? 'Nota actualizada. No está dirigida a tu rol, así que ya no la verás.'
          : 'Nota actualizada con éxito', 'success');
      } else {
        const batch = writeBatch(db);
        
        notas.forEach((n, idx) => {
          const ordenValido = typeof n.orden === 'number' ? n.orden : idx;
          batch.update(doc(db, 'administracion_notas', n.id), { orden: ordenValido + 1 });
        });

        const nuevaNotaRef = doc(collection(db, 'administracion_notas'));
        batch.set(nuevaNotaRef, {
          titulo: titulo.trim(),
          tipo,
          rolesVisibles,
          estilo: estiloGuardar,
          autor: autorNombre,
          fecha: serverTimestamp(),
          orden: 0,
          ...(tipo === 'texto'
            ? { contenido: contenido.trim() }
            : {
                items: items
                  .filter((i) => i.trim())
                  .map((texto) => ({ texto: texto.trim(), completado: false })),
              }),
        });

        await batch.commit();
        await refrescarNotas();
        showToast(dejaDeVerla
          ? 'Nota publicada. No está dirigida a tu rol, así que no la verás en el listado.'
          : 'Nota publicada correctamente', 'success');
      }
      resetFormulario();
    } catch (error) {
      console.error('Error al guardar:', error);
      showToast('Ocurrió un error al guardar', 'error');
    } finally {
      setCargando(false);
    }
  };

  const handleEditar = (nota) => {
    setEditandoId(nota.id);
    setTipo(nota.tipo || 'texto');
    setTitulo(nota.titulo || '');
    setRoles(rolesDeNota(nota));
    setErrorRoles(false);
    setEstilo(normalizarEstilo(nota.estilo));
    if (nota.tipo === 'checklist') {
      setItems(nota.items?.map((i) => i.texto) || ['']);
      setContenido('');
    } else {
      setContenido(nota.contenido || '');
      setItems(['']);
    }
  };

  const solicitarEliminacion = (id) => {
    setIdParaEliminar(id);
    setIsModalOpen(true);
  };

  const handleConfirmarEliminar = async () => {
    if (!idParaEliminar) return;

    try {
      await deleteDoc(doc(db, 'administracion_notas', idParaEliminar));
      removeLocal('notas', idParaEliminar);
      showToast('Nota eliminada correctamente', 'success');
    } catch (error) {
      console.error('Error al eliminar:', error);
      showToast('Error al eliminar la nota', 'error');
    } finally {
      setIdParaEliminar(null);
    }
  };

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
              <PlusCircle size={16} className="text-[#2383C2]" />
              {editandoId ? 'Editar Nota' : 'Administrador de Notas'}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {editandoId ? 'Modifica los campos deseados' : 'Crea notas de texto o listas interactivas para el panel.'}
            </p>
          </div>
          {editandoId && (
            <button
              onClick={resetFormulario}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
              title="Cancelar edición"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {!editandoId && (
          <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setTipo('texto')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded transition-all ${
                tipo === 'texto'
                  ? 'bg-white dark:bg-gray-800 text-[#2383C2] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <AlignLeft size={14} /> Texto Libre
            </button>
            <button
              type="button"
              onClick={() => setTipo('checklist')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded transition-all ${
                tipo === 'checklist'
                  ? 'bg-white dark:bg-gray-800 text-[#2383C2] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <CheckSquare size={14} /> Checklist
            </button>
          </div>
        )}

        <form onSubmit={handleGuardarNota} className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Título (Opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Tareas pendientes / Aviso"
              className="w-full text-xs p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
            />
          </div>

          {tipo === 'texto' ? (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Contenido
              </label>
              <textarea
                rows={4}
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder="Escribe el mensaje..."
                required
                className="w-full text-xs p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Elementos de la lista
              </label>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      placeholder={`Tarea ${idx + 1}`}
                      className="w-full text-xs p-1.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarItem(idx)}
                        className="text-gray-400 hover:text-rose-500 p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={agregarItem}
                className="mt-2 text-[11px] text-[#2383C2] hover:underline font-semibold flex items-center gap-1"
              >
                <Plus size={12} /> Añadir elemento
              </button>
            </div>
          )}

          <fieldset aria-describedby={errorRoles ? 'error-roles-nota' : undefined}>
            <div className="flex items-center justify-between mb-1">
              <legend className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Users size={12} /> Visible para <span className="text-rose-500">*</span>
              </legend>
              <button
                type="button"
                onClick={toggleTodos}
                className="text-[10px] text-[#2383C2] hover:underline font-semibold"
              >
                {roles.length === VALORES_ROLES_NOTA.length ? 'Quitar todos' : 'Todos'}
              </button>
            </div>
            <div
              className={`flex flex-wrap gap-2 p-2 rounded border ${
                errorRoles
                  ? 'border-rose-400 bg-rose-50/60 dark:bg-rose-950/20'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
              }`}
            >
              {ROLES_NOTA.map((r) => (
                <label key={r.value} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={roles.includes(r.value)}
                    onChange={() => toggleRol(r.value)}
                    className="accent-[#2383C2]"
                  />
                  {r.label}
                </label>
              ))}
              <span className="basis-full border-t border-gray-200 dark:border-gray-700" aria-hidden="true" />
              <label className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloDev}
                  onChange={toggleSoloDev}
                  className="accent-violet-600"
                />
                <Code2 size={12} /> Solo desarrolladores
              </label>
            </div>
            {errorRoles ? (
              <p id="error-roles-nota" role="alert" className="text-[10.5px] text-rose-600 dark:text-rose-400 mt-1">
                Debes elegir al menos un rol.
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                {soloDev
                  ? 'Nota privada: ningún otro rol la verá.'
                  : 'El rol Desarrollador siempre ve todas las notas.'}
              </p>
            )}
          </fieldset>

          <SelectorEstiloNota
            estilo={estilo}
            onChange={setEstilo}
            vistaPrevia={{
              tipo,
              titulo: titulo.trim(),
              contenido: contenido.trim(),
              items: items.filter((i) => i.trim()),
            }}
          />

          <div className="flex items-center justify-end gap-2 mt-2">
            {editandoId && (
              <button
                type="button"
                onClick={resetFormulario}
                disabled={cargando}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold px-3 py-2 rounded"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={cargando}
              className="bg-[#2383C2] hover:bg-[#1b6aa0] text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 min-w-[120px] justify-center"
            >
              {cargando ? (
                <>
                  <Spinner size="sm" color="#ffffff" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>{editandoId ? 'Guardar Cambios' : 'Publicar Nota'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="lg:col-span-7 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
            Notas Publicadas ({notas.length})
          </span>
        </div>

        <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
          {cargandoNotas ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
              <Spinner size="md" color="#2383C2" />
              <span className="text-xs">Cargando notas...</span>
            </div>
          ) : notas.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-8">
              No hay notas publicadas en el sistema.
            </p>
          ) : (
            notas.map((nota, idx) => {
              const visual = estiloVisualNota(nota);
              return (
              <div
                key={nota.id}
                style={visual.contenedor}
                className={`p-3 border rounded-lg flex flex-col gap-1.5 transition-all ${
                  editandoId === nota.id
                    ? `border-[#2383C2] ring-1 ring-[#2383C2] ${visual.fondoPropio ? '' : 'bg-sky-50/30 dark:bg-sky-950/20'}`
                    : `border-gray-100 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 ${visual.fondoPropio ? '' : 'bg-gray-50 dark:bg-gray-900/40'}`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {nota.tipo === 'checklist' ? (
                      <CheckSquare size={14} className="text-[#2383C2] shrink-0" />
                    ) : (
                      <AlignLeft size={14} className="text-[#2383C2] shrink-0" />
                    )}
                    {nota.titulo && (
                      <h4
                        style={visual.textoPropio ? { color: visual.texto.color } : undefined}
                        className={`text-xs font-bold ${visual.textoPropio ? '' : 'text-gray-800 dark:text-gray-100'}`}
                      >
                        {nota.titulo}
                      </h4>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="flex items-center bg-gray-200/60 dark:bg-gray-700/60 rounded mr-1">
                      <button
                        onClick={() => moverNota(idx, 'arriba')}
                        disabled={idx === 0}
                        className="p-1 text-gray-500 dark:text-gray-300 hover:text-[#2383C2] disabled:opacity-25 disabled:hover:text-gray-500 transition-colors"
                        title="Mover arriba"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => moverNota(idx, 'abajo')}
                        disabled={idx === notas.length - 1}
                        className="p-1 text-gray-500 dark:text-gray-300 hover:text-[#2383C2] disabled:opacity-25 disabled:hover:text-gray-500 transition-colors"
                        title="Mover abajo"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>

                    <button
                      onClick={() => handleEditar(nota)}
                      className="p-1 text-gray-400 hover:text-[#2383C2] dark:hover:text-sky-400 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => solicitarEliminacion(nota.id)}
                      className="p-1 text-gray-400 hover:text-rose-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {nota.tipo === 'checklist' ? (
                  <ul className="flex flex-col gap-1 pl-1">
                    {nota.items?.map((item, i) => (
                      <li
                        key={i}
                        style={visual.texto}
                        className={`text-[11px] flex items-center gap-2 ${visual.textoPropio ? '' : 'text-gray-600 dark:text-gray-300'}`}
                      >
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                        <span>{item.texto}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p
                    style={visual.texto}
                    className={`text-[11.5px] leading-relaxed whitespace-pre-wrap ${visual.textoPropio ? '' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    {nota.contenido}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1" aria-label="Roles que ven la nota">
                  {esSoloDev(rolesDeNota(nota)) ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-1 bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300">
                      <Code2 size={10} /> Solo desarrolladores
                    </span>
                  ) : rolesDeNota(nota).map((rol) => (
                    <span
                      key={rol}
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-white/80 dark:bg-gray-800/80 border-sky-200 dark:border-sky-800 text-[#2383C2] dark:text-sky-300"
                    >
                      {labelRolNota(rol)}
                    </span>
                  ))}
                </div>

                <div
                  className={`flex items-center justify-between border-t pt-1.5 mt-1 text-[9px] ${
                    visual.fondoPropio
                      ? 'border-current/20 opacity-75'
                      : 'border-gray-200/50 dark:border-gray-700/50 text-gray-400 dark:text-gray-500'
                  }`}
                  style={visual.textoPropio ? { color: visual.texto.color } : undefined}
                >
                  <span>Por: {nota.autor}</span>
                  {nota.fecha?.seconds && (
                    <span>{new Date(nota.fecha.seconds * 1000).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      <ModalConfirm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmarEliminar}
        title="¿Eliminar nota?"
        message="Esta acción no se puede deshacer. La nota se eliminará permanentemente."
        confirmText="Sí, eliminar"
        type="danger"
      />
    </div>
  );
};

export default NotasAdmin;