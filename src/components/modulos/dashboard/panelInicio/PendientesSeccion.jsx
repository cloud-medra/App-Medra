import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { moduloGestion } from '../../operaciones/shared/modulosGestion';
import { usePendientesInicioData } from './usePendientesInicioData';
import {
  RUTA_FIBRAS, filtroGestion, tipoPorRevisar, valorIndicador, sumarResultados,
} from './pendientesInicio';

// Sección "Pendientes" del panel del Inicio (reglas en pendientesInicio.js):
// un resumen de cantidades, sin nombres de pacientes. Cada línea abre la
// pantalla donde se resuelve, con el filtro aplicado cuando se puede
// (`onAbrir(modulo, ruta, filtro)`). En 0 dice "Al día" y si no se pudo
// leer, "No disponible" (nunca 0).
const LINEA = 'flex items-center justify-between gap-2 rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 px-2 py-1 min-w-0 text-left';
const LINEA_BOTON = `${LINEA} hover:border-[#2383C2] hover:bg-[#2383C2]/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]`;
const ETIQUETA = 'text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate';
const TONOS = {
  ambar: 'text-amber-700 dark:text-amber-300',
  rojo: 'text-red-700 dark:text-red-300',
  normal: 'text-gray-800 dark:text-gray-100',
};

const NoDisponible = () => (
  <span className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1 shrink-0" title="No se pudo leer este dato">
    <AlertTriangle size={11} className="shrink-0" /> No disponible
  </span>
);

const Cantidad = ({ resultado, alDia = true }) => {
  const valor = valorIndicador(resultado);
  if (valor.estado === 'cargando') return <span className="text-[12px] font-bold text-gray-400 shrink-0">…</span>;
  if (valor.estado === 'noDisponible') return <NoDisponible />;
  if (valor.estado === 'alDia' && alDia) {
    return (
      <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
        <CheckCircle2 size={11} className="shrink-0" /> Al día
      </span>
    );
  }
  return <span className="text-[13px] font-extrabold font-num text-gray-800 dark:text-gray-100 shrink-0">{valor.n.toLocaleString('es-CL')}</span>;
};

// Una línea "etiqueta … valor": botón si abre algo y ya cargó.
const Linea = ({ onClick, titulo, cargando, children }) => (onClick && !cargando
  ? <button type="button" onClick={onClick} title={titulo} className={LINEA_BOTON}>{children}</button>
  : <div className={LINEA} title={titulo}>{children}</div>);

const Bloque = ({ titulo, children }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[9.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{titulo}</span>
    {children}
  </div>
);

const ddmm = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

const PendientesSeccion = ({ bloques, onAbrir }) => {
  const { resultados: r, hoy, manana } = usePendientesInicioData(bloques);
  const abrirGestion = (modulo, tipo) => onAbrir?.(modulo, moduloGestion(modulo).rutas.gestion, filtroGestion(tipo, hoy));
  const porRevisar = sumarResultados(r.enRevision, r.agendadasVencidas);
  const hayNoDisponible = Object.values(r).some((x) => x?.error);

  return (
    <section aria-label="Pendientes" className="flex flex-col gap-2 min-w-0">
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pendientes</span>

      {bloques.implantes && (
        <Bloque titulo="Implantes">
          <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-1">
            <Linea
              cargando={!r.porImputar}
              onClick={bloques.abreSolicitud ? () => onAbrir?.('implantes', moduloGestion('implantes').rutas.solicitud) : undefined}
              titulo="Listas para imputar: se imputan al exportarlas en Solicitud"
            >
              <span className={ETIQUETA}>Por imputar</span><Cantidad resultado={r.porImputar} />
            </Linea>
            <Linea cargando={!r.incompletas} onClick={() => abrirGestion('implantes', 'incompletas')} titulo="Gestiones en estado INCOMPLETO">
              <span className={ETIQUETA}>Incompletas</span><Cantidad resultado={r.incompletas} />
            </Linea>
            <Linea
              cargando={!porRevisar}
              onClick={() => abrirGestion('implantes', tipoPorRevisar(r.enRevision, r.agendadasVencidas))}
              titulo="En REVISAR o S/COTIZACION, o agendadas con la cirugía ya pasada y sin cargar"
            >
              <span className={ETIQUETA}>Por revisar</span><Cantidad resultado={porRevisar} />
            </Linea>
          </div>
        </Bloque>
      )}

      {bloques.cirugias && (
        <Bloque titulo="Cirugías">
          <div className="grid grid-cols-2 gap-1" aria-label="Cirugías">
            {[['hoy', 'Hoy', hoy], ['manana', 'Mañana', manana]].map(([tipo, texto, dia]) => (
              <Linea key={tipo} cargando={!r[tipo]} onClick={() => abrirGestion('implantes', tipo)} titulo={`Abrir Gestión con las cirugías de ${texto.toLowerCase()}`}>
                <span className={ETIQUETA}>{texto} {ddmm(dia)}</span>
                <Cantidad resultado={r[tipo]} alDia={false} />
              </Linea>
            ))}
          </div>
        </Bloque>
      )}

      {bloques.fibras && (
        <Bloque titulo="Fibras">
          {!r.fibras ? (
            <div className={LINEA}><span className="text-[12px] font-bold text-gray-400">…</span></div>
          ) : r.fibras.error ? (
            <div className={LINEA}><span className={ETIQUETA}>Uso de fibras</span><NoDisponible /></div>
          ) : r.fibras.referencias.length === 0 ? (
            <div className={LINEA}><span className="text-[10px] text-gray-400 dark:text-gray-500">No hay referencias marcadas como fibra.</span></div>
          ) : (
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-3 gap-1">
              {r.fibras.referencias.map(({ referencia, uso }) => (
                <Linea key={referencia} onClick={() => onAbrir?.('implantes', RUTA_FIBRAS, { texto: referencia })} titulo={`Abrir Fibras con ${referencia}`}>
                  <span className={`${ETIQUETA} font-num`}>{referencia}</span>
                  {uso ? (
                    <span className={`text-[12px] font-extrabold font-num shrink-0 ${TONOS[uso.alerta] || TONOS.normal}`}>{uso.consumidos}/{uso.totales}</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 shrink-0">Sin fibra en uso</span>
                  )}
                </Linea>
              ))}
            </div>
          )}
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
