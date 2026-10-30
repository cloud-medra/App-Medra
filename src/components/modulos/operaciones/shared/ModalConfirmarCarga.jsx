// Confirmación de "Marcar todos como Cargado" en Cargas, compartida por
// Implantes y Hemodinamia: cada CotizacionCard pasa su cantidad, su
// contexto (cotización, empresa, fecha) y su propia función de confirmar.
//
// Mismo lenguaje visual que ui/ModalConfirm (ícono en círculo, primario
// #2383C2), pero aparte porque aquella siempre cierra al confirmar y no
// admite un estado de carga. `onConfirmar` puede ser síncrona (hoy lo es:
// solo cambia el estado local, la escritura es en "Guardar Todo") o
// devolver una promesa: mientras no termina, los botones quedan
// deshabilitados y el modal no se cierra.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, Loader2, Info } from 'lucide-react';

const BOTON = 'h-10 md:h-8 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed';

const ModalConfirmarCarga = ({
  abierto,
  onCerrar,
  onConfirmar,
  cantidad,
  detalles = [],
  notaExclusiones,
  nota = 'Este paso aún no guarda: los cambios se guardan al presionar Guardar Todo.'
}) => {
  const [procesando, setProcesando] = useState(false);
  // El ref evita el doble clic antes de que React vuelva a renderizar.
  const enCurso = useRef(false);
  const botonCancelar = useRef(null);
  const idTitulo = useId();
  const idDescripcion = useId();

  // Foco inicial en Cancelar (acción masiva: Enter no confirma por
  // accidente) y, al cerrar, de vuelta a donde estaba.
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement;
    botonCancelar.current?.focus();
    return () => anterior?.focus?.();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e) => {
      if (e.key === 'Escape' && !enCurso.current) onCerrar();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const cerrar = () => {
    if (!enCurso.current) onCerrar();
  };

  const confirmar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setProcesando(true);
    try {
      await onConfirmar();
    } catch (err) {
      // El modal queda abierto para reintentar o cancelar; avisar el error
      // es tarea de quien confirma.
      console.error('Error al confirmar la carga:', err);
    } finally {
      enCurso.current = false;
      setProcesando(false);
    }
  };

  const detallesVisibles = detalles.filter((d) => d.valor);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm entrada-fondo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescripcion}
        className="w-full max-w-md max-h-full overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 entrada-dialogo"
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-[#2383C2]">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0 flex-grow pt-0.5">
            <h3 id={idTitulo} className="text-[13px] font-bold text-gray-800 dark:text-gray-100">Confirmar carga</h3>
            <p id={idDescripcion} className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Marca como "Cargado" los ítems pendientes de esta cotización.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={procesando}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 p-2 md:p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="px-3 py-2.5 flex items-baseline gap-2 bg-slate-50 dark:bg-gray-900/40">
              <span className="text-[20px] leading-none font-bold font-num text-[#2383C2]">{cantidad.toLocaleString('es-CL')}</span>
              <span className="text-[11px] text-gray-600 dark:text-gray-300">
                {cantidad === 1 ? 'ítem se marcará' : 'ítems se marcarán'} como Cargado
              </span>
            </div>
            {detallesVisibles.length > 0 && (
              <dl className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-slate-200 dark:border-gray-700 text-[11px]">
                {detallesVisibles.map(({ etiqueta, valor }) => (
                  <div key={etiqueta} className="contents">
                    <dt className="text-gray-500 dark:text-gray-400">{etiqueta}</dt>
                    <dd className="font-semibold text-gray-800 dark:text-gray-100 truncate" title={String(valor)}>{valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="space-y-1 text-[10.5px] text-gray-500 dark:text-gray-400">
            {notaExclusiones && (
              <p className="flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-px" />
                <span>No se modifican: {notaExclusiones}.</span>
              </p>
            )}
            {nota && (
              <p className="flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-px" />
                <span>{nota}</span>
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={botonCancelar}
            type="button"
            onClick={cerrar}
            disabled={procesando}
            className={`${BOTON} border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={procesando}
            className={`${BOTON} bg-[#2383C2] hover:bg-[#1d6fa5] text-white shadow-sm`}
          >
            {procesando
              ? <><Loader2 size={13} className="animate-spin" /> Procesando...</>
              : <><CheckCircle2 size={13} /> Confirmar carga</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModalConfirmarCarga;
