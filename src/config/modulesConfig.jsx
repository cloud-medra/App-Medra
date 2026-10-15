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
  ToggleRight
} from "lucide-react";

export const MODULES = {
  dashboard: {
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
    path: '/plataforma'
  },
  administracion: {
    label: 'Administración',
    icon: <Settings2 size={16} />,
    subItems: [
      // Buzón de alertas (solicitudes de cambio de datos): automático para
      // Administrador y Desarrollador, no se asigna (src/config/accesoMenu.js).
      { label: 'Alertas', path: '/administracion/alertas', icon: <Bell size={14} />, automaticoAdministradores: true },
      { label: 'Control Mensual', path: '/administracion/controlMensual', icon: <CalendarCheck size={14} /> },
      { label: 'Periodo Actual', path: '/administracion/ResumenPeriodoAbierto', icon: <CalendarDays size={14} /> },
      { label: 'Notas Admin', path: '/administracion/notasAdmin', icon: <StickyNote size={14} /> },
      { label: 'Recordatorios', path: '/administracion/recordatorios', icon: <BellRing size={14} /> },
      { label: 'Crear Usuario', path: '/administracion/crearUsuario', icon: <UserPlus size={14} /> },
      { label: 'Lista Usuario', path: '/administracion/listadoUsuario', icon: <Users size={14} /> },
      // Se asigna como cualquier ítem, pero solo sirve con rol Administrador
      // (o Desarrollador): ver src/config/accesoMenu.js y functions/permisos.
      { label: 'Permisos por centro', path: '/administracion/permisosCentro', icon: <KeyRound size={14} /> },
      { label: 'Cargas Consolidado', path: '/administracion/cargasConsolidado', icon: <GitMerge size={14} /> },
      { label: 'Estadísticas', path: '/administracion/estadisticas', icon: <BarChart3 size={14} /> },
      // Activar/inactivar módulos e ítems (config/modulosActivos.js): solo rol
      // Desarrollador, no se asigna (src/config/accesoMenu.js). No se puede inactivar.
      { label: 'Gestión de módulos', path: '/administracion/gestionModulos', icon: <ToggleRight size={14} />, soloDesarrollador: true }
    ]
  },
  laboratorio: {
    label: 'Laboratorio',
    icon: <Microscope size={18} />,
    subItems: [
      { label: 'Registro Empresas', path: '/laboratorio/empresasLaboratorio', icon: <Building2 size={14} /> },
      { label: 'Maestro Códigos', path: '/laboratorio/codigoLaboratorio', icon: <BadgeInfo size={14} /> },
      { label: 'Ordenes', path: '/laboratorio/ordenLaboratorio', icon: <ClipboardList size={14} /> },
      { label: 'Xml Documentos', path: '/laboratorio/xmlDocLaboratorio', icon: <FileCode size={14} /> },
      { label: 'Control Procesos', path: '/laboratorio/archivosControlLaboratorio', icon: <FileSpreadsheet size={14} /> },
    ]
  },
  vacunatorio: {
    label: 'Vacunatorio',
    icon: <Syringe size={18} />,
    subItems: [
      { label: 'Registro Empresas', path: '/vacunatorio/empresasVacunatorio', icon: <Building2 size={14} /> },
      { label: 'Maestro Códigos', path: '/vacunatorio/codigoVacunatorio', icon: <BadgeInfo size={14} /> },
      { label: 'Ordenes', path: '/vacunatorio/ordenVacunatorio', icon: <ClipboardList size={14} /> },
      { label: 'Xml Documentos', path: '/vacunatorio/xmlDocVacunatorio', icon: <FileCode size={14} /> },
      { label: 'Control Procesos', path: '/vacunatorio/archivosControlVacunatorio', icon: <FileSpreadsheet size={14} /> },
    ]
  },
  maestros: {
    label: 'Maestros',
    icon: <Database size={18} />,
    subItems: [
      { label: 'Empresas', path: '/maestros/empresasMaestros', icon: <Factory size={14} /> },
      { label: 'Prestadores', path: '/maestros/prestadoresMaestros', icon: <UserRound size={14} /> },
      { label: 'Centros', path: '/maestros/centrosMaestros', icon: <Hospital size={14} /> },
      { label: 'Zonas por diagnóstico', path: '/maestros/zonasDiagnostico', icon: <PersonStanding size={14} /> },
      { label: 'Descripciones ocultas', path: '/maestros/descripcionesOcultas', icon: <EyeOff size={14} /> },
      { label: 'Previsiones', path: '/maestros/previsionesMaestros', icon: <ShieldCheck size={14} /> },
      { label: 'Convenios', path: '/maestros/conveniosMaestros', icon: <Handshake size={14} /> },
      { label: 'Recargos', path: '/maestros/recargosMaestros', icon: <Percent size={14} /> },
      { label: 'Calculador', path: '/maestros/calculadorMaestros', icon: <Calculator size={14} /> },
      { label: 'Codigos', path: '/maestros/codigosMaestros', icon: <ScanBarcode size={14} /> },
      { label: 'Pad', path: '/maestros/padMaestros', icon: <SlidersHorizontal size={14} /> },
      { label: 'Actualización Precios', path: '/maestros/actualizacionPreciosMaestros', icon: <BadgeDollarSign size={14} /> },
    ]
  },
  consignacion: {
    label: 'Consignación',
    icon: <PackageCheck size={18} />,
    subItems: [
      { label: 'Ingresar Guía', path: '/consignacion/ingresarGuiaDespacho', icon: <FileScan size={14} /> },
      { label: 'Listado Guía', path: '/consignacion/listadoguiasconsignacion', icon: <FileText size={14} /> },
      { label: 'Registros', path: '/consignacion/registroConsignacion', icon: <ArrowRightToLine size={14} /> },
      { label: 'Carga Masiva', path: '/consignacion/cargaMasivaConsignacion', icon: <FileSpreadsheet size={14} /> },
      { label: 'Cargas', path: '/consignacion/cargasConsignacion', icon: <CheckCheck size={14} /> },
      { label: 'Solicitud', path: '/consignacion/solicitudConsignacion', icon: <FilePlus size={14} /> },
      { label: 'Resumen', path: '/consignacion/resumenConsignacion', icon: <BarChart2 size={14} /> },
    ]
  },
  inventario: {
    label: 'Inventario',
    icon: <Warehouse size={18} />,
    subItems: [
      { label: 'Stock General', path: '/inventario/generalInventario', icon: <Boxes size={14} /> },
      { label: 'Existencias', path: '/inventario/existenciasInventario', icon: <PackageSearch size={14} /> },
      { label: 'Ingresos', path: '/inventario/ingresosInventario', icon: <ArrowDownToLine size={14} /> },
      { label: 'Egresos', path: '/inventario/egresosInventario', icon: <ArrowUpFromLine size={14} /> },
      { label: 'En Tránsito', path: '/inventario/transitoInventario', icon: <Truck size={14} /> },
      { label: 'Historial', path: '/inventario/historialInventario', icon: <History size={14} /> },
      { label: 'Stock Unidad', path: '/inventario/unidadInventario', icon: <Building2 size={14} /> },
      { label: 'Escaneo', path: '/inventario/escaneoInventario', icon: <ScanBarcode size={14} /> },
      { label: 'Inventario por cajas', path: '/inventario/inventarioCajas', icon: <ClipboardCheck size={14} /> },
    ]
  },
  bodega: {
    label: 'Bodega',
    icon: <PackageOpen size={18} />,
    subItems: [
      { label: 'Maestro / Kardex', path: '/bodega/maestroBodega', icon: <Boxes size={14} /> },
      { label: 'Ingreso', path: '/bodega/ingresoBodega', icon: <ArrowDownToLine size={14} /> },
      { label: 'Carga inicial', path: '/bodega/cargaInicialBodega', icon: <PackagePlus size={14} /> },
      { label: 'Egreso', path: '/bodega/egresoBodega', icon: <ArrowUpFromLine size={14} /> },
      { label: 'Tránsito', path: '/bodega/transitoBodega', icon: <Truck size={14} /> },
      { label: 'Tránsito por centro', path: '/bodega/centrosBodega', icon: <Building2 size={14} /> },
      { label: 'Consumo por centro', path: '/bodega/consumoBodega', icon: <BarChart3 size={14} /> },
      { label: 'Inventario físico', path: '/bodega/inventarioBodega', icon: <ClipboardCheck size={14} /> },
      { label: 'Cajas', path: '/bodega/cajasBodega', icon: <Package size={14} /> },
      { label: 'Categorías y unidades', path: '/bodega/catalogosBodega', icon: <Tags size={14} /> },
    ]
  },
  documentos: {
    label: 'Documentos',
    icon: <Folder size={18} />,
    subItems: [
      { label: 'Reportes Info', path: '/documentos/reportesInfo', icon: <BarChart2 size={14} /> },
      { label: 'Importar Detalles OC', path: '/documentos/importarDetallesOC', icon: <FileSpreadsheet size={14} /> },
      { label: 'Seguimiento de Facturas y Guías', path: '/documentos/seguimientoFacturasGuias', icon: <Receipt size={14} /> },
      { label: 'Ingreso de Órdenes', path: '/documentos/ingresoOrdenes', icon: <FileUp size={14} /> },
      { label: 'Archivo digital', path: '/documentos/archivoDigital', icon: <FolderOpen size={14} /> },
    ]
  },

  implantes: {
    label: 'Implantes',
    icon: <Activity size={18} />,
    subItems: [
      { label: 'Gestion', path: '/implantes/gestionImplantes', icon: <FolderKanban size={14} /> },
      { label: 'Carga masiva de documentos', path: '/implantes/cargaMasivaDocumentos', icon: <FolderUp size={14} /> },
      { label: 'Solicitud', path: '/implantes/solicitudImplantes', icon: <FilePlus size={14} /> },
      { label: 'Resumen', path: '/implantes/resumenImplantes', icon: <BarChart2 size={14} /> },
      { label: 'Sincronizar', path: '/implantes/sincronizacionImputadas', icon: <GitCompareArrows size={14} /> },
      { label: 'Reportes Info', path: '/implantes/reportesInfo', icon: <BarChart2 size={14} /> },
      { label: 'Respaldo de documentos', path: '/implantes/respaldoDocumentos', icon: <Archive size={14} /> },
      // Misma pantalla y datos que Maestros → Codigos, con permisos propios.
      { label: 'Códigos', path: '/implantes/codigosImplantes', icon: <ScanBarcode size={14} /> },
    ]
  },
  hemodinamia: {
    label: 'Hemodinamia',
    icon: <HeartPulse size={18} />,
    subItems: [
      { label: 'Gestion', path: '/hemodinamia/gestionHemodinamia', icon: <FolderKanban size={14} /> },
      { label: 'Carga masiva de documentos', path: '/hemodinamia/cargaMasivaDocumentos', icon: <FolderUp size={14} /> },
      { label: 'Solicitud', path: '/hemodinamia/solicitudHemodinamia', icon: <FilePlus size={14} /> },
      { label: 'Resumen', path: '/hemodinamia/resumenHemodinamia', icon: <BarChart2 size={14} /> },
      { label: 'Sincronizar', path: '/hemodinamia/sincronizacionImputadas', icon: <GitCompareArrows size={14} /> },
      { label: 'Respaldo de documentos', path: '/hemodinamia/respaldoDocumentos', icon: <Archive size={14} /> },
      // Misma pantalla y datos que Maestros → Codigos, con permisos propios.
      { label: 'Códigos', path: '/hemodinamia/codigosHemodinamia', icon: <ScanBarcode size={14} /> },
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
