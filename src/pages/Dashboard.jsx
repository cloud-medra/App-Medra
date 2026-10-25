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
  Settings, Home, ShieldCheck, Menu, Shield, Moon, Sun
} from 'lucide-react';

// Importación unificada de configuración de módulos y vistas
import { MODULES, AJUSTES_ITEMS, SPECIAL_VIEWS } from '../config/modulesConfig.jsx';

// --- UTILIDADES DEL MENÚ Y DEL PANEL (no son vistas) ---
import RecordatoriosCampana from '../components/modulos/administracion/recordatorios/RecordatoriosCampana';
import { useAlertasNoLeidas, RUTA_ALERTAS } from '../components/modulos/administracion/alertas/solicitudesServicio';
import { subItemsVisibles, puedeAbrirVista, esAdministrador, RUTAS_SOLO_DESARROLLADOR } from '../config/accesoMenu';
import {
  entradaDeItem, entradaDeRuta, moduloDeEntrada, entradasMenu, itemsDeEntrada, etiquetaEntrada, iconoEntrada, MODULO_AGRUPADO,
} from '../config/gruposMenu.jsx';
import PeriodoAbiertoBloque from '../components/layout/PeriodoAbiertoBloque';
import SelectorInstitucion from '../components/layout/SelectorInstitucion';
import { vistaInicialDesdeURL } from '../components/modulos/operaciones/documentos/reportesInfo/urlDetalle';
import { puedeConfigurarAtajos } from '../config/atajosDashboard';
import { vistaActiva, itemDeRuta, RUTA_GESTION_MODULOS } from '../config/modulosActivos';
import { useModulosActivos } from '../stores/modulosActivosStore';

// --- DASHBOARD ---
import ResumenGeneral from '../components/modulos/dashboard/ResumenGeneral';

// --- ADMINISTRACIÓN ---
import Alertas from '../components/modulos/administracion/alertas/Alertas';
import ControlMensual from '../components/modulos/administracion/controlMensual/ControlMensual';
import ResumenPeriodoAbierto from '../components/modulos/administracion/resumenPeriodoAbierto/ResumenPeriodoAbierto.jsx';
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
import ArchivosControlLaboratorio from '../components/modulos/gestiones/laboratorio/procesos/ArchivosControlLaboratorio';

// --- VACUNATORIO ---
import EmpresasVacunatorio from '../components/modulos/gestiones/vacunatorio/registros/EmpresasVacunatorio';
import CodigoVacunatorio from '../components/modulos/gestiones/vacunatorio/registros/CodigoVacunatorio';
import OrdenVacunatorio from '../components/modulos/gestiones/vacunatorio/importaciones/OrdenVacunatorio';
import XmlDocVacunatorio from '../components/modulos/gestiones/vacunatorio/importaciones/XmlDocVacunatorio';
import ArchivosControlVacunatorio from '../components/modulos/gestiones/vacunatorio/procesos/ArchivosControlVacunatorio';

// --- MAESTROS ---
import EmpresasMaestros from '../components/modulos/maestros/empresasMaestros/EmpresasMaestros';
import PrestadoresMaestros from '../components/modulos/maestros/prestadoresMaestro/PrestadoresMaestros';
import CentrosMaestros from '../components/modulos/maestros/centrosMaestros/CentrosMaestros';
import ZonasDiagnostico from '../components/modulos/maestros/zonasDiagnostico/ZonasDiagnostico';
import DescripcionesOcultas from '../components/modulos/maestros/descripcionesOcultas/DescripcionesOcultas';
import PrevisionesMaestros from '../components/modulos/maestros/previsionesMaestros/PrevisionesMaestros';
import ConveniosMaestros from '../components/modulos/maestros/conveniosMaestros/ConveniosMaestros';
import RecargosMaestros from '../components/modulos/maestros/recargosMaestros/RecargosMaestros';
import CalculadorMaestros from '../components/modulos/maestros/calculadorMaestros/CalculadorMaestros';
import CodigosMaestros from '../components/modulos/maestros/codigosMaestros/CodigosMaestros';
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

// Contador de alertas sin leer (menú lateral).
const Contador = ({ n }) => (n > 0 ? (
  <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center justify-center" aria-label={`${n} alertas sin leer`}>
    {n > 98 ? '99+' : n}
  </span>
) : null);

// Estilos del sidebar (blanco; gris 800 en oscuro). Activo: tinte azul,
// texto e ícono de marca y barra vertical a la izquierda.
const ITEM_SIDEBAR = 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60';
const ITEM_SIDEBAR_ACTIVO = 'bg-[#2383C2]/10 dark:bg-[#2383C2]/20 text-[#1b6a9e] dark:text-sky-300 font-semibold shadow-[inset_3px_0_0_#2383C2] dark:shadow-[inset_3px_0_0_#38bdf8]';
const ICONO_SIDEBAR = 'text-gray-500 dark:text-gray-400';
const ICONO_SIDEBAR_ACTIVO = 'text-[#2383C2] dark:text-sky-300';
const TITULO_SECCION_SIDEBAR = 'font-bold uppercase text-[9px] tracking-wider text-gray-500 dark:text-gray-400';

