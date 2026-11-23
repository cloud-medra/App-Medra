import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { construirLibro } from './libroRespaldo.js';
import { filasDesdeGestiones, catalogoReferencias } from './datosRespaldo.js';

const armar = async () => {
  const { filasGestiones, filasItems, ultimaLinea } = filasDesdeGestiones([{
    refPath: 'implantes_gestiones/2026/mes/11/dia/01/admision/1/empresa/A/detalles/a', gestionId: '00123', empresa: 'A', fecha: '2026-11-01', estado: 'PENDIENTE',
    cotizaciones: [{ items: [{ id: 'i1', referencia: 'R1', codigo: '10', precio: 100, cantidad: 2, totalItem: 200, venta: 300, vecesCosto: 1.5, recargoEncontrado: true, estadoCarga: 'CARGADO' }] }],
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
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Instrucciones', 'Gestiones', 'Ítems', 'Documentos', 'Referencias', 'Catálogos']);
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

  it('valida con listas de los catálogos y protege las hojas', async () => {
    const { libro } = await armar();
    const g = libro.getWorksheet('Gestiones');
    const it_ = libro.getWorksheet('Ítems');
    expect(g.dataValidations.find('D4')).toMatchObject({ type: 'list', formulae: ["'Catálogos'!$H$3:$H$3"] });
    expect(it_.dataValidations.find('B5')).toMatchObject({ type: 'list', formulae: ["'Gestiones'!$A$3:$A$8"] });
    expect(it_.dataValidations.find('F5')).toMatchObject({ type: 'list', errorStyle: 'warning' });
    expect(g.sheetProtection).toMatchObject({ sheet: true, autoFilter: true });
    expect(g.sheetProtection.sort).toBeFalsy();
    expect(g.views[0]).toMatchObject({ state: 'frozen', ySplit: 2, xSplit: 2 });
  });
});
