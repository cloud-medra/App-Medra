import { useRef, useState } from 'react';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import Spinner from '../../../ui/Spinner';
import { MODULOS, MESES } from './constants';
import { validarCierreMes } from './validarCierreMes';

// Cierre de período en 4 pasos, para que no se pueda cerrar un mes por
// error: 1) confirmar, 2) escribir a mano año y mes, 3) procesando,
// 4) resultado. Se monta con un `key` por solicitud desde ControlMensual,
// así cada cierre empieza desde el paso 1 con los campos vacíos.
const PASO = { CONFIRMAR: 'confirmar', ESCRIBIR: 'escribir', PROCESANDO: 'procesando', EXITO: 'exito', ERROR: 'error' };

const claseInput = 'w-full p-1.5 border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 text-[12px] font-num outline-none focus:border-[#2383C2] disabled:opacity-50';
const claseBtnSecundario = 'px-3 py-1 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 rounded text-[10px] font-bold hover:bg-slate-300 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const claseBtnPrimario = 'px-3 py-1 bg-[#2383C2] hover:bg-blue-600 text-white rounded text-[10px] font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const ModalCierreMes = ({ solicitud, anio, onCancelar, onConfirmar }) => {
  const [paso, setPaso] = useState(PASO.CONFIRMAR);
  const [anioIngresado, setAnioIngresado] = useState('');
  const [mesIngresado, setMesIngresado] = useState('');
  const [error, setError] = useState('');
  const [mensajeResultado, setMensajeResultado] = useState('');
  // Bloqueo síncrono contra doble clic/doble envío: el estado `paso` no
  // alcanza a actualizarse entre dos clics seguidos, el ref sí.
  const enviandoRef = useRef(false);

  if (!solicitud) return null;

  const nombreMes = MESES.find(m => m.id === solicitud.mesId)?.nombre || solicitud.mesId;
  const periodoTexto = `${nombreMes} ${anio}`;
  const nombresModulos = solicitud.modulos.map(id => MODULOS.find(m => m.id === id)?.nombre || id).join(', ');
  const procesando = paso === PASO.PROCESANDO;
  const camposCompletos = anioIngresado.trim() !== '' && mesIngresado.trim() !== '';

  const confirmarCierre = async (e) => {
    e.preventDefault();
    if (!camposCompletos || enviandoRef.current) return;

    const validacion = validarCierreMes({ anio, mesId: solicitud.mesId, anioIngresado, mesIngresado });
    if (!validacion.ok) {
      setError(validacion.mensaje);
      return;
    }

    enviandoRef.current = true;
    setError('');
    setPaso(PASO.PROCESANDO);
    const resultado = await onConfirmar({ anioIngresado: anioIngresado.trim(), mesIngresado: mesIngresado.trim() });
    enviandoRef.current = false;
    setMensajeResultado(resultado.mensaje);
    setPaso(resultado.ok ? PASO.EXITO : PASO.ERROR);
  };

  const soloDigitos = (valor) => valor.replace(/\D/g, '');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !procesando) onCancelar(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cierre-mes"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-md p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-[#2383C2] border-b border-slate-200 dark:border-gray-700 pb-2">
          <Lock size={18} />
          <h3 id="titulo-cierre-mes" className="text-[13px] font-bold uppercase">Cerrar Período de Imputación</h3>
        </div>

        {paso === PASO.CONFIRMAR && (
          <>
            <p className="text-[12px] text-slate-700 dark:text-gray-200 font-semibold">
              ¿Deseas cerrar el mes de {periodoTexto}?
            </p>
            <p className="text-[11px] text-slate-600 dark:text-gray-300">
              Módulo(s): <strong>{nombresModulos}</strong>. Una vez cerrado, no se podrán ingresar ni modificar documentos en el período.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-gray-700">
              <button type="button" onClick={onCancelar} className={claseBtnSecundario}>Cancelar</button>
              <button type="button" onClick={() => setPaso(PASO.ESCRIBIR)} className={claseBtnPrimario}>Sí, continuar</button>
            </div>
          </>
        )}

        {(paso === PASO.ESCRIBIR || procesando) && (
          <form onSubmit={confirmarCierre} autoComplete="off" className="space-y-3">
            <p className="text-[11px] text-slate-600 dark:text-gray-300">
              Para confirmar, escribe el año y el mes (número) del período que vas a cerrar.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 space-y-1">
                <span>Año</span>
                <input
                  type="text"
                  name="confirmacion-cierre-anio"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="AAAA"
                  value={anioIngresado}
                  onChange={(e) => { setAnioIngresado(soloDigitos(e.target.value)); setError(''); }}
                  disabled={procesando}
                  className={claseInput}
                />
              </label>
              <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 space-y-1">
                <span>Mes</span>
                <input
                  type="text"
                  name="confirmacion-cierre-mes"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  placeholder="MM"
                  value={mesIngresado}
                  onChange={(e) => { setMesIngresado(soloDigitos(e.target.value)); setError(''); }}
                  disabled={procesando}
                  className={claseInput}
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                <AlertCircle size={13} className="shrink-0 mt-px" /> {error}
              </p>
            )}

            {procesando && (
              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-gray-300">
                <Spinner size="sm" />
                <span>Cerrando mes {periodoTexto}...</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-gray-700">
              <button type="button" onClick={onCancelar} disabled={procesando} className={claseBtnSecundario}>Cancelar</button>
              <button type="submit" disabled={!camposCompletos || procesando} className={claseBtnPrimario}>Confirmar cierre</button>
            </div>
          </form>
        )}

        {(paso === PASO.EXITO || paso === PASO.ERROR) && (
          <>
            <p
              role={paso === PASO.ERROR ? 'alert' : 'status'}
              className={`flex items-start gap-1.5 text-[12px] font-semibold ${paso === PASO.EXITO ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {paso === PASO.EXITO ? <CheckCircle size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
              {mensajeResultado}
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-gray-700">
              <button type="button" onClick={onCancelar} className={claseBtnSecundario}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModalCierreMes;
