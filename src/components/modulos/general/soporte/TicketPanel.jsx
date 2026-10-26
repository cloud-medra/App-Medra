import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Image as ImageIcon, Info, Loader2, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import PanelLateral from '../../maestros/codigosMaestrosV2/ui/PanelLateral';
import { useToast } from '../../../../context/ToastContext';
import { BadgeEstadoTicket, BadgePrioridadTicket, TipoTicket } from './BadgesTicket';
import {
  ESTADOS_TICKET, MAX_MENSAJE, codigoTicket, etiquetaEstado, formatearFechaTicket, respuesta, cambioDeEstado
} from './ticketsConfig';
import { actualizarTicket } from './ticketsServicio';

const Dato = ({ etiqueta, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] text-slate-400 dark:text-gray-500">{etiqueta}</dt>
    <dd className="text-[12px] text-slate-700 dark:text-gray-200 truncate">{children}</dd>
  </div>
);

// Detalle de un ticket con su conversación. Usa el ticket ya cargado en el
// listado (la conversación viene en el mismo documento: 0 lecturas extra).
// modo 'usuario': responde y marca como visto. modo 'gestor': además ve el
// contexto técnico, cambia el estado o rechaza (motivo obligatorio).
const TicketPanel = ({ abierto, ticket, modo = 'usuario', userData, etiquetaModulo = (m) => m, onCerrar, onActualizado }) => {
  const { showToast } = useToast();
  const esGestor = modo === 'gestor';
  const [texto, setTexto] = useState('');
  const [estadoNuevo, setEstadoNuevo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const finRef = useRef(null);

  // Al abrirlo: quita la marca de novedad del lado que lo abre (sin tocar
  // la fecha de actualización del ticket).
  useEffect(() => {
    if (!abierto || !ticket?.id) return;
    setTexto('');
    setEstadoNuevo('');
    setMotivo('');
    const marca = esGestor ? 'pendienteGestor' : 'noLeidoUsuario';
    if (ticket[marca]) {
      actualizarTicket(ticket.id, { [marca]: false }, { tocarFecha: false })
        .then(() => onActualizado?.({ ...ticket, [marca]: false }))
        .catch((e) => console.error('No se pudo marcar el ticket como visto:', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, ticket?.id]);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView?.({ block: 'end' });
  }, [abierto, ticket?.mensajes?.length]);

  if (!ticket) return null;

  const aplicar = async (resultado, exito) => {
    if (resultado.error) { showToast(resultado.error, 'error'); return false; }
    setGuardando(true);
    try {
      await actualizarTicket(ticket.id, resultado.cambios);
      onActualizado?.({ ...ticket, ...resultado.cambios, actualizadoEl: new Date() });
      showToast(exito, 'success');
      return true;
    } catch (e) {
      console.error('Error al actualizar el ticket:', e);
      showToast('No se pudo guardar: ' + e.message, 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const responder = async () => {
    if (await aplicar(respuesta(ticket, texto, { autor: userData, deGestor: esGestor }), 'Respuesta enviada')) setTexto('');
  };

  const cambiarEstado = async () => {
    const r = cambioDeEstado(ticket, estadoNuevo, { autor: userData, motivo });
    if (await aplicar(r, `Estado cambiado a ${etiquetaEstado(estadoNuevo)}`)) {
      setEstadoNuevo('');
      setMotivo('');
    }
  };

  const encabezado = (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span className="font-mono">{codigoTicket(ticket.numero)}</span>
        <BadgeEstadoTicket estado={ticket.estado} />
      </div>
      <h3 className="mt-1.5 text-[16px] font-semibold text-slate-900 dark:text-gray-50 break-words">{ticket.titulo}</h3>
    </div>
  );

  const mensajes = ticket.mensajes || [];

  return (
    <PanelLateral abierto={abierto} onSolicitarCierre={() => !guardando && onCerrar()} encabezado={encabezado} ancho="max-w-[560px]"
      pie={(
        <div className="space-y-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={MAX_MENSAJE} rows={2}
            placeholder={esGestor ? 'Responder al usuario…' : 'Escribe una respuesta…'}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') responder(); }}
            className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[13px] text-slate-800 dark:text-gray-100 outline-none focus:border-[#2383C2] resize-none" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Ctrl+Enter para enviar</span>
            <button type="button" onClick={responder} disabled={guardando || !texto.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#2383C2] hover:bg-[#1d6fa6] text-white text-[12px] font-medium disabled:opacity-50">
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Responder
            </button>
          </div>
        </div>
      )}
    >
      <div className="px-5 py-4 space-y-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Dato etiqueta="Tipo"><TipoTicket tipo={ticket.tipo} corto={false} /></Dato>
          <Dato etiqueta="Prioridad"><BadgePrioridadTicket prioridad={ticket.prioridad} /></Dato>
          <Dato etiqueta="Módulo">{etiquetaModulo(ticket.modulo)}</Dato>
          <Dato etiqueta="Creado">{formatearFechaTicket(ticket.creadoEl)}</Dato>
          <Dato etiqueta="Actualizado">{formatearFechaTicket(ticket.actualizadoEl)}</Dato>
          {esGestor && <Dato etiqueta="Usuario">{ticket.creadoPorNombre}</Dato>}
        </dl>

        <section className="rounded-lg border border-slate-200 dark:border-gray-700 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Descripción</h4>
          <p className="text-[13px] text-slate-700 dark:text-gray-200 whitespace-pre-wrap break-words">{ticket.descripcion}</p>
          {(ticket.capturas || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {ticket.capturas.map((c, i) => (
                <a key={c.ruta || i} href={c.url} target="_blank" rel="noopener noreferrer" title={`Abrir ${c.nombre || `captura ${i + 1}`}`}
                  className="block w-24 h-16 rounded-md overflow-hidden border border-slate-200 dark:border-gray-700 hover:ring-2 hover:ring-[#2383C2]">
                  <img src={c.url} alt={c.nombre || `Captura ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {(ticket.capturas || []).length === 0 && <p className="mt-2 text-[11px] text-slate-400 flex items-center gap-1"><ImageIcon size={11} /> Sin capturas</p>}
        </section>

        {esGestor && ticket.contexto && (
          <details className="rounded-lg border border-slate-200 dark:border-gray-700 p-3 text-[12px]">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Info size={12} /> Contexto técnico</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600 dark:text-gray-300">
              <dt className="text-slate-400">Pantalla</dt><dd className="break-all">{ticket.contexto.vista || '—'}</dd>
              <dt className="text-slate-400">URL</dt><dd className="break-all">{ticket.contexto.url || '—'}</dd>
              <dt className="text-slate-400">Navegador</dt><dd className="break-all">{ticket.contexto.navegador || '—'}</dd>
              <dt className="text-slate-400">Pantalla (px)</dt><dd>{ticket.contexto.pantalla || '—'}</dd>
              <dt className="text-slate-400">Versión</dt><dd>{ticket.contexto.versionApp || '—'}</dd>
              <dt className="text-slate-400">Fecha y hora</dt><dd>{formatearFechaTicket(ticket.contexto.fechaCliente)}</dd>
              <dt className="text-slate-400">Correo</dt><dd className="break-all">{ticket.creadoPorEmail || '—'}</dd>
            </dl>
          </details>
        )}

        {esGestor && (
          <section className="rounded-lg border border-slate-200 dark:border-gray-700 p-3 space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1"><ShieldCheck size={12} /> Cambiar estado</h4>
            <div className="flex flex-wrap items-center gap-2">
              <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)} aria-label="Nuevo estado"
                className="h-8 px-2 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[12px]">
                <option value="">Elegir estado…</option>
                {ESTADOS_TICKET.filter((e) => e.id !== ticket.estado).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              <button type="button" onClick={cambiarEstado} disabled={!estadoNuevo || guardando}
                className={`h-8 px-3 rounded-md text-[12px] font-medium text-white disabled:opacity-50 ${estadoNuevo === 'RECHAZADO' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-800'}`}>
                {estadoNuevo === 'RECHAZADO' ? 'Rechazar' : 'Aplicar'}
              </button>
            </div>
            {estadoNuevo && (
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={MAX_MENSAJE}
                aria-label={estadoNuevo === 'RECHAZADO' ? 'Motivo del rechazo' : 'Comentario'}
                placeholder={estadoNuevo === 'RECHAZADO' ? 'Motivo del rechazo (obligatorio)' : 'Comentario para el usuario (opcional)'}
                className={`w-full px-3 py-2 rounded-md border bg-white dark:bg-gray-950 text-[12px] outline-none resize-none ${estadoNuevo === 'RECHAZADO' && !motivo.trim() ? 'border-red-300' : 'border-slate-300 dark:border-gray-700'}`} />
            )}
          </section>
        )}

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1"><MessageSquare size={12} /> Conversación</h4>
          {mensajes.length === 0 && <p className="text-[12px] text-slate-400">Aún no hay respuestas.</p>}
          <ol className="space-y-2">
            {mensajes.map((m) => (m.tipo === 'estado' ? (
              <li key={m.id} className="text-[11px] text-slate-500 dark:text-gray-400 flex flex-wrap items-center gap-1 px-1">
                <strong className="font-medium text-slate-700 dark:text-gray-200">{m.autorNombre}</strong> cambió el estado
                <BadgeEstadoTicket estado={m.estadoAnterior} /> <ArrowRight size={11} /> <BadgeEstadoTicket estado={m.estadoNuevo} />
                <span className="text-slate-400">· {formatearFechaTicket(m.fecha)}</span>
                {m.texto && <p className="basis-full mt-0.5 text-slate-600 dark:text-gray-300 whitespace-pre-wrap">{m.estadoNuevo === 'RECHAZADO' ? 'Motivo: ' : ''}{m.texto}</p>}
              </li>
            ) : (
              <li key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 ${m.deGestor ? 'bg-[#2383C2]/[0.07] dark:bg-[#2383C2]/15 border border-[#2383C2]/20' : 'ml-auto bg-slate-100 dark:bg-gray-800'}`}>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
                  <strong className="font-medium text-slate-700 dark:text-gray-200">{m.autorNombre}</strong>
                  {m.deGestor && <span className="text-[10px] text-[#2383C2]">Soporte</span>}
                  <span className="ml-auto">{formatearFechaTicket(m.fecha)}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-slate-700 dark:text-gray-100 whitespace-pre-wrap break-words">{m.texto}</p>
              </li>
            )))}
          </ol>
          <div ref={finRef} />
        </section>
      </div>
    </PanelLateral>
  );
};

export default TicketPanel;
