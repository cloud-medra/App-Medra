import { describe, it, expect } from 'vitest';
import { tipoArchivoDesdeNombre } from './tiposArchivo';

describe('tipoArchivoDesdeNombre', () => {
  it('reconoce la extensión sin importar mayúsculas', () => {
    expect(tipoArchivoDesdeNombre('100 - ANA - DP.PDF').etiqueta).toBe('PDF');
    expect(tipoArchivoDesdeNombre('informe.docx').etiqueta).toBe('DOC');
    expect(tipoArchivoDesdeNombre('planilla.xlsx').etiqueta).toBe('XLS');
    expect(tipoArchivoDesdeNombre('foto.JPG').etiqueta).toBe('IMG');
  });

  it('usa un ícono genérico para extensiones desconocidas o sin nombre', () => {
    expect(tipoArchivoDesdeNombre('archivo.xyz').etiqueta).toBe('FILE');
    expect(tipoArchivoDesdeNombre(undefined).etiqueta).toBe('FILE');
  });
});
