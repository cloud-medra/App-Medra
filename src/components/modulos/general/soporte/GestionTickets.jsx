import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FilterX, Inbox, Loader2, RefreshCw, Search } from 'lucide-react';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { TablaCodigos, BotonIcono } from '../../maestros/codigosMaestrosV2/ui/TablaCodigos';
import TicketPanel from './TicketPanel';
import { BadgeEstadoTicket, BadgePrioridadTicket, TipoTicket, PuntoNovedad } from './BadgesTicket';
import {
  ESTADOS_TICKET, TIPOS_TICKET, PRIORIDADES_TICKET, codigoTicket, formatearFechaTicket, numeroDesdeBusqueda
} from './ticketsConfig';
import { listarBandeja } from './ticketsServicio';
import { opcionesModuloTicket, etiquetaModuloTicket } from './modulosTicket';

const RUTA = '/administracion/tickets';

// Permisos por columna: `col_<key>` en 'tabla_tickets' (componentMaps/administracion.js).
const COLUMNAS = [
  { key: 'numero', label: 'N°', ancho: 90, min: 70 },
  { key: 'titulo', label: 'Título', ancho: 260, min: 120 },
  { key: 'tipo', label: 'Tipo', ancho: 100, min: 70 },
  { key: 'prioridad', label: 'Prioridad', ancho: 90, min: 70 },
  { key: 'modulo', label: 'Módulo', ancho: 130, min: 80 },
  { key: 'estado', label: 'Estado', ancho: 110, min: 80 },
  { key: 'usuario', label: 'Usuario', ancho: 150, min: 90 },
  { key: 'creado', label: 'Creado', ancho: 140, min: 100 },
  { key: 'actualizado', label: 'Actualizado', ancho: 140, min: 100 },
  { key: 'acciones', label: '', ancho: 44, min: 40, align: 'center' }
];

const FILTROS_VACIOS = { estado: '', tipo: '', modulo: '', prioridad: '', orden: 'desc' };

