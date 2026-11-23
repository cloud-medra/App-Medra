import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { construirLibro, COLUMNAS_CARGADOS, H } from './libroRespaldo.js';
import { filasDesdeGestiones, catalogoReferencias, datosPlantilla, TAMANO_PLANTILLA, MINIMO_CATALOGOS } from './datosRespaldo.js';

const HOJAS = ['Instrucciones', 'Gestiones', 'Ítems', 'Documentos', 'Cargados', 'Reporte Info', 'Códigos', 'Empresas', 'Centros', 'Recargos',
  'Previsiones', 'Convenios', 'Catálogos'];

const releer = async (libro) => {
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  return leido;
};

const bloqueada = (celda) => celda.protection?.locked ?? true;

describe('plantilla', () => {
  it('vacía: hojas, filas preparadas y catálogos listos para pegar', async () => {
    const { libro: armado, filas } = await construirLibro(datosPlantilla('23-11-2026 10:00'));
    const libro = await releer(armado);
    expect(libro.worksheets.map((h) => h.name)).toEqual(HOJAS);
    expect(filas.ultimaGestion).toBe(2 + TAMANO_PLANTILLA.gestionesLibres);
    expect(filas.ultimaItem).toBe(2 + TAMANO_PLANTILLA.itemsLibres);

    // Sin filas del sistema: la primera fila ya es de contingencia.
    const g = libro.getWorksheet('Gestiones');
    expect(g.getCell('A3').value.formula).toContain('TEXT(MONTH(C3),"00")');
    expect(libro.getWorksheet('Ítems').getCell('A3').value).toBe(1);
    // El botón "Mover cargados" va en Ítems: A1:B1 de Ítems libres (ayuda en
    // nota) y Gestiones con su fila de ayuda normal.
    expect(g.getCell('A1').value).toContain('admisión|empresa|AAAA-MM-DD');
    const hojaItems = libro.getWorksheet('Ítems');
    expect(hojaItems.getCell('A1').value).toBeNull();
    expect(hojaItems.getCell('B1').value).toBeNull();
    expect(hojaItems.getCell('B2').note).toContain('Gestión a la que pertenece');

    // Códigos: columnas del CSV de Códigos Maestros (con ESTADO) desde la B.
    const r = libro.getWorksheet('Códigos');
    expect(r.getRow(2).values.slice(1)).toEqual(['Clave búsqueda', 'CODIGO', 'REFERENCIA', 'DESCRIPTOR_EMPRESA', 'EMPRESA', 'TIPO', 'SEGMENTO', 'CLASE',
      'DESCRIPTOR_AUTO', 'PRECIO_NETO', 'CX', 'OBSERVACION', 'REGISTRADO_POR', 'ESTADO', 'Referencia usable', 'Veces repetida']);
    const ultimaRef = 2 + MINIMO_CATALOGOS.referencias;
    // Las inactivas quedan fuera de la búsqueda.
    expect(r.getCell(`A${ultimaRef}`).value.formula).toContain(`UPPER(TRIM(N${ultimaRef}))<>"INACTIVO"`);
    expect(r.getCell(`O${ultimaRef}`).value.formula).toContain(`UPPER(TRIM(N${ultimaRef}))<>"INACTIVO"`);
    expect(['A3', 'B3', 'N3', 'O3', 'P3'].map((c) => bloqueada(r.getCell(c)))).toEqual([true, false, false, true, true]);
    // Rango absoluto: el conteo de repetidas no se corre fila a fila.
    expect(r.getCell('P4').value.formula).toBe(`IF(O4="","",COUNTIF($O$3:$O$${ultimaRef},O4))`);

    // Empresas: hoja propia, desplegable de Gestiones.
    const e = libro.getWorksheet('Empresas');
    expect(e.getRow(2).values.slice(1)).toEqual(['NOMBRE', 'RUT', 'ESTADO']);
    expect(bloqueada(e.getCell('A3'))).toBe(false);
    expect(g.dataValidations.find('D3')).toMatchObject({ type: 'list', formulae: [`'Empresas'!$A$3:$A$${2 + MINIMO_CATALOGOS.empresas}`] });

    // Catálogos: solo las listas fijas (bloqueadas).
    const c = libro.getWorksheet('Catálogos');
    expect(c.getCell('A3').value).toBe('AGENDADO');
    expect(bloqueada(c.getCell('A3'))).toBe(true);
    // Listas de la hoja Códigos, las mismas del sistema.
    expect(['G', 'H', 'I'].map((l) => c.getCell(`${l}2`).value)).toEqual(['Tipo (Códigos)', 'Segmento (Códigos)', 'Clase (Códigos)']);
    expect([3, 4, 5, 6].map((n) => c.getCell(`I${n}`).value)).toEqual(['IMPLANTE', 'INSUMOS', 'PAD', 'KIT']);
    expect([3, 4].map((n) => c.getCell(`G${n}`).value)).toEqual(['COTIZACION', 'CONSIGNACION']);
    expect([3, 4, 5].map((n) => c.getCell(`H${n}`).value)).toEqual(['IMPLANTES', 'CONSIGNACION', 'HEMODINAMIA']);
    expect(c.getCell('J2').value).toBeNull();

    // Códigos: EMPRESA con la lista de Empresas; TIPO, SEGMENTO y CLASE con las
    // del sistema. Avisan sin bloquear y, como pegar borra la validación,
    // un formato condicional pinta en rojo lo que no está en la lista.
    const ultimaEmpresa = 2 + MINIMO_CATALOGOS.empresas;
    expect(r.dataValidations.find('E3')).toMatchObject({ type: 'list', errorStyle: 'warning', formulae: [`'Empresas'!$A$3:$A$${ultimaEmpresa}`] });
    expect(r.dataValidations.find('F3')).toMatchObject({ type: 'list', errorStyle: 'warning', formulae: ["'Catálogos'!$G$3:$G$4"] });
    expect(r.dataValidations.find('G3')).toMatchObject({ type: 'list', formulae: ["'Catálogos'!$H$3:$H$5"] });
    expect(r.dataValidations.find('H3')).toMatchObject({ type: 'list', formulae: ["'Catálogos'!$I$3:$I$6"] });
    const reglas = r.conditionalFormattings.map((cf) => [cf.ref, cf.rules[0].formulae[0]]);
    expect(reglas).toEqual(expect.arrayContaining([
      [`E3:E${ultimaRef}`, `AND(E3<>"",COUNTIF('Empresas'!$A$3:$A$${ultimaEmpresa},"?*")>0,COUNTIF('Empresas'!$A$3:$A$${ultimaEmpresa},E3)=0)`],
      [`H3:H${ultimaRef}`, `AND(H3<>"",COUNTIF('Catálogos'!$I$3:$I$6,"?*")>0,COUNTIF('Catálogos'!$I$3:$I$6,H3)=0)`],
    ]));

    // Centros y Recargos: hojas propias, vacías, con las columnas de su exportación.
    const cen = libro.getWorksheet('Centros');
    expect(cen.getRow(2).values.slice(1)).toEqual(['NOMBRE', 'COMENTARIO', 'ESTADO', 'USAR_EN_GESTIONES']);
    expect(bloqueada(cen.getCell('A3'))).toBe(false);
    expect(g.dataValidations.find('H3')).toMatchObject({ type: 'list', formulae: [`'Centros'!$A$3:$A$${2 + MINIMO_CATALOGOS.centros}`] });
    const rec = libro.getWorksheet('Recargos');
    expect(rec.getRow(2).values.slice(1)).toEqual(['DESDE', 'HASTA', 'VECES COSTO', 'COMENTARIO', 'ESTADO']);
    expect(bloqueada(rec.getCell('E52'))).toBe(false);
    // Veces costo y venta leen la hoja Recargos (por desde-hasta, sin los INACTIVOS).
    const it3 = libro.getWorksheet('Ítems');
    expect(it3.getCell('AH3').value.formula).toContain(`COUNTIFS('Recargos'!$A$3:$A$52,"<="&M3,'Recargos'!$B$3:$B$52,">="&M3`);
    expect(it3.getCell('AH3').value.formula).toContain(`'Recargos'!$E$3:$E$52,"<>INACTIVO"`);
    expect(it3.getCell('R3').value.formula).toContain(`SUMIFS('Recargos'!$C$3:$C$52`);
    expect(it3.getCell('T3').value.formula).toBe('IF(Y3="","",M3*R3*G3)');

    // Cargados: vacía, con las columnas que escribe la macro, protegida.
    const carg = libro.getWorksheet('Cargados');
    expect(carg.getRow(2).values.slice(1)).toEqual(COLUMNAS_CARGADOS.map((col) => col.titulo));
    expect(COLUMNAS_CARGADOS).toHaveLength(44); // C_COLUMNAS en macros/ModContingencia.bas
    expect(carg.getCell('A3').value).toBeNull();
    expect(carg.sheetProtection).toMatchObject({ sheet: true, autoFilter: true });

    // Instrucciones: macros, botones y cómo actualizar catálogos.
    const textos = libro.getWorksheet('Instrucciones').getColumn('A').values.filter(Boolean).join('\n');
    expect(textos).toContain('Habilitar contenido');
    expect(textos).toContain('"Mover cargados"');
    expect(textos).toContain('"Devolver a pendientes"');
    expect(textos).toContain('hoja Recargos, celda A3');
    expect(textos).toContain('hoja Centros, celda A3');
    expect(textos.toLowerCase()).not.toContain('fibra');
  });

  it('con catálogos de los archivos exportados: Códigos y Empresas cargados, origen y fecha', async () => {
    const datos = datosPlantilla('23-11-2026 10:00', {
      catalogos: {
        codigos: [{ codigo: '000123', referencia: 'REF-1', empresa: 'A', precio: 15000, clase: 'TORNILLO', tipo: 'COTIZACION', descriptorAuto: 'REF-1 D', descriptorEmpresa: 'D' }],
        empresas: [{ nombre: 'A', rut: '1-9', estado: 'ACTIVO' }],
        recargos: [{ desde: 0, hasta: 50000, vecesCosto: 2, estado: 'ACTIVO' }],
      },
      origen: { codigos: { archivo: 'registros_con_codigo_2026-11-23.csv', fecha: '2026-11-23', cargadas: 1, detalle: '3 en el archivo' } },
      fecha: new Date(Date.UTC(2026, 10, 23)),
    });
    const libro = await releer((await construirLibro(datos)).libro);
    const r = libro.getWorksheet('Códigos');
    expect(['B3', 'C3', 'D3', 'E3', 'J3', 'N3'].map((c) => r.getCell(c).value)).toEqual(['000123', 'REF-1', 'D', 'A', 15000, 'ACTIVO']);
    expect(libro.getWorksheet('Empresas').getCell('A3').value).toBe('A');
    expect(['A3', 'B3', 'C3', 'E3'].map((c) => libro.getWorksheet('Recargos').getCell(c).value)).toEqual([0, 50000, 2, 'ACTIVO']);
    const ins = libro.getWorksheet('Instrucciones');
    expect(ins.getColumn('A').values.filter(Boolean).join('\n')).toContain('Códigos: 1 cargadas del archivo registros_con_codigo_2026-11-23.csv (exportado el 2026-11-23)');
    expect(ins.getCell('B3').value.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(bloqueada(ins.getCell('B3'))).toBe(false);
  });

  it('autocompleta desde Reporte Info, deja escribir encima y avisa', async () => {
    const datos = datosPlantilla('23-11-2026 10:00', {
      catalogos: {
        reporteInfo: [{ admision: '102001', fecha: '2026-11-20', paciente: 'P UNO', convenio: 'CONV 1', prevision: 'ISAPRE A', cirujano: 'DR X', descripcion: 'CIRUGIA' }],
        previsiones: [{ nombre: 'ISAPRE A' }],
        convenios: [{ nombre: 'CONV 1' }],
      },
    });
    const libro = await releer((await construirLibro(datos)).libro);
    const ri = libro.getWorksheet('Reporte Info');
    expect(ri.getRow(2).values.slice(1)).toEqual(['Admisión', 'Fecha', 'Paciente', 'Convenio', 'Previsión (Isapre)', '1° Cirujano', 'Descripción', 'Admisión (búsqueda)']);
    expect(['A3', 'C3', 'E3', 'G3'].map((c) => ri.getCell(c).value)).toEqual(['102001', 'P UNO', 'ISAPRE A', 'CIRUGIA']);
    expect(ri.getCell('B3').value.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(ri.getCell('H3').value.formula).toBe('IF(TRIM(A3&"")="","",TRIM(A3&""))');
    expect(bloqueada(ri.getCell('A3'))).toBe(false);

    const g = libro.getWorksheet('Gestiones');
    // Las celdas visibles muestran el auxiliar (=AG3...) y se pueden escribir encima.
    expect(['E3', 'L3', 'M3', 'N3', 'O3'].map((c) => g.getCell(c).value.formula)).toEqual(['AG3', 'AH3', 'AI3', 'AJ3', 'AK3']);
    expect(['E3', 'L3', 'M3', 'N3', 'O3'].map((c) => bloqueada(g.getCell(c)))).toEqual([false, false, false, false, false]);
    expect(g.getCell('AF3').value.formula).toContain("MATCH(TRIM(B3),'Reporte Info'!$H$3:$H$");
    expect(g.getCell('AI3').value.formula).toContain("INDEX('Reporte Info'!$E$3:$E$");
    expect(g.getCell('AE3').value.formula).toContain('Admisión no está en Reporte Info');
    expect(g.getCell('AE3').value.formula).toContain('Previsión fuera de la lista');
    expect(g.getColumn('AE').hidden).toBe(false);
    expect(g.getColumn('AG').hidden).toBe(true);
    // A mano: lista que avisa pero no bloquea.
    expect(g.dataValidations.find('M3')).toMatchObject({ type: 'list', errorStyle: 'warning', formulae: [`'Previsiones'!$A$3:$A$${2 + MINIMO_CATALOGOS.previsiones}`] });
    expect(g.dataValidations.find('L3')).toMatchObject({ type: 'list', errorStyle: 'warning' });
    expect(libro.getWorksheet('Previsiones').getCell('A3').value).toBe('ISAPRE A');
  });

  it('un catálogo que no viene del export oficial queda como PROVISIONAL en Instrucciones', async () => {
    const datos = datosPlantilla('23-11-2026 10:00', {
      catalogos: { recargos: [{ desde: 0, hasta: 351, vecesCosto: 7.5 }] },
      origen: { recargos: { archivo: 'recargos_transcritos.xlsx', fecha: null, cargadas: 1, detalle: 'x', provisional: true } },
    });
    const libro = await releer((await construirLibro(datos)).libro);
    const textos = libro.getWorksheet('Instrucciones').getColumn('A').values.filter(Boolean).join('\n');
    expect(textos).toContain('Rangos de recargo: 1 cargados de forma PROVISIONAL. Deben reemplazarse por la exportación oficial de la app');
    expect(textos).not.toContain('recargos_transcritos.xlsx');
  });

  it('los nombres de hoja coinciden con los que usan las macros', () => {
    expect([H.G, H.I, H.CARG]).toEqual(['Gestiones', 'Ítems', 'Cargados']);
  });
});


const armar = async ({ itemsExtra = [] } = {}) => {
  const { filasGestiones, filasItems, ultimaLinea } = filasDesdeGestiones([{
    refPath: 'implantes_gestiones/2026/mes/11/dia/01/admision/1/empresa/A/detalles/a', gestionId: '00123', empresa: 'A', fecha: '2026-11-01', estado: 'PENDIENTE',
    informe: 'PENDIENTE', observacion: 'OBS',
    cotizaciones: [{ items: [{ id: 'i1', referencia: 'R1', codigo: '10', precio: 100, cantidad: 2, lote: 'L1', totalItem: 200, venta: 300, vecesCosto: 1.5, recargoEncontrado: true, estadoCarga: 'CARGADO' }, ...itemsExtra] }],
  }]);
  const { libro, filas } = await construirLibro({
    generadoEl: '23-11-2026 10:00', periodoTexto: 'noviembre 2026 (ABIERTO)', mesExportado: '2026-11',
    filasGestiones, filasItems, ultimaLinea,
    catalogo: catalogoReferencias([{ referencia: 'R1', empresa: 'A', codigo: '10', precioNeto: 100 }]),
    empresas: ['A'], centros: ['PABELLON'], recargos: [{ desde: 0, hasta: 1000, vecesCosto: 1.5 }],
    tamano: { gestionesLibres: 5, itemsLibres: 6, documentosLibres: 4 },
  });
  // Ida y vuelta: el archivo generado se puede volver a leer.
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  return { libro: leido, filas };
};

describe('construirLibro', () => {
  it('crea las hojas en orden y dimensiona las filas libres', async () => {
    const { libro, filas } = await armar();
    expect(libro.worksheets.map((h) => h.name)).toEqual(HOJAS);
    expect(filas).toEqual({ ultimaGestion: 3 + 1 + 5 - 1, ultimaItem: 3 + 1 + 6 - 1, ultimaDocumento: 3 + 4 - 1 });
    expect(libro.getWorksheet('Instrucciones').getCell('A4').value).toContain('Catálogo de referencias actualizado al: 23-11-2026 10:00');
  });

  it('la fila del sistema es una foto bloqueada; la libre trae fórmulas y se escribe', async () => {
    const { libro } = await armar();
    const g = libro.getWorksheet('Gestiones');
    expect(g.getCell('B2').value).toBe('Admisión');
    expect(g.getCell('A3').value).toBe('00123|A|2026-11-01');
    expect(g.getCell('B3').value).toBe('00123'); // texto: conserva el cero
    expect(g.getCell('V3').value).toBe('SISTEMA');
    expect(g.getCell('B3').protection?.locked ?? true).toBe(true);
    expect(g.getCell('Q3').value.formula).toContain('COUNTIFS');
    // Fila libre: CLAVE con AAAA-MM-DD armado sin depender del idioma de Excel.
    expect(g.getCell('A4').value.formula).toContain('TEXT(MONTH(C4),"00")');
    expect(g.getCell('B4').protection?.locked ?? true).toBe(false);
    expect(g.getCell('B4').numFmt).toBe('@');
    expect(g.getCell('C4').numFmt).toBe('dd-mm-yyyy');
    expect(g.getCell('A4').protection?.locked ?? true).toBe(true);

    const it_ = libro.getWorksheet('Ítems');
    expect(it_.getCell('A3').value).toBe(1);
    expect(it_.getCell('L3').value).toBe('10'); // código guardado, no fórmula
    expect(it_.getCell('A4').value).toBe(2); // las libres siguen la numeración
    expect(it_.getCell('L4').value.formula).toContain('No lleva OC');
    expect(it_.getCell('AD4').value.formula).toContain('MATCH');
    expect(it_.getColumn('AD').hidden).toBe(true);
    expect(it_.getCell('F4').protection?.locked ?? true).toBe(false);
  });

  it('en las filas del sistema deja cambiar solo los campos acordados y guarda el original', async () => {
    const { libro } = await armar({
      itemsExtra: [
        { id: 'p', esPad: true, referencia: 'PAD1', codigo: '20', cantidad: 1, lote: 'PAD', vencimiento: 'PAD', estadoCarga: 'PAD' },
        { id: 's', referencia: 'SINCOD', codigo: '', sinCodigo: true, cantidad: 1, lote: 'LS', estadoCarga: 'PENDIENTE' },
      ],
    });
    const bloqueada = (celda) => celda.protection?.locked ?? true;
    const g = libro.getWorksheet('Gestiones');
    expect(['G3', 'J3', 'K3'].map((c) => bloqueada(g.getCell(c)))).toEqual([false, false, false]);
    expect(['B3', 'D3', 'E3', 'P3'].map((c) => bloqueada(g.getCell(c)))).toEqual([true, true, true, true]);
    expect(g.getCell('AB3').value).toBe('PENDIENTE');
    expect(g.getCell('AD3').value).toBe('OBS');
    expect(g.getCell('AA3').value.formula).toBe('IF(OR(G3<>AB3,J3<>AC3,K3<>AD3),"SÍ","NO")');
    expect(g.getColumn('AA').hidden).toBe(false);
    expect(g.getColumn('AB').hidden).toBe(true);

    const it_ = libro.getWorksheet('Ítems');
    // Línea normal: Cantidad, Lote, Vencimiento y Estado carga.
    expect(['G3', 'H3', 'I3', 'J3'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, false, false, false]);
    expect(['F3', 'L3', 'M3', 'E3'].map((c) => bloqueada(it_.getCell(c)))).toEqual([true, true, true, true]);
    expect(it_.getCell('AL3').value).toBe(2);
    expect(it_.getCell('AM3').value).toBe('L1');
    expect(it_.getCell('AO3').value).toBe('CARGADO');
    expect(it_.getCell('AK3').value.formula).toBe('IF(OR(G3<>AL3,H3<>AM3,I3<>AN3,J3<>AO3),"SÍ","NO")');
    expect(it_.getCell('S3').value.formula).toBe('IF(J3="SIN CARGO",0,M3*G3)');
    // PAD PADRE: solo Cantidad. Sin código: todo salvo Estado carga.
    expect(['G4', 'H4', 'I4', 'J4'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, true, true, true]);
    expect(['G5', 'H5', 'I5', 'J5'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, false, false, true]);
    // El filtro llega hasta MODIFICADO (después de las auxiliares ocultas).
    expect(JSON.stringify(it_.autoFilter)).toContain('AK2');
  });

  it('valida con listas de los catálogos y protege las hojas', async () => {
    const { libro } = await armar();
    const g = libro.getWorksheet('Gestiones');
    const it_ = libro.getWorksheet('Ítems');
    expect(g.dataValidations.find('D4')).toMatchObject({ type: 'list', formulae: ["'Empresas'!$A$3:$A$302"] });
    expect(it_.dataValidations.find('B5')).toMatchObject({ type: 'list', formulae: ["'Gestiones'!$A$3:$A$8"] });
    expect(it_.dataValidations.find('F5')).toMatchObject({ type: 'list', errorStyle: 'warning' });
    expect(g.sheetProtection).toMatchObject({ sheet: true, autoFilter: true });
    expect(g.sheetProtection.sort).toBeFalsy();
    expect(g.views[0]).toMatchObject({ state: 'frozen', ySplit: 2, xSplit: 2 });
  });
});
