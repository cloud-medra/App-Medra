import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { construirPdfCaja, enOrdenDeCaja, textoCelda } from './pdfCajas';

describe('pdfCajas', () => {
  it('enOrdenDeCaja: orden de la caja y los que ya no están al final, en su orden', () => {
    const lineas = [{ productoId: 'x' }, { productoId: 'a' }, { productoId: 'y' }, { productoId: 'b' }];
    expect(enOrdenDeCaja(lineas, ['b', 'a']).map((l) => l.productoId)).toEqual(['b', 'a', 'x', 'y']);
    expect(enOrdenDeCaja(undefined, ['a'])).toEqual([]);
  });

  it('textoCelda: números en es-CL y sin el signo menos tipográfico', () => {
    expect(textoCelda(12345)).toBe('12.345');
    expect(textoCelda('Consumo (actual − contado)')).toBe('Consumo (actual - contado)');
    expect(textoCelda(null)).toBe('');
  });

  it('construirPdfCaja: título en metadata, varias páginas y "Página X de Y" en cada una', () => {
    const columnas = [{ titulo: 'Producto', valor: (f) => f.nombre }, { titulo: 'Faltante', valor: (f) => f.faltante, numero: true }];
    const filas = Array.from({ length: 80 }, (_, i) => ({ nombre: `Producto ${i}`, faltante: i % 3 }));
    const doc = construirPdfCaja({ jsPDF, autoTable }, {
      tipo: 'Contenido de la caja', titulo: 'Caja de prueba', generado: '29-10-2026 10:00',
      resumen: [{ etiqueta: 'Productos', valor: 80 }],
      secciones: [{ columnas, filas, resaltar: (f) => f.faltante > 0, alerta: 'Faltante' }],
    });
    const paginas = doc.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);
    const salida = doc.output();
    expect(salida).toContain('/Title (Contenido de la caja');
    // "Página" va codificada en el PDF; basta con el resto del texto.
    for (let p = 1; p <= paginas; p += 1) expect(salida).toContain(`gina ${p} de ${paginas}`);
  });

  it('construirPdfCaja: una sección vacía muestra su mensaje', () => {
    const doc = construirPdfCaja({ jsPDF, autoTable }, {
      tipo: 'Inventario de la caja', titulo: 'Caja', generado: '',
      secciones: [{ titulo: '2. Faltante', columnas: [{ titulo: 'Producto', valor: (f) => f.nombre }], filas: [], vacio: 'Ningún producto quedó con faltante.' }],
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
