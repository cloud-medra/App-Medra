// Códigos de módulos y de ítems: formato, unicidad, cobertura de todo el
// menú (y Ajustes) y permanencia de los ya publicados.
import { describe, it, expect } from 'vitest';
import { CODIGOS_MODULOS, CODIGOS_ITEMS, codigoEntrada, codigoItem, ENTRADA_AJUSTES } from './codigosModulos';
import { MODULES, AJUSTES_ITEMS } from './modulesConfig.jsx';
import { GRUPOS_MENU, entradaDeItem } from './gruposMenu.jsx';

const codigosModulo = Object.values(CODIGOS_MODULOS);

// Todos los ítems con la entrada del sidebar donde aparecen.
const ITEMS = [
  ...Object.entries(MODULES).flatMap(([mKey, m]) => (m.subItems || []).map((s) => ({ ruta: s.path, entrada: entradaDeItem(mKey, s) }))),
  ...AJUSTES_ITEMS.map((s) => ({ ruta: s.path, entrada: ENTRADA_AJUSTES })),
];

describe('códigos de módulos', () => {
  it('3 letras mayúsculas y únicos', () => {
    codigosModulo.forEach((c) => expect(c).toMatch(/^[A-Z]{3}$/));
    expect(new Set(codigosModulo).size).toBe(codigosModulo.length);
  });

  it('todo módulo y grupo del menú tiene código', () => {
    [...Object.keys(MODULES), ...Object.keys(GRUPOS_MENU)].forEach((k) => {
      expect(codigoEntrada(k), `falta el código de "${k}"`).not.toBeNull();
    });
  });

  // Permanentes: si este test falla porque se cambió un código, revertir el
  // cambio (los códigos publicados no se modifican). Uno nuevo se agrega aquí.
  it('los códigos publicados no cambian', () => {
    expect(CODIGOS_MODULOS).toEqual({
      implantes: 'IMP', hemodinamia: 'HEM', consignacion: 'CON', documentos: 'DOC',
      laboratorio: 'LAB', vacunatorio: 'VAC', bodega: 'BOD', inventario: 'INV',
      maestros: 'MAE', finanzas: 'FIN', usuarios: 'USR', administracion: 'HER',
      dashboard: 'DSH', ajustes: 'AJU',
    });
  });
});

describe('códigos de ítems', () => {
  it('todo ítem de los módulos y de Ajustes tiene código, y no sobran códigos', () => {
    ITEMS.forEach(({ ruta }) => expect(codigoItem(ruta), `falta el código de "${ruta}"`).not.toBeNull());
    expect(Object.keys(CODIGOS_ITEMS).sort()).toEqual(ITEMS.map((i) => i.ruta).sort());
  });

  it('código de su módulo (entrada del sidebar) + 3 letras mayúsculas', () => {
    ITEMS.forEach(({ ruta, entrada }) => {
      expect(codigoItem(ruta), ruta).toMatch(/^[A-Z]{6}$/);
      expect(codigoItem(ruta).slice(0, 3), ruta).toBe(codigoEntrada(entrada));
    });
  });

  it('las 3 letras del ítem nunca son un código de módulo', () => {
    Object.entries(CODIGOS_ITEMS).forEach(([ruta, c]) => {
      expect(codigosModulo, `${c} (${ruta})`).not.toContain(c.slice(3));
    });
  });

  it('únicos entre sí y distintos de los códigos de módulo', () => {
    const todos = [...codigosModulo, ...Object.values(CODIGOS_ITEMS)];
    expect(new Set(todos).size).toBe(todos.length);
  });

  // Igual que los de módulos: permanentes. Uno nuevo se agrega aquí.
  it('los códigos publicados no cambian', () => {
    const publicados = Object.fromEntries(PUBLICADOS.trim().split('\n').map((l) => l.trim().split(' ')));
    expect(CODIGOS_ITEMS).toEqual(publicados);
  });
});

