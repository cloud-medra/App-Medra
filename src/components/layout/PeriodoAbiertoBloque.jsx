import { CalendarDays, CalendarX2 } from 'lucide-react';
import { usePeriodosAbiertos } from '../../hooks/usePeriodoAbiertoStore';
import { resumirPeriodosAbiertos } from './periodoAbierto';

// Bloque "Período abierto" del Dashboard: en el sidebar (arriba de Política,
// Privacidad y versión; con el sidebar colapsado, solo el ícono y el tooltip)
// y en el menú de usuario en móvil (`variante="menu"`). Lee el listener
// compartido de períodos abiertos (src/stores/periodosStore.js, colección
// cierres_periodos): se actualiza solo al abrir o cerrar un período, sin
// lecturas extra. Informativo; con `onAbrir` (solo admin/dev) enlaza a
// Control Mensual.

const ESTILOS = {
  sidebar: {
    caja: 'rounded-lg border border-[#2383C2]/20 dark:border-[#2383C2]/35 bg-[#2383C2]/[0.07] dark:bg-[#2383C2]/15 text-[#1b6a9e] dark:text-sky-300',
    etiqueta: 'text-[#1b6a9e] dark:text-sky-300',
    valor: 'text-[#1b6a9e] dark:text-sky-200',
    aviso: 'text-amber-700 dark:text-amber-300',
    suave: 'text-gray-500 dark:text-gray-400',
    placeholder: 'bg-[#2383C2]/15',
    hover: 'hover:bg-[#2383C2]/[0.12] dark:hover:bg-[#2383C2]/25',
  },
  menu: {
    caja: 'rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200',
    etiqueta: 'text-gray-500 dark:text-gray-400',
    valor: 'text-gray-800 dark:text-gray-100',
    aviso: 'text-amber-700 dark:text-amber-400',
    suave: 'text-gray-400',
    placeholder: 'bg-gray-200 dark:bg-gray-700',
    hover: 'hover:bg-gray-100 dark:hover:bg-gray-800',
  },
};

const PeriodoAbiertoBloque = ({ colapsado = false, variante = 'sidebar', onAbrir, className = '' }) => {
  const { docs, cargando, error } = usePeriodosAbiertos();
  const e = ESTILOS[variante];
  const resumen = cargando || error ? null : resumirPeriodosAbiertos(docs);
  const sinPeriodo = !cargando && !error && !resumen;

  const texto = cargando
    ? 'Cargando período…'
    : error
      ? 'Período no disponible'
      : sinPeriodo
        ? 'Sin período abierto'
        : resumen.etiqueta;
  const tooltip = cargando || error || sinPeriodo
    ? texto
    : `Período abierto: ${resumen.etiqueta}${resumen.variaPorModulo ? `\n${resumen.detalle.map((d) => `${d.modulo}: ${d.etiqueta}`).join('\n')}` : ''}`;
  const Icono = sinPeriodo ? CalendarX2 : CalendarDays;
  const Contenedor = onAbrir ? 'button' : 'div';
  const propsContenedor = onAbrir
    ? { type: 'button', onClick: onAbrir, title: `${tooltip}\n(Abrir Control Mensual)` }
    : { title: tooltip };

  return (
    <Contenedor
      {...propsContenedor}
      role={onAbrir ? undefined : 'status'}
      aria-label={`Período abierto: ${texto}`}
      aria-busy={cargando || undefined}
      data-estado={cargando ? 'cargando' : error ? 'error' : sinPeriodo ? 'sin-periodo' : 'abierto'}
      className={`${e.caja} ${onAbrir ? `${e.hover} transition-colors cursor-pointer` : ''} w-full text-left flex items-center ${colapsado ? 'justify-center py-2' : 'gap-2 px-2.5 py-1.5'} ${className}`}
    >
      <Icono size={14} aria-hidden="true" className={`shrink-0 ${sinPeriodo ? e.aviso : 'opacity-80'}`} />
      {!colapsado && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className={`block text-[9px] font-semibold uppercase tracking-wider ${e.etiqueta}`}>Período abierto</span>
          {cargando ? (
            // Mismo alto que el texto: sin saltos al cargar.
            <span className={`block h-[14px] mt-0.5 w-20 rounded animate-pulse ${e.placeholder}`} />
          ) : (
            <span className={`block text-[11.5px] font-semibold truncate ${sinPeriodo ? e.aviso : error ? e.suave : e.valor}`}>
              {texto}
              {resumen?.variaPorModulo && <span className={`font-normal text-[9.5px] ${e.etiqueta}`}> · varía por módulo</span>}
            </span>
          )}
        </span>
      )}
    </Contenedor>
  );
};

export default PeriodoAbiertoBloque;
