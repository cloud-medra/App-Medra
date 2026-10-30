import { useRef, useState } from 'react';
import { ArrowLeft, Save, AlertTriangle, X } from 'lucide-react';
import Spinner from '../../../ui/Spinner';

// Detalle de un registro de origen IMPLANTES: GestionesImplantesDetalleView
// (Detalles/Información/Cargas/Logs) no trae su propio encabezado de
// "Volver / Guardar Todo" — en GestionImplantes.jsx ese encabezado vive en
// el contenedor padre. Acá se replica esa misma cáscara para que el
// comportamiento sea idéntico al de Implantes.
//
// El hook de gestiones se llama en modo detalle ({ admision }): escucha en
// vivo solo las gestiones de la admisión abierta (lo que usa la vista de
// detalle para agrupar las cotizaciones y para guardar), en vez de la
// ventana de 150 gestiones del listado. Hemodinamia comparte la misma
// cáscara (mismo contrato de hook y de vista), por eso el componente recibe
// hook/vista/título por props.
const DetalleGestionConHeader = ({ fila, onVolver, useGestiones, DetalleView, titulo, formatearFechaFn, onAbrirZonasDiagnostico }) => {
  const raw = fila._raw || {};
  const admision = String(raw.gestionId ?? raw.agendaId ?? '').trim();
  const admisionPendiente = ['', 'P', 'SIN_ADMISION'].includes(admision.toUpperCase());
  const implantesHook = useGestiones(
    admisionPendiente ? { refPath: fila.refPath } : { admision }
  );
  const detalleRef = useRef(null);
  const [showConfirmSalir, setShowConfirmSalir] = useState(false);

  const handleGuardarDetalle = async (datosActualizados) => {
    const resultado = await implantesHook.guardarDesdeDetalle(datosActualizados);
    // Fibra agotada o vencida (Implantes): no se guardó, sigue abierto.
    if (resultado?.mantenerAbierto) return;
    onVolver();
  };

  const handleIntentarVolver = () => {
    if (detalleRef.current?.hayCambiosSinGuardar?.()) {
      setShowConfirmSalir(true);
    } else {
      onVolver();
    }
  };

  const itemActual = implantesHook.implantes.find(i => i.refPath === fila.refPath) || fila._raw;
  // Abierto solo con la ruta (p. ej. desde Reporte Info): se espera a que
  // el listener traiga la gestión.
  const esperando = !itemActual;

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {implantesHook.cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Procesando...</h3>
          </div>
        </div>
      )}

      {showConfirmSalir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm max-h-full overflow-y-auto rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/20">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Cambios sin guardar</h3>
              <button onClick={() => setShowConfirmSalir(false)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <X size={15} />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-gray-600 dark:text-gray-300">Tienes modificaciones que no se han guardado. ¿Qué deseas hacer antes de salir?</p>
            </div>
            <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
              <button
                onClick={() => { setShowConfirmSalir(false); detalleRef.current?.guardarTodo(); }}
                className="w-full h-10 md:h-8 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center justify-center gap-1.5 transition text-[11px]"
              >
                <Save size={13} /> Guardar y salir
              </button>
              <button
                onClick={() => { setShowConfirmSalir(false); onVolver(); }}
                className="w-full h-10 md:h-8 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded font-semibold transition text-[11px]"
              >
                Salir sin guardar
              </button>
              <button
                onClick={() => setShowConfirmSalir(false)}
                className="w-full h-10 md:h-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition text-[11px]"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={handleIntentarVolver}
          className="p-1.5 md:p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition shadow-xs"
          title="Volver al listado"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-400">
          {titulo}
        </span>
        <button
          onClick={() => detalleRef.current?.guardarTodo()}
          className="ml-auto h-9 md:h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[11px] shadow-xs active:scale-[0.98]"
        >
          <Save size={13} /> Guardar Todo
        </button>
      </div>

      {esperando ? (
        <div className="flex-grow flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
          <Spinner size="sm" color="#2383C2" /> Cargando gestión…
        </div>
      ) : (
      <DetalleView
        ref={detalleRef}
        item={itemActual}
        todosLosRegistros={implantesHook.implantes}
        onGuardar={handleGuardarDetalle}
        onAgregarEmpresaFecha={implantesHook.agregarEmpresaFechaDesdeDetalle}
        onCancelar={handleIntentarVolver}
        logsList={implantesHook.logsList}
        loadingLogs={implantesHook.loadingLogs}
        cargarLogsDeImplante={implantesHook.cargarLogsDeImplante}
        formatearFecha={formatearFechaFn}
        handleCopiarTexto={implantesHook.handleCopiarTexto}
        onAbrirZonasDiagnostico={onAbrirZonasDiagnostico}
      />
      )}
    </div>
  );
};

export default DetalleGestionConHeader;
