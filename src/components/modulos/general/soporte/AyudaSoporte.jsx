import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, LifeBuoy, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { TablaCodigos, BotonIcono } from '../../maestros/codigosMaestrosV2/ui/TablaCodigos';
import NuevoTicketPanel from './NuevoTicketPanel';
import TicketPanel from './TicketPanel';
import { BadgeEstadoTicket, TipoTicket, PuntoNovedad } from './BadgesTicket';
import { codigoTicket, formatearFechaTicket } from './ticketsConfig';
import { listarMisTickets } from './ticketsServicio';
import { opcionesModuloTicket, etiquetaModuloTicket, moduloDesdeContexto } from './modulosTicket';

const COLUMNAS = [
  { key: 'numero', label: 'N°', ancho: 90, min: 70 },
  { key: 'titulo', label: 'Título', ancho: 320, min: 140 },
  { key: 'tipo', label: 'Tipo', ancho: 110, min: 80 },
  { key: 'estado', label: 'Estado', ancho: 110, min: 80 },
  { key: 'actualizado', label: 'Última actualización', ancho: 150, min: 110 },
  { key: 'acciones', label: '', ancho: 44, min: 40, align: 'center' }
];

// Ayuda y soporte (Ajustes y menú del usuario): mis tickets, nuevo ticket y
// la conversación de cada uno. Lecturas: una página de mis tickets
// (consulta por creadoPor, paginada); abrir uno usa el dato ya cargado.
// `contexto`: { vista, entrada } de la pantalla desde donde se abrió (para
// preseleccionar el módulo del ticket nuevo); `abrirNuevo`: abre el formulario.
const AyudaSoporte = ({ contexto = {}, abrirNuevo = false }) => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const [tickets, setTickets] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [nuevoAbierto, setNuevoAbierto] = useState(abrirNuevo);
  // Ticket del panel (se conserva al cerrar, para la animación de salida).
  const [seleccion, setSeleccion] = useState(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const abrir = (id) => { setSeleccion(id); setPanelAbierto(true); };

  const modulos = useMemo(() => opcionesModuloTicket(), []);
  const moduloInicial = useMemo(() => moduloDesdeContexto(contexto), [contexto]);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(COLUMNAS);

  const cargar = useCallback(async ({ mas = false } = {}) => {
    if (!userData?.uid) return;
    setCargando(true);
    try {
      const r = await listarMisTickets(userData.uid, mas ? cursor : null);
      setTickets((prev) => (mas ? [...prev, ...r.tickets] : r.tickets));
      setCursor(r.cursor);
      setHayMas(r.hayMas);
    } catch (e) {
      console.error('Error al cargar mis tickets:', e);
      showToast('No se pudieron cargar tus tickets', 'error');
    } finally {
      setCargando(false);
    }
  }, [userData?.uid, cursor, showToast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [userData?.uid]);

  const actualizarEnLista = (t) => setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  const ticketAbierto = tickets.find((t) => t.id === seleccion) || null;

  const renderCelda = (col, t) => {
    switch (col.key) {
      case 'numero': return (
        <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-700 dark:text-gray-200">
          {t.noLeidoUsuario && <PuntoNovedad title="Tiene una respuesta o un cambio de estado sin ver" />}
          {codigoTicket(t.numero)}
        </span>
      );
      case 'titulo': return <span className={t.noLeidoUsuario ? 'font-semibold text-slate-900 dark:text-gray-50' : ''} title={t.titulo}>{t.titulo}</span>;
      case 'tipo': return <TipoTicket tipo={t.tipo} />;
      case 'estado': return <BadgeEstadoTicket estado={t.estado} />;
      case 'actualizado': return <span className="text-gray-500 dark:text-gray-400">{formatearFechaTicket(t.actualizadoEl)}</span>;
      case 'acciones': return <BotonIcono icono={Eye} title="Ver ticket" onClick={() => abrir(t.id)} />;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
      <header className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1"><LifeBuoy size={12} /> Ayuda y soporte</p>
          <h1 className="text-[18px] font-semibold text-slate-900 dark:text-gray-50">Mis tickets</h1>
          <p className="text-[12px] text-slate-500 dark:text-gray-400">Reporta errores, pide mejoras o integraciones y haz consultas. Doble clic en un ticket para ver la conversación.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => cargar()} disabled={cargando} title="Actualizar"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button type="button" onClick={() => setNuevoAbierto(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#2383C2] hover:bg-[#1d6fa6] text-white text-[12px] font-medium">
            <Plus size={14} /> Nuevo ticket
          </button>
        </div>
      </header>

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
        mensajeVacio="Aún no has creado tickets."
      />
      {hayMas && (
        <div className="shrink-0 flex justify-center py-2 border-t border-slate-200 dark:border-gray-700">
          <button type="button" onClick={() => cargar({ mas: true })} disabled={cargando}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800">
            {cargando && <Loader2 size={12} className="animate-spin" />} Cargar más
          </button>
        </div>
      )}

      <NuevoTicketPanel
        abierto={nuevoAbierto}
        onCerrar={() => setNuevoAbierto(false)}
        onCreado={() => cargar()}
        userData={userData}
        modulos={modulos}
        moduloInicial={moduloInicial}
        vista={contexto.vista}
      />
      <TicketPanel
        abierto={panelAbierto && Boolean(ticketAbierto)}
        ticket={ticketAbierto}
        modo="usuario"
        userData={userData}
        etiquetaModulo={etiquetaModuloTicket}
        onCerrar={() => setPanelAbierto(false)}
        onActualizado={actualizarEnLista}
      />
    </div>
  );
};

export default AyudaSoporte;
