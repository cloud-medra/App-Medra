import React, { useState, useEffect, useRef } from 'react';
import { auth, limpiarCacheAlCerrarSesion } from '../firebaseConfig';
import { borrarTodosLosBorradoresCargaMasiva } from '../components/modulos/operaciones/consignacion/cargaMasivaConsignacion/utils/borradorCargaMasiva';
import { omitirSincronizacionEnProximaCarga } from '../services/sessionSync';
import { signOut } from 'firebase/auth';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import logoMedraClaro from '../assets/logo/medra-logo-claro.svg';
import logoMedraOscuro from '../assets/logo/medra-logo-oscuro.svg';
import { obtenerNombreMostrar } from '../utils/nombreMostrar';
import {
  LogOut, Calendar, UserCircle, ChevronRight, ArrowLeft, FileText,
  Settings, Home, ShieldCheck, Menu, Shield, Moon, Sun, Camera, LifeBuoy
} from 'lucide-react';
import AyudaSoporte from '../components/modulos/general/soporte/AyudaSoporte';
import GestionTickets from '../components/modulos/general/soporte/GestionTickets';
import { useNovedadesTicketsUsuario, useTicketsPendientesGestor } from '../components/modulos/general/soporte/useIndicadoresTickets';
import { RUTA_GESTION_TICKETS, RUTA_AYUDA_SOPORTE } from '../components/modulos/general/soporte/ticketsConfig';
import { LIMITE_PENDIENTES_GESTOR } from '../components/modulos/general/soporte/ticketsServicio';
import { VERSION_APP } from '../config/versionApp';
import AvatarUsuario from '../components/ui/AvatarUsuario';
import FotoPerfilModal from '../components/modulos/general/fotoPerfil/FotoPerfilModal';

// Importación unificada de configuración de módulos y vistas
import { MODULES, AJUSTES_ITEMS, SPECIAL_VIEWS } from '../config/modulesConfig.jsx';

// --- UTILIDADES DEL MENÚ Y DEL PANEL (no son vistas) ---
import RecordatoriosAlarma from '../components/modulos/administracion/recordatorios/RecordatoriosAlarma';
import NotificacionesCampana from '../components/layout/NotificacionesCampana';
import { useAlertasNoLeidas, RUTA_ALERTAS } from '../components/modulos/administracion/alertas/solicitudesServicio';
import { subItemsVisibles, puedeAbrirVista, esAdministrador, RUTAS_SOLO_DESARROLLADOR } from '../config/accesoMenu';
import { entradaDeItem, entradaDeRuta, etiquetaEntrada, iconoEntrada, colorEntrada, moduloDeEntrada, MODULO_AGRUPADO } from '../config/gruposMenu.jsx';
import CuadritoIcono from '../components/ui/CuadritoIcono';
import { entradasDelSidebar, itemsDelSidebar } from '../config/menuSidebar';
import { ENTRADA_AJUSTES } from '../config/codigosModulos';
import { indiceMenu, ENTRADA_INICIO } from '../config/buscadorMenu';
import BuscadorMenu, { BuscadorMenuModal } from '../components/layout/BuscadorMenu';
import { vistaDeModulo, leerModuloDeURL } from '../config/vistaModulo';
import { useHistorialVistaModulo } from '../hooks/useHistorialVistaModulo';
import AccesoRapidoModulo from '../components/modulos/general/accesoModulo/AccesoRapidoModulo';
import { tituloPestana } from '../config/tituloPestana';
import PeriodoAbiertoBloque from '../components/layout/PeriodoAbiertoBloque';
import SelectorInstitucion from '../components/layout/SelectorInstitucion';
import { vistaInicialDesdeURL } from '../components/modulos/operaciones/documentos/reportesInfo/urlDetalle';
import { puedeConfigurarAtajos } from '../config/atajosDashboard';
import { vistaActiva, itemDeRuta, RUTA_GESTION_MODULOS } from '../config/modulosActivos';
import { useModulosActivos } from '../stores/modulosActivosStore';
import { CONTENEDORES_PESTANAS, esContenedor, redireccionContenedor } from '../config/pestanasControlProcesos';

// --- DASHBOARD ---
import ResumenGeneral from '../components/modulos/dashboard/ResumenGeneral';

// --- ADMINISTRACIÓN ---
import Alertas from '../components/modulos/administracion/alertas/Alertas';
import ControlMensual from '../components/modulos/administracion/controlMensual/ControlMensual';
import ResumenPeriodoAbierto from '../components/modulos/administracion/resumenPeriodoAbierto/ResumenPeriodoAbierto.jsx';
import TotalFinanzas from '../components/modulos/administracion/totalesFinanzas/TotalFinanzas.jsx';
import { TOTALES_FINANZAS } from '../components/modulos/administracion/totalesFinanzas/totalesFinanzas';
import ComparativoMes from '../components/modulos/administracion/totalesFinanzas/ComparativoMes.jsx';
import { RUTA_COMPARATIVO_MES } from '../components/modulos/administracion/totalesFinanzas/comparativoMes';
import NotasAdmin from '../components/modulos/administracion/notasAdmin/NotasAdmin';
import Recordatorios from '../components/modulos/administracion/recordatorios/Recordatorios';
import CrearUsuario from '../components/modulos/administracion/usuarios/CrearUsuario';
import ListadoUsuario from '../components/modulos/administracion/usuarios/ListadoUsuario';
import PermisosPorCentro from '../components/modulos/administracion/permisosCentro/PermisosPorCentro';
import CargasConsolidado from '../components/modulos/administracion/cargasConsolidado/CargasConsolidado';
import Estadisticas from '../components/modulos/administracion/estadisticas/Estadisticas';
import GestionModulos from '../components/modulos/administracion/gestionModulos/GestionModulos';

// --- LABORATORIO ---
import EmpresasLaboratorio from '../components/modulos/gestiones/laboratorio/registros/EmpresasLaboratorio';
import CodigoLaboratorio from '../components/modulos/gestiones/laboratorio/registros/CodigoLaboratorio';
import OrdenLaboratorio from '../components/modulos/gestiones/laboratorio/importaciones/OrdenLaboratorio';
import XmlDocLaboratorio from '../components/modulos/gestiones/laboratorio/importaciones/XmlDocLaboratorio';
import { vistasControlLaboratorio } from '../components/modulos/gestiones/laboratorio/procesos/ArchivosControlLaboratorio';
import { usePendientesLaboratorio } from '../components/modulos/gestiones/laboratorio/procesos/usePendientesLaboratorio';

// --- VACUNATORIO ---
import EmpresasVacunatorio from '../components/modulos/gestiones/vacunatorio/registros/EmpresasVacunatorio';
import CodigoVacunatorio from '../components/modulos/gestiones/vacunatorio/registros/CodigoVacunatorio';
import OrdenVacunatorio from '../components/modulos/gestiones/vacunatorio/importaciones/OrdenVacunatorio';
import XmlDocVacunatorio from '../components/modulos/gestiones/vacunatorio/importaciones/XmlDocVacunatorio';
import { vistasControlVacunatorio } from '../components/modulos/gestiones/vacunatorio/procesos/ArchivosControlVacunatorio';

