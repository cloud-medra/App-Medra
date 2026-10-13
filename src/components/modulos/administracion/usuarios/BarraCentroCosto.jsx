import { Building2, RotateCcw } from 'lucide-react';
import MarcaOrigen from './MarcaOrigen';

// Encima del editor de permisos de un usuario: su centro de costo, cuántos
// permisos tiene personalizados (excepciones) y "Restablecer a la plantilla".
// `centro`: "Centro – Rol" (la plantilla es por combinación).
// `sinPlantilla`: rol Administrador/Desarrollador (solo permisos propios).
const BarraCentroCosto = ({ centro, conPlantilla, excepciones, onRestablecer, onConfigurarCentro, sinPlantilla = false, rol = '' }) => {
  const total = excepciones.agregados + excepciones.quitados;
  if (sinPlantilla) {
    return (
      <div className="shrink-0 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-[11.5px] text-gray-600 dark:text-gray-300">
        <Building2 size={14} className="text-gray-400 shrink-0" />
        {rol ? `Rol ${rol}` : 'Su rol'}: no usa plantillas de centro; ve y usa solo lo que se marque aquí.
      </div>
    );
  }
  if (!centro) {
    return (
      <div className="shrink-0 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-[11.5px] text-gray-600 dark:text-gray-300">
        <Building2 size={14} className="text-gray-400 shrink-0" />
        Sin centro de costo: todos sus permisos son propios. Asígnale uno en Datos generales para que herede una plantilla.
      </div>
    );
  }
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-[11.5px] text-gray-600 dark:text-gray-300">
      <span className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-100">
        <Building2 size={14} className="text-[#2383C2] shrink-0" /> {centro}
      </span>
      <span className={conPlantilla ? '' : 'text-amber-700 dark:text-amber-400'}>
        {conPlantilla ? 'Hereda la plantilla de este centro y rol.' : 'Esta combinación no tiene permisos configurados: no otorga permisos.'}
      </span>
      {!conPlantilla && onConfigurarCentro && (
        <button type="button" onClick={onConfigurarCentro} className="font-semibold text-[#1d6fa5] dark:text-blue-300 hover:underline">
          Configurar en Permisos por centro
        </button>
      )}
      <span className="flex items-center gap-1.5" aria-label="Leyenda">
        <MarcaOrigen origen="heredado" /> <MarcaOrigen origen="agregado" /> <MarcaOrigen origen="quitado" />
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className={total ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-gray-400'}>
          {total ? `${total} personalizado(s): +${excepciones.agregados} / −${excepciones.quitados}` : 'Sin permisos personalizados'}
        </span>
        <button type="button" onClick={onRestablecer} disabled={!total}
          className="h-7 px-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-[11px] font-semibold inline-flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700">
          <RotateCcw size={12} /> Restablecer a la plantilla
        </button>
      </span>
    </div>
  );
};

export default BarraCentroCosto;
