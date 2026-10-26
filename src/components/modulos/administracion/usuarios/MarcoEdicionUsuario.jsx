import { ArrowLeft, AlertTriangle, Loader2, Save, X } from 'lucide-react';
import AvatarUsuario from '../../../ui/AvatarUsuario';

// Marco de pantalla completa para Crear Usuario y Editar usuario (mismo
// patrón que las vistas de detalle del sistema: reemplaza al listado dentro
// del área de contenido). Encabezado fijo con la identidad del usuario, el
// aviso de cambios sin guardar y las acciones; pestañas debajo; el contenido
// ocupa el resto de la altura y hace su propio scroll.

export const Chip = ({ tono = 'gris', icon: Icon, children }) => {
  const tonos = {
    gris: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    azul: 'bg-[#2383C2]/10 dark:bg-blue-950/40 text-[#2383C2] dark:text-blue-400',
    verde: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    rojo: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    ambar: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${tonos[tono]}`}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
};

const MarcoEdicionUsuario = ({
  migas,
  nombre,
  // Foto de perfil del usuario (si tiene), del documento ya cargado.
  fotoUrl,
  detalle,
  chips,
  hayCambios,
  guardando,
  onVolver,
  onCancelar,
  onGuardar,
  textoGuardar = 'Guardar cambios',
  puedeGuardar = true,
  accionesExtra,
  tabs,
  tabActiva,
  onTab,
  children,
}) => (
  <div className="h-full min-h-[560px] flex flex-col bg-slate-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    {/* Encabezado fijo */}
    <header className="shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 px-5 pt-3 text-[11px] text-gray-400 dark:text-gray-500">
        {onVolver && (
        <button
          type="button"
          onClick={onVolver}
          className="p-1 -ml-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          title="Volver"
          aria-label="Volver"
        >
          <ArrowLeft size={14} />
        </button>
        )}
        {migas}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <AvatarUsuario nombre={nombre} fotoUrl={fotoUrl} className="w-11 h-11 bg-[#2383C2]/10 text-[#2383C2] text-[14px] font-bold" />
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-gray-900 dark:text-gray-50 truncate">{nombre || 'Nuevo usuario'}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {detalle && <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{detalle}</span>}
              {chips}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {hayCambios && (
            <span role="status" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-2.5 py-1 rounded-md">
              <AlertTriangle size={13} /> Tienes cambios sin guardar
            </span>
          )}
          {accionesExtra}
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              disabled={guardando}
              className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          {onGuardar && (
            <button
              type="button"
              onClick={onGuardar}
              disabled={guardando || !puedeGuardar}
              className="h-8 px-4 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {guardando ? 'Guardando…' : textoGuardar}
            </button>
          )}
        </div>
      </div>
      {/* Pestañas */}
      <nav className="flex gap-1 px-5" role="tablist">
        {tabs.map((t) => {
          const activa = t.id === tabActiva;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activa}
              disabled={t.deshabilitada}
              title={t.deshabilitada ? t.motivo : undefined}
              onClick={() => onTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                activa
                  ? 'border-[#2383C2] text-[#2383C2] dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.icon && <t.icon size={14} />}
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </nav>
    </header>

    <div className="flex-1 min-h-0 overflow-hidden p-5">{children}</div>
  </div>
);

// Confirmación al salir con cambios sin guardar (mismo diálogo que las
// vistas de detalle del sistema).
export const ConfirmarSalida = ({ abierto, guardando, onGuardarYSalir, onSalir, onSeguir }) => {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-salida">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/20">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <h3 id="titulo-confirmar-salida" className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">Cambios sin guardar</h3>
          <button type="button" onClick={onSeguir} aria-label="Cerrar" className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
            <X size={15} />
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12px] text-gray-600 dark:text-gray-300">
            Tienes cambios en este usuario que no se han guardado. ¿Qué deseas hacer antes de salir?
          </p>
        </div>
        <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
          {onGuardarYSalir && (
            <button
              type="button"
              onClick={onGuardarYSalir}
              disabled={guardando}
              className="w-full h-8 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded-md font-semibold flex items-center justify-center gap-1.5 transition text-[12px] disabled:opacity-60"
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar y salir
            </button>
          )}
          <button type="button" onClick={onSalir} className="w-full h-8 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-md font-semibold transition text-[12px]">
            Salir sin guardar
          </button>
          <button type="button" onClick={onSeguir} className="w-full h-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition text-[12px]">
            Seguir editando
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarcoEdicionUsuario;
