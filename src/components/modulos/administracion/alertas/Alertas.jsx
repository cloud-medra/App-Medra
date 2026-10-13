import { useMemo, useState } from 'react';
import { Bell, BellDot, CheckCircle2, XCircle, Ban, Clock, Check, X, ArrowRight, Inbox } from 'lucide-react';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import Spinner from '../../../ui/Spinner';
import {
  useAlertas, useSolicitud, useHistorialSolicitud, marcarLeida, resolverSolicitud, validarMotivo,
  TIPOS_SOLICITUD, ESTADOS_SOLICITUD, etiquetaTipo, formatoFecha, mensajeErrorSolicitud, MAX_ALERTAS,
} from './solicitudesServicio';

// Administración → Alertas: buzón genérico. Lo ven automáticamente
// Administrador y Desarrollador (ítem automaticoAdministradores); cada uno ve
// las alertas en que es destinatario y el Desarrollador, todas. Hoy el único
// tipo es "solicitud" (cambio de datos de un usuario): se aprueba o rechaza
// desde aquí; puede hacerlo un administrador destinatario o un
// Desarrollador (lo vuelve a exigir la función resolverSolicitud).

const CRITERIO = {
  asignados: 'Le llegó a sus administradores asignados y a los desarrolladores.',
  centro: 'Le llegó a todos los administradores de su centro y a los desarrolladores.',
  sinCentro: 'El usuario no tiene centro de costo: le llegó a todos los administradores y a los desarrolladores.',
  desarrolladores: 'Le llegó a los desarrolladores.',
};
const ICONO = { aplicada: CheckCircle2, aprobada: CheckCircle2, rechazada: XCircle, cancelada: Ban, pendiente: Clock };
const ACCIONES_HISTORIAL = {
  CREADA: 'Creada', APROBADA: 'Aprobada', APROBADA_Y_APLICADA: 'Aprobada y aplicada', APLICADA: 'Aplicada (correo confirmado)',
  RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
};
const SELECT = 'text-xs py-1.5 px-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2]';

