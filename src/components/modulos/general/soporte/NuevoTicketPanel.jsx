import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, LifeBuoy, Loader2, Send, X } from 'lucide-react';
import PanelLateral from '../../maestros/codigosMaestrosV2/ui/PanelLateral';
import { useToast } from '../../../../context/ToastContext';
import {
  TIPOS_TICKET, PRIORIDADES_TICKET, MAX_CAPTURAS, MAX_TITULO, MAX_DESCRIPCION, validarTicketNuevo
} from './ticketsConfig';
import { crearTicket, validarCaptura, TIPOS_CAPTURA } from './ticketsServicio';

const CLASE_CONTROL = 'w-full px-3 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[13px] text-slate-800 dark:text-gray-100 outline-none focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15';

const Campo = ({ etiqueta, error, children, ayuda }) => (
  <label className="block">
    <span className="block mb-1 text-[12px] font-medium text-slate-700 dark:text-gray-300">{etiqueta}</span>
    {children}
    {error ? <span className="block mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</span>
      : ayuda ? <span className="block mt-1 text-[11px] text-slate-400">{ayuda}</span> : null}
  </label>
);

const FORM_VACIO = { tipo: 'ERROR', titulo: '', descripcion: '', prioridad: 'MEDIA', modulo: '' };

// Nuevo ticket. `modulos`: [{ id, label }] (mismo orden que el sidebar);
// `moduloInicial`: el de la pantalla donde estaba el usuario (editable).
const NuevoTicketPanel = ({ abierto, onCerrar, onCreado, userData, modulos, moduloInicial, vista }) => {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [capturas, setCapturas] = useState([]); // [{ archivo, url }]
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setForm({ ...FORM_VACIO, modulo: moduloInicial || modulos[0]?.id || 'GENERAL' });
    setCapturas((prev) => { prev.forEach((c) => URL.revokeObjectURL(c.url)); return []; });
    setIntento(false);
  }, [abierto, moduloInicial, modulos]);

  // Vistas previas de las capturas: se liberan al quitarlas, al reiniciar el
  // formulario y al desmontar.
  const capturasRef = useRef(capturas);
  capturasRef.current = capturas;
  useEffect(() => () => capturasRef.current.forEach((c) => URL.revokeObjectURL(c.url)), []);
  const quitarCaptura = (c) => { URL.revokeObjectURL(c.url); setCapturas((prev) => prev.filter((x) => x !== c)); };

  const errores = validarTicketNuevo({ ...form, capturas });
  const error = (campo) => (intento ? errores[campo] : undefined);
  const set = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));

  const agregarCapturas = (lista) => {
    const nuevas = [];
    for (const archivo of lista) {
      const problema = validarCaptura(archivo);
      if (problema) { showToast(problema, 'error'); continue; }
      if (capturas.length + nuevas.length >= MAX_CAPTURAS) { showToast(`Máximo ${MAX_CAPTURAS} capturas.`, 'error'); break; }
      nuevas.push({ archivo, url: URL.createObjectURL(archivo) });
    }
    if (nuevas.length) setCapturas((prev) => [...prev, ...nuevas]);
  };

  const enviar = async () => {
    setIntento(true);
    if (Object.keys(errores).length > 0 || enviando) return;
    setEnviando(true);
    try {
      const creado = await crearTicket({ form, capturas: capturas.map((c) => c.archivo), userData, vista });
      showToast(`Ticket creado`, 'success');
      onCreado?.(creado);
      onCerrar();
    } catch (e) {
      console.error('Error al crear el ticket:', e);
      showToast('No se pudo crear el ticket: ' + e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  const encabezado = (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400"><LifeBuoy size={12} /> Ayuda y soporte</div>
      <h3 className="mt-1.5 text-[17px] font-semibold text-slate-900 dark:text-gray-50">Nuevo ticket</h3>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">Reporta un error, pide una mejora o haz una consulta.</p>
    </div>
  );

  const pie = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onCerrar} disabled={enviando} className="h-8 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] font-medium text-slate-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">Cancelar</button>
      <button type="button" onClick={enviar} disabled={enviando} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#2383C2] hover:bg-[#1d6fa6] text-white text-[12px] font-medium disabled:opacity-50">
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar ticket
      </button>
    </div>
  );

  return (
    <PanelLateral abierto={abierto} onSolicitarCierre={() => !enviando && onCerrar()} encabezado={encabezado} pie={pie}>
      <div className="px-5 py-4 space-y-4">
        <Campo etiqueta="Tipo" error={error('tipo')}>
          <select value={form.tipo} onChange={set('tipo')} className={`${CLASE_CONTROL} h-9`}>
            {TIPOS_TICKET.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Título" error={error('titulo')}>
          <input value={form.titulo} onChange={set('titulo')} maxLength={MAX_TITULO} placeholder="Resumen breve" className={`${CLASE_CONTROL} h-9`} />
        </Campo>
        <Campo etiqueta="Descripción" error={error('descripcion')} ayuda="Qué pasó o qué necesitas, y los pasos para reproducirlo si es un error.">
          <textarea value={form.descripcion} onChange={set('descripcion')} maxLength={MAX_DESCRIPCION} rows={6} className={`${CLASE_CONTROL} py-2 resize-y`} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Prioridad" error={error('prioridad')}>
            <select value={form.prioridad} onChange={set('prioridad')} className={`${CLASE_CONTROL} h-9`}>
              {PRIORIDADES_TICKET.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Módulo relacionado" error={error('modulo')}>
            <select value={form.modulo} onChange={set('modulo')} className={`${CLASE_CONTROL} h-9`}>
              {modulos.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Campo>
        </div>

        <div>
          <span className="block mb-1 text-[12px] font-medium text-slate-700 dark:text-gray-300">Capturas de pantalla (opcional, hasta {MAX_CAPTURAS})</span>
          <input ref={inputRef} type="file" accept={TIPOS_CAPTURA.join(',')} multiple className="hidden"
            onChange={(e) => { agregarCapturas([...(e.target.files || [])]); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2">
            {capturas.map((c, i) => (
              <div key={c.url} className="relative w-20 h-20 rounded-md overflow-hidden border border-slate-200 dark:border-gray-700">
                <img src={c.url} alt={`Captura ${i + 1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => quitarCaptura(c)} title="Quitar captura"
                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-900/60 text-white hover:bg-slate-900/80"><X size={12} /></button>
              </div>
            ))}
            {capturas.length < MAX_CAPTURAS && (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="w-20 h-20 rounded-md border border-dashed border-slate-300 dark:border-gray-700 text-slate-400 hover:text-[#2383C2] hover:border-[#2383C2] flex flex-col items-center justify-center gap-1 text-[10px]">
                <ImagePlus size={18} /> Agregar
              </button>
            )}
          </div>
          <span className="block mt-1 text-[11px] text-slate-400">JPG, PNG o WebP. Se reducen y comprimen antes de subirlas.</span>
        </div>
        <p className="text-[11px] text-slate-400">Se adjunta automáticamente información técnica (pantalla, navegador y versión) para ayudar a resolverlo.</p>
      </div>
    </PanelLateral>
  );
};

export default NuevoTicketPanel;
