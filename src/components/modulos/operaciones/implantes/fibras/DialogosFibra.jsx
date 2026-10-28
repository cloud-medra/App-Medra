import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  USOS_PERMITIDOS, MAX_FIBRAS_POR_REGISTRO, validarNuevaFibra, validarEdicionFibra,
  usosConsumidosDe, usosRestantes, siguienteNumeroUso,
} from './fibrasNucleo';
import { leerCodigosFibra } from './useFibrasReutilizablesData';

// Formularios de Implantes → Fibras: registrar, corregir, pérdida y anular
// pérdida. Cada uno valida con fibrasNucleo.js antes de llamar a `onGuardar`,
// que devuelve true si se guardó (entonces se cierra).

const INPUT = 'h-8 w-full px-2 text-[11px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#2383C2] disabled:bg-slate-100 dark:disabled:bg-gray-800';

const Dialogo = ({ titulo, subtitulo, onCerrar, onGuardar, textoGuardar = 'Guardar', guardando, tono = 'primario', children }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, guardando]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!guardando) onGuardar(); }}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 text-[11px]"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-slate-800 dark:text-gray-100">{titulo}</h3>
            {subtitulo && <p className="text-[11px] text-slate-500 dark:text-gray-400">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-4 py-3 space-y-3">{children}</div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-8 px-3 rounded border border-slate-300 dark:border-gray-600 font-semibold text-slate-600 dark:text-gray-300">Cancelar</button>
          <button
            type="submit"
            disabled={guardando}
            className={`h-8 px-3 rounded text-white font-semibold flex items-center gap-1.5 disabled:opacity-60 ${tono === 'peligro' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#2383C2] hover:bg-[#1d6fa5]'}`}
          >
            {guardando && <Loader2 size={12} className="animate-spin" />} {textoGuardar}
          </button>
        </div>
      </form>
    </div>
  );
};

const Campo = ({ etiqueta, error, ayuda, children, htmlFor }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-[10px] font-bold uppercase text-slate-500 dark:text-gray-400">{etiqueta}</label>
    {children}
    {error ? <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>
      : ayuda ? <span className="text-[10px] text-slate-400 dark:text-gray-500">{ayuda}</span> : null}
  </div>
);

// Envuelve onGuardar con el estado "guardando" y cierra si resultó.
const useGuardar = (onGuardar, onCerrar) => {
  const [guardando, setGuardando] = useState(false);
  const guardar = async (...args) => {
    setGuardando(true);
    const ok = await onGuardar(...args);
    setGuardando(false);
    if (ok) onCerrar();
  };
  return [guardando, guardar];
};

