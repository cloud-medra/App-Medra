import React from 'react';
import {
  Activity,
  Archive,
  FolderOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightToLine,
  BadgeInfo,
  BarChart2,
  Building2,
  Boxes,
  Calendar,
  CalendarDays,
  CalendarCheck,
  Calculator,
  CheckCheck,
  ClipboardList,
  ClipboardCheck,
  Package,
  Database,
  Factory,
  FileScan,
  FileCode,
  FileSpreadsheet,
  FilePlus,
  FilePen,
  FileUp,
  Folder,
  FolderKanban,
  GitCompareArrows,
  GitMerge,
  BarChart3,
  BellRing,
  Bell,
  Microscope,
  Handshake,
  Receipt,
  HeartPulse,
  Hospital,
  History,
  LayoutDashboard,
  Percent,
  PackageCheck,
  PackagePlus,
  PackageMinus,
  PackageSearch,
  PackageOpen,
  Tags,
  Settings2,
  ShieldCheck,
  StickyNote,
  Syringe,
  ScanBarcode,
  Truck,
  Users,
  UserPlus,
  UserSearch,
  UserRound,
  Warehouse,
  UserCircle,
  Shield,
  Sun,
  Lock,
  Eye,
  ArrowUpDown,
  Sliders,
  SlidersHorizontal,
  BadgeDollarSign,
  HelpCircle,
  Home,
  FileText,
  FolderUp,
  Zap,
  KeyRound,
  PersonStanding,
  EyeOff,
  ToggleRight,
  Inbox,
  Link2,
  AlertTriangle,
  CheckSquare,
  CheckCircle2,
  Edit3
} from "lucide-react";
import { FASES_CONTROL_PROCESOS, CONTENEDORES_PESTANAS } from './pestanasControlProcesos.js';

// Paleta de colores del menú. Cada módulo y cada ítem tiene su `color` acá
// (y los grupos del sidebar en config/gruposMenu.jsx): el ícono va en un
// cuadrito con un tinte suave de ese color (ui/CuadritoIcono.jsx), igual en
// el sidebar, la vista de acceso rápido de un módulo y los Accesos rápidos.
// Dentro de un módulo los ítems varían de color para distinguirse.
export const PALETA_MENU = {
  verde: '#047857',
  indigo: '#4338ca',
  pizarra: '#5b738b',
  fucsia: '#a21caf',
  turquesa: '#0f828f',
  cafe: '#6c5c3f',
  frambuesa: '#d0306a',
  pasto: '#188918',
  ambar: '#a45d00',
  violeta: '#7858ff',
  azul: '#0a6ed1',
  rojo: '#c8102e',
};

export const COLOR_MENU_POR_DEFECTO = PALETA_MENU.pizarra;

// Ítems que antes eran las pestañas de "Control Procesos" (ver
// config/pestanasControlProcesos.js): misma ruta que la pestaña y
// `pestanaDe` = el contenedor, que es lo que se sigue asignando en el editor
// de permisos (con el label, ícono y color que tenía el ítem).
const ICONOS_FASES = {
  documentosRecibidos: Inbox,
  iniciarProcesos: FileText,
  vinculacionCodigos: Tags,
  vinculacionOrdenes: Link2,
  solicitudDiferencias: AlertTriangle,
  documentosListos: CheckSquare,
  documentosImputados: CheckCircle2,
  documentosEdicion: Edit3,
};
const itemsControlProcesos = (rutaContenedor, colorContenedor, colores) => {
  const pestanaDe = {
    path: rutaContenedor,
    label: CONTENEDORES_PESTANAS[rutaContenedor].label,
    icon: <FileSpreadsheet size={14} />,
    color: colorContenedor,
  };
  return FASES_CONTROL_PROCESOS.map(({ clave, label }, i) => {
    const Icono = ICONOS_FASES[clave];
    return { label, path: `${rutaContenedor}/${clave}`, icon: <Icono size={14} />, color: colores[i], pestanaDe };
  });
};

