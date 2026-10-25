import { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Building2, Plus, Trash2, Search, Pencil, Save, X, RefreshCw, Star, Power } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { upsertLocal, removeLocal } from '../../../../stores/catalogosStore';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import Spinner from '../../../ui/Spinner';
import {
  RUTA_INSTITUCIONES, COLECCION_INSTITUCIONES, LARGO_MAXIMO, FORM_VACIO,
  normalizarInstitucion, validarInstitucion, idsADesmarcar,
} from './instituciones';

const PATH_VISTA = RUTA_INSTITUCIONES;
const INPUT = 'w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none focus:border-[#2383C2] dark:focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100';
const ETIQUETA = 'block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5';
const CELDA = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70';
const TH = 'py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700';

const CAMPOS_FORM = [
  { campo: 'nombre', etiqueta: 'Nombre *', ancho: 'w-[220px]', placeholder: 'Ej: Sociedad Clínica del Norte S.A.' },
  { campo: 'nombreCorto', etiqueta: 'Nombre corto', ancho: 'w-[150px]', placeholder: 'Ej: Clínica Norte' },
  { campo: 'rut', etiqueta: 'RUT', ancho: 'w-[110px]', placeholder: 'Ej: 76.123.456-7' },
  { campo: 'direccion', etiqueta: 'Dirección', ancho: 'w-[220px]', placeholder: 'Ej: Av. Principal 123' },
  { campo: 'ciudad', etiqueta: 'Ciudad', ancho: 'w-[130px]', placeholder: 'Ej: Santiago' },
  { campo: 'telefono', etiqueta: 'Teléfono', ancho: 'w-[120px]', placeholder: 'Ej: +56 2 2345 6789' },
  { campo: 'email', etiqueta: 'Email', ancho: 'w-[190px]', placeholder: 'Ej: contacto@clinica.cl', tipo: 'email' },
];

