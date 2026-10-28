import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { moduloGestion } from '../../operaciones/shared/modulosGestion';
import { usePendientesInicioData } from './usePendientesInicioData';
import {
  RUTA_FIBRAS, MAX_CIRUGIAS_LISTA, filtroGestion, filtroFibras, valorIndicador, sumarResultados, unirCirugias,
} from './pendientesInicio';

// Sección "Pendientes" del panel del Inicio (reglas en pendientesInicio.js).
// Cada indicador abre la pantalla donde se resuelve, con el filtro aplicado
// cuando se puede (`onAbrir(modulo, ruta, filtro)`). En 0 dice "Al día" y si
// no se pudo leer, "No disponible" (nunca 0).
const TONOS = {
  ambar: 'text-amber-700 dark:text-amber-300',
  rojo: 'text-red-700 dark:text-red-300',
};
const CAJA = 'rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 px-2 py-1.5 min-w-0 text-left';
const CAJA_BOTON = `${CAJA} hover:border-[#2383C2] hover:bg-[#2383C2]/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]`;

const ValorIndicador = ({ valor, tono = 'ambar' }) => {
  if (valor.estado === 'cargando') return <p className="text-[13px] font-extrabold text-gray-400">…</p>;
  if (valor.estado === 'noDisponible') {
    return (
      <p className="text-[12px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1" title="No se pudo leer este dato">
        <AlertTriangle size={12} className="shrink-0" /> No disponible
      </p>
    );
  }
  if (valor.estado === 'alDia') {
    return (
      <p className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
        <CheckCircle2 size={12} className="shrink-0" /> Al día
      </p>
    );
  }
  return <p className={`text-[15px] font-extrabold font-num ${TONOS[tono]}`}>{valor.n.toLocaleString('es-CL')}</p>;
};

const Indicador = ({ etiqueta, resultado, tono, onClick, titulo, children }) => {
  const valor = valorIndicador(resultado);
  const contenido = (
    <>
      <p className="text-[9.5px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate" title={etiqueta}>{etiqueta}</p>
      <ValorIndicador valor={valor} tono={tono} />
      {children}
    </>
  );
  // Con hijos (botones propios) no puede ser un botón: va como caja.
  if (!onClick || children || valor.estado === 'cargando') return <div className={CAJA}>{contenido}</div>;
  return <button type="button" onClick={onClick} title={titulo} className={CAJA_BOTON}>{contenido}</button>;
};

