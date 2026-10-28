// Códigos cortos de los módulos y de sus ítems, al estilo de las
// transacciones de SAP (ej. LAB = Laboratorio, LABFOL = Ingreso de Folios).
// Es la ÚNICA definición: la usan el sidebar y la usará su buscador.
//
// Reglas (las verifica codigosModulos.test.js):
//   - 3 letras mayúsculas, únicos y PERMANENTES: no se cambian ni se
//     reutilizan aunque el módulo se renombre o se elimine (los usuarios los
//     aprenden y se usarán en búsquedas y atajos). No son editables desde la app.
//   - La clave es la de la entrada del sidebar (clave interna del módulo en
//     modulesConfig.jsx o del grupo en gruposMenu.jsx), no su nombre visible.
//   - Todo módulo y grupo del menú debe tener el suyo; uno nuevo sin código
//     hace fallar el test.
//   - `dashboard` y `ajustes` (modo Ajustes Sistema, sin módulo propio) no
//     salen en la lista de módulos, pero tienen código para el buscador.

export const ENTRADA_AJUSTES = 'ajustes';

export const CODIGOS_MODULOS = Object.freeze({
  implantes: 'IMP',
  hemodinamia: 'HEM',
  consignacion: 'CON',
  documentos: 'DOC',
  laboratorio: 'LAB',
  vacunatorio: 'VAC',
  bodega: 'BOD',
  inventario: 'INV',
  maestros: 'MAE',
  finanzas: 'FIN',
  usuarios: 'USR',
  administracion: 'HER',
  dashboard: 'DSH',
  [ENTRADA_AJUSTES]: 'AJU',
});

// Código de una entrada del sidebar (módulo o grupo), o null si no tiene.
export const codigoEntrada = (entrada) => CODIGOS_MODULOS[entrada] ?? null;

// --- Códigos de ítems --------------------------------------------------------
// Código del módulo (de la entrada del sidebar donde aparece el ítem: los de
// Herramientas usan FIN, USR o HER según su grupo) + 3 letras asociadas al
// nombre. Sin números, para que no se note si faltan ítems. Las 3 letras
// nunca son un código de módulo (ej. Imputados = IPT, no IMP). Las pantallas
// repetidas en varios módulos usan las mismas letras (DOCREP / IMPREP).
// La clave es la ruta del ítem (su clave interna en modulesConfig.jsx y en
// los permisos), no su nombre visible. Únicos y permanentes, como los de
// módulos: si un ítem cambia de grupo o de nombre, conserva su código.
// Existen aunque el usuario no tenga el ítem: cada uno ve solo los suyos.

const LAB_CP = '/laboratorio/archivosControlLaboratorio';
const VAC_CP = '/vacunatorio/archivosControlVacunatorio';

