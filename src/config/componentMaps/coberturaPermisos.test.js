import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_MAPS } from './index.js';

// Toda llamada hasPermission(RUTA, 'seccion', 'elemento') de las pantallas
// tiene que existir en COMPONENT_MAPS. Si la vista no existe en el mapa,
// useGranularPermission bloquea a todo usuario que no sea admin/dev y el
// formulario de usuarios no ofrece cómo otorgarla (pasaba con Laboratorio
// Códigos/Órdenes/XML). Solo se revisan rutas literales (constante o texto
// en el mismo archivo); `privado/` es código de respaldo fuera del menú.
const RAIZ = fileURLToPath(new URL('../../components', import.meta.url));

const mapas = {};
const agregar = (ruta, config) => {
  mapas[ruta] = config;
  Object.entries(config.procesos || {}).forEach(([p, c]) => agregar(p, c));
};
Object.entries(COMPONENT_MAPS).forEach(([ruta, config]) => agregar(ruta, config));

const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'privado' ? [] : recorrer(p);
  return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});

// Componentes compartidos que reciben la ruta por prop: se verifican
// contra cada vista que los monta.
const RUTAS_DINAMICAS = {
  // Códigos: misma pantalla en Maestros y en Implantes (prop rutaVista).
  'modulos/maestros/codigosMaestros/components/tabPendientes/TabPendientes.jsx': ['/maestros/codigosMaestros/pendientes', '/implantes/codigosImplantes/pendientes'],
  'modulos/maestros/codigosMaestros/components/tabConCodigo/TabConCodigo.jsx': ['/maestros/codigosMaestros/conCodigo', '/implantes/codigosImplantes/conCodigo'],
  'modulos/maestros/codigosMaestros/components/tabVistaGeneral/TabVistaGeneral.jsx': ['/maestros/codigosMaestros/vistaGeneral', '/implantes/codigosImplantes/vistaGeneral'],
  'modulos/gestiones/shared/TablaOrdenes.jsx': ['/laboratorio/ordenLaboratorio', '/vacunatorio/ordenVacunatorio'],
  'modulos/gestiones/shared/DetalleOrdenTabla.jsx': ['/laboratorio/ordenLaboratorio', '/vacunatorio/ordenVacunatorio'],
  'modulos/gestiones/shared/TablaXmlDocumentos.jsx': ['/laboratorio/xmlDocLaboratorio', '/vacunatorio/xmlDocVacunatorio'],
  'modulos/gestiones/laboratorio/vizualizador/XmlDetallesDoc.jsx': ['/laboratorio/xmlDocLaboratorio', '/laboratorio/archivosControlLaboratorio/documentosRecibidos'],
  'modulos/gestiones/vacunatorio/vizualizador/XmlDetallesDoc.jsx': ['/vacunatorio/xmlDocVacunatorio', '/vacunatorio/archivosControlVacunatorio/documentosRecibidos'],
  'modulos/operaciones/documentos/reportesInfo/ReportesInfo.jsx': ['/documentos/reportesInfo', '/implantes/reportesInfo'],
  // Pantallas compartidas por Implantes y Hemodinamia (shared/modulosGestion.js).
  'modulos/operaciones/shared/respaldoDocumentos/RespaldoDocumentos.jsx': ['/implantes/respaldoDocumentos', '/hemodinamia/respaldoDocumentos'],
  'modulos/operaciones/shared/sincronizacionImputadas/SincronizacionImputadas.jsx': ['/implantes/sincronizacionImputadas', '/hemodinamia/sincronizacionImputadas'],
};