const Bloque = ({ titulo, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{titulo}</span>
    {children}
  </div>
);

const ddmm = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const NOMBRE_MODULO = { implantes: 'Implantes', hemodinamia: 'Hemodinamia' };

const ColumnaCirugias = ({ titulo, dia, modulos, resultados, prefijo, onVerTodas }) => {
  const porModulo = modulos.map((m) => resultados[`${prefijo}:${m}`]);
  const cargando = porModulo.some((r) => !r);
  const error = porModulo.some((r) => r?.error);
  const cirugias = cargando || error ? [] : unirCirugias(porModulo.map((r) => r.lista));
  const visibles = cirugias.slice(0, MAX_CIRUGIAS_LISTA);
  const truncado = cirugias.length > visibles.length;
  const modulosConCirugias = modulos.filter((m) => cirugias.some((c) => c.modulo === m));

  return (
    <div className={`${CAJA} flex flex-col gap-1`} aria-label={`${titulo} (${ddmm(dia)})`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{titulo} · {ddmm(dia)}</span>
        {!cargando && !error && <span className="text-[13px] font-extrabold font-num text-gray-800 dark:text-gray-100">{cirugias.length}</span>}
      </div>
      {cargando ? (
        <p className="text-[11px] text-gray-400">…</p>
      ) : error ? (
        <ValorIndicador valor={{ estado: 'noDisponible' }} />
      ) : cirugias.length === 0 ? (
        <p className="text-[10.5px] text-gray-400 dark:text-gray-500">Sin cirugías.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700/60">
          {visibles.map((c) => (
            <li key={c.clave} className="py-0.5 min-w-0">
              <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center gap-1">
                {c.modulo === 'hemodinamia' && (
                  <span className="text-[8.5px] font-bold px-1 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">HEM</span>
                )}
                <span className="truncate">{c.paciente}</span>
              </p>
              <p className="text-[9.5px] text-gray-500 dark:text-gray-400 truncate">
                {c.medico}{c.gestionId ? ` · ID ${c.gestionId}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {truncado && (
        <div className="flex flex-wrap gap-x-2">
          {modulosConCirugias.map((m) => (
            <button key={m} type="button" onClick={() => onVerTodas(m)} className="text-[10px] font-semibold text-[#2383C2] hover:underline">
              {modulosConCirugias.length === 1 ? 'Ver todas' : `Ver todas en ${NOMBRE_MODULO[m]}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PendientesSeccion = ({ bloques, onAbrir }) => {
  const { resultados: r, hoy, manana } = usePendientesInicioData(bloques);
  const impl = moduloGestion('implantes').rutas;
  const abrirGestion = (modulo, tipo) => onAbrir?.(modulo, moduloGestion(modulo).rutas.gestion, filtroGestion(tipo, hoy));
  const abrirFibras = (indicador) => onAbrir?.('implantes', RUTA_FIBRAS, filtroFibras(r.fibras?.indicadores?.[indicador]?.referencias));
  const fibra = (indicador) => (r.fibras && !r.fibras.error ? { n: r.fibras.indicadores[indicador].n } : r.fibras);

  const porRevisar = sumarResultados(r.enRevision, r.agendadasVencidas);
  const hayNoDisponible = Object.values(r).some((x) => x?.error);

  return (
    <section aria-label="Pendientes" className="flex flex-col gap-2">
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pendientes</span>

      {bloques.implantes && (
        <Bloque titulo="Implantes">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <Indicador
              etiqueta="Por imputar"
              resultado={r.porImputar}
              onClick={bloques.abreSolicitud ? () => onAbrir?.('implantes', impl.solicitud) : undefined}
              titulo="Abrir Solicitud"
            />
            <Indicador etiqueta="Incompletas" resultado={r.incompletas} onClick={() => abrirGestion('implantes', 'incompletas')} titulo="Abrir Gestión con las incompletas" />
            <Indicador etiqueta="Por revisar" resultado={porRevisar}>
              <div className="flex flex-wrap gap-x-2 mt-0.5">
                {[
                  ['enRevision', 'en revisión o sin cotización'],
                  ['agendadasVencidas', 'agendadas sin cargar'],
                ].map(([tipo, texto]) => (
                  <button key={tipo} type="button" onClick={() => abrirGestion('implantes', tipo)} className="text-[9.5px] font-semibold text-[#2383C2] hover:underline">
                    {r[tipo] && !r[tipo].error ? r[tipo].n.toLocaleString('es-CL') : '–'} {texto}
                  </button>
                ))}
              </div>
            </Indicador>
          </div>
        </Bloque>
      )}

      {bloques.cirugias.length > 0 && (
        <Bloque titulo="Cirugías">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <ColumnaCirugias titulo="Hoy" dia={hoy} prefijo="hoy" modulos={bloques.cirugias} resultados={r} onVerTodas={(m) => abrirGestion(m, 'hoy')} />
            <ColumnaCirugias titulo="Mañana" dia={manana} prefijo="manana" modulos={bloques.cirugias} resultados={r} onVerTodas={(m) => abrirGestion(m, 'manana')} />
          </div>
        </Bloque>
      )}

      {bloques.fibras && (
        <Bloque titulo="Fibras">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1.5">
            <Indicador etiqueta="En su último uso" resultado={fibra('ultimoUso')} onClick={() => abrirFibras('ultimoUso')} titulo="Fibras en uso con 1 uso restante" />
            <Indicador etiqueta="Vencen en 30 días" resultado={fibra('vencenPronto')} onClick={() => abrirFibras('vencenPronto')} titulo="En uso o en bodega, vigentes, que vencen en los próximos 30 días" />
            <Indicador etiqueta="Vencidas" tono="rojo" resultado={fibra('vencidas')} onClick={() => abrirFibras('vencidas')} titulo="En uso o en bodega, ya vencidas" />
            <Indicador etiqueta="Sin fibra en uso" resultado={fibra('bodegaSinUso')} onClick={() => abrirFibras('bodegaSinUso')} titulo="Referencias con fibras en bodega pero ninguna en uso" />
            <Indicador etiqueta="Por comprar" resultado={fibra('sinDisponibles')} onClick={() => abrirFibras('sinDisponibles')} titulo="Referencias marcadas como fibra sin ninguna fibra vigente en uso ni en bodega" />
          </div>
        </Bloque>
      )}

      {hayNoDisponible && (
        <p role="alert" className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md px-2 py-1 flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" />
          No se pudo leer parte de los pendientes. Actualiza la página o revisa la pantalla correspondiente.
        </p>
      )}
    </section>
  );
};

export default PendientesSeccion;