const Selector = ({ value, onChange, todos, opciones }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className={`h-8 pl-2 pr-6 rounded-md border text-[12px] bg-white dark:bg-gray-950 outline-none cursor-pointer ${value ? 'border-[#2383C2]/60 text-[#2383C2] font-medium' : 'border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300'}`}>
    <option value="">{todos}</option>
    {opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);

// Herramientas → Gestionar tickets (permiso "Gestionar tickets"). Bandeja
// paginada con los filtros aplicados en la consulta (nunca todos los
// tickets). Buscar por número (TK-0012) consulta ese ticket; otro texto
// filtra la página ya cargada por título o usuario.
const GestionTickets = () => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [busqueda, setBusqueda] = useState('');
  const [tickets, setTickets] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const modulos = useMemo(() => opcionesModuloTicket(), []);
  const { columnasVisibles } = useColumnasPermitidas(RUTA, 'tabla_tickets', COLUMNAS);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);

  const numeroBuscado = numeroDesdeBusqueda(busqueda);

  const cargar = useCallback(async ({ mas = false } = {}) => {
    setCargando(true);
    try {
      const r = await listarBandeja({ ...filtros, numero: numeroBuscado }, mas ? cursor : null);
      setTickets((prev) => (mas ? [...prev, ...r.tickets] : r.tickets));
      setCursor(r.cursor);
      setHayMas(r.hayMas);
    } catch (e) {
      console.error('Error al cargar la bandeja de tickets:', e);
      showToast('No se pudo cargar la bandeja de tickets', 'error');
    } finally {
      setCargando(false);
    }
  }, [filtros, numeroBuscado, cursor, showToast]);

  // Cada cambio de filtro u orden (o un número buscado) es una consulta nueva.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [filtros, numeroBuscado]);

  const termino = numeroBuscado ? '' : busqueda.trim().toLowerCase();
  const visibles = termino
    ? tickets.filter((t) => `${t.titulo} ${t.creadoPorNombre}`.toLowerCase().includes(termino))
    : tickets;

  const setFiltro = (campo) => (valor) => setFiltros((prev) => ({ ...prev, [campo]: valor }));
  const hayFiltros = busqueda || Object.entries(filtros).some(([k, v]) => (k === 'orden' ? v !== 'desc' : v));
  const abrir = (id) => { setSeleccion(id); setPanelAbierto(true); };
  const actualizarEnLista = (t) => setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  const ticketAbierto = tickets.find((t) => t.id === seleccion) || null;

  const renderCelda = (col, t) => {
    switch (col.key) {
      case 'numero': return (
        <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-700 dark:text-gray-200">
          {t.pendienteGestor && <PuntoNovedad title="Sin revisar" />}
          {codigoTicket(t.numero)}
        </span>
      );
      case 'titulo': return <span className={t.pendienteGestor ? 'font-semibold text-slate-900 dark:text-gray-50' : ''} title={t.titulo}>{t.titulo}</span>;
      case 'tipo': return <TipoTicket tipo={t.tipo} />;
      case 'prioridad': return <BadgePrioridadTicket prioridad={t.prioridad} />;
      case 'modulo': return <span title={etiquetaModuloTicket(t.modulo)}>{etiquetaModuloTicket(t.modulo)}</span>;
      case 'estado': return <BadgeEstadoTicket estado={t.estado} />;
      case 'usuario': return <span title={t.creadoPorEmail}>{t.creadoPorNombre}</span>;
      case 'creado': return <span className="text-gray-500 dark:text-gray-400">{formatearFechaTicket(t.creadoEl)}</span>;
      case 'actualizado': return <span className="text-gray-500 dark:text-gray-400">{formatearFechaTicket(t.actualizadoEl)}</span>;
      case 'acciones': return <BotonIcono icono={Eye} title="Abrir ticket" onClick={() => abrir(t.id)} />;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
      <header className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-gray-700">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1"><Inbox size={12} /> Herramientas</p>
        <h1 className="text-[18px] font-semibold text-slate-900 dark:text-gray-50">Gestionar tickets</h1>
        <p className="text-[12px] text-slate-500 dark:text-gray-400">Bandeja de tickets de soporte. Doble clic para abrir, responder o cambiar el estado.</p>
      </header>

      <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-gray-700">
        <div className="relative w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="N° (TK-0012), título o usuario…"
            title="Un número busca ese ticket; otro texto filtra la página cargada"
            className="w-full h-8 pl-8 pr-2 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[12px] outline-none focus:border-[#2383C2]" />
        </div>
        <Selector value={filtros.estado} onChange={setFiltro('estado')} todos="Estado: todos" opciones={ESTADOS_TICKET} />
        <Selector value={filtros.tipo} onChange={setFiltro('tipo')} todos="Tipo: todos" opciones={TIPOS_TICKET} />
        <Selector value={filtros.modulo} onChange={setFiltro('modulo')} todos="Módulo: todos" opciones={modulos} />
        <Selector value={filtros.prioridad} onChange={setFiltro('prioridad')} todos="Prioridad: todas" opciones={PRIORIDADES_TICKET} />
        <select value={filtros.orden} onChange={(e) => setFiltro('orden')(e.target.value)} aria-label="Orden"
          className="h-8 px-2 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[12px] text-slate-600 dark:text-gray-300">
          <option value="desc">Más recientes primero</option>
          <option value="asc">Más antiguos primero</option>
        </select>
        {hayFiltros && (
          <button type="button" onClick={() => { setFiltros(FILTROS_VACIOS); setBusqueda(''); }}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[12px] text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800">
            <FilterX size={14} /> Limpiar
          </button>
        )}
        <button type="button" onClick={() => cargar()} disabled={cargando} title="Actualizar"
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      <TablaCodigos
        columnas={columnasVisibles}
        anchos={anchos}
        onResize={handleResize}
        anchoTotal={anchoTotalTabla}
        filas={visibles}
        renderCelda={renderCelda}
        onFilaDobleClic={(t) => abrir(t.id)}
        filaActiva={panelAbierto ? seleccion : null}
        cargando={cargando && tickets.length === 0}
        mensajeVacio={hayFiltros ? 'Ningún ticket coincide con los filtros.' : 'No hay tickets.'}
      />
      {hayMas && !numeroBuscado && (
        <div className="shrink-0 flex justify-center py-2 border-t border-slate-200 dark:border-gray-700">
          <button type="button" onClick={() => cargar({ mas: true })} disabled={cargando}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800">
            {cargando && <Loader2 size={12} className="animate-spin" />} Cargar más
          </button>
        </div>
      )}

      <TicketPanel
        abierto={panelAbierto && Boolean(ticketAbierto)}
        ticket={ticketAbierto}
        modo="gestor"
        userData={userData}
        etiquetaModulo={etiquetaModuloTicket}
        onCerrar={() => setPanelAbierto(false)}
        onActualizado={actualizarEnLista}
      />
    </div>
  );
};

export default GestionTickets;