// "ruta CÓDIGO", uno por línea.
const PUBLICADOS = `
  /administracion/controlMensual FINCIE
  /administracion/ResumenPeriodoAbierto FINACT
  /administracion/cargasConsolidado FINCAR
  /administracion/estadisticas FINEST
  /administracion/consumos FINCSM
  /administracion/facturas FINFAC
  /administracion/valorizacionBodega FINVAL
  /administracion/comparativoMes FINCOM
  /administracion/alertas USRALE
  /administracion/crearUsuario USRCRE
  /administracion/listadoUsuario USRLIS
  /administracion/permisosCentro USRPER
  /administracion/notasAdmin HERNOT
  /administracion/recordatorios HERREC
  /administracion/tickets HERTIC
  /administracion/gestionModulos HERMOD
  /laboratorio/empresasLaboratorio LABEMP
  /laboratorio/codigoLaboratorio LABCOD
  /laboratorio/ordenLaboratorio LABORD
  /laboratorio/xmlDocLaboratorio LABXML
  /laboratorio/archivosControlLaboratorio/documentosRecibidos LABREC
  /laboratorio/archivosControlLaboratorio/iniciarProcesos LABFOL
  /laboratorio/archivosControlLaboratorio/vinculacionCodigos LABVCO
  /laboratorio/archivosControlLaboratorio/vinculacionOrdenes LABVOR
  /laboratorio/archivosControlLaboratorio/solicitudDiferencias LABDIF
  /laboratorio/archivosControlLaboratorio/documentosListos LABLIS
  /laboratorio/archivosControlLaboratorio/documentosImputados LABIPT
  /laboratorio/archivosControlLaboratorio/documentosEdicion LABEDI
  /vacunatorio/empresasVacunatorio VACEMP
  /vacunatorio/codigoVacunatorio VACCOD
  /vacunatorio/ordenVacunatorio VACORD
  /vacunatorio/xmlDocVacunatorio VACXML
  /vacunatorio/archivosControlVacunatorio/documentosRecibidos VACREC
  /vacunatorio/archivosControlVacunatorio/iniciarProcesos VACFOL
  /vacunatorio/archivosControlVacunatorio/vinculacionCodigos VACVCO
  /vacunatorio/archivosControlVacunatorio/vinculacionOrdenes VACVOR
  /vacunatorio/archivosControlVacunatorio/solicitudDiferencias VACDIF
  /vacunatorio/archivosControlVacunatorio/documentosListos VACLIS
  /vacunatorio/archivosControlVacunatorio/documentosImputados VACIPT
  /vacunatorio/archivosControlVacunatorio/documentosEdicion VACEDI
  /maestros/empresasMaestros MAEEMP
  /maestros/prestadoresMaestros MAEPRS
  /maestros/centrosMaestros MAECEN
  /maestros/institucionesMaestros MAEINS
  /maestros/zonasDiagnostico MAEZON
  /maestros/descripcionesOcultas MAEOCU
  /maestros/previsionesMaestros MAEPRV
  /maestros/conveniosMaestros MAECNV
  /maestros/recargosMaestros MAEREC
  /maestros/calculadorMaestros MAECAL
  /maestros/codigosMaestros MAECOD
  /maestros/padMaestros MAEPAD
  /maestros/actualizacionPreciosMaestros MAEACT
  /consignacion/ingresarGuiaDespacho CONING
  /consignacion/listadoguiasconsignacion CONGUI
  /consignacion/registroConsignacion CONREG
  /consignacion/cargaMasivaConsignacion CONMAS
  /consignacion/cargasConsignacion CONCAR
  /consignacion/solicitudConsignacion CONSOL
  /consignacion/solicitudModificacionesConsignacion CONMOD
  /consignacion/resumenConsignacion CONIPT
  /inventario/generalInventario INVGEN
  /inventario/existenciasInventario INVEXI
  /inventario/ingresosInventario INVING
  /inventario/egresosInventario INVEGR
  /inventario/transitoInventario INVTRA
  /inventario/historialInventario INVHIS
  /inventario/unidadInventario INVUNI
  /inventario/escaneoInventario INVESC
  /inventario/inventarioCajas INVCAJ
  /bodega/maestroBodega BODKAR
  /bodega/ingresoBodega BODING
  /bodega/cargaInicialBodega BODINI
  /bodega/egresoBodega BODEGR
  /bodega/transitoBodega BODTRA
  /bodega/centrosBodega BODTRC
  /bodega/consumoBodega BODCSM
  /bodega/inventarioBodega BODFIS
  /bodega/cajasBodega BODCAJ
  /bodega/consignacionesBodega BODCNS
  /bodega/catalogosBodega BODCAT
  /documentos/reportesInfo DOCREP
  /documentos/importarDetallesOC DOCIOC
  /documentos/seguimientoFacturasGuias DOCSEG
  /documentos/ingresoOrdenes DOCORD
  /documentos/archivoDigital DOCARC
  /implantes/gestionImplantes IMPGES
  /implantes/cargaMasivaDocumentos IMPMAS
  /implantes/solicitudImplantes IMPSOL
  /implantes/solicitudModificacionesImplantes IMPMOD
  /implantes/resumenImplantes IMPIPT
  /implantes/sincronizacionImputadas IMPSIN
  /implantes/reportesInfo IMPREP
  /implantes/respaldoDocumentos IMPRES
  /implantes/codigosImplantes IMPCOD
  /implantes/importarDetallesOC IMPIOC
  /implantes/seguimientoFacturasGuias IMPSEG
  /implantes/ingresoOrdenes IMPORD
  /hemodinamia/gestionHemodinamia HEMGES
  /hemodinamia/cargaMasivaDocumentos HEMMAS
  /hemodinamia/solicitudHemodinamia HEMSOL
  /hemodinamia/solicitudModificacionesHemodinamia HEMMOD
  /hemodinamia/resumenHemodinamia HEMIPT
  /hemodinamia/sincronizacionImputadas HEMSIN
  /hemodinamia/respaldoDocumentos HEMRES
  /hemodinamia/codigosHemodinamia HEMCOD
  /settings/datosUsuarios AJUDAT
  /settings/cambiarPasswordAjustes AJUCLA
  /settings/ajusteTema AJUTEM
  /ajustes/configPrivacidad AJUPRI
  /settings/modulosVisibles AJUVIS
  /settings/ordenModulos AJUORD
  /settings/atajosDashboard AJUATA
  /ajustes/preferenciasGenerales AJUPRE
  /ajustes/ayudaSoporte AJUAYU
`;