const DetalleSolicitud = ({ alerta, userData, nombreCentro }) => {
  const { showToast } = useToast();
  const solicitud = useSolicitud(alerta.datos?.solicitudId);
  const { datos: historial } = useHistorialSolicitud(alerta.datos?.solicitudId);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  if (!solicitud) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;
  const puedeResolver = solicitud.estado === 'pendiente' && solicitud.solicitanteUid !== userData.uid
    && (userData.rol === 'dev' || (userData.rol === 'admin' && (solicitud.aprobadores || []).includes(userData.uid)));

  const resolver = async (decision) => {
    let datos = { id: solicitud.id, decision };
    if (decision === 'rechazar') {
      const m = validarMotivo(motivo);
      if (m.error) { setError(m.error === 'Indica el motivo del cambio.' ? 'Indica el motivo del rechazo.' : m.error); return; }
      datos = { ...datos, motivo: m.motivo };
    }
    setGuardando(true);
    try {
      const { estado } = await resolverSolicitud(datos);
      showToast(estado === 'rechazada' ? 'Solicitud rechazada.' : estado === 'aprobada' ? 'Solicitud aprobada: el usuario debe confirmar su nuevo correo.' : 'Solicitud aprobada y aplicada.', 'success');
      setRechazando(false);
    } catch (err) {
      console.error('Error al resolver la solicitud:', err);
      showToast(mensajeErrorSolicitud(err, 'No se pudo resolver la solicitud.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const Icono = ICONO[solicitud.estado] || Clock;
  return (
    <div className="flex flex-col gap-3 text-[11.5px] text-gray-700 dark:text-gray-200">
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-gray-500">Usuario</dt><dd className="font-semibold">{solicitud.solicitanteNombre}</dd>
        <dt className="text-gray-500">Centro de costo</dt><dd>{solicitud.centroId ? nombreCentro(solicitud.centroId) : 'Sin centro'}</dd>
        <dt className="text-gray-500">Dato</dt><dd>{etiquetaTipo(solicitud.tipo)}</dd>
        <dt className="text-gray-500">Cambio</dt>
        <dd className="break-all">"{solicitud.valorActual || '—'}" <ArrowRight size={11} className="inline mx-1" /> <strong>"{solicitud.valorSolicitado}"</strong></dd>
        <dt className="text-gray-500">Motivo</dt><dd className="whitespace-pre-wrap">{solicitud.motivo}</dd>
        <dt className="text-gray-500">Estado</dt>
        <dd className="inline-flex items-center gap-1 font-semibold"><Icono size={12} /> {ESTADOS_SOLICITUD[solicitud.estado] || solicitud.estado}{solicitud.resueltoPor ? ` · ${solicitud.resueltoPor}` : ''}</dd>
        {solicitud.motivoRechazo && (<><dt className="text-gray-500">Motivo de cierre</dt><dd>{solicitud.motivoRechazo}</dd></>)}
      </dl>
      <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{CRITERIO[solicitud.criterioAprobadores] || ''}</p>

      {puedeResolver && !rechazando && (
        <div className="flex gap-2">
          <button type="button" onClick={() => resolver('aprobar')} disabled={guardando}
            className="h-8 px-3 rounded-md bg-green-600 hover:bg-green-700 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {guardando ? <Spinner size="sm" color="#ffffff" /> : <Check size={13} />} Aprobar
          </button>
          <button type="button" onClick={() => { setRechazando(true); setError(null); }} disabled={guardando}
            className="h-8 px-3 rounded-md border border-red-300 text-red-700 dark:text-red-400 text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            <X size={13} /> Rechazar
          </button>
        </div>
      )}
      {puedeResolver && rechazando && (
        <div className="flex flex-col gap-2 rounded border border-red-200 dark:border-red-900/50 p-2.5">
          <label htmlFor="motivoRechazo" className="text-[11px] font-semibold">Motivo del rechazo</label>
          <textarea id="motivoRechazo" rows={2} value={motivo} onChange={(e) => { setMotivo(e.target.value); setError(null); }}
            className="w-full text-xs p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRechazando(false)} className="text-[11px] px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600">Volver</button>
            <button type="button" onClick={() => resolver('rechazar')} disabled={guardando}
              className="text-[11px] font-bold px-3 py-1.5 rounded bg-red-600 text-white disabled:opacity-50">Confirmar rechazo</button>
          </div>
        </div>
      )}
      {solicitud.estado === 'pendiente' && !puedeResolver && (
        <p className="text-[11px] text-gray-500">Solo pueden resolverla los administradores a quienes llegó, o un desarrollador.</p>
      )}

      <div>
        <h5 className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500 mb-1">Historial</h5>
        <ol className="flex flex-col gap-1">
          {historial.map((h) => (
            <li key={h.id} className="text-[11px]">
              <span className="text-gray-400">{formatoFecha(h.fecha)}</span> · {ACCIONES_HISTORIAL[h.accion] || h.accion} · {h.usuario}
              {h.detalle?.motivoRechazo ? ` — ${h.detalle.motivoRechazo}` : ''}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

const Alertas = () => {
  const { userData } = useUser();
  const { datos: alertas, cargando, error } = useAlertas(userData);
  const { datos: centros } = useCatalogo('centros');
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || 'Centro eliminado';
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [abiertaId, setAbiertaId] = useState(null);

  const noLeida = (a) => (a.noLeidas || []).includes(userData?.uid);
  const filtradas = useMemo(() => alertas.filter((a) => (filtroEstado === 'todas' || a.estado === filtroEstado)
    && (filtroTipo === 'todos' || a.datos?.tipoSolicitud === filtroTipo)
    && (!soloNoLeidas || (a.noLeidas || []).includes(userData?.uid))), [alertas, filtroEstado, filtroTipo, soloNoLeidas, userData?.uid]);
  const abierta = alertas.find((a) => a.id === abiertaId) || null;

  const abrir = (a) => {
    setAbiertaId(a.id);
    if (noLeida(a)) marcarLeida(a.id, userData.uid).catch((err) => console.warn('No se pudo marcar como leída:', err));
  };

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 shadow-sm flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-1.5">
          <Bell size={15} className="text-[#2383C2]" /> Alertas
          <span className="text-[10px] font-normal normal-case text-gray-400">({filtradas.length})</span>
        </h3>
        <select aria-label="Estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={`${SELECT} sm:ml-2`}>
          <option value="pendiente">Pendientes</option>
          <option value="resuelta">Resueltas</option>
          <option value="todas">Todas</option>
        </select>
        <select aria-label="Tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={SELECT}>
          <option value="todos">Todos los tipos</option>
          {Object.entries(TIPOS_SOLICITUD).map(([k, t]) => <option key={k} value={k}>Cambio de {t.etiqueta.toLowerCase()}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} className="accent-[#2383C2]" /> Solo no leídas
        </label>
        {alertas.length >= MAX_ALERTAS && <span className="text-[10.5px] text-gray-400 ml-auto">Se muestran las {MAX_ALERTAS} más recientes.</span>}
      </div>

      {cargando ? (
        <div className="flex justify-center py-10"><Spinner size="md" /></div>
      ) : error ? (
        <p className="text-center text-xs text-red-600 py-10">No se pudieron cargar las alertas.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 min-h-0 flex-1">
          <ul className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700" aria-label="Lista de alertas">
            {filtradas.length === 0 && (
              <li className="text-center text-xs text-gray-400 py-10 flex flex-col items-center gap-2"><Inbox size={20} /> No hay alertas con estos filtros.</li>
            )}
            {filtradas.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => abrir(a)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 ${abiertaId === a.id ? 'bg-[#2383C2]/5' : ''}`}>
                  {noLeida(a) ? <BellDot size={14} className="text-[#2383C2] mt-0.5 shrink-0" aria-label="No leída" /> : <Bell size={14} className="text-gray-300 mt-0.5 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12px] truncate ${noLeida(a) ? 'font-bold text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}>{a.titulo}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{a.resumen}</span>
                    <span className="block text-[10px] text-gray-400">{formatoFecha(a.creadoEl)} · {a.estado === 'pendiente' ? 'Pendiente' : 'Resuelta'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 overflow-y-auto" aria-label="Detalle de la alerta">
            {!abierta ? (
              <p className="text-center text-xs text-gray-400 py-10">Elige una alerta para ver el detalle.</p>
            ) : (
              <>
                <h4 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 mb-1">{abierta.titulo}</h4>
                <p className="text-[10.5px] text-gray-400 mb-3">{formatoFecha(abierta.creadoEl)}</p>
                {abierta.tipo === 'solicitud'
                  ? <DetalleSolicitud key={abierta.id} alerta={abierta} userData={userData} nombreCentro={nombreCentro} />
                  : <p className="text-[11.5px]">{abierta.resumen}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Alertas;
