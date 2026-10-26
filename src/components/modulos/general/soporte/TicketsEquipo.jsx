import React, { useCallback, useEffect, useState } from 'react';
import { Eye, FilterX, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { TablaCodigos, BotonIcono } from '../../maestros/codigosMaestrosV2/ui/TablaCodigos';
import TicketPanel from './TicketPanel';
import { BadgeEstadoTicket, BadgePrioridadTicket, TipoTicket } from './BadgesTicket';
import { ESTADOS_TICKET, TIPOS_TICKET, codigoTicket, formatearFechaTicket } from './ticketsConfig';
import { listarEquipo } from './ticketsServicio';
import { etiquetaModuloTicket } from './modulosTicket';

const COLUMNAS = [
  { key: 'numero', label: 'N°', ancho: 90, min: 70 },
  { key: 'titulo', label: 'Título', ancho: 260, min: 120 },
  { key: 'usuario', label: 'Usuario', ancho: 150, min: 90 },
  { key: 'tipo', label: 'Tipo', ancho: 100, min: 70 },
  { key: 'prioridad', label: 'Prioridad', ancho: 90, min: 70 },
  { key: 'estado', label: 'Estado', ancho: 110, min: 80 },
  { key: 'actualizado', label: 'Actualizado', ancho: 140, min: 100 },
  { key: 'acciones', label: '', ancho: 44, min: 40, align: 'center' }
];

const Selector = ({ value, onChange, todos, opciones }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className={`h-8 pl-2 pr-6 rounded-md border text-[12px] bg-white dark:bg-gray-950 outline-none cursor-pointer ${value ? 'border-[#2383C2]/60 text-[#2383C2] font-medium' : 'border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300'}`}>
    <option value="">{todos}</option>
    {opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);

// Tickets de mi equipo (Administrador): los tickets de sus usuarios
// asignados, en modo lectura. Consultas paginadas por los campos de
// visibilidad guardados en cada ticket (ver listarEquipo); nunca todos.
const TicketsEquipo = ({ userData }) => {
  const { showToast } = useToast();
  const [filtros, setFiltros] = useState({ estado: '', tipo: '' });
  const [tickets, setTickets] = useState([]);
  const [cursores, setCursores] = useState({});
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(COLUMNAS);

  const cargar = useCallback(async ({ mas = false } = {}) => {
    if (!userData?.uid) return;
    setCargando(true);
    try {
      const r = await listarEquipo({ uid: userData.uid, centros: userData.centrosAdministrados || [] }, filtros, mas ? cursores : {});
      setTickets((prev) => {
        if (!mas) return r.tickets;
        const vistos = new Set(prev.map((t) => t.id));
        return [...prev, ...r.tickets.filter((t) => !vistos.has(t.id))];
      });
      setCursores(r.cursores);
      setHayMas(r.hayMas);
    } catch (e) {
      console.error('Error al cargar los tickets del equipo:', e);
      showToast('No se pudieron cargar los tickets de tu equipo', 'error');
    } finally {
      setCargando(false);
    }
  }, [userData?.uid, userData?.centrosAdministrados, filtros, cursores, showToast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [userData?.uid, filtros]);

  const abrir = (id) => { setSeleccion(id); setPanelAbierto(true); };
  const ticketAbierto = tickets.find((t) => t.id === seleccion) || null;
  const hayFiltros = filtros.estado || filtros.tipo;

  const renderCelda = (col, t) => {
    switch (col.key) {
      case 'numero': return <span className="font-mono font-semibold text-slate-700 dark:text-gray-200">{codigoTicket(t.numero)}</span>;
      case 'titulo': return <span title={t.titulo}>{t.titulo}</span>;
      case 'usuario': return <span title={t.creadoPorEmail}>{t.creadoPorNombre}</span>;
      case 'tipo': return <TipoTicket tipo={t.tipo} />;
      case 'prioridad': return <BadgePrioridadTicket prioridad={t.prioridad} />;
      case 'estado': return <BadgeEstadoTicket estado={t.estado} />;
      case 'actualizado': return <span className="text-gray-500 dark:text-gray-400">{formatearFechaTicket(t.actualizadoEl)}</span>;
      case 'acciones': return <BotonIcono icono={Eye} title="Ver ticket" onClick={() => abrir(t.id)} />;
      default: return null;
    }
  };

  return (
    <>
      <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-gray-700">
        <span className="text-[12px] text-slate-500 dark:text-gray-400 mr-1">Tickets de los usuarios que tienes asignados (solo lectura).</span>
        <Selector value={filtros.estado} onChange={(v) => setFiltros((p) => ({ ...p, estado: v }))} todos="Estado: todos" opciones={ESTADOS_TICKET} />
        <Selector value={filtros.tipo} onChange={(v) => setFiltros((p) => ({ ...p, tipo: v }))} todos="Tipo: todos" opciones={TIPOS_TICKET} />
        {hayFiltros && (
          <button type="button" onClick={() => setFiltros({ estado: '', tipo: '' })}
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
        columnas={COLUMNAS}
        anchos={anchos}
        onResize={handleResize}
        anchoTotal={anchoTotalTabla}
        filas={tickets}
        renderCelda={renderCelda}
        onFilaDobleClic={(t) => abrir(t.id)}
        filaActiva={panelAbierto ? seleccion : null}
        cargando={cargando && tickets.length === 0}
        mensajeVacio={hayFiltros ? 'Ningún ticket coincide con los filtros.' : 'Tus usuarios aún no han creado tickets.'}
      />
      {hayMas && (
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
        modo="lectura"
        userData={userData}
        etiquetaModulo={etiquetaModuloTicket}
        onCerrar={() => setPanelAbierto(false)}
      />
    </>
  );
};

export default TicketsEquipo;