export const RegistrarFibraDialogo = ({ onGuardar, onCerrar }) => {
  const [codigos, setCodigos] = useState(null);
  const [form, setForm] = useState({ codigoId: '', lote: '', vencimiento: '', usosTotales: '5', usosPrevios: '0', cantidad: '1' });
  const [intento, setIntento] = useState(false);
  const [guardando, guardar] = useGuardar(onGuardar, onCerrar);
  useEffect(() => {
    leerCodigosFibra().then(setCodigos).catch(() => setCodigos([]));
  }, []);
  const codigo = (codigos || []).find((c) => c.id === form.codigoId);
  const datos = {
    referencia: codigo?.referencia || '',
    codigo: codigo?.codigo || '',
    descriptor: codigo?.descriptorAuto || codigo?.descriptorEmpresa || '',
    lote: form.lote,
    vencimiento: form.vencimiento,
    usosTotales: Number(form.usosTotales),
    usosPrevios: form.usosPrevios === '' ? NaN : Number(form.usosPrevios),
    cantidad: Number(form.cantidad),
  };
  const errores = intento ? validarNuevaFibra(datos) : {};
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const enviar = () => {
    setIntento(true);
    if (Object.keys(validarNuevaFibra(datos)).length === 0) guardar(datos);
  };

  return (
    <Dialogo titulo="Registrar fibra(s)" subtitulo="Cada fibra física recibe su propio código interno (FIB-0001…)." onCerrar={onCerrar} onGuardar={enviar} textoGuardar="Registrar" guardando={guardando}>
      <Campo etiqueta="Referencia" error={errores.referencia} htmlFor="fib-ref"
        ayuda={codigos && codigos.length === 0 ? 'No hay códigos marcados como "Fibra reutilizable" en Códigos Maestros.' : undefined}>
        <select id="fib-ref" className={INPUT} value={form.codigoId} onChange={set('codigoId')} disabled={codigos === null}>
          <option value="">{codigos === null ? 'Cargando…' : 'Elige la referencia…'}</option>
          {(codigos || []).map((c) => <option key={c.id} value={c.id}>{c.referencia} · {c.descriptorAuto || c.descriptorEmpresa || c.codigo}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Lote" error={errores.lote} htmlFor="fib-lote">
          <input id="fib-lote" className={INPUT} value={form.lote} onChange={set('lote')} placeholder="Ej: A241544" />
        </Campo>
        <Campo etiqueta="Vencimiento" error={errores.vencimiento} htmlFor="fib-venc">
          <input id="fib-venc" type="date" className={INPUT} value={form.vencimiento} onChange={set('vencimiento')} />
        </Campo>
        <Campo etiqueta="Usos por fibra" error={errores.usosTotales} htmlFor="fib-usos">
          <select id="fib-usos" className={INPUT} value={form.usosTotales} onChange={set('usosTotales')}>
            {USOS_PERMITIDOS.map((n) => <option key={n} value={n}>{n} usos</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidades iguales" error={errores.cantidad} htmlFor="fib-cant" ayuda={`Crea una fibra por unidad (máx. ${MAX_FIBRAS_POR_REGISTRO}).`}>
          <input id="fib-cant" type="number" min="1" max={MAX_FIBRAS_POR_REGISTRO} className={INPUT} value={form.cantidad} onChange={set('cantidad')} />
        </Campo>
      </div>
      <Campo etiqueta="Usos previos" error={errores.usosPrevios} htmlFor="fib-prev"
        ayuda="Usos ya consumidos antes de registrarla aquí (quedan sin detalle). 0 si es nueva.">
        <input id="fib-prev" type="number" min="0" className={INPUT} value={form.usosPrevios} onChange={set('usosPrevios')} />
      </Campo>
    </Dialogo>
  );
};

export const EditarFibraDialogo = ({ fibra, onGuardar, onCerrar }) => {
  const [form, setForm] = useState({ lote: fibra.lote, vencimiento: fibra.vencimiento, usosTotales: String(fibra.usosTotales), motivo: '' });
  const [intento, setIntento] = useState(false);
  const [guardando, guardar] = useGuardar(onGuardar, onCerrar);
  const conUsos = (fibra.numerosOcupados || []).length > 0;
  const valores = { ...form, usosTotales: Number(form.usosTotales) };
  const { errores } = validarEdicionFibra(fibra, valores);
  const erroresVisibles = intento ? errores : {};
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const enviar = () => {
    setIntento(true);
    if (Object.keys(errores).length > 0) return;
    if (!form.motivo.trim()) return;
    guardar(valores);
  };
  return (
    <Dialogo titulo={`Corregir ${fibra.codigoInterno}`} subtitulo={`${fibra.referencia} · ${usosConsumidosDe(fibra)} uso(s) consumido(s)`} onCerrar={onCerrar} onGuardar={enviar} guardando={guardando}>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Lote" error={erroresVisibles.lote} htmlFor="fe-lote" ayuda={conUsos ? 'Con usos registrados no se puede cambiar.' : undefined}>
          <input id="fe-lote" className={INPUT} value={form.lote} onChange={set('lote')} disabled={conUsos} />
        </Campo>
        <Campo etiqueta="Vencimiento" error={erroresVisibles.vencimiento} htmlFor="fe-venc" ayuda={conUsos ? 'Con usos registrados no se puede cambiar.' : undefined}>
          <input id="fe-venc" type="date" className={INPUT} value={form.vencimiento} onChange={set('vencimiento')} disabled={conUsos} />
        </Campo>
      </div>
      <Campo etiqueta="Usos totales" error={erroresVisibles.usosTotales} htmlFor="fe-usos" ayuda="No puede quedar por debajo de los usos consumidos.">
        <select id="fe-usos" className={INPUT} value={form.usosTotales} onChange={set('usosTotales')}>
          {USOS_PERMITIDOS.map((n) => <option key={n} value={n}>{n} usos</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Motivo de la corrección" error={intento && !form.motivo.trim() ? 'Ingresa el motivo' : undefined} htmlFor="fe-motivo" ayuda="Queda en el historial de la fibra.">
        <input id="fe-motivo" className={INPUT} value={form.motivo} onChange={set('motivo')} placeholder="Ej: se registró de 5 y era de 10" />
      </Campo>
    </Dialogo>
  );
};

export const PerdidaDialogo = ({ fibra, onGuardar, onCerrar }) => {
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, guardar] = useGuardar(onGuardar, onCerrar);
  const numero = siguienteNumeroUso(fibra);
  const ultimo = usosRestantes(fibra) === 1;
  return (
    <Dialogo
      titulo={`Registrar pérdida · ${fibra.codigoInterno}`}
      subtitulo={`Lote ${fibra.lote}: descuenta un uso igual que uno normal.`}
      onCerrar={onCerrar}
      onGuardar={() => { setIntento(true); if (motivo.trim()) guardar(motivo.trim()); }}
      textoGuardar="Registrar pérdida"
      tono="peligro"
      guardando={guardando}
    >
      <p className={`text-[11px] font-semibold ${ultimo ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-gray-300'}`}>
        Se registrará como uso {numero}/{fibra.usosTotales}{ultimo ? ': es el último, la fibra quedará agotada.' : `; quedarán ${usosRestantes(fibra) - 1}.`}
      </p>
      <Campo etiqueta="Motivo" error={intento && !motivo.trim() ? 'Ingresa el motivo' : undefined} htmlFor="fp-motivo">
        <input id="fp-motivo" autoFocus className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se dañó al conectarla" />
      </Campo>
    </Dialogo>
  );
};

export const AnularPerdidaDialogo = ({ fibra, uso, onGuardar, onCerrar }) => {
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, guardar] = useGuardar(onGuardar, onCerrar);
  return (
    <Dialogo
      titulo={`Anular pérdida ${uso.numeroUso}/${uso.usosTotales}`}
      subtitulo={`${fibra.codigoInterno} · lote ${fibra.lote}: el uso vuelve a quedar disponible.`}
      onCerrar={onCerrar}
      onGuardar={() => { setIntento(true); if (motivo.trim()) guardar(motivo.trim()); }}
      textoGuardar="Anular pérdida"
      tono="peligro"
      guardando={guardando}
    >
      <p className="text-[11px] text-slate-600 dark:text-gray-300">Pérdida registrada: {uso.motivo}</p>
      <Campo etiqueta="Motivo de la anulación" error={intento && !motivo.trim() ? 'Ingresa el motivo' : undefined} htmlFor="fa-motivo">
        <input id="fa-motivo" autoFocus className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se registró por error" />
      </Campo>
    </Dialogo>
  );
};