// --- MAESTROS ---
import EmpresasMaestros from '../components/modulos/maestros/empresasMaestros/EmpresasMaestros';
import PrestadoresMaestros from '../components/modulos/maestros/prestadoresMaestro/PrestadoresMaestros';
import CentrosMaestros from '../components/modulos/maestros/centrosMaestros/CentrosMaestros';
import InstitucionesMaestros from '../components/modulos/maestros/institucionesMaestros/InstitucionesMaestros';
import { RUTA_INSTITUCIONES } from '../components/modulos/maestros/institucionesMaestros/instituciones';
import { InstitucionProvider } from '../context/InstitucionContext';
import ZonasDiagnostico from '../components/modulos/maestros/zonasDiagnostico/ZonasDiagnostico';
import DescripcionesOcultas from '../components/modulos/maestros/descripcionesOcultas/DescripcionesOcultas';
import PrevisionesMaestros from '../components/modulos/maestros/previsionesMaestros/PrevisionesMaestros';
import ConveniosMaestros from '../components/modulos/maestros/conveniosMaestros/ConveniosMaestros';
import RecargosMaestros from '../components/modulos/maestros/recargosMaestros/RecargosMaestros';
import CalculadorMaestros from '../components/modulos/maestros/calculadorMaestros/CalculadorMaestros';
import CodigosMaestrosV2 from '../components/modulos/maestros/codigosMaestrosV2/CodigosMaestrosV2';
import PadMaestros from '../components/modulos/maestros/padMaestros/PadMaestros';
import ActualizacionPreciosMaestros from '../components/modulos/maestros/actualizacionPreciosMaestros/ActualizacionPreciosMaestros';

// --- CONSIGNACIÓN ---
import IngresarGuiaDespacho from '../components/modulos/operaciones/consignacion/ingresarGuiaDespacho/IngresarGuiaDespacho';
import Listadoguiasconsignacion from '../components/modulos/operaciones/consignacion/listadoguiasconsignacion/Listadoguiasconsignacion';
import RegistroConsignacion from '../components/modulos/operaciones/consignacion/registroConsignacion/RegistroConsignacion';
import CargaMasivaConsignacion from '../components/modulos/operaciones/consignacion/cargaMasivaConsignacion/CargaMasivaConsignacion';
import CargasConsignacion from '../components/modulos/operaciones/consignacion/cargasConsignacion/CargasConsignacion';
import SolicitudConsignacion from '../components/modulos/operaciones/consignacion/solicitudConsignacion/SolicitudConsignacion';
import ResumenConsignacion from '../components/modulos/operaciones/consignacion/resumenConsignacion/ResumenConsignacion';

// --- INVENTARIO ---
import GeneralInventario from '../components/modulos/inventario/generalInventario/GeneralInventario';
import ExistenciasInventario from '../components/modulos/inventario/existenciasInventario/ExistenciasInventario';
import IngresosInventario from '../components/modulos/inventario/ingresosInventario/IngresosInventario';
import EgresosInventario from '../components/modulos/inventario/egresosInventario/EgresosInventario';
import TransitoInventario from '../components/modulos/inventario/transitoInventario/TransitoInventario';
import HistorialInventario from '../components/modulos/inventario/historialInventario/HistorialInventario';
import UnidadInventario from '../components/modulos/inventario/unidadInventario/UnidadInventario';
import EscaneoInventario from '../components/modulos/inventario/escaneoInventario/EscaneoInventario';
import InventarioPorCajas from '../components/modulos/inventario/inventarioCajas/InventarioPorCajas';

// --- BODEGA ---
import MaestroBodega from '../components/modulos/bodega/maestroBodega/MaestroBodega';
import IngresoBodega from '../components/modulos/bodega/ingresoBodega/IngresoBodega';
import CargaInicialBodega from '../components/modulos/bodega/cargaInicialBodega/CargaInicialBodega';
import EgresoBodega from '../components/modulos/bodega/egresoBodega/EgresoBodega';
import TransitoBodega from '../components/modulos/bodega/transitoBodega/TransitoBodega';
import CentrosBodega from '../components/modulos/bodega/centrosBodega/CentrosBodega';
import CajasBodega from '../components/modulos/bodega/cajasBodega/CajasBodega';
import ConsignacionesBodega from '../components/modulos/bodega/consignacionesBodega/ConsignacionesBodega';
import ConsumoBodega from '../components/modulos/bodega/consumoBodega/ConsumoBodega';
import InventarioBodega from '../components/modulos/bodega/inventarioBodega/InventarioBodega';
import CatalogosBodega from '../components/modulos/bodega/catalogosBodega/CatalogosBodega';

// --- DOCUMENTOS ---
import ReportesInfo from '../components/modulos/operaciones/documentos/reportesInfo/ReportesInfo';
import ImportarDetallesOC from '../components/modulos/operaciones/documentos/importarDetallesOC/ImportarDetallesOC';
import SeguimientoFacturasGuias from '../components/modulos/operaciones/documentos/seguimientoFacturasGuias/SeguimientoFacturasGuias';
import IngresoOrdenes from '../components/modulos/operaciones/documentos/ingresoOrdenes/IngresoOrdenes';
import ArchivoDigital from '../components/modulos/operaciones/documentos/archivoDigital/ArchivoDigital.jsx';

// --- IMPLANTES ---
import GestionImplantes from '../components/modulos/operaciones/implantes/gestionImplantes/GestionImplantes';
import CargaMasivaDocumentos from '../components/modulos/operaciones/implantes/cargaMasivaDocumentos/CargaMasivaDocumentos.jsx';
import SolicitudImplantes from '../components/modulos/operaciones/implantes/solicitudImplantes/SolicitudImplantes';
import ResumenImplantes from '../components/modulos/operaciones/implantes/resumenImplantes/ResumenImplantes.jsx';
import SincronizacionImputadas from '../components/modulos/operaciones/implantes/sincronizacionImputadas/SincronizacionImputadas.jsx';
import RespaldoDocumentos from '../components/modulos/operaciones/implantes/respaldoDocumentos/RespaldoDocumentos.jsx';
import SolicitudModificaciones from '../components/modulos/operaciones/shared/solicitudModificaciones/SolicitudModificaciones.jsx';

// --- HEMODINAMIA ---
import GestionHemodinamia from '../components/modulos/operaciones/hemodinamia/gestionHemodinamia/GestionHemodinamia';
import CargaMasivaDocumentosHemodinamia from '../components/modulos/operaciones/hemodinamia/cargaMasivaDocumentos/CargaMasivaDocumentos.jsx';
import SolicitudHemodinamia from '../components/modulos/operaciones/hemodinamia/solicitudHemodinamia/SolicitudHemodinamia';
import ResumenHemodinamia from '../components/modulos/operaciones/hemodinamia/resumenHemodinamia/ResumenHemodinamia';
import SincronizacionImputadasHemodinamia from '../components/modulos/operaciones/hemodinamia/sincronizacionImputadas/SincronizacionImputadas.jsx';
import RespaldoDocumentosHemodinamia from '../components/modulos/operaciones/hemodinamia/respaldoDocumentos/RespaldoDocumentos.jsx';

// --- AJUSTES ---
import DatosUsuarios from '../components/modulos/general/settings/datosUsuarios/DatosUsuarios';
import CambiarPasswordAjustes from '../components/modulos/general/settings/cambiarPassword/CambiarPasswordAjustes';
import AjusteTema from '../components/modulos/general/settings/ajusteTema/AjusteTema';
import ConfigPrivacidad from '../components/modulos/general/settings/configPrivacidad/ConfigPrivacidad';
import ModulosVisibles from '../components/modulos/general/settings/modulosVisibles/ModulosVisibles';
import OrdenModulos from '../components/modulos/general/settings/ordenModulos/OrdenModulos';
import AtajosDashboard from '../components/modulos/general/settings/atajosDashboard/AtajosDashboard';
// import PreferenciasGenerales from '../components/modulos/ajustes/PreferenciasGenerales';

// --- PERFIL Y LEGALES (sin ítem de menú) ---
import Perfil from '../components/modulos/general/perfil/Perfil';
import PoliticasPrivacidad from '../components/modulos/general/legales/PoliticasPrivacidad';
import TerminosServicio from '../components/modulos/general/legales/TerminosServicio';

