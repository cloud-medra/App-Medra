import React from 'react';
import { AlertOctagon, Lightbulb, HelpCircle } from 'lucide-react';
import { ESTADO_POR_ID, PRIORIDAD_POR_ID, TIPO_POR_ID, etiquetaEstado, etiquetaPrioridad } from './ticketsConfig';

// Badges de los tickets (mismo estilo que la vista nueva de Códigos).
const TONOS = {
  neutro: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300 ring-slate-200 dark:ring-gray-700',
  acento: 'bg-[#2383C2]/10 text-[#2383C2] dark:text-[#369BCE] ring-[#2383C2]/25',
  aviso: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 ring-amber-200 dark:ring-amber-900',
  violeta: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 ring-violet-200 dark:ring-violet-900',
  exito: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-900',
  peligro: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 ring-red-200 dark:ring-red-900',
};

const Badge = ({ tono = 'neutro', icono: Icono, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold ring-1 ring-inset whitespace-nowrap ${TONOS[tono] || TONOS.neutro}`}>
    {Icono && <Icono size={10} />}
    {children}
  </span>
);

export const BadgeEstadoTicket = ({ estado }) => (
  <Badge tono={ESTADO_POR_ID[estado]?.tono}>{etiquetaEstado(estado)}</Badge>
);

export const BadgePrioridadTicket = ({ prioridad }) => (
  <Badge tono={PRIORIDAD_POR_ID[prioridad]?.tono}>{etiquetaPrioridad(prioridad)}</Badge>
);

const ICONO_TIPO = { ERROR: AlertOctagon, MEJORA: Lightbulb, CONSULTA: HelpCircle };
const TONO_TIPO = { ERROR: 'text-red-600 dark:text-red-400', MEJORA: 'text-amber-600 dark:text-amber-400', CONSULTA: 'text-[#2383C2] dark:text-sky-400' };
const CORTO_TIPO = { ERROR: 'Error', MEJORA: 'Mejora', CONSULTA: 'Consulta' };

export const TipoTicket = ({ tipo, corto = true }) => {
  const Icono = ICONO_TIPO[tipo] || HelpCircle;
  return (
    <span className="inline-flex items-center gap-1 min-w-0" title={TIPO_POR_ID[tipo]?.label}>
      <Icono size={12} className={`shrink-0 ${TONO_TIPO[tipo] || ''}`} />
      <span className="truncate">{corto ? CORTO_TIPO[tipo] || tipo : TIPO_POR_ID[tipo]?.label || tipo}</span>
    </span>
  );
};

// Punto de "novedad sin ver".
export const PuntoNovedad = ({ title = 'Tiene novedades sin ver' }) => (
  <span title={title} aria-label={title} className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
);
