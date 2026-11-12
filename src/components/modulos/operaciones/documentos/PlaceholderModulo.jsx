import { Construction } from 'lucide-react';

// Plantilla compartida para secciones del módulo Documentos que ya tienen
// ruta/ítem de menú propios pero cuya funcionalidad todavía no se implementa
// (mismo criterio usado para AvanceInventario.jsx en el Dashboard: se deja
// la navegación lista y un "Próximamente" visual, sin lógica de datos).
const PlaceholderModulo = ({ titulo, descripcion, Icon }) => (
  <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden text-[11px]">
    <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
      {Icon && <Icon size={16} className="text-[#2383C2]" />}
      <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
        {titulo}
      </span>
    </header>

    <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center px-6">
      <Construction size={28} className="text-slate-300 dark:text-gray-600" />
      <span className="text-[11px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wide">Próximamente</span>
      {descripcion && (
        <span className="text-[10.5px] text-slate-400 dark:text-gray-500 max-w-md">{descripcion}</span>
      )}
    </div>
  </div>
);

export default PlaceholderModulo;
