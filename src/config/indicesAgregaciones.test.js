import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Toda agregación sum() con filtros necesita un índice compuesto que
// incluya los campos filtrados Y los sumados; el índice automático de un
// campo no alcanza. Sin él, getAggregateFromServer falla con
// FAILED_PRECONDITION y la pantalla muestra 0 (pasó con la Valorización de
// bodega y el Comparativo mensual: el índice (periodoId, linea) no tenía
// cantidad ni valor). Un sum() sin filtros no necesita índice compuesto.
//
// CONSULTAS lista cada consulta sum() de src/: el test exige que su índice
// exista en firestore.indexes.json y que todo archivo con sum() esté aquí
// con todos sus campos sumados. Al agregar una consulta, se agrega aquí y
// su índice al archivo.
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const INDICES = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../firestore.indexes.json', import.meta.url)), 'utf8'));

const CONSULTAS = {
  // Saldo de Bodega del mes abierto: sum() por línea de la cuadratura
  // (periodoId == id, o == null para los movimientos sin periodo).
  'components/modulos/administracion/controlMensual/bodegaPeriodoStore.js': [
    { coleccion: 'bodega_movimientos', filtros: ['periodoId', 'linea'], sumas: ['cantidad', 'valor'] },
  ],
  // Mes abierto de Control Mensual: toda la subcolección, sin filtros.
  'components/modulos/administracion/controlMensual/resumenImputacionesStore.js': [
    { coleccion: 'documentos', filtros: [], sumas: ['total'] },
  ],
  // Comparativo mensual: rango sobre la fecha del documento.
  'components/modulos/administracion/totalesFinanzas/useComparativoMesData.js': [
    { coleccion: 'documentos', filtros: ['fecha'], sumas: ['total'] },
    { coleccion: 'documentos', filtros: ['fchEmis'], sumas: ['total'] },
  ],
  // Herramienta de medición (solo desarrollo): toda la subcolección, sin filtros.
  'dev/firestoreMeter.js': [
    { coleccion: 'documentos', filtros: [], sumas: ['total'] },
  ],
};

const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'privado' ? [] : recorrer(p);
  return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});
const relativo = (p) => path.relative(RAIZ, p).split(path.sep).join('/');

// sum('campo') o fs.sum('campo') de firebase/firestore.
const sumasDe = (codigo) => [...codigo.matchAll(/\bsum\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

// Campos de un índice compuesto (sin el __name__ implícito).
const camposIndice = (i) => i.fields.map((f) => f.fieldPath).filter((c) => c !== '__name__');
const tieneIndice = ({ coleccion, filtros, sumas }) => {
  const buscados = [...filtros, ...sumas].sort();
  return INDICES.indexes.some((i) => i.collectionGroup === coleccion && i.queryScope === 'COLLECTION'
    && JSON.stringify([...camposIndice(i)].sort()) === JSON.stringify(buscados));
};

describe('índices de las agregaciones sum()', () => {
  const conSuma = recorrer(RAIZ)
    .map((p) => ({ archivo: relativo(p), sumas: sumasDe(fs.readFileSync(p, 'utf8')) }))
    .filter((a) => a.sumas.length);

  it('todo archivo con sum() está en CONSULTAS con todos sus campos sumados', () => {
    const faltan = conSuma.flatMap(({ archivo, sumas }) => {
      const declaradas = (CONSULTAS[archivo] || []).flatMap((c) => c.sumas);
      return sumas.filter((s) => !declaradas.includes(s)).map((s) => `${archivo}: sum('${s}')`);
    });
    expect(faltan).toEqual([]);
  });

  it('CONSULTAS no tiene archivos que ya no usan sum()', () => {
    const usados = conSuma.map((a) => a.archivo);
    expect(Object.keys(CONSULTAS).filter((a) => !usados.includes(a))).toEqual([]);
  });

  it('cada sum() con filtros tiene su índice compuesto en firestore.indexes.json', () => {
    const sinIndice = Object.entries(CONSULTAS).flatMap(([archivo, consultas]) => consultas
      .filter((c) => c.filtros.length && !tieneIndice(c))
      .map((c) => `${archivo}: ${c.coleccion} (${[...c.filtros, ...c.sumas].join(', ')})`));
    expect(sinIndice).toEqual([]);
  });
});
