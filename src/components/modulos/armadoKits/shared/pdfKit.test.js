import { describe, it, expect, beforeAll } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { BitArray, Code128Reader } from '@zxing/library';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { COLUMNAS_PDF, FIBRAS_LASER, construirPdfKit, filasContenido, modulosCodigoBarras, nombreArchivoKit, textoVencimiento } from './pdfKit';

const libs = { jsPDF, autoTable, JsBarcode };
const HOY = '2026-11-10';
const KIT = {
  codigo: 'F001', referencia: 'KFH', modeloNombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', tipo: 'HOMBRE_NORMAL', version: 2, totalUnidades: 6,
  lineas: [
    { componenteId: 'vaina', componenteNombre: 'Vaina', componenteOrden: 2, referencia: 'REF-C', productoNombre: 'Insumo C', lote: null, vencimiento: '2025-01-01', cantidad: 1 },
    { componenteId: 'guia', componenteNombre: 'Guía', componenteOrden: 1, referencia: 'REF-A', productoNombre: 'Insumo A', lote: 'A1', vencimiento: '2029-01-01', cantidad: 3 },
    { componenteId: 'guia', componenteNombre: 'Guía', componenteOrden: 1, referencia: 'REF-B', productoNombre: 'Insumo B', lote: 'B1', vencimiento: null, cantidad: 2 },
  ],
};
const generar = (kit = KIT) => construirPdfKit(libs, { kit, hoy: HOY });

// Texto de cada página tal como lo lee un visor de PDF (pdf.js): así se ve si
// un carácter quedó mal codificado (por ejemplo "Âµ" en vez de "µ").
const paginas = async (doc) => {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output('arraybuffer')), isEvalSupported: false, useSystemFonts: false }).promise;
  const textos = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const contenido = await (await pdf.getPage(p)).getTextContent();
    // La fuente estándar dibuja el glifo "mu": pdf.js lo devuelve como μ
    // (U+03BC), que se ve igual que µ (U+00B5). Se igualan para comparar; un
    // error de codificación se vería como "Âµ" y no pasa.
    textos.push(contenido.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').replace(/μ/g, 'µ'));
  }
  return textos;
};

beforeAll(() => { pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href; });

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
  it('mantiene ID, referencia, tipo, código de barras, contenido y total', async () => {
    const [t] = await paginas(generar());
    ['HOJA DE KIT', 'Kit F001', 'KFH - Kit Flexible Hombre', 'Hombre · vaina normal', 'KITF001V2', 'Contenido versión 2',
      'REF-A', 'Insumo A', 'A1', '01-01-2029', 'Total de unidades', 'S/L'].forEach((s) => expect(t).toContain(s));
  });

  it('sin "Generado" ni fecha de generación', async () => {
    const [t] = await paginas(generar());
    expect(t).not.toMatch(/Generado/i);
    expect(t).not.toContain('10-11-2026');
    expect(generar().output()).not.toMatch(/Generado/i);
  });

  it('campos Admisión, Nombre y Fecha en blanco antes de la tabla', async () => {
    const [t] = await paginas(generar());
    expect(t).toMatch(/Admisión:.*Nombre:.*Fecha:.*Componente/);
  });

  it('columnas en orden y el componente en cada fila, sin filas de título', async () => {
    const [t] = await paginas(generar());
    expect(t).toContain(COLUMNAS_PDF.join(' '));
    expect(COLUMNAS_PDF).toEqual(['Componente', 'Referencia', 'Nombre', 'Lote', 'Vencimiento', 'Cantidad']);
    expect(filasContenido(KIT.lineas, HOY)).toEqual([
      ['Guía', 'REF-A', 'Insumo A', 'A1', '01-01-2029', '3'],
      ['Guía', 'REF-B', 'Insumo B', 'B1', 'Sin vencimiento', '2'],
      ['Vaina', 'REF-C', 'Insumo C', 'S/L', '01-01-2025 · Vencido', '1'],
    ]);
    expect(t).not.toContain('Guía (5)');
  });

  it('mantiene "Sin vencimiento" y "Vencido"', async () => {
    const [t] = await paginas(generar());
    expect(t).toContain('Sin vencimiento');
    expect(t).toContain('01-01-2025 · Vencido');
    expect(textoVencimiento('2026-11-10', HOY)).toBe('10-11-2026');
  });

  it('tabla "Fibras láser" con la µ bien codificada y el uso en blanco', async () => {
    const [t] = await paginas(generar());
    expect(t).toMatch(/Fibras láser Referencia Uso 272 µm 365 µm 550 µm 1000 µm/);
    expect(t).not.toContain('Â');
    expect(FIBRAS_LASER).toEqual(['272 µm', '365 µm', '550 µm', '1000 µm']);
  });

  it('un nombre largo pasa a otra línea dentro de su celda, sin cortarse', async () => {
    const largo = 'NITINOL TIPLESS STONE EXTRACTOR CANASTILLA DE RECUPERACION DE CALCULOS URETERALES CON PUNTA ATRAUMATICA 2.4 FR 115 CM';
    const doc = generar({ ...KIT, lineas: [{ ...KIT.lineas[0], productoNombre: largo, referencia: 'NTSED-024115-UDH', componenteNombre: 'Catéter doble J' }] });
    const [t] = await paginas(doc);
    largo.split(' ').forEach((palabra) => expect(t).toContain(palabra));
    expect(t).toContain('NTSED-024115-UDH');
    expect(t).toContain('Catéter doble J');
  });

  it('con muchas líneas y varias por componente: campos en la primera página y fibras completas en una sola', async () => {
    const lineas = Array.from({ length: 70 }, (_, i) => ({
      componenteId: `c${i % 5}`, componenteNombre: `Componente ${i % 5}`, componenteOrden: i % 5, referencia: `REF-${i}`, productoNombre: `Insumo ${i}`, lote: `L${i}`, vencimiento: '2030-01-01', cantidad: 1,
    }));
    const doc = generar({ ...KIT, lineas, totalUnidades: 70 });
    const textos = await paginas(doc);
    expect(textos.length).toBeGreaterThan(1);
    expect(textos[0]).toMatch(/Admisión:.*Nombre:.*Fecha:/);
    const conFibras = textos.filter((t) => t.includes('Fibras láser'));
    expect(conFibras).toHaveLength(1);
    FIBRAS_LASER.forEach((f) => expect(conFibras[0]).toContain(f));
    expect(filasContenido(lineas, HOY).map((f) => f[0]).slice(0, 15)).toEqual([...Array(14).fill('Componente 0'), 'Componente 1']);
  });

  it('no dice Medra en ninguna parte, ni en metadatos ni en el nombre del archivo', async () => {
    const doc = generar();
    expect(doc.output().toLowerCase()).not.toContain('medra');
    (await paginas(doc)).forEach((t) => expect(t.toLowerCase()).not.toContain('medra'));
    expect(nombreArchivoKit(KIT)).toMatch(/^Kit_F001_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('un kit sin versión guardada usa la versión 1', async () => {
    const [t] = await paginas(generar({ ...KIT, version: undefined }));
    expect(t).toContain('KITF001V1');
  });
});
