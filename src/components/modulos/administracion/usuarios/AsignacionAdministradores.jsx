import { administradoresDelCentro } from '../../../../../functions/solicitudes/destinatarios.mjs';

// Editar usuario → Datos generales:
//   - CentrosAdministrados (rol Administrador): de qué centros recibe y
//     resuelve las solicitudes de sus usuarios.
//   - AdministradoresAsignados (Operador / Encargado): quiénes reciben y
//     resuelven sus solicitudes. Solo administradores activos de su centro;
//     sin ninguno, o con "Todos", le llegan a todos los de su centro.
// Siempre las reciben, además, los desarrolladores.

const CAJA = 'max-h-40 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 flex flex-col gap-1';
const OPCION = 'flex items-center gap-2 text-[12px] text-gray-700 dark:text-gray-200 cursor-pointer';

export const CentrosAdministrados = ({ centros, seleccionados, onCambiar }) => {
  const alternar = (id) => onCambiar(seleccionados.includes(id) ? seleccionados.filter((c) => c !== id) : [...seleccionados, id]);
  return (
    <fieldset>
      <legend className="block text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Centros que administra</legend>
      <div className={CAJA}>
        {centros.map((c) => (
          <label key={c.id} className={OPCION}>
            <input type="checkbox" checked={seleccionados.includes(c.id)} onChange={() => alternar(c.id)} className="accent-[#2383C2]" />
            {c.nombre}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
        Recibe en Alertas las solicitudes de los usuarios de estos centros y puede aprobarlas o rechazarlas.
      </p>
    </fieldset>
  );
};

export const AdministradoresAsignados = ({ usuarios, centroId, asignados, todos, onCambiar }) => {
  const disponibles = administradoresDelCentro(usuarios, centroId);
  const alternar = (uid) => onCambiar({
    administradoresAsignados: asignados.includes(uid) ? asignados.filter((a) => a !== uid) : [...asignados, uid],
    todosLosAdministradoresDelCentro: false,
  });
  return (
    <fieldset>
      <legend className="block text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Administradores asignados</legend>
      {!centroId ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">Asígnale un centro de costo para elegir sus administradores.</p>
      ) : (
        <>
          <div className={CAJA}>
            <label className={`${OPCION} font-semibold`}>
              <input type="checkbox" checked={todos} onChange={(e) => onCambiar({ administradoresAsignados: [], todosLosAdministradoresDelCentro: e.target.checked })} className="accent-[#2383C2]" />
              Todos los administradores del centro
            </label>
            {disponibles.map((a) => (
              <label key={a.uid ?? a.id} className={`${OPCION} ${todos ? 'opacity-50' : ''}`}>
                <input type="checkbox" disabled={todos} checked={asignados.includes(a.uid ?? a.id)} onChange={() => alternar(a.uid ?? a.id)} className="accent-[#2383C2]" />
                {a.nombreCompleto || a.email}
              </label>
            ))}
            {!disponibles.length && <span className="text-[11px] text-gray-400">Este centro no tiene administradores activos.</span>}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            {todos || !asignados.length
              ? 'Sus solicitudes llegan a todos los administradores del centro (y a los desarrolladores).'
              : 'Sus solicitudes llegan a estos administradores (y a los desarrolladores).'}
          </p>
        </>
      )}
    </fieldset>
  );
};