// Color de acento de cada módulo: el ícono va en un cuadrito con un tinte
// suave de ese color (en oscuro, tinte más fuerte e ícono aclarado).
const COLOR_MODULO = {
  finanzas: '#047857',
  usuarios: '#4338ca',
  administracion: '#5b738b',
  laboratorio: '#a21caf',
  vacunatorio: '#0f828f',
  maestros: '#6c5c3f',
  consignacion: '#d0306a',
  inventario: '#188918',
  bodega: '#a45d00',
  documentos: '#7858ff',
  implantes: '#0a6ed1',
  hemodinamia: '#c8102e',
};

// `moduleKey`: entrada del sidebar (módulo o grupo de config/gruposMenu.jsx).
const IconoModulo = ({ moduleKey }) => {
  const icon = iconoEntrada(moduleKey);
  return (
    <span
      className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 bg-[color:color-mix(in_srgb,var(--c)_12%,transparent)] text-[color:var(--c)] dark:bg-[color:color-mix(in_srgb,var(--c)_28%,transparent)] dark:text-[color:color-mix(in_srgb,var(--c)_45%,white)]"
      style={{ '--c': COLOR_MODULO[moduleKey] ?? '#5b738b' }}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon, { size: 16 }) : icon}
    </span>
  );
};

// Entrada del sidebar que lleva el contador de alertas sin leer.
const ENTRADA_ALERTAS = entradaDeRuta(MODULO_AGRUPADO, RUTA_ALERTAS);