export const MODULES = {
  dashboard: {
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
    path: '/plataforma'
  },
  administracion: {
    label: 'Herramientas',
    icon: <Settings2 size={16} />,
    color: PALETA_MENU.pizarra,
    // `grupo`: en el sidebar estos ítems se reparten en Finanzas, Usuarios y
    // accesos y Herramientas (config/gruposMenu.jsx). Es solo el menú: el
    // permiso sigue siendo permisos.administracion con estas mismas rutas,
    // que validan firestore.rules y las Cloud Functions.
    subItems: [
      // Buzón de alertas (solicitudes de cambio de datos): automático para
      // Administrador y Desarrollador, no se asigna (src/config/accesoMenu.js).
      { label: 'Alertas', path: '/administracion/alertas', icon: <Bell size={14} />, color: PALETA_MENU.azul, automaticoAdministradores: true, grupo: 'usuarios' },
      { label: 'Apertura y cierre de períodos', path: '/administracion/controlMensual', icon: <CalendarCheck size={14} />, color: PALETA_MENU.verde, grupo: 'finanzas' },
      { label: 'Período actual', path: '/administracion/ResumenPeriodoAbierto', icon: <CalendarDays size={14} />, color: PALETA_MENU.frambuesa, grupo: 'finanzas' },
      { label: 'Notas del panel', path: '/administracion/notasAdmin', icon: <StickyNote size={14} />, color: PALETA_MENU.violeta },
      { label: 'Recordatorios', path: '/administracion/recordatorios', icon: <BellRing size={14} />, color: PALETA_MENU.ambar },
      { label: 'Crear usuario', path: '/administracion/crearUsuario', icon: <UserPlus size={14} />, color: PALETA_MENU.turquesa, grupo: 'usuarios' },
      { label: 'Listado de usuarios', path: '/administracion/listadoUsuario', icon: <Users size={14} />, color: PALETA_MENU.fucsia, grupo: 'usuarios' },
      // Se asigna como cualquier ítem, pero solo sirve con rol Administrador
      // (o Desarrollador): ver src/config/accesoMenu.js y functions/permisos.
      { label: 'Permisos por centro', path: '/administracion/permisosCentro', icon: <KeyRound size={14} />, color: PALETA_MENU.pasto, grupo: 'usuarios' },
      // En el grupo Finanzas; la ruta y el permiso siguen siendo de administracion.
      { label: 'Cargas consolidadas', path: '/administracion/cargasConsolidado', icon: <GitMerge size={14} />, color: PALETA_MENU.indigo, grupo: 'finanzas' },
      { label: 'Estadísticas del período', path: '/administracion/estadisticas', icon: <BarChart3 size={14} />, color: PALETA_MENU.rojo, grupo: 'finanzas' },
      // Totales de Finanzas (administracion/totalesFinanzas): ítems normales,
      // así que solo los ve el Desarrollador hasta que se asignen.
      { label: 'Consumos', path: '/administracion/consumos', icon: <BadgeDollarSign size={14} />, color: PALETA_MENU.ambar, grupo: 'finanzas' },
      { label: 'Facturas', path: '/administracion/facturas', icon: <Receipt size={14} />, color: PALETA_MENU.azul, grupo: 'finanzas' },
      { label: 'Valorización de bodega', path: '/administracion/valorizacionBodega', icon: <Warehouse size={14} />, color: PALETA_MENU.violeta, grupo: 'finanzas' },
      // Bandeja completa de tickets de soporte (Ayuda y soporte). Es el
      // permiso "Gestionar tickets": siempre activo para el Desarrollador (ve
      // todos los ítems) y, para los demás, solo si se asigna en el editor de
      // permisos (también a un Administrador, y se le puede quitar). Ver
      // gestionaTickets() en firestore.rules.
      { label: 'Gestionar tickets', path: '/administracion/tickets', icon: <Inbox size={14} />, color: PALETA_MENU.turquesa },
      // Activar/inactivar módulos e ítems (config/modulosActivos.js): solo rol
      // Desarrollador, no se asigna (src/config/accesoMenu.js). No se puede inactivar.
      { label: 'Gestión de módulos', path: '/administracion/gestionModulos', icon: <ToggleRight size={14} />, color: PALETA_MENU.cafe, soloDesarrollador: true }
    ]
  },
  laboratorio: {
    label: 'Laboratorio',
    icon: <Microscope size={18} />,
    color: PALETA_MENU.fucsia,
    subItems: [
      { label: 'Registro Empresas', path: '/laboratorio/empresasLaboratorio', icon: <Building2 size={14} />, color: PALETA_MENU.pasto },
      { label: 'Maestro Códigos', path: '/laboratorio/codigoLaboratorio', icon: <BadgeInfo size={14} />, color: PALETA_MENU.indigo },
      { label: 'Ordenes', path: '/laboratorio/ordenLaboratorio', icon: <ClipboardList size={14} />, color: PALETA_MENU.rojo },
      { label: 'Xml Documentos', path: '/laboratorio/xmlDocLaboratorio', icon: <FileCode size={14} />, color: PALETA_MENU.cafe },
      ...itemsControlProcesos('/laboratorio/archivosControlLaboratorio', PALETA_MENU.pizarra, [
        PALETA_MENU.pizarra, PALETA_MENU.azul, PALETA_MENU.ambar, PALETA_MENU.violeta,
        PALETA_MENU.frambuesa, PALETA_MENU.verde, PALETA_MENU.turquesa, PALETA_MENU.indigo,
      ]),
    ]
  },
  vacunatorio: {
    label: 'Vacunatorio',
    icon: <Syringe size={18} />,
    color: PALETA_MENU.turquesa,
    subItems: [
      { label: 'Registro Empresas', path: '/vacunatorio/empresasVacunatorio', icon: <Building2 size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Maestro Códigos', path: '/vacunatorio/codigoVacunatorio', icon: <BadgeInfo size={14} />, color: PALETA_MENU.pasto },
      { label: 'Ordenes', path: '/vacunatorio/ordenVacunatorio', icon: <ClipboardList size={14} />, color: PALETA_MENU.indigo },
      { label: 'Xml Documentos', path: '/vacunatorio/xmlDocVacunatorio', icon: <FileCode size={14} />, color: PALETA_MENU.rojo },
      ...itemsControlProcesos('/vacunatorio/archivosControlVacunatorio', PALETA_MENU.cafe, [
        PALETA_MENU.cafe, PALETA_MENU.azul, PALETA_MENU.ambar, PALETA_MENU.violeta,
        PALETA_MENU.frambuesa, PALETA_MENU.verde, PALETA_MENU.pizarra, PALETA_MENU.pasto,
      ]),
    ]
  },
  maestros: {
    label: 'Maestros',
    icon: <Database size={18} />,
    color: PALETA_MENU.cafe,
    subItems: [
      { label: 'Empresas', path: '/maestros/empresasMaestros', icon: <Factory size={14} />, color: PALETA_MENU.pizarra },
      { label: 'Prestadores', path: '/maestros/prestadoresMaestros', icon: <UserRound size={14} />, color: PALETA_MENU.azul },
      { label: 'Centros', path: '/maestros/centrosMaestros', icon: <Hospital size={14} />, color: PALETA_MENU.verde },
      // Instituciones / sucursales: las ofrece el selector del header
      // (context/InstitucionContext.jsx).
      { label: 'Instituciones', path: '/maestros/institucionesMaestros', icon: <Building2 size={14} />, color: PALETA_MENU.frambuesa },
      { label: 'Zonas por diagnóstico', path: '/maestros/zonasDiagnostico', icon: <PersonStanding size={14} />, color: PALETA_MENU.violeta },
      { label: 'Descripciones ocultas', path: '/maestros/descripcionesOcultas', icon: <EyeOff size={14} />, color: PALETA_MENU.ambar },
      { label: 'Previsiones', path: '/maestros/previsionesMaestros', icon: <ShieldCheck size={14} />, color: PALETA_MENU.turquesa },
      { label: 'Convenios', path: '/maestros/conveniosMaestros', icon: <Handshake size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Recargos', path: '/maestros/recargosMaestros', icon: <Percent size={14} />, color: PALETA_MENU.pasto },
      { label: 'Calculador', path: '/maestros/calculadorMaestros', icon: <Calculator size={14} />, color: PALETA_MENU.indigo },
      { label: 'Codigos', path: '/maestros/codigosMaestros', icon: <ScanBarcode size={14} />, color: PALETA_MENU.rojo },
      { label: 'Pad', path: '/maestros/padMaestros', icon: <SlidersHorizontal size={14} />, color: PALETA_MENU.cafe },
      { label: 'Actualización Precios', path: '/maestros/actualizacionPreciosMaestros', icon: <BadgeDollarSign size={14} />, color: PALETA_MENU.pizarra },
    ]
  },
  consignacion: {
    label: 'Consignación',
    icon: <PackageCheck size={18} />,
    color: PALETA_MENU.frambuesa,
    subItems: [
      { label: 'Ingresar Guía', path: '/consignacion/ingresarGuiaDespacho', icon: <FileScan size={14} />, color: PALETA_MENU.violeta },
      { label: 'Listado Guía', path: '/consignacion/listadoguiasconsignacion', icon: <FileText size={14} />, color: PALETA_MENU.ambar },
      { label: 'Registros', path: '/consignacion/registroConsignacion', icon: <ArrowRightToLine size={14} />, color: PALETA_MENU.turquesa },
      { label: 'Carga Masiva', path: '/consignacion/cargaMasivaConsignacion', icon: <FileSpreadsheet size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Cargas', path: '/consignacion/cargasConsignacion', icon: <CheckCheck size={14} />, color: PALETA_MENU.pasto },
      { label: 'Solicitud', path: '/consignacion/solicitudConsignacion', icon: <FilePlus size={14} />, color: PALETA_MENU.indigo },
      { label: 'Imputados', path: '/consignacion/resumenConsignacion', icon: <BarChart2 size={14} />, color: PALETA_MENU.rojo },
    ]
  },
  inventario: {
    label: 'Inventario',
    icon: <Warehouse size={18} />,
    color: PALETA_MENU.pasto,
    subItems: [
      { label: 'Stock General', path: '/inventario/generalInventario', icon: <Boxes size={14} />, color: PALETA_MENU.indigo },
      { label: 'Existencias', path: '/inventario/existenciasInventario', icon: <PackageSearch size={14} />, color: PALETA_MENU.rojo },
      { label: 'Ingresos', path: '/inventario/ingresosInventario', icon: <ArrowDownToLine size={14} />, color: PALETA_MENU.cafe },
      { label: 'Egresos', path: '/inventario/egresosInventario', icon: <ArrowUpFromLine size={14} />, color: PALETA_MENU.pizarra },
      { label: 'En Tránsito', path: '/inventario/transitoInventario', icon: <Truck size={14} />, color: PALETA_MENU.azul },
      { label: 'Historial', path: '/inventario/historialInventario', icon: <History size={14} />, color: PALETA_MENU.verde },
      { label: 'Stock Unidad', path: '/inventario/unidadInventario', icon: <Building2 size={14} />, color: PALETA_MENU.frambuesa },
      { label: 'Escaneo', path: '/inventario/escaneoInventario', icon: <ScanBarcode size={14} />, color: PALETA_MENU.violeta },
      { label: 'Inventario por cajas', path: '/inventario/inventarioCajas', icon: <ClipboardCheck size={14} />, color: PALETA_MENU.ambar },
    ]
  },
  bodega: {
    label: 'Bodega',
    icon: <PackageOpen size={18} />,
    color: PALETA_MENU.ambar,
    subItems: [
      { label: 'Maestro / Kardex', path: '/bodega/maestroBodega', icon: <Boxes size={14} />, color: PALETA_MENU.turquesa },
      { label: 'Ingreso', path: '/bodega/ingresoBodega', icon: <ArrowDownToLine size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Carga inicial', path: '/bodega/cargaInicialBodega', icon: <PackagePlus size={14} />, color: PALETA_MENU.pasto },
      { label: 'Egreso', path: '/bodega/egresoBodega', icon: <ArrowUpFromLine size={14} />, color: PALETA_MENU.indigo },
      { label: 'Tránsito', path: '/bodega/transitoBodega', icon: <Truck size={14} />, color: PALETA_MENU.rojo },
      { label: 'Tránsito por centro', path: '/bodega/centrosBodega', icon: <Building2 size={14} />, color: PALETA_MENU.cafe },
      { label: 'Consumo por centro', path: '/bodega/consumoBodega', icon: <BarChart3 size={14} />, color: PALETA_MENU.pizarra },
      { label: 'Inventario físico', path: '/bodega/inventarioBodega', icon: <ClipboardCheck size={14} />, color: PALETA_MENU.azul },
      { label: 'Cajas', path: '/bodega/cajasBodega', icon: <Package size={14} />, color: PALETA_MENU.verde },
      { label: 'Stock consignado', path: '/bodega/consignacionesBodega', icon: <Handshake size={14} />, color: PALETA_MENU.frambuesa },
      { label: 'Categorías y unidades', path: '/bodega/catalogosBodega', icon: <Tags size={14} />, color: PALETA_MENU.violeta },
    ]
  },
  documentos: {
    label: 'Documentos',
    icon: <Folder size={18} />,
    color: PALETA_MENU.violeta,
    subItems: [
      { label: 'Reportes Info', path: '/documentos/reportesInfo', icon: <BarChart2 size={14} />, color: PALETA_MENU.ambar },
      { label: 'Importar Detalles OC', path: '/documentos/importarDetallesOC', icon: <FileSpreadsheet size={14} />, color: PALETA_MENU.turquesa },
      { label: 'Seguimiento de Facturas y Guías', path: '/documentos/seguimientoFacturasGuias', icon: <Receipt size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Ingreso de Órdenes', path: '/documentos/ingresoOrdenes', icon: <FileUp size={14} />, color: PALETA_MENU.pasto },
      { label: 'Archivo digital', path: '/documentos/archivoDigital', icon: <FolderOpen size={14} />, color: PALETA_MENU.indigo },
    ]
  },

  implantes: {
    label: 'Implantes',
    icon: <Activity size={18} />,
    color: PALETA_MENU.azul,
    subItems: [
      { label: 'Gestion', path: '/implantes/gestionImplantes', icon: <FolderKanban size={14} />, color: PALETA_MENU.verde },
      { label: 'Carga masiva de documentos', path: '/implantes/cargaMasivaDocumentos', icon: <FolderUp size={14} />, color: PALETA_MENU.frambuesa },
      { label: 'Solicitud', path: '/implantes/solicitudImplantes', icon: <FilePlus size={14} />, color: PALETA_MENU.violeta },
      // Por defecto lo ve quien tiene Solicitud (heredaDe); ver config/accesoMenu.js.
      { label: 'Solicitudes de modificaciones', path: '/implantes/solicitudModificacionesImplantes', icon: <FilePen size={14} />, color: PALETA_MENU.rojo, heredaDe: '/implantes/solicitudImplantes' },
      { label: 'Imputados', path: '/implantes/resumenImplantes', icon: <BarChart2 size={14} />, color: PALETA_MENU.ambar },
      { label: 'Sincronizar', path: '/implantes/sincronizacionImputadas', icon: <GitCompareArrows size={14} />, color: PALETA_MENU.turquesa },
      { label: 'Reportes Info', path: '/implantes/reportesInfo', icon: <BarChart2 size={14} />, color: PALETA_MENU.fucsia },
      { label: 'Respaldo de documentos', path: '/implantes/respaldoDocumentos', icon: <Archive size={14} />, color: PALETA_MENU.pasto },
      // Misma pantalla y datos que Maestros → Codigos, con permisos propios.
      { label: 'Códigos', path: '/implantes/codigosImplantes', icon: <ScanBarcode size={14} />, color: PALETA_MENU.indigo },
      // Mismas pantallas y datos que en Documentos, con permisos propios.
      { label: 'Importar Detalles OC', path: '/implantes/importarDetallesOC', icon: <FileSpreadsheet size={14} />, color: PALETA_MENU.rojo },
      { label: 'Seguimiento de Facturas y Guías', path: '/implantes/seguimientoFacturasGuias', icon: <Receipt size={14} />, color: PALETA_MENU.cafe },
      { label: 'Ingreso de Órdenes', path: '/implantes/ingresoOrdenes', icon: <FileUp size={14} />, color: PALETA_MENU.pizarra },
    ]
  },
  hemodinamia: {
    label: 'Hemodinamia',
    icon: <HeartPulse size={18} />,
    color: PALETA_MENU.rojo,
    subItems: [
      { label: 'Gestion', path: '/hemodinamia/gestionHemodinamia', icon: <FolderKanban size={14} />, color: PALETA_MENU.cafe },
      { label: 'Carga masiva de documentos', path: '/hemodinamia/cargaMasivaDocumentos', icon: <FolderUp size={14} />, color: PALETA_MENU.pizarra },
      { label: 'Solicitud', path: '/hemodinamia/solicitudHemodinamia', icon: <FilePlus size={14} />, color: PALETA_MENU.azul },
      { label: 'Solicitudes de modificaciones', path: '/hemodinamia/solicitudModificacionesHemodinamia', icon: <FilePen size={14} />, color: PALETA_MENU.turquesa, heredaDe: '/hemodinamia/solicitudHemodinamia' },
      { label: 'Imputados', path: '/hemodinamia/resumenHemodinamia', icon: <BarChart2 size={14} />, color: PALETA_MENU.verde },
      { label: 'Sincronizar', path: '/hemodinamia/sincronizacionImputadas', icon: <GitCompareArrows size={14} />, color: PALETA_MENU.frambuesa },
      { label: 'Respaldo de documentos', path: '/hemodinamia/respaldoDocumentos', icon: <Archive size={14} />, color: PALETA_MENU.violeta },
      // Misma pantalla y datos que Maestros → Codigos, con permisos propios.
      { label: 'Códigos', path: '/hemodinamia/codigosHemodinamia', icon: <ScanBarcode size={14} />, color: PALETA_MENU.ambar },
    ]
  }
};

// --- CONFIGURACIÓN DE AJUSTES DEL SISTEMA ---
export const AJUSTES_ITEMS = [
  { path: '/settings/datosUsuarios', label: 'Datos Personales', icon: <UserCircle size={15} /> },
  { path: '/settings/cambiarPasswordAjustes', label: 'Cambiar Contraseña', icon: <Shield size={15} /> },
  { path: '/settings/ajusteTema', label: 'Tema y Apariencia', icon: <Sun size={15} /> },
  { path: '/ajustes/configPrivacidad', label: 'Config. Privacidad', icon: <Lock size={15} /> },
  { path: '/settings/modulosVisibles', label: 'Módulos Visibles', icon: <Eye size={15} /> },
  { path: '/settings/ordenModulos', label: 'Orden de Módulos', icon: <ArrowUpDown size={15} /> },
  // soloDesarrollador: solo se muestra al rol Desarrollador (configuración global).
  { path: '/settings/atajosDashboard', label: 'Atajos', icon: <Zap size={15} />, soloDesarrollador: true },
  { path: '/ajustes/preferenciasGenerales', label: 'Preferencias Generales', icon: <Sliders size={15} /> },
  { path: '/ajustes/ayudaSoporte', label: 'Ayuda y Soporte', icon: <HelpCircle size={15} /> },
];

// --- VISTAS ESPECIALES Y BREADCRUMBS ---
export const SPECIAL_VIEWS = {
  'dashboard': { label: 'Inicio', icon: <Home size={13} /> },
  'perfil': { label: 'Mi Perfil', icon: <UserCircle size={13} /> },
  'privacidad': { label: 'Política de Privacidad', icon: <ShieldCheck size={13} /> },
  'terminos': { label: 'Términos de Servicio', icon: <FileText size={13} /> },
  '/settings/datosUsuarios': { label: 'Datos Personales', icon: <UserCircle size={13} /> },
  '/settings/cambiarPasswordAjustes': { label: 'Cambiar Contraseña', icon: <Shield size={13} /> },
  '/settings/ajusteTema': { label: 'Tema y Apariencia', icon: <Sun size={13} /> },
  '/ajustes/configPrivacidad': { label: 'Configuración de Privacidad', icon: <Lock size={13} /> },
  '/settings/modulosVisibles': { label: 'Módulos Visibles', icon: <Eye size={13} /> },
  '/settings/ordenModulos': { label: 'Orden de Módulos', icon: <ArrowUpDown size={13} /> },
  '/settings/atajosDashboard': { label: 'Atajos del Dashboard', icon: <Zap size={13} /> },
  '/ajustes/preferenciasGenerales': { label: 'Preferencias Generales', icon: <Sliders size={13} /> },
  '/ajustes/ayudaSoporte': { label: 'Centro de Ayuda', icon: <HelpCircle size={13} /> },
};
