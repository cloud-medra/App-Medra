import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { BitArray, Code128Reader } from '@zxing/library';
import { construirPdfKit, filasPorComponente, modulosCodigoBarras, nombreArchivoKit, textoVencimiento } from './pdfKit';

const libs = { jsPDF, autoTable, JsBarcode };
const KIT = {
  codigo: 'F001', referencia: 'KFH', modeloNombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', tipo: 'HOMBRE_NORMAL', version: 2, totalUnidades: 6,
  lineas: [
    { componenteId: 'vaina', componenteNombre: 'Vaina', componenteOrden: 2, referencia: 'REF-C', productoNombre: 'Insumo C', lote: null, vencimiento: '2025-01-01', cantidad: 1 },
    { componenteId: 'guia', componenteNombre: 'Guía', componenteOrden: 1, referencia: 'REF-A', productoNombre: 'Insumo A', lote: 'A1', vencimiento: '2029-01-01', cantidad: 3 },
    { componenteId: 'guia', componenteNombre: 'Guía', componenteOrden: 1, referencia: 'REF-B', productoNombre: 'Insumo B', lote: 'B1', vencimiento: null, cantidad: 2 },
  ],
};
const generar = () => construirPdfKit(libs, { kit: KIT, hoy: '2026-11-10', generado: '10-11-2026 09:00' });

// Lee los módulos como lo haría el lector: una fila de barras con su zona de silencio.
const leer = (modulos) => {
  const fila = new BitArray(modulos.length + 40);
  [...modulos].forEach((m, i) => { if (m === '1') fila.set(i + 20); });
  return new Code128Reader().decodeRow(0, fila, new Map()).getText();
};

describe('código de barras del kit', () => {
  it('@zxing vuelve a leer el valor que codifica JsBarcode', () => {
    ['KITF001V1', 'KITF001V2', 'KITF1000V12'].forEach((v) => expect(leer(modulosCodigoBarras(JsBarcode, v))).toBe(v));
  });
  it('cabe en la hoja: unos 44 mm para KITF001V1', () => {
    expect(modulosCodigoBarras(JsBarcode, 'KITF001V1').length * 0.33).toBeLessThan(50);
  });
});

describe('PDF del kit', () => {
  const texto = () => generar().output();

  it('trae ID, referencia, tipo, fecha, código, contenido y total', () => {
    const t = texto();
    ['Kit F001', 'KFH - Kit Flexible Hombre', 'Hombre · vaina normal', 'Generado el 10-11-2026 09:00', 'KITF001V2', 'Contenido versión 2',
      'REF-A', 'Insumo A', 'A1', '01-01-2029', 'Total de unidades', 'S/L'].forEach((s) => expect(t).toContain(s));
  });

  it('marca "Sin vencimiento" y "Vencido"', () => {
    const t = texto();
    expect(t).toContain('Sin vencimiento');
    expect(t).toContain('01-01-2025 · Vencido');
    expect(textoVencimiento(null, '2026-11-10')).toBe('Sin vencimiento');
    expect(textoVencimiento('2026-11-10', '2026-11-10')).toBe('10-11-2026');
  });

  it('no dice Medra en ninguna parte, ni en metadatos ni en el nombre del archivo', () => {
    expect(texto().toLowerCase()).not.toContain('medra');
    expect(nombreArchivoKit(KIT)).toMatch(/^Kit_F001_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(nombreArchivoKit(KIT).toLowerCase()).not.toContain('medra');
  });

  it('un kit sin versión guardada usa la versión 1', () => {
    const t = construirPdfKit(libs, { kit: { ...KIT, version: undefined }, hoy: '2026-11-10', generado: 'x' }).output();
    expect(t).toContain('KITF001V1');
  });

  it('agrupa por componente, en el orden de la receta y con su total', () => {
    expect(filasPorComponente(KIT.lineas).map((g) => [g.nombre, g.lineas.map((l) => l.referencia)])).toEqual([['Guía', ['REF-A', 'REF-B']], ['Vaina', ['REF-C']]]);
    // Dentro del PDF los paréntesis van escapados.
    const t = generar().output();
    expect(t).toContain('Guía \\(5\\)');
    expect(t).toContain('Vaina \\(1\\)');
    expect(t.indexOf('Guía \\(5\\)')).toBeLessThan(t.indexOf('Vaina \\(1\\)'));
  });

  it('un kit sin componentes va en un solo grupo', () => {
    expect(filasPorComponente([{ referencia: 'X', cantidad: 1 }]).map((g) => g.nombre)).toEqual(['Contenido']);
  });
});