const Dashboard = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  const [vistaURL] = useState(() => vistaInicialDesdeURL(userData));
  // activeModule: entrada del sidebar abierta (módulo o grupo, ver
  // config/gruposMenu.jsx).
  const [activeModule, setActiveModule] = useState(vistaURL?.modulo ? entradaDeRuta(vistaURL.modulo, vistaURL.vista) : null);
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
  if (import.meta.env.DEV) window.__FS_METER__?.setScreen(activeView);

  // Título de la pestaña dentro de la plataforma; al salir se restaura el de
  // index.html. Al cerrar sesión se recarga en "/" y LoginForm pone el suyo.
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = 'Inicio | Medra';
    return () => { document.title = tituloAnterior; };
  }, []);

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

  const salirDeAjustes = () => {
    setIsAjustesMode(false);
    setActiveView('dashboard');
  };

  const getBreadcrumb = () => {
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

  const VIEW_MAP = {
    // ── Dashboard ──
    'dashboard': <ResumenGeneral userData={userData} onAbrirAtajo={abrirVistaDeModulo} />,

    // ── Administración ──
    [RUTA_ALERTAS]: <Alertas />,
    '/administracion/controlMensual': <ControlMensual />,
    '/administracion/ResumenPeriodoAbierto': <ResumenPeriodoAbierto />,
    '/administracion/notasAdmin': <NotasAdmin />,
    '/administracion/recordatorios': <Recordatorios />,
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

    // ── Laboratorio ──
    '/laboratorio/empresasLaboratorio': <EmpresasLaboratorio />,
    '/laboratorio/codigoLaboratorio': <CodigoLaboratorio />,
    '/laboratorio/ordenLaboratorio': <OrdenLaboratorio />,
    '/laboratorio/xmlDocLaboratorio': <XmlDocLaboratorio />,
    '/laboratorio/archivosControlLaboratorio': <ArchivosControlLaboratorio />,

    // ── Vacunatorio ──
    '/vacunatorio/empresasVacunatorio': <EmpresasVacunatorio />,
    '/vacunatorio/codigoVacunatorio': <CodigoVacunatorio />,
    '/vacunatorio/ordenVacunatorio': <OrdenVacunatorio />,
    '/vacunatorio/xmlDocVacunatorio': <XmlDocVacunatorio />,
    '/vacunatorio/archivosControlVacunatorio': <ArchivosControlVacunatorio />,

    // ── Maestros ──
    '/maestros/empresasMaestros': <EmpresasMaestros />,
    '/maestros/prestadoresMaestros': <PrestadoresMaestros />,
    '/maestros/centrosMaestros': <CentrosMaestros />,
    '/maestros/zonasDiagnostico': <ZonasDiagnostico key={busquedaZonas} busquedaInicial={busquedaZonas} />,
    '/maestros/descripcionesOcultas': <DescripcionesOcultas />,
    '/maestros/previsionesMaestros': <PrevisionesMaestros />,
    '/maestros/conveniosMaestros': <ConveniosMaestros />,
    '/maestros/recargosMaestros': <RecargosMaestros />,
    '/maestros/calculadorMaestros': <CalculadorMaestros />,
    // Misma pantalla en Maestros, Implantes y Hemodinamia; la key separa su estado.
    '/maestros/codigosMaestros': <CodigosMaestros key="maestros" />,
    '/maestros/padMaestros': <PadMaestros />,
    '/maestros/actualizacionPreciosMaestros': <ActualizacionPreciosMaestros />,

    // ── Consignación ──
    '/consignacion/ingresarGuiaDespacho': <IngresarGuiaDespacho />,
    '/consignacion/listadoguiasconsignacion': <Listadoguiasconsignacion />,
    '/consignacion/registroConsignacion': <RegistroConsignacion />,
    '/consignacion/cargaMasivaConsignacion': <CargaMasivaConsignacion />,
    '/consignacion/cargasConsignacion': <CargasConsignacion />,
    '/consignacion/solicitudConsignacion': <SolicitudConsignacion />,
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
    '/implantes/resumenImplantes': <ResumenImplantes />,
    '/implantes/sincronizacionImputadas': <SincronizacionImputadas />,
    '/implantes/reportesInfo': <ReportesInfo pathVista="/implantes/reportesInfo" onAbrirGestionImplante={abrirGestionImplante} />,
    '/implantes/respaldoDocumentos': <RespaldoDocumentos />,
    '/implantes/codigosImplantes': <CodigosMaestros key="implantes" rutaBase="/implantes/codigosImplantes" />,
    '/implantes/importarDetallesOC': <ImportarDetallesOC key="implantes" pathVista="/implantes/importarDetallesOC" />,
    '/implantes/seguimientoFacturasGuias': <SeguimientoFacturasGuias key="implantes" pathVista="/implantes/seguimientoFacturasGuias" />,
    '/implantes/ingresoOrdenes': <IngresoOrdenes key="implantes" pathVista="/implantes/ingresoOrdenes" />,

    // ── Hemodinamia ──
    '/hemodinamia/gestionHemodinamia': <GestionHemodinamia />,
    '/hemodinamia/cargaMasivaDocumentos': <CargaMasivaDocumentosHemodinamia />,
    '/hemodinamia/solicitudHemodinamia': <SolicitudHemodinamia />,
    '/hemodinamia/resumenHemodinamia': <ResumenHemodinamia />,
    '/hemodinamia/sincronizacionImputadas': <SincronizacionImputadasHemodinamia />,
    '/hemodinamia/respaldoDocumentos': <RespaldoDocumentosHemodinamia />,
    '/hemodinamia/codigosHemodinamia': <CodigosMaestros key="hemodinamia" rutaBase="/hemodinamia/codigosHemodinamia" />,

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

  // --- ORDEN DE MÓDULOS APLICADO (usa userData.ordenModulos si existe) ---
  const modulosPermitidos = (() => {
    // El Desarrollador ve todos los ítems y Administrador/Desarrollador los
    // automáticos (Alertas) aunque no estén en sus permisos (ver
    // src/config/accesoMenu.js).
    // Un módulo inactivo, o con todos sus ítems visibles inactivos, no sale.
    const base = Object.keys(MODULES).filter((mKey) => {
      const visibles = subItemsVisibles(userData, mKey, modulosActivos).length;
      if (visibles === 0 && subItemsVisibles(userData, mKey).length > 0) return false;
      return (userData.permisos[mKey] || []).length > 0 || visibles > 0;
    });
    const orden = userData.ordenModulos;
    if (!orden || !orden.length) return base;
    const ordenados = orden.filter((k) => base.includes(k));
    const faltantes = base.filter((k) => !ordenados.includes(k));
    return [...ordenados, ...faltantes];
  })();

  // --- ORDEN DE SUBITEMS APLICADO (usa userData.ordenSubItems[modulo] si existe) ---
  // `entrada`: módulo o grupo del sidebar; el orden guardado es el del módulo.
  const getSubItemsOrdenados = (entrada) => {
    const moduleKey = moduloDeEntrada(entrada);
    const visibles = subItemsVisibles(userData, moduleKey, modulosActivos);
    const ordenGuardado = userData.ordenSubItems?.[moduleKey];
    if (!ordenGuardado || !ordenGuardado.length) return itemsDeEntrada(entrada, visibles);
    const ordenados = ordenGuardado
      .map((path) => visibles.find((s) => s.path === path))
      .filter(Boolean);
    const faltantes = visibles.filter((s) => !ordenGuardado.includes(s.path));
    return itemsDeEntrada(entrada, [...ordenados, ...faltantes]);
  };

  // Entradas del sidebar: Administración se reparte en sus grupos (en su
  // lugar del orden); un grupo sin ítems visibles no se muestra.
  const entradasPermitidas = entradasMenu(modulosPermitidos).filter(
    (e) => moduloDeEntrada(e) !== MODULO_AGRUPADO || getSubItemsOrdenados(e).length > 0
  );

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
        <SelectorInstitucion />
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
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-shrink-0">
                  {breadcrumb.moduloIcon && <span className="opacity-70">{breadcrumb.moduloIcon}</span>}
                  {breadcrumb.moduloLabel}
                </span>
              </>
            )}

            {activeView !== 'dashboard' && (
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

        <div className="flex items-center gap-3 flex-shrink-0">
        {/* Recordatorios del usuario: campana en todas las vistas (solo si
            tiene permiso de recibirlos). */}
        <RecordatoriosCampana />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-9 h-9 rounded-full bg-[#2383C2] text-white flex items-center justify-center font-bold text-sm shadow-md"
          >
            {userData.nombreCompleto
              ? userData.nombreCompleto
                .trim()
                .split(' ')
                .filter(Boolean)
                .map(palabra => palabra.charAt(0).toUpperCase())
                .slice(0, 2)
                .join('')
              : 'U'}
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

              {!colapsado && (
                <div className="px-2 pt-1 pb-2 text-sm font-bold tracking-tight flex items-center gap-2 text-gray-800 dark:text-gray-100">
                  <Settings size={16} className="flex-shrink-0 text-[#2383C2] dark:text-sky-300" />
                  <span className="truncate">Ajustes Sistema</span>
                </div>
              )}

              {/* VOLVER AL SISTEMA */}
              <div className="mb-2">
                <button
                  onClick={salirDeAjustes}
                  className={`w-full flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 active:scale-95 rounded-lg font-bold transition-all text-gray-800 dark:text-gray-100 ${colapsado ? 'justify-center' : ''}`}
                  title="Volver al Sistema"
                >
                  <ArrowLeft size={16} className="flex-shrink-0" />
                  <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                    Volver al Sistema
                  </span>
                </button>

                <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
              </div>

              {/* SECCIÓN CONFIGURACIÓN E ÍTEMS */}
              <div className={`px-2 mb-2 ${TITULO_SECCION_SIDEBAR} transition-all duration-300 truncate ${colapsado ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                Configuración
              </div>

              <div className="space-y-1">
                {AJUSTES_ITEMS.filter((item) => !item.soloDesarrollador || puedeConfigurarAtajos(userData)).map((item) => (
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
                  </button>
                ))}
              </div>
            </div>
          ) : (

            /* MODO SISTEMA NORMAL */
            <div key="normal-menu">

              {/* SECCIÓN MÓDULOS (el inicio es el logo del header) */}
              {!activeModule ? (
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
                      {!colapsado && <ChevronRight size={14} className="flex-shrink-0 text-gray-400 dark:text-gray-500 ml-1" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveModule(null)}
                    className={`flex items-center mb-4 text-[10px] text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-sky-300 transition-colors p-1 w-full ${colapsado ? 'justify-center' : 'gap-1'}`}
                    title="Volver a módulos"
                  >
                    <ArrowLeft size={12} className="flex-shrink-0" />
                    <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                      Volver a módulos
                    </span>
                  </button>

                  <div className={`px-2 mb-2 ${TITULO_SECCION_SIDEBAR} transition-all duration-300 truncate ${colapsado ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                    {etiquetaEntrada(activeModule)}
                  </div>

                  {getSubItemsOrdenados(activeModule).map((sub, idx) => (
                    <button
                      key={sub.path ?? idx}
                      onClick={() => setActiveView(sub.path)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${activeView === sub.path ? ITEM_SIDEBAR_ACTIVO : ITEM_SIDEBAR} ${colapsado ? 'justify-center' : ''}`}
                      title={colapsado ? sub.label : ""}
                    >
                      <div className={`flex-shrink-0 ${activeView === sub.path ? ICONO_SIDEBAR_ACTIVO : ICONO_SIDEBAR}`}>{sub.icon}</div>
                      <span className={`transition-all duration-300 truncate ${colapsado ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'}`}>
                        {sub.label}
                      </span>
                      {sub.path === RUTA_ALERTAS && !colapsado && <Contador n={alertasNoLeidas} />}
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
                <span>v1.0.0</span>
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

        <main className="flex-grow min-w-0 px-3 pb-3 pt-5 overflow-y-auto">
          <div className="h-full">
            {/* Guard: las vistas de solo administradores no se abren con otro
                rol, ni las de módulos/ítems inactivos (aunque se lleguen por
                URL o atajo). Mientras carga la configuración, las vistas de
                módulos esperan. */}
            {!puedeAbrirVista(userData, activeView) ? (
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
    </div>
  );
};

export default Dashboard;