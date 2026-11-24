import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quitarComentariosVba } from './quitarComentariosVba.js';

describe('quitarComentariosVba', () => {
  it('quita líneas de comentario y comentarios al final, sin tocar los textos', () => {
    const vba = [
      'Attribute VB_Name = "M"',
      "' cabecera que menciona la app",
      'Option Explicit',
      '',
      '',
      "Private Const A As String = \"it's\" ' comentario",
      '    x = "a ""b"" \'c\'"  \' otro',
      '    Rem viejo',
      'End Sub',
      '',
    ].join('\r\n');
    expect(quitarComentariosVba(vba)).toBe([
      'Attribute VB_Name = "M"',
      'Option Explicit',
      '',
      "Private Const A As String = \"it's\"",
      '    x = "a ""b"" \'c\'"',
      'End Sub',
      '',
    ].join('\r\n'));
  });

  it('el módulo del libro queda sin comentarios ni menciones a la app', () => {
    const bas = fs.readFileSync(fileURLToPath(new URL('./ModContingencia.bas', import.meta.url)), 'utf8');
    const limpio = quitarComentariosVba(bas);
    // Ninguna línea con ' fuera de texto: se comprueba quitando los textos.
    const sinTextos = limpio.replace(/"(?:[^"]|"")*"/g, '""');
    expect(sinTextos).not.toMatch(/'/);
    expect(limpio).not.toMatch(/medra/i);
    expect(limpio).toContain('Public Sub MoverCargados()');
    expect(limpio.split(/\r?\n/).length).toBeLessThan(bas.split(/\r?\n/).length);
  });
});