export const CODIGOS_ITEMS = Object.freeze({
  // Finanzas (administracion, grupo finanzas)
  '/administracion/controlMensual': 'FINCIE',
  '/administracion/ResumenPeriodoAbierto': 'FINACT',
  '/administracion/cargasConsolidado': 'FINCAR',
  '/administracion/estadisticas': 'FINEST',
  '/administracion/consumos': 'FINCSM',
  '/administracion/facturas': 'FINFAC',
  '/administracion/valorizacionBodega': 'FINVAL',
  '/administracion/comparativoMes': 'FINCOM',
  // Usuarios y accesos (administracion, grupo usuarios)
  '/administracion/alertas': 'USRALE',
  '/administracion/crearUsuario': 'USRCRE',
  '/administracion/listadoUsuario': 'USRLIS',
  '/administracion/permisosCentro': 'USRPER',
  // Herramientas (administracion, sin grupo)
  '/administracion/notasAdmin': 'HERNOT',
  '/administracion/recordatorios': 'HERREC',
  '/administracion/tickets': 'HERTIC',
  '/administracion/gestionModulos': 'HERMOD',
  // Laboratorio
  '/laboratorio/empresasLaboratorio': 'LABEMP',
  '/laboratorio/codigoLaboratorio': 'LABCOD',
  '/laboratorio/ordenLaboratorio': 'LABORD',
  '/laboratorio/xmlDocLaboratorio': 'LABXML',
  [`${LAB_CP}/documentosRecibidos`]: 'LABREC',
  [`${LAB_CP}/iniciarProcesos`]: 'LABFOL',
  [`${LAB_CP}/vinculacionCodigos`]: 'LABVCO',
  [`${LAB_CP}/vinculacionOrdenes`]: 'LABVOR',
  [`${LAB_CP}/solicitudDiferencias`]: 'LABDIF',
  [`${LAB_CP}/documentosListos`]: 'LABLIS',
  [`${LAB_CP}/documentosImputados`]: 'LABIPT',
  [`${LAB_CP}/documentosEdicion`]: 'LABEDI',
  // Vacunatorio
  '/vacunatorio/empresasVacunatorio': 'VACEMP',
  '/vacunatorio/codigoVacunatorio': 'VACCOD',
  '/vacunatorio/ordenVacunatorio': 'VACORD',
  '/vacunatorio/xmlDocVacunatorio': 'VACXML',
  [`${VAC_CP}/documentosRecibidos`]: 'VACREC',
  [`${VAC_CP}/iniciarProcesos`]: 'VACFOL',
  [`${VAC_CP}/vinculacionCodigos`]: 'VACVCO',
  [`${VAC_CP}/vinculacionOrdenes`]: 'VACVOR',
  [`${VAC_CP}/solicitudDiferencias`]: 'VACDIF',
  [`${VAC_CP}/documentosListos`]: 'VACLIS',
  [`${VAC_CP}/documentosImputados`]: 'VACIPT',
  [`${VAC_CP}/documentosEdicion`]: 'VACEDI',
  // Maestros
  '/maestros/empresasMaestros': 'MAEEMP',
  '/maestros/prestadoresMaestros': 'MAEPRS',
  '/maestros/centrosMaestros': 'MAECEN',
  '/maestros/institucionesMaestros': 'MAEINS',
  '/maestros/zonasDiagnostico': 'MAEZON',
  '/maestros/descripcionesOcultas': 'MAEOCU',
  '/maestros/previsionesMaestros': 'MAEPRV',
  '/maestros/conveniosMaestros': 'MAECNV',
  '/maestros/recargosMaestros': 'MAEREC',
  '/maestros/calculadorMaestros': 'MAECAL',
  '/maestros/codigosMaestros': 'MAECOD',
  '/maestros/padMaestros': 'MAEPAD',
  '/maestros/actualizacionPreciosMaestros': 'MAEACT',
  // Consignación
  '/consignacion/ingresarGuiaDespacho': 'CONING',
  '/consignacion/listadoguiasconsignacion': 'CONGUI',
  '/consignacion/registroConsignacion': 'CONREG',
  '/consignacion/cargaMasivaConsignacion': 'CONMAS',
  '/consignacion/cargasConsignacion': 'CONCAR',
  '/consignacion/solicitudConsignacion': 'CONSOL',
  '/consignacion/solicitudModificacionesConsignacion': 'CONMOD',
  '/consignacion/resumenConsignacion': 'CONIPT',
  // Inventario
  '/inventario/generalInventario': 'INVGEN',
  '/inventario/existenciasInventario': 'INVEXI',
  '/inventario/ingresosInventario': 'INVING',
  '/inventario/egresosInventario': 'INVEGR',
  '/inventario/transitoInventario': 'INVTRA',
  '/inventario/historialInventario': 'INVHIS',
  '/inventario/unidadInventario': 'INVUNI',
  '/inventario/escaneoInventario': 'INVESC',
  '/inventario/inventarioCajas': 'INVCAJ',
  // Bodega
  '/bodega/maestroBodega': 'BODKAR',
  '/bodega/ingresoBodega': 'BODING',
  '/bodega/cargaInicialBodega': 'BODINI',
  '/bodega/egresoBodega': 'BODEGR',
  '/bodega/transitoBodega': 'BODTRA',
  '/bodega/centrosBodega': 'BODTRC',
  '/bodega/consumoBodega': 'BODCSM',
  '/bodega/inventarioBodega': 'BODFIS',
  '/bodega/cajasBodega': 'BODCAJ',
  '/bodega/consignacionesBodega': 'BODCNS',
  '/bodega/catalogosBodega': 'BODCAT',
  // Documentos
  '/documentos/reportesInfo': 'DOCREP',
  '/documentos/importarDetallesOC': 'DOCIOC',
  '/documentos/seguimientoFacturasGuias': 'DOCSEG',
  '/documentos/ingresoOrdenes': 'DOCORD',
  '/documentos/archivoDigital': 'DOCARC',
  // Implantes
  '/implantes/gestionImplantes': 'IMPGES',
  '/implantes/cargaMasivaDocumentos': 'IMPMAS',
  '/implantes/solicitudImplantes': 'IMPSOL',
  '/implantes/solicitudModificacionesImplantes': 'IMPMOD',
  '/implantes/resumenImplantes': 'IMPIPT',
  '/implantes/sincronizacionImputadas': 'IMPSIN',
  '/implantes/reportesInfo': 'IMPREP',
  '/implantes/respaldoDocumentos': 'IMPRES',
  '/implantes/codigosImplantes': 'IMPCOD',
  '/implantes/importarDetallesOC': 'IMPIOC',
  '/implantes/seguimientoFacturasGuias': 'IMPSEG',
  '/implantes/ingresoOrdenes': 'IMPORD',
  '/implantes/fibrasReutilizables': 'IMPFIB',
  // Hemodinamia
  '/hemodinamia/gestionHemodinamia': 'HEMGES',
  '/hemodinamia/cargaMasivaDocumentos': 'HEMMAS',
  '/hemodinamia/solicitudHemodinamia': 'HEMSOL',
  '/hemodinamia/solicitudModificacionesHemodinamia': 'HEMMOD',
  '/hemodinamia/resumenHemodinamia': 'HEMIPT',
  '/hemodinamia/sincronizacionImputadas': 'HEMSIN',
  '/hemodinamia/respaldoDocumentos': 'HEMRES',
  '/hemodinamia/codigosHemodinamia': 'HEMCOD',
  // Ajustes Sistema (AJUSTES_ITEMS)
  '/settings/datosUsuarios': 'AJUDAT',
  '/settings/cambiarPasswordAjustes': 'AJUCLA',
  '/settings/ajusteTema': 'AJUTEM',
  '/ajustes/configPrivacidad': 'AJUPRI',
  '/settings/modulosVisibles': 'AJUVIS',
  '/settings/ordenModulos': 'AJUORD',
  '/settings/atajosDashboard': 'AJUATA',
  '/ajustes/preferenciasGenerales': 'AJUPRE',
  '/ajustes/ayudaSoporte': 'AJUAYU',
});

// Código de un ítem por su ruta, o null si no tiene.
export const codigoItem = (ruta) => CODIGOS_ITEMS[ruta] ?? null;