// Maestros → Instituciones: instituciones o sucursales que ofrece el
// selector del header. Lee el catalogosStore (lectura única por sesión);
// sus escrituras se reflejan con upsertLocal/removeLocal. Solo puede haber
// una predeterminada: cada escritura que la marca desmarca las demás en el
// mismo writeBatch.
const InstitucionesMaestros = () => {
  const { datos, refrescar } = useCatalogo('instituciones');
  const [formData, setFormData] = useState(FORM_VACIO);
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const instituciones = useMemo(
    () => [...datos].sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
    [datos]
  );
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    if (!q) return instituciones;
    return instituciones.filter((i) => ['nombre', 'nombreCorto', 'rut', 'ciudad', 'direccion', 'email', 'telefono']
      .some((c) => String(i[c] ?? '').toLocaleLowerCase('es').includes(q)));
  }, [instituciones, busqueda]);

  const auditoria = () => ({
    actualizadoEl: serverTimestamp(),
    actualizadoPor: userData?.nombreCompleto || 'Usuario',
    actualizadoPorUid: userData?.uid || '',
  });

  // Escribe `cambios` en `id` y, si queda predeterminada, desmarca las demás.
  const guardarConPredeterminada = async (ref, cambios, { nuevo = false } = {}) => {
    const batch = writeBatch(db);
    const desmarcar = cambios.predeterminada ? idsADesmarcar(instituciones, ref.id) : [];
    if (nuevo) batch.set(ref, cambios);
    else batch.update(ref, cambios);
    desmarcar.forEach((id) => batch.update(doc(db, COLECCION_INSTITUCIONES, id), { predeterminada: false, ...auditoria() }));
    await batch.commit();
    upsertLocal('instituciones', ref.id, cambios);
    desmarcar.forEach((id) => upsertLocal('instituciones', id, { predeterminada: false }));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    const datosForm = normalizarInstitucion(formData);
    const error = validarInstitucion(datosForm, instituciones, editingId);
    if (error) return showToast(error, 'error');

    setCargando(true);
    try {
      if (editingId) {
        await guardarConPredeterminada(doc(db, COLECCION_INSTITUCIONES, editingId), { ...datosForm, ...auditoria() });
        showToast('Institución actualizada correctamente', 'success');
      } else {
        const ref = doc(collection(db, COLECCION_INSTITUCIONES));
        await guardarConPredeterminada(ref, {
          ...datosForm,
          creadoEl: serverTimestamp(),
          creadoPor: userData?.nombreCompleto || 'Usuario',
          creadoPorUid: userData?.uid || '',
          ...auditoria(),
        }, { nuevo: true });
        showToast('Institución registrada correctamente', 'success');
      }
      setFormData(FORM_VACIO);
      setEditingId(null);
    } catch (err) {
      showToast(`Error al guardar: ${err.message}`, 'error');
    } finally {
      setCargando(false);
    }
  };

  const ejecutar = async (accion, mensaje) => {
    setCargando(true);
    try {
      await accion();
      showToast(mensaje, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setCargando(false);
    }
  };

  // Desactivar también le quita la marca de predeterminada.
  const alternarEstado = (i) => {
    const activa = i.activa === false;
    ejecutar(
      () => guardarConPredeterminada(doc(db, COLECCION_INSTITUCIONES, i.id), {
        activa, predeterminada: activa ? i.predeterminada === true : false, ...auditoria(),
      }),
      activa ? 'Institución activada' : 'Institución desactivada'
    );
  };

  const marcarPredeterminada = (i) => ejecutar(
    () => guardarConPredeterminada(doc(db, COLECCION_INSTITUCIONES, i.id), { predeterminada: true, ...auditoria() }),
    `${i.nombre} es ahora la institución predeterminada`
  );

  const handleDelete = (i) => {
    confirmAction(
      'Eliminar institución',
      `¿Eliminar "${i.nombre}"? Esta acción no se puede deshacer. Si solo quieres dejar de usarla, desactívala.`,
      async () => {
        try {
          await deleteDoc(doc(db, COLECCION_INSTITUCIONES, i.id));
          removeLocal('instituciones', i.id);
          if (editingId === i.id) cancelarEdicion();
          showToast('Institución eliminada', 'info');
        } catch (err) {
          showToast(`Error al eliminar: ${err.message}`, 'error');
        }
      }
    );
  };

  const iniciarEdicion = (i) => {
    setEditingId(i.id);
    setFormData(normalizarInstitucion(i));
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setFormData(FORM_VACIO);
  };

  const verNombre = hasPermission(PATH_VISTA, 'tabla_datos', 'col_nombre');
  const verNombreCorto = hasPermission(PATH_VISTA, 'tabla_datos', 'col_nombre_corto');
  const verRut = hasPermission(PATH_VISTA, 'tabla_datos', 'col_rut');
  const verCiudad = hasPermission(PATH_VISTA, 'tabla_datos', 'col_ciudad');
  const verDireccion = hasPermission(PATH_VISTA, 'tabla_datos', 'col_direccion');
  const verContacto = hasPermission(PATH_VISTA, 'tabla_datos', 'col_contacto');
  const verEstado = hasPermission(PATH_VISTA, 'tabla_datos', 'col_estado');

  const puedeEnviar = (!editingId && hasPermission(PATH_VISTA, 'formulario_registro', 'btn_registrar'))
    || (editingId && hasPermission(PATH_VISTA, 'formulario_registro', 'btn_actualizar'));

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
          <Building2 size={14} className="text-[#2383C2]" />
          {editingId ? 'EDITAR INSTITUCIÓN' : 'REGISTRO DE INSTITUCIONES'}
        </h2>
        <button
          type="button"
          onClick={refrescar}
          className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          title="Actualizar (traer cambios de otros usuarios)"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {hasPermission(PATH_VISTA, 'formulario_registro') && (
        <form onSubmit={handleGuardar} className="px-3 py-2 flex flex-wrap items-end gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
          {CAMPOS_FORM.map(({ campo, etiqueta, ancho, placeholder, tipo }) => (
            <div key={campo} className={ancho}>
              <label htmlFor={`institucion-${campo}`} className={ETIQUETA}>{etiqueta}</label>
              <input
                id={`institucion-${campo}`}
                type={tipo || 'text'}
                required={campo === 'nombre'}
                maxLength={LARGO_MAXIMO[campo]}
                value={formData[campo]}
                onChange={(e) => setFormData({ ...formData, [campo]: e.target.value })}
                className={INPUT}
                placeholder={placeholder}
              />
            </div>
          ))}

          <label className="h-7 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.activa}
              onChange={(e) => setFormData({ ...formData, activa: e.target.checked, predeterminada: e.target.checked && formData.predeterminada })}
              className="accent-[#2383C2]"
            />
            Activa
          </label>

          {hasPermission(PATH_VISTA, 'formulario_registro', 'check_predeterminada') && (
            <label
              className={`h-7 flex items-center gap-1.5 text-[11px] font-semibold select-none ${formData.activa ? 'text-gray-600 dark:text-gray-300 cursor-pointer' : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}
              title="Se selecciona automáticamente en el header si el usuario no eligió otra. Solo puede haber una."
            >
              <input
                type="checkbox"
                checked={formData.predeterminada}
                disabled={!formData.activa}
                onChange={(e) => setFormData({ ...formData, predeterminada: e.target.checked })}
                className="accent-[#2383C2]"
              />
              Predeterminada
            </label>
          )}

          {puedeEnviar && (
            <button type="submit" className={`h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'} text-white transition`}>
              {editingId ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
            </button>
          )}

          {editingId && (
            <button type="button" onClick={cancelarEdicion} className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded font-bold text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition">
              <X size={13} /> Cancelar
            </button>
          )}
        </form>
      )}

      {hasPermission(PATH_VISTA, 'barra_busqueda', 'input_buscar') && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
          <div className="relative w-60">
            <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`${INPUT} pl-7`}
              placeholder="Buscar por nombre, RUT, ciudad..."
              aria-label="Buscar instituciones"
            />
          </div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {instituciones.filter((i) => i.activa !== false).length} activas de {instituciones.length}
          </span>
        </div>
      )}

      {hasPermission(PATH_VISTA, 'tabla_datos') && (
        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
                <th className={`${TH} w-8 text-center`}>#</th>
                {verNombre && <th className={TH}>Nombre</th>}
                {verNombreCorto && <th className={TH}>Nombre corto</th>}
                {verRut && <th className={TH}>RUT</th>}
                {verCiudad && <th className={TH}>Ciudad</th>}
                {verDireccion && <th className={TH}>Dirección</th>}
                {verContacto && <th className={TH}>Contacto</th>}
                {verEstado && <th className={TH}>Estado</th>}
                <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={2 + [verNombre, verNombreCorto, verRut, verCiudad, verDireccion, verContacto, verEstado].filter(Boolean).length} className="py-6 text-center text-gray-500 dark:text-gray-400">
                    {instituciones.length === 0 ? 'Aún no hay instituciones registradas.' : 'Sin coincidencias.'}
                  </td>
                </tr>
              )}
              {filtradas.map((i, index) => {
                const activa = i.activa !== false;
                return (
                  <tr key={i.id} className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                    <td className={`${CELDA} text-gray-500 dark:text-gray-400 font-bold text-center`}>{index + 1}</td>
                    {verNombre && (
                      <td className={`${CELDA} text-gray-700 dark:text-gray-200 font-medium`}>
                        {i.nombre}
                        {i.predeterminada && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300">Predeterminada</span>
                        )}
                      </td>
                    )}
                    {verNombreCorto && <td className={`${CELDA} text-gray-600 dark:text-gray-300`}>{i.nombreCorto || '-'}</td>}
                    {verRut && <td className={`${CELDA} text-gray-500 dark:text-gray-400`}>{i.rut || '-'}</td>}
                    {verCiudad && <td className={`${CELDA} text-gray-500 dark:text-gray-400`}>{i.ciudad || '-'}</td>}
                    {verDireccion && <td className={`${CELDA} text-gray-500 dark:text-gray-400`}>{i.direccion || '-'}</td>}
                    {verContacto && (
                      <td className={`${CELDA} text-gray-500 dark:text-gray-400`}>
                        {[i.telefono, i.email].filter(Boolean).join(' · ') || '-'}
                      </td>
                    )}
                    {verEstado && (
                      <td className={CELDA}>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${activa ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'}`}>
                          {activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                    )}
                    <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center">
                      <div className="flex justify-center gap-2">
                        {hasPermission(PATH_VISTA, 'tabla_datos', 'action_editar') && (
                          <button type="button" onClick={() => iniciarEdicion(i)} title="Editar" aria-label={`Editar ${i.nombre}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition">
                            <Pencil size={13} />
                          </button>
                        )}
                        {activa && !i.predeterminada && hasPermission(PATH_VISTA, 'tabla_datos', 'action_predeterminada') && (
                          <button type="button" onClick={() => marcarPredeterminada(i)} title="Marcar como predeterminada" aria-label={`Marcar ${i.nombre} como predeterminada`} className="text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition">
                            <Star size={13} />
                          </button>
                        )}
                        {hasPermission(PATH_VISTA, 'tabla_datos', 'action_estado') && (
                          <button type="button" onClick={() => alternarEstado(i)} title={activa ? 'Desactivar' : 'Activar'} aria-label={`${activa ? 'Desactivar' : 'Activar'} ${i.nombre}`} className={`${activa ? 'text-gray-500 hover:text-red-600 dark:hover:text-red-400' : 'text-green-600 hover:text-green-700 dark:text-green-400'} transition`}>
                            <Power size={13} />
                          </button>
                        )}
                        {hasPermission(PATH_VISTA, 'tabla_datos', 'action_eliminar') && (
                          <button type="button" onClick={() => handleDelete(i)} title="Eliminar" aria-label={`Eliminar ${i.nombre}`} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InstitucionesMaestros;