const usos = [];
recorrer(RAIZ).forEach((archivo) => {
  const src = fs.readFileSync(archivo, 'utf8');
  if (!src.includes('hasPermission(')) return;
  const constantes = {};
  for (const m of src.matchAll(/const\s+([A-Za-z_]+)\s*=\s*['"](\/[^'"]+)['"]/g)) constantes[m[1]] = m[2];
  for (const m of src.matchAll(/hasPermission\(\s*([A-Za-z_]+|['"][^'"]+['"])\s*,\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g)) {
    const ruta = m[1].startsWith("'") || m[1].startsWith('"') ? m[1].slice(1, -1) : constantes[m[1]];
    // Ruta por prop: se verifica contra cada vista que monta el componente
    // (RUTAS_DINAMICAS); si no está declarada, no es verificable.
    const relativo = path.relative(RAIZ, archivo).split(path.sep).join('/');
    const rutas = ruta ? [ruta] : (RUTAS_DINAMICAS[relativo] || []);
    rutas.forEach((r) => usos.push({ archivo: relativo, ruta: r, seccion: m[2], elemento: m[3] }));
  }
});

// --- Granularidad por columnas ---------------------------------------
// useColumnasPermitidas(RUTA, 'seccion', LISTA): cada `key` de la `const
// LISTA = [...]` del archivo (salvo `fija: true`) debe existir como
// `col_<key>` en esa sección del mapa.


// Tablas que todavía no tienen granularidad por columnas: pendientes de la
// segunda tanda. Una tabla NUEVA que no esté acá y no declare sus columnas
// hace fallar el test.
const TABLAS_PENDIENTES = new Set([
  'modulos/administracion/cargasConsolidado/components/GestionUnificadaTable.jsx',
  'modulos/administracion/cargasConsolidado/components/ImputadasUnificadasTable.jsx',
  'modulos/administracion/cargasConsolidado/components/SolicitudesUnificadasTable.jsx',
  'modulos/administracion/controlMensual/ControlMensual.jsx',
  'modulos/administracion/controlMensual/MonthRow.jsx',
  'modulos/administracion/usuarios/ListadoUsuario.jsx',
  'modulos/inventario/egresosInventario/EgresosInventario.jsx',
  'modulos/inventario/escaneoInventario/egreso/EgresoPorEscaneo.jsx',
  'modulos/inventario/escaneoInventario/ingreso/IngresoDirecto.jsx',
  'modulos/inventario/escaneoInventario/ingresoDocumento/IngresoPorDocumento.jsx',
  'modulos/inventario/generalInventario/InventarioTable.jsx',
  'modulos/inventario/historialInventario/HistorialInventario.jsx',
  'modulos/inventario/ingresosInventario/TablaItemsIngreso.jsx',
  'modulos/inventario/inventarioCajas/components/ConteoCaja.jsx',
  'modulos/inventario/inventarioCajas/components/ResumenComparacion.jsx',
  'modulos/inventario/unidadInventario/UnidadInventario.jsx',
  'modulos/maestros/actualizacionPreciosMaestros/components/DetalleImportacion.jsx',
  'modulos/maestros/actualizacionPreciosMaestros/components/HistorialImportaciones.jsx',
  'modulos/operaciones/consignacion/cargaMasivaConsignacion/CargaMasivaConsignacion.jsx',
  'modulos/operaciones/consignacion/cargasConsignacion/components/CargasConsignacionTable.jsx',
  'modulos/operaciones/consignacion/cargasConsignacion/components/CargasTab.jsx',
  'modulos/operaciones/consignacion/cargasConsignacion/components/DeliveryTab.jsx',
  'modulos/operaciones/consignacion/ingresarGuiaDespacho/IngresarGuiaDespacho.jsx',
  'modulos/operaciones/consignacion/listadoguiasconsignacion/Listadoguiasconsignacion.jsx',
  'modulos/operaciones/consignacion/registroConsignacion/components/ConsignacionTable.jsx',
  'modulos/operaciones/consignacion/resumenConsignacion/ResumenConsignacion.jsx',
  'modulos/operaciones/consignacion/solicitudConsignacion/SolicitudConsignacion.jsx',
  'modulos/operaciones/documentos/importarDetallesOC/ImportarDetallesOC.jsx',
  'modulos/operaciones/documentos/ingresoOrdenes/components/IngresoOrdenesDetalleView.jsx',
  'modulos/operaciones/documentos/ingresoOrdenes/components/OCSinPdf.jsx',
  'modulos/operaciones/documentos/ingresoOrdenes/components/RegistrosOrdenes.jsx',
  'modulos/operaciones/documentos/seguimientoFacturasGuias/SeguimientoFacturasGuias.jsx',
  'modulos/operaciones/hemodinamia/gestionHemodinamia/components/Cargastab/Cargastab.jsx',
  'modulos/operaciones/hemodinamia/gestionHemodinamia/components/Cargastab/CotizacionCard.jsx',
  'modulos/operaciones/hemodinamia/gestionHemodinamia/components/GestionesHemodinamiaTable.jsx',
  'modulos/operaciones/hemodinamia/resumenHemodinamia/ResumenHemodinamia.jsx',
  'modulos/operaciones/shared/cargaMasivaDocumentos/CargaMasivaDocumentos.jsx',
  'modulos/operaciones/implantes/gestionImplantes/components/Cargastab/Cargastab.jsx',
  'modulos/operaciones/implantes/gestionImplantes/components/Cargastab/CotizacionCard.jsx',
  // La tabla de contenido del PAD registrado (antes dentro de Cargastab.jsx).
  'modulos/operaciones/implantes/gestionImplantes/components/Cargastab/ContenidoPadRegistrado.jsx',
  'modulos/operaciones/shared/documentosAdmision/DocumentosTab.jsx',
  'modulos/operaciones/implantes/gestionImplantes/components/GestionesImplantesTable.jsx',
  'modulos/operaciones/shared/ordenesOC/OrdenTab.jsx',
  'modulos/operaciones/shared/ocIndex/SincronizarOCResumenModal.jsx',
  'modulos/operaciones/implantes/resumenImplantes/ResumenImplantes.jsx',
  'modulos/operaciones/shared/sincronizacionImputadas/SincronizacionImputadas.jsx',
  // Solicitud de Implantes y Hemodinamia (pantalla compartida).
  'modulos/operaciones/shared/solicitud/SolicitudGestiones.jsx',
  'ui/TablaRedimensionable.jsx',
]);

// Permisos por centro: vista de administración de usuarios (solo rol
// Administrador con el ítem, o Desarrollador); sus tablas no tienen
// granularidad por columnas.
const TABLAS_SOLO_ADMINISTRADORES = new Set([
  'modulos/administracion/permisosCentro/PermisosPorCentro.jsx',
  'modulos/administracion/permisosCentro/ConfigurarCentro.jsx',
]);

const usosColumnas = [];
const tablasSinColumnas = [];
recorrer(RAIZ).forEach((archivo) => {
  const src = fs.readFileSync(archivo, 'utf8');
  const relativo = path.relative(RAIZ, archivo).split(path.sep).join('/');
  // Solo componentes .jsx (un .js puede contener '<table' como texto, ej. al leer HTML).
  const tieneTabla = relativo.endsWith('.jsx') && src.includes('<table');
  const declaraColumnas = /useColumnasPermitidas\(|hasPermission\([^)]*['"]col_/.test(src);
  if (tieneTabla && !declaraColumnas && !TABLAS_PENDIENTES.has(relativo) && !TABLAS_SOLO_ADMINISTRADORES.has(relativo)) tablasSinColumnas.push(relativo);

  const constantes = {};
  for (const m of src.matchAll(/const\s+([A-Za-z_]+)\s*=\s*['"](\/[^'"]+)['"]/g)) constantes[m[1]] = m[2];
  for (const m of src.matchAll(/useColumnasPermitidas\(\s*([A-Za-z_]+|['"][^'"]+['"])\s*,\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_]+)\s*\)/g)) {
    const literal = m[1].startsWith("'") || m[1].startsWith('"') ? m[1].slice(1, -1) : constantes[m[1]];
    const rutas = literal ? [literal] : RUTAS_DINAMICAS[relativo];
    const lista = src.match(new RegExp(`const\\s+${m[3]}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
    const claves = lista
      ? lista[1].split('\n').filter((l) => /key:\s*'/.test(l) && !/fija:\s*true/.test(l)).map((l) => l.match(/key:\s*'([^']+)'/)[1])
      : null;
    usosColumnas.push({ archivo: relativo, rutas, seccion: m[2], lista: m[3], claves });
  }
});

describe('cobertura de permisos granulares', () => {
  it('encuentra llamadas a revisar', () => {
    expect(usos.length).toBeGreaterThan(100);
  });

  it('toda ruta/sección/acción consultada por una pantalla existe en COMPONENT_MAPS', () => {
    const faltantes = usos
      .filter(({ ruta, seccion, elemento }) => {
        const s = mapas[ruta]?.sections?.[seccion];
        return !s || (elemento && !s.elements?.[elemento]);
      })
      .map(({ archivo, ruta, seccion, elemento }) => `${archivo}: ${ruta} → ${seccion}${elemento ? '.' + elemento : ''}`);
    expect([...new Set(faltantes)]).toEqual([]);
  });

  it('toda tabla declara sus columnas en el mapa (salvo pendientes de la segunda tanda)', () => {
    expect(tablasSinColumnas).toEqual([]);
  });

  it('las tablas pendientes siguen existiendo (si una se resolvió o se borró, quitarla de la lista)', () => {
    const todas = new Set(recorrer(RAIZ).map((a) => path.relative(RAIZ, a).split(path.sep).join('/')));
    const sobrantes = [...TABLAS_PENDIENTES].filter((a) => {
      if (!todas.has(a)) return true;
      const src = fs.readFileSync(path.join(RAIZ, a), 'utf8');
      return /useColumnasPermitidas\(|hasPermission\([^)]*['"]col_/.test(src);
    });
    expect(sobrantes).toEqual([]);
  });

  it('cada columna de useColumnasPermitidas existe como col_<key> en el mapa', () => {
    const problemas = [];
    usosColumnas.forEach(({ archivo, rutas, seccion, lista, claves }) => {
      if (!rutas) { problemas.push(`${archivo}: ruta dinámica sin entrada en RUTAS_DINAMICAS`); return; }
      if (!claves || claves.length === 0) { problemas.push(`${archivo}: no se encontró la lista ${lista}`); return; }
      rutas.forEach((ruta) => claves.forEach((k) => {
        if (!mapas[ruta]?.sections?.[seccion]?.elements?.[`col_${k}`]) problemas.push(`${archivo}: ${ruta} → ${seccion}.col_${k}`);
      }));
    });
    expect(problemas).toEqual([]);
  });
});