// Contador del menú lateral (alertas sin leer, tickets sin revisar).
// `tope`: con n >= tope se muestra "(tope-1)+" (consultas con limit).
const Contador = ({ n, etiqueta = 'alertas sin leer', tope = 99 }) => (n > 0 ? (
  <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center justify-center" aria-label={`${n} ${etiqueta}`}>
    {n >= tope ? `${tope - 1}+` : n}
  </span>
) : null);

// Punto rojo de novedad (menú del usuario).
const PuntoAviso = ({ className = '' }) => <span aria-hidden="true" className={`w-2 h-2 rounded-full bg-red-500 ${className}`} />;

// Estilos del sidebar (blanco; gris 800 en oscuro). Activo: tinte azul,
// texto e ícono de marca y barra vertical a la izquierda.
const ITEM_SIDEBAR = 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60';
const ITEM_SIDEBAR_ACTIVO = 'bg-[#2383C2]/10 dark:bg-[#2383C2]/20 text-[#1b6a9e] dark:text-sky-300 font-semibold shadow-[inset_3px_0_0_#2383C2] dark:shadow-[inset_3px_0_0_#38bdf8]';
const ICONO_SIDEBAR = 'text-gray-500 dark:text-gray-400';
const ICONO_SIDEBAR_ACTIVO = 'text-[#2383C2] dark:text-sky-300';
const TITULO_SECCION_SIDEBAR = 'font-bold uppercase text-[9px] tracking-wider text-gray-500 dark:text-gray-400';

// Íconos de módulos e ítems: cuadrito con el color de la configuración
// (PALETA_MENU en config/modulesConfig.jsx, ui/CuadritoIcono.jsx).
// `moduleKey`: entrada del sidebar (módulo o grupo de config/gruposMenu.jsx).
const IconoModulo = ({ moduleKey }) => (
  <CuadritoIcono icon={iconoEntrada(moduleKey)} color={colorEntrada(moduleKey)} />
);

// Encabezado de un módulo (o de Ajustes) abierto en el sidebar: botón
// "Volver" a todo el ancho y título con su cuadrito, separado de los ítems.
// Colapsado: solo la flecha y el cuadrito, con tooltip.
const VolverSidebar = ({ texto, onClick, colapsado }) => (
  <button
    type="button"
    onClick={onClick}
    title={texto}
    aria-label={texto}
    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60 ${colapsado ? 'justify-center' : ''}`}
  >
    <ArrowLeft size={16} className="flex-shrink-0 text-gray-500 dark:text-gray-400" />
    {!colapsado && <span className="truncate">{texto}</span>}
  </button>
);

// Con `onClick` (módulos) el título es un botón que abre la vista de acceso
// rápido del módulo; `activo` lo resalta mientras se ve esa vista.
const TituloSidebar = ({ cuadrito, texto, colapsado, onClick, activo = false }) => {
  const clases = `flex items-center gap-2.5 px-2 pt-2 pb-2.5 mb-2 border-b border-gray-200 dark:border-gray-700 ${colapsado ? 'justify-center' : ''}`;
  const titulo = <h2 className={colapsado ? 'sr-only' : `text-sm font-bold truncate ${activo ? 'text-[#1b6a9e] dark:text-sky-300' : 'text-gray-800 dark:text-gray-100'}`}>{texto}</h2>;
  if (!onClick) {
    return (
      <div title={colapsado ? texto : undefined} className={clases}>
        {cuadrito}
        {titulo}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver todas las pantallas de ${texto}`}
      aria-current={activo ? 'page' : undefined}
      className={`w-full text-left rounded-t-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60 ${activo ? 'bg-[#2383C2]/10 dark:bg-[#2383C2]/20' : ''} ${clases}`}
    >
      {cuadrito}
      {titulo}
    </button>
  );
};

// Entrada del sidebar que lleva el contador de alertas sin leer.
const ENTRADA_ALERTAS = entradaDeRuta(MODULO_AGRUPADO, RUTA_ALERTAS);
// Entrada del sidebar que lleva el contador de tickets sin revisar.
const ENTRADA_TICKETS = entradaDeRuta(MODULO_AGRUPADO, RUTA_GESTION_TICKETS);

