import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import {
  construirLibro, COLUMNAS_CARGADOS, COLUMNAS_ITEMS, VISTA_CARGA, I, H, CELDAS_LIBRO, CELDAS_NUEVO_MES, MENSAJES_LIBRO, nombreLibroMes,
  MARCAS_CAMBIO,
} from './libroRespaldo.js';
import { filasDesdeGestiones, catalogoReferencias, datosPlantilla, TAMANO_PLANTILLA, MINIMO_CATALOGOS } from './datosRespaldo.js';

const HOJAS = ['Instrucciones', 'Nuevo mes', 'Gestiones', 'Ítems', 'Cargados', 'Solicitud Implantes', 'Resumen', 'Reporte Info', 'Códigos', 'Empresas', 'Centros', 'Recargos',
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
    // El botón "Mover cargados" va en Ítems: A1:D1 de Ítems libres (ayuda en
    // nota) y Gestiones con su fila de ayuda normal.
    expect(g.getCell('A2').note).toContain('admisión|empresa|AAAA-MM-DD');
    const hojaItems = libro.getWorksheet('Ítems');
    expect(['A1', 'B1', 'C1', 'D1'].map((c) => hojaItems.getCell(c).value)).toEqual([null, null, null, null]);
    expect(hojaItems.getCell('B2').note).toContain('de la CLAVE');

    // Vista de carga al inicio (Ítems y Cargados), congelada y en verde.
    expect(hojaItems.getRow(2).values.slice(1, 8)).toEqual(VISTA_CARGA);
    expect(VISTA_CARGA).toEqual(['N° línea', 'Admisión', 'Fecha', 'Código', 'Cantidad', 'Venta', 'Estado carga']);
    expect(hojaItems.views[0]).toMatchObject({ state: 'frozen', xSplit: 7, ySplit: 2 });
    expect(hojaItems.getCell('G2').fill.fgColor.argb).toBe('FFC6E0B4');
    expect(hojaItems.getCell('H2').value).toBe('CLAVE');
    expect(hojaItems.getCell('H2').fill.fgColor.argb).not.toBe('FFC6E0B4');
    // Admisión y Fecha salen de la CLAVE (bloqueadas; Fecha como fecha).
    expect(hojaItems.getCell('B3').value.formula).toBe('IF(H3="","",IFERROR(LEFT(H3,FIND("|",H3)-1),""))');
    expect(hojaItems.getCell('C3').value.formula).toBe('IF(H3="","",IFERROR(DATE(LEFT(RIGHT(H3,10),4),MID(RIGHT(H3,10),6,2),RIGHT(RIGHT(H3,10),2)),""))');
    expect(hojaItems.getCell('C3').numFmt).toBe('dd-mm-yyyy');
    expect(['B3', 'C3', 'D3', 'E3', 'F3'].map((c) => bloqueada(hojaItems.getCell(c)))).toEqual([true, true, true, true, true]);
    expect(['G3'].map((c) => bloqueada(hojaItems.getCell(c)))).toEqual([false]);
    // Cantidad (E) muestra la que se escribe en "Cantidad (ingresar)", justo
    // después de Referencia (L).
    expect(I.referencia).toBe('L');
    expect(I.cantidadIngreso).toBe('M');
    expect(hojaItems.getCell('M2').value).toBe('Cantidad (ingresar)');
    expect(bloqueada(hojaItems.getCell('M3'))).toBe(false);
    expect(hojaItems.getCell('E3').value.formula).toBe('IF(M3="","",M3)');
    // Valores automáticos por tipo de línea: PAD PADRE -> Lote y Vencimiento
    // "PAD"; CONTENIDO PAD -> Estado carga "CONTENIDO". Se puede escribir encima.
    expect(hojaItems.getCell(`${I.lote}3`).value.formula).toBe('IF(I3="PAD PADRE","PAD","")');
    expect(hojaItems.getCell(`${I.vencimiento}3`).value.formula).toBe('IF(I3="PAD PADRE","PAD","")');
    expect(hojaItems.getCell('G3').value.formula).toBe('IF(I3="CONTENIDO PAD","CONTENIDO","")');
    expect([I.lote, I.vencimiento].map((l) => bloqueada(hojaItems.getCell(`${l}3`)))).toEqual([false, false]);
    expect(hojaItems.getCell(`${I.estadoEf}3`).value.formula).toBe(`IF(${I.tipoEf}3="","",IF(${I.tipoEf}3="CONTENIDO PAD","CONTENIDO",IF(G3="","PENDIENTE",G3)))`);
    expect(hojaItems.getCell(`${I.estadoNorm}3`).value.formula).toContain('"CONTENIDO"');
    expect(hojaItems.getCell(`${I.alerta}3`).value.formula).toContain('PAD PADRE: Lote y Vencimiento deben ser PAD');
    // Código real: el del catálogo en toda línea; Código sigue con "No lleva OC".
    expect(hojaItems.getCell(`${I.codigoReal}2`).value).toBe('Código real');
    expect(hojaItems.getCell(`${I.codigoReal}3`).value.formula).toBe(`IF(OR(${I.tipoEf}3="",${I.filaCat}3=""),"",INDEX('Códigos'!$B$3:$B$${2 + MINIMO_CATALOGOS.referencias},${I.filaCat}3)&"")`);
    expect(hojaItems.getCell('D3').value.formula).toContain('No lleva OC');
    // Las letras de las fórmulas salen de la posición: cada título una vez.
    expect(new Set(COLUMNAS_ITEMS.map((col) => col.titulo)).size).toBe(COLUMNAS_ITEMS.length);
    expect(COLUMNAS_ITEMS.map((col) => col.l).slice(0, 8)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    // Códigos: columnas del CSV de Códigos Maestros (con ESTADO) desde la B.
    const r = libro.getWorksheet('Códigos');
    const datosCodigos = ['CODIGO', 'REFERENCIA', 'DESCRIPTOR_EMPRESA', 'EMPRESA', 'TIPO', 'SEGMENTO', 'CLASE',
      'DESCRIPTOR_AUTO', 'PRECIO_NETO', 'CX', 'OBSERVACION', 'REGISTRADO_POR', 'ESTADO'];
    // Después de los datos: las automáticas, las marcas de cambio y lo original (oculto).
    expect(r.getRow(2).values.slice(1)).toEqual(['Clave búsqueda', ...datosCodigos, 'Referencia usable', 'Veces repetida',
      'CAMBIO', 'FECHA CAMBIO', ...datosCodigos.map((t) => `orig: ${t}`)]);
    const ultimaRef = 2 + MINIMO_CATALOGOS.referencias;
    // Las inactivas quedan fuera de la búsqueda.
    expect(r.getCell(`A${ultimaRef}`).value.formula).toContain(`UPPER(TRIM(N${ultimaRef}))<>"INACTIVO"`);
    expect(r.getCell(`O${ultimaRef}`).value.formula).toContain(`UPPER(TRIM(N${ultimaRef}))<>"INACTIVO"`);
    expect(['A3', 'B3', 'N3', 'O3', 'P3'].map((c) => bloqueada(r.getCell(c)))).toEqual([true, false, false, true, true]);
    // Rango absoluto: el conteo de repetidas no se corre fila a fila.
    expect(r.getCell('P4').value.formula).toBe(`IF(O4="","",COUNTIF($O$3:$O$${ultimaRef},O4))`);

    // Empresas: hoja propia, desplegable de Gestiones.
    const e = libro.getWorksheet('Empresas');
    expect(e.getRow(2).values.slice(1, 4)).toEqual(['NOMBRE', 'RUT', 'ESTADO']);
    expect(bloqueada(e.getCell('A3'))).toBe(false);
    expect(g.dataValidations.find('D3')).toMatchObject({ type: 'list', formulae: [`'Empresas'!$A$3:$A$${2 + MINIMO_CATALOGOS.empresas}`] });

    // Catálogos: solo las listas fijas (bloqueadas).
    const c = libro.getWorksheet('Catálogos');
    expect(c.getCell('A3').value).toBe('AGENDADO');
    expect(bloqueada(c.getCell('A3'))).toBe(true);
    // Listas de la hoja Códigos, las mismas del sistema.
    // Sin la lista SÍ/NO (solo la usaba la hoja Documentos, eliminada).
    expect(['E', 'F', 'G', 'H'].map((l) => c.getCell(`${l}2`).value)).toEqual(['Tipo de línea', 'Tipo (Códigos)', 'Segmento (Códigos)', 'Clase (Códigos)']);
    expect([3, 4, 5, 6].map((n) => c.getCell(`H${n}`).value)).toEqual(['IMPLANTE', 'INSUMOS', 'PAD', 'KIT']);
    expect([3, 4].map((n) => c.getCell(`F${n}`).value)).toEqual(['COTIZACION', 'CONSIGNACION']);
    expect([3, 4, 5].map((n) => c.getCell(`G${n}`).value)).toEqual(['IMPLANTES', 'CONSIGNACION', 'HEMODINAMIA']);
    expect(c.getCell('I2').value).toBe('Estado contenido PAD'); // lista de Estado carga del CONTENIDO PAD

    // Códigos: EMPRESA con la lista de Empresas; TIPO, SEGMENTO y CLASE con las
    // del sistema. Avisan sin bloquear y, como pegar borra la validación,
    // un formato condicional pinta en rojo lo que no está en la lista.
    const ultimaEmpresa = 2 + MINIMO_CATALOGOS.empresas;
    expect(r.dataValidations.find('E3')).toMatchObject({ type: 'list', errorStyle: 'warning', formulae: [`'Empresas'!$A$3:$A$${ultimaEmpresa}`] });
    expect(r.dataValidations.find('F3')).toMatchObject({ type: 'list', errorStyle: 'warning', formulae: ["'Catálogos'!$F$3:$F$4"] });
    expect(r.dataValidations.find('G3')).toMatchObject({ type: 'list', formulae: ["'Catálogos'!$G$3:$G$5"] });
    expect(r.dataValidations.find('H3')).toMatchObject({ type: 'list', formulae: ["'Catálogos'!$H$3:$H$6"] });
    const reglas = r.conditionalFormattings.map((cf) => [cf.ref, cf.rules[0].formulae[0]]);
    expect(reglas).toEqual(expect.arrayContaining([
      [`E3:E${ultimaRef}`, `AND(E3<>"",COUNTIF('Empresas'!$A$3:$A$${ultimaEmpresa},"?*")>0,COUNTIF('Empresas'!$A$3:$A$${ultimaEmpresa},E3)=0)`],
      [`H3:H${ultimaRef}`, `AND(H3<>"",COUNTIF('Catálogos'!$H$3:$H$6,"?*")>0,COUNTIF('Catálogos'!$H$3:$H$6,H3)=0)`],
    ]));

    // Centros y Recargos: hojas propias, vacías, con las columnas de su exportación.
    const cen = libro.getWorksheet('Centros');
    expect(cen.getRow(2).values.slice(1, 5)).toEqual(['NOMBRE', 'COMENTARIO', 'ESTADO', 'USAR_EN_GESTIONES']);
    expect(bloqueada(cen.getCell('A3'))).toBe(false);
    expect(g.dataValidations.find('H3')).toMatchObject({ type: 'list', formulae: [`'Centros'!$A$3:$A$${2 + MINIMO_CATALOGOS.centros}`] });
    const rec = libro.getWorksheet('Recargos');
    expect(rec.getRow(2).values.slice(1, 6)).toEqual(['DESDE', 'HASTA', 'VECES COSTO', 'COMENTARIO', 'ESTADO']);
    expect(bloqueada(rec.getCell('E52'))).toBe(false);
    // Veces costo y venta leen la hoja Recargos (por desde-hasta, sin los INACTIVOS).
    const it3 = libro.getWorksheet('Ítems');
    expect(it3.getCell(`${I.tramo}3`).value.formula).toContain(`COUNTIFS('Recargos'!$A$3:$A$52,"<="&R3,'Recargos'!$B$3:$B$52,">="&R3`);
    expect(it3.getCell(`${I.tramo}3`).value.formula).toContain(`'Recargos'!$E$3:$E$52,"<>INACTIVO"`);
    expect(it3.getCell(`${I.veces}3`).value.formula).toContain(`SUMIFS('Recargos'!$C$3:$C$52`);
    expect(it3.getCell('F3').value.formula).toBe('IF(AC3="","",R3*W3*E3)');
    // Gestiones lee de Ítems la CLAVE, el total y los auxiliares por su letra nueva.
    expect(g.getCell('R4').value.formula).toBe(`IF(A4="","",COUNTIF('Ítems'!$H$3:$H$${2 + TAMANO_PLANTILLA.itemsLibres},A4))`);
    expect(g.getCell('S4').value.formula).toContain(`'Ítems'!$${I.total}$3:$${I.total}$`);

    // Cargados: vacía, con las columnas que escribe la macro, protegida.
    const carg = libro.getWorksheet('Cargados');
    expect(carg.getRow(2).values.slice(1)).toEqual(COLUMNAS_CARGADOS.map((col) => col.titulo));
    expect(COLUMNAS_CARGADOS).toHaveLength(45);
    expect(COLUMNAS_CARGADOS.slice(0, 7).map((col) => col.titulo)).toEqual(['N° línea (original)', ...VISTA_CARGA.slice(1)]);
    expect(COLUMNAS_CARGADOS.map((col) => col.titulo)).toContain('Código real');
    expect(carg.views[0]).toMatchObject({ state: 'frozen', xSplit: 7, ySplit: 2 });
    expect(carg.getCell('G2').fill.fgColor.argb).toBe('FFC6E0B4');
    expect(carg.getCell('A3').value).toBeNull();
    expect(carg.sheetProtection).toMatchObject({ sheet: true, autoFilter: true });

    // Instrucciones: macros, botones y cómo actualizar catálogos.
    const textos = libro.getWorksheet('Instrucciones').getColumn('A').values.filter(Boolean).join('\n');
    expect(textos).toContain('Habilitar contenido');
    expect(textos).toContain('"Mover cargados"');
    expect(textos).toContain('"Devolver a pendientes"');
    // Dónde pegar cada catálogo y en qué orden.
    expect(textos).toContain('PEGAR LOS CATÁLOGOS');
    expect(textos).toContain('Recargos → celda A3: DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO');
    expect(textos).toContain('Centros → celda A3: NOMBRE, COMENTARIO, ESTADO, USAR_EN_GESTIONES');
    expect(textos).toContain('Códigos → celda B3: CODIGO, REFERENCIA');
    expect(textos).toContain('FIJAR CATÁLOGOS COMO BASE');
    // Pasos para bloquear el proyecto VBA a mano (Excel no lo permite por automatización).
    expect(textos).toContain('"Bloquear proyecto para visualización"');
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
    expect(ins.getCell('B4').value.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(bloqueada(ins.getCell('B4'))).toBe(false);
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

  it('Solicitud Implantes y Resumen: mismas columnas que la app, más FECHA MOVIMIENTO y CLAVE', async () => {
    const libro = await releer((await construirLibro(datosPlantilla('x'))).libro);
    expect(libro.getWorksheet('Solicitud Implantes').getRow(1).values.slice(1)).toEqual(['ID', 'PACIENTE', 'MEDICO', 'FECHA', 'EMPRESA', 'CODIGO', 'DESCRIPCION', 'CANTIDAD', 'PRECIO', 'ATRIBUTO', 'FECHA REGISTRO', 'FECHA CARGA', 'N° COTIZACION', 'FECHA INGRESO', 'LOTE', 'VENCIMIENTO', 'FECHA MOVIMIENTO', 'CLAVE']);
    expect(libro.getWorksheet('Resumen').getRow(1).values.slice(1)).toEqual(['Ingreso', 'Area', 'Previsión', 'Id', 'Cód', 'Cant', 'Venta', 'Médico', 'Fecha', 'Descripción', 'Estado', 'FECHA MOVIMIENTO', 'CLAVE']);
    expect(libro.getWorksheet('Resumen').views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('oculta todas las fórmulas y protege las hojas con la contraseña recibida', async () => {
    const { libro: armado } = await construirLibro({ ...datosPlantilla('x'), claveHojas: 'ClaveDePrueba1' });
    const libro = await releer(armado);
    // Toda celda con fórmula queda oculta; las bloqueadas siguen bloqueadas y
    // las del autocompletado de Gestiones (E, L-O) siguen desbloqueadas.
    const ocultas = [];
    libro.worksheets.forEach((hoja) => hoja.eachRow((fila) => fila.eachCell((celda) => {
      if (celda.formula) ocultas.push(celda.protection?.hidden === true);
    })));
    expect(ocultas.length).toBeGreaterThan(1000);
    expect(ocultas.every(Boolean)).toBe(true);
    const g = libro.getWorksheet('Gestiones');
    expect(g.getCell('A3').protection).toMatchObject({ hidden: true });
    expect(g.getCell('A3').protection.locked ?? true).toBe(true);
    expect(g.getCell('E3').protection).toMatchObject({ locked: false, hidden: true });
    expect(g.getCell('B3').protection).toMatchObject({ locked: false });
    expect(g.getCell('B3').protection.hidden).toBeFalsy();
    // Contraseña: en el archivo queda solo su hash, en todas las hojas.
    libro.worksheets.forEach((hoja) => {
      expect(hoja.sheetProtection).toMatchObject({ sheet: true, algorithmName: 'SHA-512' });
      expect(hoja.sheetProtection.hashValue).toBeTruthy();
    });
    expect(JSON.stringify(libro.worksheets.map((h) => h.sheetProtection))).not.toContain('ClaveDePrueba1');
  });

  it('la macro usa la contraseña desde un marcador (nunca escrita en el repo)', () => {
    const bas = fs.readFileSync(new URL('./macros/ModContingencia.bas', import.meta.url), 'utf8');
    expect(bas).toContain('Private Const CLAVE_HOJAS As String = "__CLAVE_HOJAS__"');
    expect(bas).toContain('ws.Unprotect Password:=CLAVE_HOJAS');
    expect(bas).toContain('ws.Protect Password:=CLAVE_HOJAS');
    expect(bas).not.toMatch(/Protect Password:=""/);
    expect(bas).not.toMatch(/Documentos/);
  });

  it('plantilla base: sin mes, no deja registrar y tiene la hoja Nuevo mes', async () => {
    const libro = await releer((await construirLibro(datosPlantilla('x'))).libro);
    const g = libro.getWorksheet('Gestiones');
    const cat = libro.getWorksheet('Catálogos');
    // Mes del libro vacío; meses en J.
    expect(cat.getCell(CELDAS_LIBRO.anio).value).toBeNull();
    expect(cat.getCell(CELDAS_LIBRO.mes).value).toBeNull();
    expect([cat.getCell('J3').value, cat.getCell('J13').value]).toEqual(['ENERO', 'NOVIEMBRE']);
    // Admisión y Fecha exigen un mes: la base rechaza todo, con su mensaje.
    const vB = g.dataValidations.find('B3');
    const vC = g.dataValidations.find('C10');
    expect(vB.formulae[0]).toMatch(/^AND\(NOT\(N\('Catálogos'!\$K\$3\)=0\),AND\(ISNUMBER/);
    expect(vC.formulae[0]).toBe("AND(NOT(N('Catálogos'!$K$3)=0),ISNUMBER(C3),YEAR(C3)='Catálogos'!$K$3,MONTH(C3)='Catálogos'!$L$3)");
    expect([vB.error, vC.error]).toEqual([MENSAJES_LIBRO.base, MENSAJES_LIBRO.base]);
    expect(vC.errorStyle).toBe('stop');
    // Sin 'Omitir blancos': si no, Excel no valida con el mes vacío.
    expect([vB.allowBlank, vC.allowBlank].map(Boolean)).toEqual([false, false]);
    // Rótulo del libro (A1:D1) y alerta de fecha fuera del mes.
    expect(g.getCell('A1').value.formula).toContain('PLANTILLA BASE (sin mes)');
    expect(g.getCell('A1').value.formula).toContain("\"LIBRO \"&'Catálogos'!$M$3");
    expect(g.getCell('AE3').value.formula).toContain('Fecha fuera del mes del libro (es de "&INDEX(\'Catálogos\'!$J$3:$J$14,MONTH(C3))');
    expect(g.conditionalFormattings.some((cf) => cf.ref.startsWith('C3:') && cf.rules[0].formulae[0].includes("YEAR(C3)<>'Catálogos'!$K$3"))).toBe(true);
    // Nuevo mes: año y mes editables, con validación; el resto protegido.
    const nm = libro.getWorksheet('Nuevo mes');
    expect([CELDAS_NUEVO_MES.anio, CELDAS_NUEVO_MES.mes].map((c) => bloqueada(nm.getCell(c)))).toEqual([false, false]);
    expect(nm.dataValidations.find('B6')).toMatchObject({ type: 'whole', formulae: [1, 12] });
    expect(nm.getCell('B7').value.formula).toContain('"respaldo_implantes_"&B5&"-"&TEXT(B6,"00")&".xlsm"');
    expect(nm.sheetProtection).toMatchObject({ sheet: true });
    // Instrucciones: el mes del libro arriba y cómo crear el libro.
    const ins = libro.getWorksheet('Instrucciones');
    expect(ins.getCell('A2').value.formula).toContain('PLANTILLA BASE (sin mes)');
    const textos = ins.getColumn('A').values.filter((v) => typeof v === 'string').join('\n');
    expect(textos).toContain('CÓMO SE TRABAJA MES A MES');
    expect(textos).toContain('a fin de mes, desde el libro actual, cree el libro del mes siguiente'.replace('a fin', 'A fin'));
    expect(textos).toContain('ACTUALIZAR REPORTE INFO');
    expect(textos).toContain('AGREGAR O CORREGIR CATÁLOGOS');
    expect(textos).toContain('"Crear libro del mes"');
  });

  it('con mes (modo con datos del sistema): escribe año y mes y el mensaje del mes', async () => {
    const datos = { ...datosPlantilla('x'), libroMes: { anio: 2026, mes: 11 } };
    const libro = await releer((await construirLibro(datos)).libro);
    const cat = libro.getWorksheet('Catálogos');
    expect([cat.getCell('K3').value, cat.getCell('L3').value]).toEqual([2026, 11]);
    expect(cat.getCell('M3').value.formula).toBe('IF(N(K3)=0,"",INDEX($J$3:$J$14,L3)&" "&K3)');
    const g = libro.getWorksheet('Gestiones');
    expect(nombreLibroMes({ anio: 2026, mes: 11 })).toBe('NOVIEMBRE 2026');
    expect(g.dataValidations.find('C3').error).toBe('Este libro es de NOVIEMBRE 2026. Registra esta gestión en el libro del mes de su fecha (respaldo_implantes_AAAA-MM.xlsm).');
    expect(g.dataValidations.find('B3').error).toBe(MENSAJES_LIBRO.admision);
  });

  it('la macro usa las mismas celdas y mensajes del libro del mes', () => {
    const bas = fs.readFileSync(new URL('./macros/ModContingencia.bas', import.meta.url), 'utf8');
    const constante = (nombre) => bas.match(new RegExp(`Private Const ${nombre} As String = "([^"]*)"`))[1];
    expect([constante('LIBRO_ANIO'), constante('LIBRO_MES')]).toEqual([CELDAS_LIBRO.anio, CELDAS_LIBRO.mes]);
    expect([constante('NM_ANIO'), constante('NM_MES')]).toEqual([CELDAS_NUEVO_MES.anio, CELDAS_NUEVO_MES.mes]);
    expect([constante('HOJA_CATALOGOS'), constante('HOJA_NUEVO_MES')]).toEqual([H.C, H.NM]);
    expect(constante('MSJ_ADMISION')).toBe(MENSAJES_LIBRO.admision);
    expect(constante('MSJ_FECHA').replace('{MES}', 'OCTUBRE 2026')).toBe(MENSAJES_LIBRO.fecha('OCTUBRE 2026'));
    expect(constante('MESES').split(',')[9]).toBe('OCTUBRE');
    // Las validaciones de Excel aceptan hasta 255 caracteres.
    expect(MENSAJES_LIBRO.fecha('SEPTIEMBRE 2026').length).toBeLessThanOrEqual(255);
    expect(MENSAJES_LIBRO.base.length).toBeLessThanOrEqual(255);
  });

  it('marca los cambios en Códigos, Empresas y Recargos contra lo original', async () => {
    const datos = datosPlantilla('x', {
      catalogos: {
        codigos: [{ codigo: '000123', referencia: 'REF-1', empresa: 'A', precio: 15000, tipo: 'COTIZACION' }],
        empresas: [{ nombre: 'A', rut: '1-9', estado: 'ACTIVO' }],
        recargos: [{ desde: 0, hasta: 50000, vecesCosto: 2, estado: 'ACTIVO' }],
      },
    });
    const libro = await releer((await construirLibro(datos)).libro);
    const r = libro.getWorksheet('Códigos');
    // Lo original queda en columnas ocultas, una por dato (sin convertir a texto).
    expect(['S3', 'T3', 'V3', 'W3', 'AA3', 'AE3'].map((c) => r.getCell(c).value)).toEqual(['000123', 'REF-1', 'A', 'COTIZACION', 15000, 'ACTIVO']);
    expect(r.getColumn('S').hidden).toBe(true);
    expect(r.getColumn('Q').hidden).toBe(false);
    expect(r.getCell('S4').value).toBeNull();
    expect(r.getCell('Q3').value.formula).toBe('IF(COUNTA(B3:N3)=0,IF(COUNTA(S3:AE3)=0,"","BORRADO"),IF(COUNTA(S3:AE3)=0,"NUEVO",IF(OR(B3<>S3,C3<>T3,D3<>U3,E3<>V3,F3<>W3,G3<>X3,H3<>Y3,I3<>Z3,J3<>AA3,K3<>AB3,L3<>AC3,M3<>AD3,N3<>AE3),"MODIFICADO","")))');
    // Todas las filas preparadas: una fila nueva al final también se marca.
    const ultima = 2 + MINIMO_CATALOGOS.referencias;
    expect(r.getCell(`Q${ultima}`).value.formula).toContain(`COUNTA(B${ultima}:N${ultima})`);
    expect(r.getCell(`R${ultima}`).numFmt).toBe('dd-mm-yyyy');
    // Datos editables; marcas, original y fórmulas bloqueadas y ocultas.
    expect(['B3', 'J3', 'N3', `C${ultima}`].map((c) => bloqueada(r.getCell(c)))).toEqual([false, false, false, false]);
    expect(['A3', 'O3', 'Q3', 'R3', 'S3'].map((c) => bloqueada(r.getCell(c)))).toEqual([true, true, true, true, true]);
    expect(r.getCell('Q3').protection.hidden).toBe(true);
    const e = libro.getWorksheet('Empresas');
    expect(e.getRow(2).values.slice(1)).toEqual(['NOMBRE', 'RUT', 'ESTADO', 'CAMBIO', 'FECHA CAMBIO', 'orig: NOMBRE', 'orig: RUT', 'orig: ESTADO']);
    expect(e.getCell('F3').value).toBe('A');
    expect(e.getCell('D3').value.formula).toContain('OR(A3<>F3,B3<>G3,C3<>H3)');
    const rec = libro.getWorksheet('Recargos');
    expect(rec.getRow(2).values.slice(1, 8)).toEqual(['DESDE', 'HASTA', 'VECES COSTO', 'COMENTARIO', 'ESTADO', 'CAMBIO', 'FECHA CAMBIO']);
    expect(['H3', 'I3', 'J3'].map((c) => rec.getCell(c).value)).toEqual([0, 50000, 2]);
    // Centros también (lo fija el botón); Previsiones y Convenios, sin marcas.
    expect(libro.getWorksheet('Centros').getRow(2).values.slice(1, 7)).toEqual(['NOMBRE', 'COMENTARIO', 'ESTADO', 'USAR_EN_GESTIONES', 'CAMBIO', 'FECHA CAMBIO']);
    expect(libro.getWorksheet('Previsiones').getCell('D2').value).toBeNull();
    expect(Object.keys(MARCAS_CAMBIO)).toEqual(['Códigos', 'Empresas', 'Centros', 'Recargos']);
    // A1 de Códigos queda para el botón "Fijar catálogos como base".
    expect(r.getCell('A1').value).toBeNull();
    expect(r.getCell('B1').value).toContain('PEGAR LOS CATÁLOGOS');
  });

  it('la macro de las marcas usa las mismas columnas', () => {
    const bas = fs.readFileSync(new URL('./macros/ModContingencia.bas', import.meta.url), 'utf8');
    const marcas = bas.match(/Private Const MARCAS As String = "([^"]*)"/)[1];
    const n = (l) => [...l].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
    const esperado = Object.entries(MARCAS_CAMBIO).map(([hoja, m]) => [hoja, n(m.desde), n(m.hasta), n(m.cambio), n(m.fecha)].join(':')).join('|');
    expect(marcas).toBe(esperado);
    const ps1 = fs.readFileSync(new URL('./macros/armarXlsm.ps1', import.meta.url), 'utf8');
    expect(ps1).toContain('Workbook_SheetChange');
    expect(ps1).toContain('RegistrarCambioCatalogo Sh, Target');
    expect(ps1).toContain('RemovePersonalInformation = $false');
    // Botón que fija lo actual como original, con la confirmación pedida.
    expect(bas).toContain('"btnFijarCatalogos", "Fijar catálogos como base", "FijarCatalogosBase"');
    expect(bas).toContain('MsgBox("Se reiniciarán todas las marcas de cambio. ¿Continuar?"');
  });

  it('los nombres de hoja coinciden con los que usan las macros', () => {
    expect([H.G, H.I, H.CARG]).toEqual(['Gestiones', 'Ítems', 'Cargados']);
  });

  it('cada título que busca la macro existe en Ítems o en Cargados', () => {
    const bas = fs.readFileSync(new URL('./macros/ModContingencia.bas', import.meta.url), 'utf8');
    const constante = (nombre) => bas.match(new RegExp(`Private Const ${nombre} As String = "([^"]*)"`))[1];
    const titulosItems = new Set(COLUMNAS_ITEMS.map((c) => c.titulo));
    const titulosCargados = new Set(COLUMNAS_CARGADOS.map((c) => c.titulo));
    // Ítems: celdas que se escriben y las que lee Col(ti, "...").
    const deItems = [
      ...constante('I_ENTRADAS').split('|'),
      ...constante('C_DESDE_ITEMS').split('|').map((p) => p.split('>')[1]),
      ...[...bas.matchAll(/Col\(ti, "([^"]+)"\)/g)].map((m) => m[1]),
    ];
    expect(deItems.filter((t) => !titulosItems.has(t))).toEqual([]);
    // Cargados: lo que llega desde Ítems y desde Gestiones, y lo que se lee al devolver.
    const deCargados = [
      ...constante('C_DESDE_ITEMS').split('|').map((p) => p.split('>')[0]),
      ...constante('G_DESDE_CARGADOS').split('|').map((p) => p.split(':')[1]),
      ...[...bas.matchAll(/Col\(tc, "([^"]+)"\)/g)].map((m) => m[1]),
      'Movido el', 'Movido por', 'Estado gestión',
    ];
    expect(deCargados.filter((t) => !titulosCargados.has(t))).toEqual([]);
    // Toda columna de Cargados tiene de dónde salir.
    const conOrigen = new Set(deCargados);
    expect(COLUMNAS_CARGADOS.map((c) => c.titulo).filter((t) => !conOrigen.has(t))).toEqual([]);
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
    tamano: { gestionesLibres: 5, itemsLibres: 6 },
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
    expect(filas).toEqual({ ultimaGestion: 3 + 1 + 5 - 1, ultimaItem: 3 + 1 + 6 - 1 });
    expect(libro.getWorksheet('Instrucciones').getCell('A5').value).toContain('Catálogo de referencias actualizado al: 23-11-2026 10:00');
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
    expect(it_.getCell('D3').value).toBe('10'); // código guardado, no fórmula
    expect(it_.getCell(`${I.codigoReal}3`).value).toBe('10'); // código real = el guardado
    expect(it_.getCell('B3').value.formula).toContain('FIND("|",H3)');
    expect(it_.getCell('A4').value).toBe(2); // las libres siguen la numeración
    expect(it_.getCell('D4').value.formula).toContain('No lleva OC');
    expect(it_.getCell(`${I.filaCat}4`).value.formula).toContain('MATCH');
    expect(it_.getColumn(I.filaCat).hidden).toBe(true);
    expect(it_.getCell('L4').protection?.locked ?? true).toBe(false);
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
    // Línea normal: Cantidad (ingresar) (M), Lote (O), Vencimiento (P) y
    // Estado carga (G). Cantidad (E) es la fórmula que la muestra.
    expect(['M3', 'O3', 'P3', 'G3'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, false, false, false]);
    expect(['E3', 'L3', 'D3', 'R3', 'K3'].map((c) => bloqueada(it_.getCell(c)))).toEqual([true, true, true, true, true]);
    expect(it_.getCell('M3').value).toBe(2);
    expect(it_.getCell('E3').value.formula).toBe('IF(M3="","",M3)');
    expect(it_.getCell('AP3').value).toBe(2);
    expect(it_.getCell('AQ3').value).toBe('L1');
    expect(it_.getCell('AS3').value).toBe('CARGADO');
    expect(it_.getCell('AO3').value.formula).toBe('IF(OR(G3<>AS3,M3<>AP3,O3<>AQ3,P3<>AR3),"SÍ","NO")');
    expect(it_.getCell('X3').value.formula).toBe('IF(G3="SIN CARGO",0,R3*E3)');
    expect(it_.getCell('F3').value.formula).toBe('IF(G3="SIN CARGO",0,R3*W3*E3)');
    // PAD PADRE: Cantidad y Estado carga. Sin código: todo salvo Estado carga.
    expect(['M4', 'O4', 'P4', 'G4'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, true, true, false]);
    expect(['M5', 'O5', 'P5', 'G5'].map((c) => bloqueada(it_.getCell(c)))).toEqual([false, false, false, true]);
    // El filtro llega hasta MODIFICADO (después de las auxiliares ocultas).
    expect(I.modificado).toBe('AO');
    expect(JSON.stringify(it_.autoFilter)).toContain('AO2');
  });

  it('valida con listas de los catálogos y protege las hojas', async () => {
    const { libro } = await armar();
    const g = libro.getWorksheet('Gestiones');
    const it_ = libro.getWorksheet('Ítems');
    expect(g.dataValidations.find('D4')).toMatchObject({ type: 'list', formulae: ["'Empresas'!$A$3:$A$302"] });
    expect(it_.dataValidations.find('H5')).toMatchObject({ type: 'list', formulae: ["'Gestiones'!$A$3:$A$8"] });
    expect(it_.dataValidations.find('L5')).toMatchObject({ type: 'list', errorStyle: 'warning' });
    expect(it_.dataValidations.find('E5')).toBeUndefined();
    expect(it_.dataValidations.find('M5')).toMatchObject({ type: 'decimal' });
    // Estado carga: en CONTENIDO PAD la lista solo trae CONTENIDO.
    expect(it_.dataValidations.find('G5')).toMatchObject({ type: 'list', formulae: ["IF($I3=\"CONTENIDO PAD\",'Catálogos'!$I$3:$I$3,'Catálogos'!$B$3:$B$7)"] });
    // PAD PADRE: Lote y Vencimiento no se escriben (son PAD).
    expect(it_.dataValidations.find('O5')).toMatchObject({ type: 'custom', formulae: ['$I3<>"PAD PADRE"'] });
    expect(it_.dataValidations.find('P5')).toMatchObject({ type: 'custom', formulae: ['AND($I3<>"PAD PADRE",ISNUMBER(P3),P3>=DATE(2020,1,1),P3<=DATE(2100,12,31))'] });
    expect(libro.getWorksheet('Catálogos').getCell('I3').value).toBe('CONTENIDO');
    expect(g.sheetProtection).toMatchObject({ sheet: true, autoFilter: true });
    expect(g.sheetProtection.sort).toBeFalsy();
    expect(g.views[0]).toMatchObject({ state: 'frozen', ySplit: 2, xSplit: 2 });
  });
});
