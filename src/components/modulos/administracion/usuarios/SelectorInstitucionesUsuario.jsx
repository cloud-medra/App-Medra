import { useCatalogo } from '../../../../hooks/useCatalogo';
import { institucionesActivas, nombreVisible } from '../../maestros/institucionesMaestros/instituciones';

// Crear usuario / Editar usuario → Datos generales: instituciones del
// usuario (usuarios/{uid}.instituciones, las guarda guardarPermisosUsuario).
// Definen qué ofrece el selector del header; aún no filtran datos. Se eligen
// entre las activas; una asignada que se desactivó sigue a la vista
// ("inactiva") para poder quitarla.

const CAJA = 'max-h-40 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 flex flex-col gap-1';
const OPCION = 'flex items-center gap-2 text-[12px] text-gray-700 dark:text-gray-200 cursor-pointer';

const SelectorInstitucionesUsuario = ({ seleccionadas = [], onCambiar, disabled = false }) => {
  const { datos, cargado } = useCatalogo('instituciones');
  const activas = institucionesActivas(datos);
  const inactivasAsignadas = datos.filter((i) => i.activa === false && seleccionadas.includes(i.id));
  const opciones = [...activas, ...inactivasAsignadas];
  const alternar = (id) => onCambiar(seleccionadas.includes(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id]);

  return (
    <fieldset disabled={disabled}>
      <legend className="block text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Instituciones</legend>
      {!cargado ? (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Cargando instituciones…</p>
      ) : opciones.length === 0 ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">No hay instituciones activas (Maestros → Instituciones).</p>
      ) : (
        <div className={CAJA}>
          {opciones.map((i) => (
            <label key={i.id} className={OPCION} title={i.nombre}>
              <input type="checkbox" checked={seleccionadas.includes(i.id)} onChange={() => alternar(i.id)} className="accent-[#2383C2]" />
              <span className="truncate">{nombreVisible(i)}</span>
              {i.activa === false && <span className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">(inactiva)</span>}
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
        Las que podrá elegir en el header. Sin ninguna marcada, ve todas las activas.
      </p>
    </fieldset>
  );
};

export default SelectorInstitucionesUsuario;