const Dashboard = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Foto de perfil (menú del usuario): ventana para subir, cambiar o quitar.
  const [fotoPerfilAbierta, setFotoPerfilAbierta] = useState(false);
  // Ayuda y soporte: pantalla desde donde se abrió (para preseleccionar el
  // módulo del ticket nuevo). `n` remonta la vista en cada apertura.
  const [contextoSoporte, setContextoSoporte] = useState({ n: 0 });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Sidebar como drawer en pantallas < md (se abre con el ☰ del header).
  // Abierto se ve siempre expandido, aunque en escritorio esté colapsado.
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const colapsado = isSidebarCollapsed && !menuMovilAbierto;
  // userData viene de UserContext (única copia en la app): así los cambios
  // hechos desde Ajustes (datos personales, tema, nombre a mostrar) se ven al
  // instante en el header y los saludos. ProtectedRoute garantiza que exista.
  const { userData, setUserData } = useUser();
  // Módulos/ítems activos (global, Administración → Gestión de módulos):
  // lo inactivo no sale en el sidebar ni se abre. null mientras carga.
  const modulosActivos = useModulosActivos();
  // Al recargar con el detalle de Reporte Info en la URL (?vista=…&detalle=…)
  // se vuelve a abrir esa vista (ver reportesInfo/urlDetalle.js).
  // Con ?modulo=<entrada> en la URL (recarga de la vista de acceso rápido de
  // un módulo, config/vistaModulo.js) se vuelve a abrir esa vista, si el
  // usuario tiene ítems en ese módulo (mismo criterio que el sidebar).
  const [vistaURL] = useState(() => {
    const entrada = leerModuloDeURL();
    if (entrada && itemsDelSidebar(userData, entrada, null).length > 0) {
      return { entrada, vista: vistaDeModulo(entrada) };
    }
    return vistaInicialDesdeURL(userData);
  });
  // activeModule: entrada del sidebar abierta (módulo o grupo, ver
  // config/gruposMenu.jsx).
  const [activeModule, setActiveModule] = useState(
    vistaURL?.entrada ?? (vistaURL?.modulo ? entradaDeRuta(vistaURL.modulo, vistaURL.vista) : null)
  );
  const [activeView, setActiveView] = useState(vistaURL?.vista ?? 'dashboard');
  const [isAjustesMode, setIsAjustesMode] = useState(false);
  // Id del usuario cuya creación (wizard de 3 pasos) se quiere retomar desde
  // ListadoUsuario.jsx -> "Continuar creación". Se limpia una vez consumido
  // por CrearUsuario.jsx para no reabrirlo en visitas futuras a la vista.
  const [resumeUsuarioId, setResumeUsuarioId] = useState(null);
  // Usuario a abrir en edición al llegar a Lista Usuario (desde Permisos por
  // centro → "Ver usuarios").
  const [editarUsuarioId, setEditarUsuarioId] = useState(null);
  // Búsqueda inicial de Maestros → Zonas por diagnóstico (desde el Bodymap
  // de una gestión cuya descripción no tiene zona).
  const [busquedaZonas, setBusquedaZonas] = useState('');
  // Apertura de Implantes → Gestiones desde Reporte Info ("Gestión
  // implante"): { admision, refPath?, n }. `n` remonta la vista en cada clic.
  const [aperturaGestion, setAperturaGestion] = useState(null);

  const menuRef = useRef(null);

  const { oscuro, alternarOscuro } = useTheme();
  const nombreSaludo = obtenerNombreMostrar(userData, { mayusculas: true });

  // Medidor de lecturas de Firestore (solo `npm run dev`, ver src/dev/firestoreMeter.js).
  // Se avisa durante el render y no en un efecto: los efectos de la pantalla
  // hija corren ANTES que los del Dashboard, así que con un useEffect sus
  // primeras lecturas se anotaban en la pantalla anterior.
  // "Control Procesos" de Laboratorio/Vacunatorio ya no es una pantalla
  // (sus pestañas son ítems, ver config/pestanasControlProcesos.js): si se
  // llega a su ruta (historial, enlaces, URL) se pasa al primer ítem que el
  // usuario ve. Durante el render, como vistaDelMenuMovil más abajo.
  if (esContenedor(activeView)) {
    const { modulo } = CONTENEDORES_PESTANAS[activeView];
    setActiveView(redireccionContenedor(activeView, subItemsVisibles(userData, modulo, modulosActivos).map((s) => s.path)));
  }

  if (import.meta.env.DEV) window.__FS_METER__?.setScreen(activeView);

  // Título de la pestaña dentro de la plataforma ("Módulo | Medra", ver
  // config/tituloPestana.js); al salir se restaura el de index.html. Al
  // cerrar sesión se recarga en "/" y LoginForm pone el suyo.
  useEffect(() => {
    const tituloAnterior = document.title;
    return () => { document.title = tituloAnterior; };
  }, []);
  useEffect(() => {
    document.title = tituloPestana({ isAjustesMode, activeModule, activeView });
  }, [isAjustesMode, activeModule, activeView]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // El drawer móvil se cierra al abrir una vista, con Esc o al pasar a
  // escritorio (ahí el sidebar vuelve a su lugar).
  const [vistaDelMenuMovil, setVistaDelMenuMovil] = useState(activeView);
  if (vistaDelMenuMovil !== activeView) {
    setVistaDelMenuMovil(activeView);
    setMenuMovilAbierto(false);
  }
  useEffect(() => {
    if (!menuMovilAbierto) return undefined;
    const escritorio = window.matchMedia('(min-width: 768px)');
    const alCambiar = (e) => { if (e.matches) setMenuMovilAbierto(false); };
    const alTeclear = (e) => { if (e.key === 'Escape') setMenuMovilAbierto(false); };
    escritorio.addEventListener('change', alCambiar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      escritorio.removeEventListener('change', alCambiar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [menuMovilAbierto]);

  // ☰ del header: en escritorio colapsa/expande el sidebar; en móvil abre o
  // cierra el drawer.
  const alternarMenu = () => {
    if (window.matchMedia('(min-width: 768px)').matches) setIsSidebarCollapsed((c) => !c);
    else setMenuMovilAbierto((a) => !a);
  };

  const abrirAjustesGenerales = () => {
    setIsAjustesMode(true);
    setActiveModule(null);
    setActiveView('/ajustes/datosPersonales');
    setIsMenuOpen(false);
  };

  // Abre una pantalla de un módulo igual que el menú: deja el módulo
  // expandido en el sidebar y el ítem activo. Lo usan los Accesos rápidos.
  const abrirVistaDeModulo = (moduleKey, path) => {
    setIsAjustesMode(false);
    setActiveModule(entradaDeRuta(moduleKey, path));
    setActiveView(path);
  };

  // Vista de acceso rápido de un módulo (o grupo): al presionar su nombre en
  // el sidebar o en el header. El sidebar sigue mostrando sus ítems.
  const abrirAccesoModulo = (entrada) => {
    setIsAjustesMode(false);
    setActiveModule(entrada);
    setActiveView(vistaDeModulo(entrada));
  };
  // Botón atrás/adelante y recarga de la vista de acceso rápido (?modulo=…).
  const entradaAccesoRapido = useHistorialVistaModulo({
    vista: activeView,
    modulo: activeModule,
    ajustes: isAjustesMode,
    restaurar: (s) => {
      setIsAjustesMode(Boolean(s.ajustes));
      setActiveModule(s.modulo ?? null);
      setActiveView(s.vista ?? 'dashboard');
    },
    abrirModulo: abrirAccesoModulo,
  });

  const salirDeAjustes = () => {
    setIsAjustesMode(false);
    setActiveView('dashboard');
  };

  const getBreadcrumb = () => {
    // Vista de acceso rápido: Inicio → Módulo, sin ítem.
    if (entradaAccesoRapido) {
      return {
        moduloLabel: etiquetaEntrada(entradaAccesoRapido),
        moduloIcon: iconoEntrada(entradaAccesoRapido),
        entrada: entradaAccesoRapido,
        vistaLabel: null,
        vistaIcon: null,
      };
    }

    if (SPECIAL_VIEWS[activeView]) {
      return {
        moduloLabel: isAjustesMode ? 'Ajustes Generales' : null,
        moduloIcon: isAjustesMode ? <Settings size={13} /> : null,
        vistaLabel: SPECIAL_VIEWS[activeView].label,
        vistaIcon: SPECIAL_VIEWS[activeView].icon,
      };
    }

    for (const mKey of Object.keys(MODULES)) {
      const modulo = MODULES[mKey];
      const subItem = modulo.subItems?.find(s => s.path === activeView);
      if (subItem) {
        return {
          moduloLabel: etiquetaEntrada(entradaDeItem(mKey, subItem)),
          moduloIcon: iconoEntrada(entradaDeItem(mKey, subItem)),
          entrada: entradaDeItem(mKey, subItem),
          vistaLabel: subItem.label,
          vistaIcon: subItem.icon ?? null,
        };
      }
    }

    return { moduloLabel: null, moduloIcon: null, vistaLabel: activeView, vistaIcon: null };
  };

  const breadcrumb = getBreadcrumb();
  const abrirGestionImplante = (destino) => {
    setAperturaGestion(prev => ({ ...destino, n: (prev?.n || 0) + 1 }));
    abrirVistaDeModulo('implantes', '/implantes/gestionImplantes');
  };

  const irAPermisosCentro = () => abrirVistaDeModulo('administracion', '/administracion/permisosCentro');
  // Bloque "Período abierto": enlaza a Control Mensual solo si tiene el ítem.
  const abrirControlMensual = subItemsVisibles(userData, 'administracion', modulosActivos).some((s) => s.path === '/administracion/controlMensual')
    ? () => abrirVistaDeModulo('administracion', '/administracion/controlMensual')
    : undefined;
  // Selector de institución sin instituciones: enlaza al maestro solo si tiene el ítem.
  const abrirMaestroInstituciones = subItemsVisibles(userData, 'maestros', modulosActivos).some((s) => s.path === RUTA_INSTITUCIONES)
    ? () => { setIsAjustesMode(false); abrirVistaDeModulo('maestros', RUTA_INSTITUCIONES); }
    : undefined;

  const VIEW_MAP = {
    // ── Dashboard ──
    'dashboard': <ResumenGeneral userData={userData} onAbrirAtajo={abrirVistaDeModulo} />,

    // ── Administración ──
    [RUTA_ALERTAS]: <Alertas />,
    '/administracion/controlMensual': <ControlMensual />,
    '/administracion/ResumenPeriodoAbierto': <ResumenPeriodoAbierto />,
    '/administracion/notasAdmin': <NotasAdmin />,
    '/administracion/recordatorios': <Recordatorios />,
    [RUTA_GESTION_TICKETS]: <GestionTickets />,
    [RUTA_AYUDA_SOPORTE]: <AyudaSoporte key={contextoSoporte.n} contexto={contextoSoporte} />,
    [RUTA_GESTION_MODULOS]: <GestionModulos />,
    '/administracion/crearUsuario': (
      <CrearUsuario
        resumeUsuarioId={resumeUsuarioId}
        onResumeConsumido={() => setResumeUsuarioId(null)}
        onIrAPermisosCentro={irAPermisosCentro}
      />
    ),
    '/administracion/listadoUsuario': (
      <ListadoUsuario
        onContinuarCreacion={(uid) => {
          setResumeUsuarioId(uid);
          setActiveView('/administracion/crearUsuario');
        }}
        abrirUsuarioId={editarUsuarioId}
        onAbrirUsuarioConsumido={() => setEditarUsuarioId(null)}
        onIrAPermisosCentro={irAPermisosCentro}
      />
    ),
    '/administracion/permisosCentro': (
      <PermisosPorCentro
        onEditarUsuario={(uid) => {
          setEditarUsuarioId(uid);
          abrirVistaDeModulo('administracion', '/administracion/listadoUsuario');
        }}
      />
    ),
    '/administracion/cargasConsolidado': <CargasConsolidado />,
    '/administracion/estadisticas': <Estadisticas />,
    // `key`: cada total con su propio estado (mes elegido) al pasar de uno a otro.
    ...Object.fromEntries(Object.entries(TOTALES_FINANZAS).map(([tipo, t]) => [t.ruta, <TotalFinanzas key={tipo} tipo={tipo} />])),
    [RUTA_COMPARATIVO_MES]: <ComparativoMes />,

    // ── Laboratorio ──
    '/laboratorio/empresasLaboratorio': <EmpresasLaboratorio />,
    '/laboratorio/codigoLaboratorio': <CodigoLaboratorio />,
    '/laboratorio/ordenLaboratorio': <OrdenLaboratorio />,
    '/laboratorio/xmlDocLaboratorio': <XmlDocLaboratorio />,
    ...vistasControlLaboratorio(),

    // ── Vacunatorio ──
    '/vacunatorio/empresasVacunatorio': <EmpresasVacunatorio />,
    '/vacunatorio/codigoVacunatorio': <CodigoVacunatorio />,
    '/vacunatorio/ordenVacunatorio': <OrdenVacunatorio />,
    '/vacunatorio/xmlDocVacunatorio': <XmlDocVacunatorio />,
    ...vistasControlVacunatorio(),

    // ── Maestros ──
    '/maestros/empresasMaestros': <EmpresasMaestros />,
    '/maestros/prestadoresMaestros': <PrestadoresMaestros />,
    '/maestros/centrosMaestros': <CentrosMaestros />,
    [RUTA_INSTITUCIONES]: <InstitucionesMaestros />,
    '/maestros/zonasDiagnostico': <ZonasDiagnostico key={busquedaZonas} busquedaInicial={busquedaZonas} />,
    '/maestros/descripcionesOcultas': <DescripcionesOcultas />,
    '/maestros/previsionesMaestros': <PrevisionesMaestros />,
    '/maestros/conveniosMaestros': <ConveniosMaestros />,
    '/maestros/recargosMaestros': <RecargosMaestros />,
    '/maestros/calculadorMaestros': <CalculadorMaestros />,
    // Misma pantalla en Maestros, Implantes y Hemodinamia; la key separa su estado.
    '/maestros/codigosMaestros': <CodigosMaestrosV2 key="maestros" />,
    '/maestros/padMaestros': <PadMaestros />,
    '/maestros/actualizacionPreciosMaestros': <ActualizacionPreciosMaestros />,

    // ── Consignación ──
    '/consignacion/ingresarGuiaDespacho': <IngresarGuiaDespacho />,
    '/consignacion/listadoguiasconsignacion': <Listadoguiasconsignacion />,
    '/consignacion/registroConsignacion': <RegistroConsignacion />,
    '/consignacion/cargaMasivaConsignacion': <CargaMasivaConsignacion />,
    '/consignacion/cargasConsignacion': <CargasConsignacion />,
    '/consignacion/solicitudConsignacion': <SolicitudConsignacion />,
    '/consignacion/solicitudModificacionesConsignacion': <SolicitudModificaciones modulo="consignacion" />,
    '/consignacion/resumenConsignacion': <ResumenConsignacion />,

    // ── Inventario ──
    '/inventario/generalInventario': <GeneralInventario />,
    '/inventario/existenciasInventario': <ExistenciasInventario />,
    '/inventario/ingresosInventario': <IngresosInventario />,
    '/inventario/egresosInventario': <EgresosInventario />,
    '/inventario/transitoInventario': <TransitoInventario />,
    '/inventario/historialInventario': <HistorialInventario />,
    '/inventario/unidadInventario': <UnidadInventario />,
    '/inventario/escaneoInventario': <EscaneoInventario />,
    '/inventario/inventarioCajas': <InventarioPorCajas />,

    // ── Bodega ──
    '/bodega/maestroBodega': <MaestroBodega />,
    '/bodega/ingresoBodega': <IngresoBodega />,
    '/bodega/cargaInicialBodega': <CargaInicialBodega />,
    '/bodega/egresoBodega': <EgresoBodega />,
    '/bodega/transitoBodega': <TransitoBodega />,
    '/bodega/centrosBodega': <CentrosBodega />,
    '/bodega/cajasBodega': <CajasBodega />,
    '/bodega/consignacionesBodega': <ConsignacionesBodega />,
    '/bodega/consumoBodega': <ConsumoBodega />,
    '/bodega/inventarioBodega': <InventarioBodega />,
    '/bodega/catalogosBodega': <CatalogosBodega />,

    // ── Documentos ──
    '/documentos/reportesInfo': <ReportesInfo pathVista="/documentos/reportesInfo" onAbrirGestionImplante={abrirGestionImplante} />,
    '/documentos/importarDetallesOC': <ImportarDetallesOC />,
    '/documentos/seguimientoFacturasGuias': <SeguimientoFacturasGuias />,
    '/documentos/ingresoOrdenes': <IngresoOrdenes />,
    '/documentos/archivoDigital': <ArchivoDigital />,

    // ── Implantes ──
    '/implantes/gestionImplantes': (
      <GestionImplantes
        key={aperturaGestion?.n || 0}
        apertura={aperturaGestion}
        onAbrirZonasDiagnostico={(descripcion) => {
          setBusquedaZonas(descripcion);
          abrirVistaDeModulo('maestros', '/maestros/zonasDiagnostico');
        }}
      />
    ),
    '/implantes/cargaMasivaDocumentos': <CargaMasivaDocumentos />,
    '/implantes/solicitudImplantes': <SolicitudImplantes />,
    '/implantes/solicitudModificacionesImplantes': <SolicitudModificaciones modulo="implantes" />,
    '/implantes/resumenImplantes': <ResumenImplantes />,
    '/implantes/sincronizacionImputadas': <SincronizacionImputadas />,
    '/implantes/reportesInfo': <ReportesInfo pathVista="/implantes/reportesInfo" onAbrirGestionImplante={abrirGestionImplante} />,
    '/implantes/respaldoDocumentos': <RespaldoDocumentos />,
    '/implantes/codigosImplantes': <CodigosMaestrosV2 key="implantes" rutaBase="/implantes/codigosImplantes" />,
    '/implantes/importarDetallesOC': <ImportarDetallesOC key="implantes" pathVista="/implantes/importarDetallesOC" />,
    '/implantes/seguimientoFacturasGuias': <SeguimientoFacturasGuias key="implantes" pathVista="/implantes/seguimientoFacturasGuias" />,
    '/implantes/ingresoOrdenes': <IngresoOrdenes key="implantes" pathVista="/implantes/ingresoOrdenes" />,

    // ── Hemodinamia ──
    '/hemodinamia/gestionHemodinamia': <GestionHemodinamia />,
    '/hemodinamia/cargaMasivaDocumentos': <CargaMasivaDocumentosHemodinamia />,
    '/hemodinamia/solicitudHemodinamia': <SolicitudHemodinamia />,
    '/hemodinamia/solicitudModificacionesHemodinamia': <SolicitudModificaciones modulo="hemodinamia" />,
    '/hemodinamia/resumenHemodinamia': <ResumenHemodinamia />,
    '/hemodinamia/sincronizacionImputadas': <SincronizacionImputadasHemodinamia />,
    '/hemodinamia/respaldoDocumentos': <RespaldoDocumentosHemodinamia />,
    '/hemodinamia/codigosHemodinamia': <CodigosMaestrosV2 key="hemodinamia" rutaBase="/hemodinamia/codigosHemodinamia" />,

    // ── Ajustes ──
    '/settings/datosUsuarios': <DatosUsuarios userData={userData} />,
    '/settings/cambiarPasswordAjustes': <CambiarPasswordAjustes userData={userData} />,
    '/settings/ajusteTema': <AjusteTema />,
    '/ajustes/configPrivacidad': <ConfigPrivacidad />,
    '/settings/modulosVisibles': <ModulosVisibles userData={userData} />,
    '/settings/ordenModulos': ( <OrdenModulos userData={userData} onOrderSaved={(cambios) => setUserData(prev => ({ ...prev, ...cambios }))} /> ),
    '/settings/atajosDashboard': <AtajosDashboard userData={userData} />,
    // '/ajustes/preferenciasGenerales': <PreferenciasGenerales />,

    // ── Vistas sin ítem de menú (perfil y legales) ──
    'perfil': <Perfil userData={userData} />,
    'privacidad': <PoliticasPrivacidad />,
    'terminos': <TerminosServicio />,
  };

  const fechaActual = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Alertas sin leer (Administración → Alertas): contador en el menú.
  const alertasNoLeidas = useAlertasNoLeidas(userData?.uid, esAdministrador(userData));

  // Tickets de soporte: novedades del usuario (limit 1) y, para quien tiene
  // "Gestionar tickets", los sin revisar (limit 10). Ver useIndicadoresTickets.
  const novedadesTickets = useNovedadesTicketsUsuario(userData?.uid);
  const gestionaTickets = subItemsVisibles(userData, 'administracion', modulosActivos).some((s) => s.path === RUTA_GESTION_TICKETS);
  const pendientesTickets = useTicketsPendientesGestor(gestionaTickets);
  const abrirAyudaSoporte = () => {
    setContextoSoporte((prev) => ({ vista: activeView, entrada: activeModule, n: prev.n + 1 }));
    setIsAjustesMode(true);
    setActiveModule(null);
    setActiveView(RUTA_AYUDA_SOPORTE);
    setIsMenuOpen(false);
  };

  // Módulos/grupos e ítems del sidebar, en el orden guardado del usuario
  // (config/menuSidebar.js).
  const entradasPermitidas = entradasDelSidebar(userData, modulosActivos);
  const getSubItemsOrdenados = (entrada) => itemsDelSidebar(userData, entrada, modulosActivos);
  const ajustesVisibles = AJUSTES_ITEMS.filter((item) => !item.soloDesarrollador || puedeConfigurarAtajos(userData));

  // Buscador del sidebar (config/buscadorMenu.js): su índice es exactamente
  // lo que el menú le muestra al usuario (permisos y módulos activos), así
  // nunca revela un ítem sin acceso, ni por su código exacto.
  const indiceBuscador = indiceMenu({
    entradas: entradasPermitidas,
    itemsDe: getSubItemsOrdenados,
    etiquetaDe: etiquetaEntrada,
    ajustes: ajustesVisibles,
  });
  const elegirDelBuscador = (r) => {
    if (r.entrada === ENTRADA_INICIO) { irAlInicio(); return; }
    if (r.entrada === ENTRADA_AJUSTES) {
      if (r.tipo === 'modulo') { abrirAjustesGenerales(); return; }
      setIsAjustesMode(true);
      setActiveModule(null);
      setActiveView(r.ruta);
      return;
    }
    if (r.tipo === 'modulo') abrirAccesoModulo(r.entrada);
    else abrirVistaDeModulo(moduloDeEntrada(r.entrada), r.ruta);
  };
  // Ctrl+K (⌘K): enfoca el campo del sidebar si está a la vista (lista de
  // módulos, sidebar expandido y, en móvil, el drawer abierto); si no, abre
  // el buscador flotante.
  const [buscadorFlotante, setBuscadorFlotante] = useState(false);
  const buscadorRef = useRef(null);
  const campoBuscadorVisible = useRef(false);
  useEffect(() => {
    const escritorio = window.matchMedia?.('(min-width: 768px)').matches ?? true;
    campoBuscadorVisible.current = !isAjustesMode && !activeModule && !colapsado && (escritorio || menuMovilAbierto);
  });
  useEffect(() => {
    const alTeclear = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      if (campoBuscadorVisible.current && buscadorRef.current) { buscadorRef.current.focus(); buscadorRef.current.select(); }
      else setBuscadorFlotante(true);
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, []);

  // Documentos por procesar en las fases de Laboratorio: solo cuenta los
  // ítems que el menú lateral muestra ahora (con permiso), por conteo.
  const rutasMenuLateral = activeModule && !isAjustesMode ? getSubItemsOrdenados(activeModule).map((s) => s.path) : [];
  const pendientesLaboratorio = usePendientesLaboratorio(rutasMenuLateral, activeView);

  // Campana de notificaciones: el clic abre la pantalla como el menú (o
  // Ayuda y soporte, para un ticket de alguien de mi equipo).
  const puedeAbrirRuta = (ruta) => {
    const it = itemDeRuta(MODULES, ruta);
    return !it || subItemsVisibles(userData, it.moduloKey, modulosActivos).some((s) => s.path === ruta);
  };
  const abrirNotificacion = (ruta) => {
    if (ruta === RUTA_AYUDA_SOPORTE) { abrirAyudaSoporte(); return; }
    const it = itemDeRuta(MODULES, ruta);
    if (it) abrirVistaDeModulo(it.moduloKey, ruta);
  };

  // Logo del header: al panel principal (lo que hacía "Inicio" en el
  // sidebar), también desde Ajustes.
  const irAlInicio = () => {
    setIsAjustesMode(false);
    setActiveModule(null);
    setActiveView('dashboard');
    setMenuMovilAbierto(false);
  };

  const handleLogout = async () => {
    try {
      // Borradores de Carga Masiva de Consignación (localStorage): traen
      // nombres de pacientes.
      borrarTodosLosBorradoresCargaMasiva();
      // Primero se cierra Firestore y se borra su caché local (IndexedDB),
      // para que el próximo usuario no vea datos de esta cuenta.
      await limpiarCacheAlCerrarSesion();
      await signOut(auth);
      sessionStorage.clear();
      // Recarga completa: descarta también los catálogos y cachés en memoria
      // de los módulos (y reinicializa Firestore desde cero).
      omitirSincronizacionEnProximaCarga();
      window.location.replace('/');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    // Institución del selector del header, disponible para todas las vistas
    // (context/InstitucionContext.jsx). Por ahora no filtra datos.
    <InstitucionProvider>
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">

      {/* HEADER (todo el ancho): ☰, logo, institución, saludo, fecha,
          breadcrumbs, campana y avatar. El saludo se oculta < lg y la fecha
          < xl para que no empujen los breadcrumbs. */}
      <header className="relative z-50 h-16 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 flex-shrink-0">

        <button
          type="button"
          onClick={alternarMenu}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#2383C2] dark:hover:text-white transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60"
          title="Mostrar u ocultar menú"
          aria-label="Mostrar u ocultar menú"
        >
          <Menu size={20} />
        </button>

        <button
          type="button"
          onClick={irAlInicio}
          title="Ir al inicio"
          aria-label="Ir al inicio"
          className="flex items-center gap-1.5 flex-shrink-0 select-none cursor-pointer rounded-lg px-1 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60"
        >
          <img src={oscuro ? logoMedraOscuro : logoMedraClaro} alt="" className="h-7 w-auto" />
          <span aria-hidden="true" className="hidden sm:inline text-[15px] font-normal text-gray-500 dark:text-gray-400">ERP</span>
        </button>

        <div className="hidden md:block h-6 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
        <SelectorInstitucion onAbrirMaestro={abrirMaestroInstituciones} />
        <div className="hidden md:block h-6 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>

        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">

          <h2 className="hidden lg:flex text-sm font-bold text-gray-700 dark:text-gray-100 items-center gap-2 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            ¡Bienvenido {nombreSaludo}!
          </h2>

          <div className="hidden lg:block h-4 w-[1px] bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>

          <p className="hidden xl:flex text-xs text-gray-500 dark:text-gray-400 items-center gap-2 flex-shrink-0">
            <Calendar size={14} /> {fechaActual}
          </p>
          <div className="hidden xl:block h-4 w-[1px] bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>

          <nav className="flex items-center gap-1.5 min-w-0 text-[12px] font-medium text-gray-700 dark:text-gray-200 truncate">
            <button
              onClick={salirDeAjustes}
              className="flex items-center gap-1 text-[#2383C2] hover:text-[#1a6aa0] dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-semibold flex-shrink-0"
            >
              <Home size={13} />
              <span>Inicio</span>
            </button>

            {breadcrumb.moduloLabel && (
              <>
                <ChevronRight size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                {breadcrumb.entrada ? (
                  // Nombre del módulo: abre su vista de acceso rápido.
                  <button
                    type="button"
                    onClick={() => abrirAccesoModulo(breadcrumb.entrada)}
                    title={`Ver todas las pantallas de ${breadcrumb.moduloLabel}`}
                    aria-current={entradaAccesoRapido ? 'page' : undefined}
                    className={`flex items-center gap-1 flex-shrink-0 rounded px-0.5 transition-colors hover:text-[#2383C2] dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60 ${entradaAccesoRapido ? 'text-gray-800 dark:text-gray-100 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    {breadcrumb.moduloIcon && <span className="opacity-70">{breadcrumb.moduloIcon}</span>}
                    {breadcrumb.moduloLabel}
                  </button>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-shrink-0">
                    {breadcrumb.moduloIcon && <span className="opacity-70">{breadcrumb.moduloIcon}</span>}
                    {breadcrumb.moduloLabel}
                  </span>
                )}
              </>
            )}

            {activeView !== 'dashboard' && breadcrumb.vistaLabel && (
              <>
                <ChevronRight size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-gray-800 dark:text-gray-100 font-semibold flex items-center gap-1 truncate">
                  {breadcrumb.vistaIcon && <span className="opacity-80">{breadcrumb.vistaIcon}</span>}
                  {breadcrumb.vistaLabel}
                </span>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
        {/* Recordatorios del usuario: reloj en todas las vistas (solo si
            tiene permiso de recibirlos). La campana es de notificaciones. */}
        <RecordatoriosAlarma />
        <NotificacionesCampana uid={userData?.uid} puedeAbrirRuta={puedeAbrirRuta} onAbrir={abrirNotificacion} />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Menú del usuario"
            aria-label="Menú del usuario"
            className="relative w-9 h-9 rounded-full shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60"
          >
            {/* Foto de perfil (si la subió) o iniciales: viene en userData, sin lecturas. */}
            <AvatarUsuario
              nombre={userData.nombreCompleto}
              fotoUrl={userData.fotoPerfilUrl}
              porDefecto="U"
              className="w-9 h-9 bg-[#2383C2] text-white font-bold text-sm"
            />
            {(novedadesTickets || pendientesTickets > 0) && (
              <span
                className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white dark:border-gray-800"
                title={novedadesTickets ? 'Tienes novedades en tus tickets' : 'Hay tickets sin revisar'}
              />
            )}
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-2 z-50 text-gray-700 dark:text-gray-200">
              {/* En móvil no hay sidebar: el período abierto va acá. */}
              <div className="md:hidden px-3 pb-2 mb-1 border-b border-gray-100 dark:border-gray-700">
                <PeriodoAbiertoBloque variante="menu" onAbrir={abrirControlMensual && (() => { abrirControlMensual(); setIsMenuOpen(false); })} />
              </div>

              <button
                onClick={() => { setIsAjustesMode(false); setActiveView('perfil'); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <UserCircle size={16} className="text-blue-500 dark:text-blue-400" /> Mi Perfil
              </button>

              <button
                onClick={() => { setFotoPerfilAbierta(true); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Camera size={16} className="text-violet-500 dark:text-violet-400" /> Foto de perfil
              </button>

              <button
                onClick={() => { setIsAjustesMode(false); setActiveView('/ajustes/cambiarPassword'); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Shield size={16} className="text-emerald-500 dark:text-emerald-400" /> Cambiar Contraseña
              </button>

              <button
                onClick={alternarOscuro}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {oscuro ? (
                  <Sun size={16} className="text-amber-400" />
                ) : (
                  <Moon size={16} className="text-indigo-500 dark:text-indigo-400" />
                )}
                {oscuro ? 'Modo Claro' : 'Modo Oscuro'}
              </button>

              <button
                onClick={abrirAyudaSoporte}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <LifeBuoy size={16} className="text-teal-600 dark:text-teal-400" /> Ayuda y soporte
                {novedadesTickets && <PuntoAviso className="ml-auto" />}
              </button>

              {gestionaTickets && (
                <button
                  onClick={() => { abrirVistaDeModulo('administracion', RUTA_GESTION_TICKETS); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <LifeBuoy size={16} className="text-slate-500 dark:text-slate-400" /> Gestionar tickets
                  <Contador n={pendientesTickets} etiqueta="tickets sin revisar" tope={LIMITE_PENDIENTES_GESTOR} />
                </button>
              )}

              <button
                onClick={abrirAjustesGenerales}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold transition-colors"
              >
                <Settings size={16} className="text-[#2383C2]" /> Ajustes Generales
              </button>

              <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
              >
                <LogOut size={16} className="text-red-500" /> Cerrar Sesión
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      <div className="relative flex flex-1 min-h-0">

      {/* Fondo del drawer móvil */}
      <div
        className={`md:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-gray-900/50 transition-opacity ${menuMovilAbierto ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuMovilAbierto(false)}
        aria-hidden="true"
      />

      {/* SIDEBAR LATERAL (bajo el header; en móvil, drawer) */}
      <aside className={`fixed top-16 bottom-0 left-0 z-40 w-64 max-w-[85vw] md:static md:z-auto md:translate-x-0 md:visible ${menuMovilAbierto ? 'translate-x-0' : '-translate-x-full invisible'} ${colapsado ? 'md:w-16 md:min-w-[64px] md:max-w-[64px]' : 'md:w-56 md:min-w-[190px] md:max-w-[190px]'
        } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none flex-shrink-0 select-none overflow-x-hidden`}>

        {/* NAV PRINCIPAL DE LA BARRA LATERAL */}
        <nav className="flex-1 p-2 text-xs overflow-y-auto overflow-x-hidden relative">

          {/* MODO AJUSTES */}
          {isAjustesMode ? (
            <div key="ajustes-menu">

              {/* VOLVER AL SISTEMA + TÍTULO (mismo formato que un módulo) */}
              <VolverSidebar texto="Volver al Sistema" onClick={salirDeAjustes} colapsado={colapsado} />
              <TituloSidebar cuadrito={<CuadritoIcono icon={<Settings />} color="#2383C2" />} texto="Ajustes Sistema" colapsado={colapsado} />

              {/* SECCIÓN CONFIGURACIÓN E ÍTEMS */}
              <div className={`px-2 mb-2 ${TITULO_SECCION_SIDEBAR} transition-all duration-300 truncate ${colapsado ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                Configuración
              </div>

              <div className="space-y-1">
                {ajustesVisibles.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => setActiveView(item.path)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-150 ${activeView === item.path ? ITEM_SIDEBAR_ACTIVO : ITEM_SIDEBAR} ${colapsado ? 'justify-center' : ''}`}
                    title={colapsado ? item.label : ""}
                  >
                    <div className={`flex-shrink-0 ${activeView === item.path ? ICONO_SIDEBAR_ACTIVO : ICONO_SIDEBAR}`}>{item.icon}</div>
                    <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                      {item.label}
                    </span>
                    {item.path === RUTA_AYUDA_SOPORTE && novedadesTickets && !colapsado && <PuntoAviso className="ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (

            /* MODO SISTEMA NORMAL */
            <div key="normal-menu">

              {/* SECCIÓN MÓDULOS (el inicio es el logo del header) */}
              {!activeModule ? (
                <BuscadorMenu ref={buscadorRef} indice={indiceBuscador} onElegir={elegirDelBuscador} oculto={colapsado}>
                <div className="space-y-1">
                  {entradasPermitidas.map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveModule(key)}
                      className={`w-full flex items-center rounded-lg ${ITEM_SIDEBAR} font-medium transition-all px-2 py-1.5 ${colapsado ? 'justify-center' : 'justify-between'}`}
                      title={colapsado ? etiquetaEntrada(key) : ""}
                    >
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <IconoModulo moduleKey={key} />
                        <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                          {etiquetaEntrada(key)}
                        </span>
                      </div>
                      {key === ENTRADA_ALERTAS && !colapsado && <Contador n={alertasNoLeidas} />}
                      {key === ENTRADA_TICKETS && !colapsado && <Contador n={pendientesTickets} etiqueta="tickets sin revisar" tope={LIMITE_PENDIENTES_GESTOR} />}
                      {!colapsado && <ChevronRight size={14} className="flex-shrink-0 text-gray-400 dark:text-gray-500 ml-1" />}
                    </button>
                  ))}
                </div>
                </BuscadorMenu>
              ) : (
                <div className="space-y-1">
                  <VolverSidebar texto="Volver a módulos" onClick={() => setActiveModule(null)} colapsado={colapsado} />
                  <TituloSidebar
                    cuadrito={<IconoModulo moduleKey={activeModule} />}
                    texto={etiquetaEntrada(activeModule)}
                    colapsado={colapsado}
                    onClick={() => abrirAccesoModulo(activeModule)}
                    activo={entradaAccesoRapido === activeModule}
                  />

                  {getSubItemsOrdenados(activeModule).map((sub, idx) => (
                    <button
                      key={sub.path ?? idx}
                      onClick={() => setActiveView(sub.path)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${activeView === sub.path ? ITEM_SIDEBAR_ACTIVO : ITEM_SIDEBAR} ${colapsado ? 'justify-center' : ''}`}
                      title={colapsado ? sub.label : ""}
                    >
                      {/* Activo: además del fondo y la barra, el cuadrito lleva un anillo de su color. */}
                      <CuadritoIcono
                        icon={sub.icon}
                        color={sub.color}
                        tamano="sm"
                        className={activeView === sub.path ? 'ring-2 ring-[color:var(--c)]/60 ring-offset-1 ring-offset-white dark:ring-offset-gray-800' : ''}
                      />
                      <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                        {sub.label}
                      </span>
                      {sub.path === RUTA_ALERTAS && !colapsado && <Contador n={alertasNoLeidas} />}
                      {sub.path === RUTA_GESTION_TICKETS && !colapsado && <Contador n={pendientesTickets} etiqueta="tickets sin revisar" tope={LIMITE_PENDIENTES_GESTOR} />}
                      {!colapsado && <Contador n={pendientesLaboratorio[sub.path] ?? 0} etiqueta="documentos por procesar" tope={100} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </nav>

        {/* PERÍODO ABIERTO (arriba del pie, separado de él) */}
        <div className="mx-2 mt-2 flex-shrink-0">
          <PeriodoAbiertoBloque colapsado={colapsado} onAbrir={abrirControlMensual} />
        </div>

        {/* PIE DE PÁGINA LATERAL */}
        <div className="p-2 m-2 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 flex flex-col gap-2 overflow-hidden flex-shrink-0 transition-all duration-300">
          {!colapsado ? (
            <div className="transition-all duration-300 opacity-100 flex flex-col gap-2">
              <div className="flex flex-col gap-1.5 border-b border-gray-200 dark:border-gray-700 pb-1.5">
                <button
                  onClick={() => { setIsAjustesMode(false); setActiveView('privacidad'); setActiveModule(null); }}
                  className="hover:text-[#2383C2] dark:hover:text-sky-300 transition-colors text-left flex items-center gap-1.5 truncate"
                >
                  <ShieldCheck size={12} className="opacity-70 flex-shrink-0" />
                  <span className="truncate">Política de Privacidad</span>
                </button>
                <button
                  onClick={() => { setIsAjustesMode(false); setActiveView('terminos'); setActiveModule(null); }}
                  className="hover:text-[#2383C2] dark:hover:text-sky-300 transition-colors text-left flex items-center gap-1.5 truncate"
                >
                  <FileText size={12} className="opacity-70 flex-shrink-0" />
                  <span className="truncate">Términos de Servicio</span>
                </button>
              </div>
              <div className="flex justify-between items-center text-[9px] text-gray-500 dark:text-gray-400 font-num px-0.5">
                <span>Versión</span>
                <span>v{VERSION_APP}</span>
              </div>
            </div>
          ) : (
            <div
              className="flex justify-center items-center text-[9px] text-gray-500 dark:text-gray-400 font-num py-1 cursor-help opacity-100 transition-all duration-300"
              title="Versión 1.0.0 — Políticas disponibles en menú expandido"
            >
              <span>v1.0</span>
            </div>
          )}
        </div>
      </aside>
      {buscadorFlotante && <BuscadorMenuModal indice={indiceBuscador} onElegir={elegirDelBuscador} onCerrar={() => setBuscadorFlotante(false)} />}

        <main className="flex-grow min-w-0 px-3 pb-3 pt-5 overflow-y-auto">
          <div className="h-full">
            {/* Guard: las vistas de solo administradores no se abren con otro
                rol, ni las de módulos/ítems inactivos (aunque se lleguen por
                URL o atajo). Mientras carga la configuración, las vistas de
                módulos esperan. */}
            {entradaAccesoRapido ? (
              // Vista de acceso rápido del módulo: los mismos ítems que el
              // sidebar (permisos, activos, orden), sin lecturas nuevas.
              <AccesoRapidoModulo
                etiqueta={etiquetaEntrada(entradaAccesoRapido)}
                icono={iconoEntrada(entradaAccesoRapido)}
                color={colorEntrada(entradaAccesoRapido)}
                items={getSubItemsOrdenados(entradaAccesoRapido)}
                cargando={!modulosActivos}
                onAbrir={(path) => setActiveView(path)}
              />
            ) : !puedeAbrirVista(userData, activeView) ? (
              <div className="text-center text-gray-500 dark:text-gray-400">
                {RUTAS_SOLO_DESARROLLADOR.has(activeView)
                  ? 'Solo el rol Desarrollador puede abrir esta vista.'
                  : 'Solo un administrador puede abrir esta vista.'}
              </div>
            ) : !modulosActivos && itemDeRuta(MODULES, activeView) ? (
              <div className="text-center text-gray-400 dark:text-gray-500 text-xs">Cargando...</div>
            ) : !vistaActiva(modulosActivos, MODULES, activeView) ? (
              <div className="text-center text-gray-500 dark:text-gray-400">
                Este módulo no está activo.
              </div>
            ) : VIEW_MAP[activeView] || (
              <div className="text-center text-gray-500 dark:text-gray-400">
                Vista no configurada
              </div>
            )}
          </div>
        </main>
      </div>
      <FotoPerfilModal abierto={fotoPerfilAbierta} onCerrar={() => setFotoPerfilAbierta(false)} userData={userData} />
    </div>
    </InstitucionProvider>
  );
};

export default Dashboard;