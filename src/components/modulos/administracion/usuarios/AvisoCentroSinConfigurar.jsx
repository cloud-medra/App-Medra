import { AlertTriangle, ArrowRight } from 'lucide-react';

// La combinación centro + rol elegida no tiene permisos configurados: el
// usuario no recibe permisos de ella. Enlace a Administración → Permisos
// por centro. `nombre`: "Centro – Rol".
const AvisoCentroSinConfigurar = ({ nombre, onConfigurar }) => (
  <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-secundario text-amber-900 dark:text-amber-200">
    <AlertTriangle size={14} className="shrink-0" />
    <span className="flex-1 min-w-0">
      <b>{nombre}</b> aún no tiene permisos configurados: el usuario no recibirá permisos de esta combinación.
    </span>
    {onConfigurar && (
      <button type="button" onClick={onConfigurar} className="inline-flex items-center gap-1 text-etiqueta text-[#1d6fa5] dark:text-blue-300 hover:underline">
        Configurar en Permisos por centro <ArrowRight size={12} />
      </button>
    )}
  </div>
);

export default AvisoCentroSinConfigurar;
