// Historial de uso de las referencias: con Firestore en memoria, porque lo que
// importa es el resultado de eventos repetidos, atrasados o en desorden.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import {
  COLECCION_USO_CODIGOS, idReferenciaUso, claveDeTexto, claveDeGestion, aportesDeGestion, resumenUso, fechaDeGestion,
} from './nucleo.mjs';

const require = createRequire(import.meta.url);
const { aplicarCambioGestion, recalcular } = require('./servicio');

// Firestore mínimo: documentos por ruta y transacciones que aplican al final.
const crearDb = () => {
  const datos = new Map();
  const refDoc = (path) => ({ path, id: path.split('/').pop() });
  const snap = (ref) => ({ ref, id: ref.id, exists: datos.has(ref.path), data: () => datos.get(ref.path), get: (c) => datos.get(ref.path)?.[c] });
  const db = {
    datos,
    collection: (nombre) => ({
      doc: (id) => refDoc(`${nombre}/${id}`),
      get: async () => ({ docs: [...datos.keys()].filter((k) => k.startsWith(`${nombre}/`)).map((k) => snap(refDoc(k))) }),
    }),
    doc: refDoc,
    collectionGroup: () => {
      const consulta = {
        orderBy: () => consulta, startAt: () => consulta, endBefore: () => consulta, select: () => consulta,
        get: async () => {
          const docs = [...datos.keys()].filter((k) => k.includes('/detalles/')).sort().map((k) => snap(refDoc(k)));
          return { docs, size: docs.length };
        },
      };
      return consulta;
    },
    runTransaction: async (fn) => {
      const escrituras = [];
      const resultado = await fn({
        get: async (ref) => snap(ref),
        getAll: async (...refs) => refs.map(snap),
        set: (ref, d) => escrituras.push(() => datos.set(ref.path, d)),
        delete: (ref) => escrituras.push(() => datos.delete(ref.path)),
      });
      escrituras.forEach((e) => e());
      return resultado;
    },
    batch: () => {
      const ops = [];
      return {
        set: (ref, d) => ops.push(() => datos.set(ref.path, d)),
        delete: (ref) => ops.push(() => datos.delete(ref.path)),
        commit: async () => ops.forEach((o) => o()),
      };
    },
  };
  return db;
};

const RUTA = 'implantes_gestiones/2026/mes/11/dia/05/admision/100/empresa/ACME/detalles/uno';
const RUTA_2 = 'implantes_gestiones/2026/mes/11/dia/06/admision/200/empresa/ACME/detalles/uno';
const gestion = (medico, descripcion, referencias, fecha = '2026-11-05', empresa = 'ACME') => ({
  medico, descripcion, fecha, empresa, cotizaciones: [{ items: referencias.map((referencia) => ({ referencia })) }],
});

describe('historial de uso', () => {
  let db;
  // Simula un evento: deja la gestión como `despues` y corre el trigger.
  const guardar = async (ruta, antes, despues) => {
    if (despues) db.datos.set(ruta, despues); else db.datos.delete(ruta);
    return aplicarCambioGestion(db, db.doc(ruta), antes, despues);
  };
  const usoDe = async (referencia) => db.datos.get(`${COLECCION_USO_CODIGOS}/${await idReferenciaUso(referencia)}`);
  const medicosDe = async (referencia) => resumenUso(await usoDe(referencia)).medicos;

  beforeEach(() => { db = crearDb(); });

  it('asocia médico y descripción a la referencia', async () => {
    await guardar(RUTA, null, gestion('Juan Pérez', 'ARTROSCOPIA', ['ABC-123']));
    const r = resumenUso(await usoDe('ABC-123'));
    expect(r.medicos).toMatchObject([{ nombre: 'Juan Pérez', usos: 1, ultimoUso: '2026-11-05' }]);
    expect(r.descripciones).toMatchObject([{ nombre: 'ARTROSCOPIA', usos: 1 }]);
  });

  it('otro médico se agrega sin borrar el anterior', async () => {
    await guardar(RUTA, null, gestion('Juan Pérez', 'A', ['ABC-123']));
    await guardar(RUTA_2, null, gestion('Ana Soto', 'A', ['ABC-123'], '2026-11-06'));
    expect((await medicosDe('ABC-123')).map((m) => m.nombre).sort()).toEqual(['Ana Soto', 'Juan Pérez']);
  });

  it('el mismo médico con otra escritura no se duplica y suma usos', async () => {
    await guardar(RUTA, null, gestion('Juan Perez', 'A', ['ABC-123']));
    await guardar(RUTA_2, null, gestion('  JUAN   PÉREZ ', 'A', ['abc-123'], '2026-11-06'));
    expect(await medicosDe('ABC-123')).toMatchObject([{ nombre: 'Juan Perez', usos: 2, ultimoUso: '2026-11-06' }]);
  });

  it('varias líneas de la misma referencia en una gestión son un solo uso', async () => {
    await guardar(RUTA, null, gestion('Juan Pérez', 'A', ['ABC-123', 'abc-123']));
    expect((await medicosDe('ABC-123'))[0].usos).toBe(1);
  });

  it('evento duplicado: no descuadra nada', async () => {
    const g = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, g);
    const primero = JSON.stringify(await usoDe('ABC-123'));
    await aplicarCambioGestion(db, db.doc(RUTA), null, g);
    expect(JSON.stringify(await usoDe('ABC-123'))).toBe(primero);
    expect((await medicosDe('ABC-123'))[0].usos).toBe(1);
  });

  it('eliminación duplicada: la segunda no hace nada', async () => {
    const g = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, g);
    await guardar(RUTA_2, null, gestion('Juan Pérez', 'A', ['ABC-123'], '2026-11-06'));
    await guardar(RUTA, g, null);
    await aplicarCambioGestion(db, db.doc(RUTA), g, null);
    expect(await medicosDe('ABC-123')).toMatchObject([{ usos: 1, ultimoUso: '2026-11-06' }]);
  });

  it('evento atrasado: no hace reaparecer una gestión ya eliminada', async () => {
    const g = gestion('Juan Pérez', 'A', ['ABC-123']);
    db.datos.set(RUTA, g);
    db.datos.delete(RUTA); // Se creó y se eliminó; llega primero la eliminación.
    await aplicarCambioGestion(db, db.doc(RUTA), g, null);
    await aplicarCambioGestion(db, db.doc(RUTA), null, g);
    expect(await usoDe('ABC-123')).toBeUndefined();
  });

  it('eventos en desorden: queda el médico actual, no el del último evento recibido', async () => {
    const a = gestion('Juan Pérez', 'A', ['ABC-123']);
    const b = gestion('Ana Soto', 'A', ['ABC-123']);
    const c = gestion('Luis Rojas', 'A', ['ABC-123']);
    db.datos.set(RUTA, c);
    await aplicarCambioGestion(db, db.doc(RUTA), b, c);
    await aplicarCambioGestion(db, db.doc(RUTA), a, b);
    expect((await medicosDe('ABC-123')).map((m) => m.nombre)).toEqual(['Luis Rojas']);
  });

  it('edición que cambia la referencia: mueve la asociación', async () => {
    const antes = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, antes);
    await guardar(RUTA, antes, gestion('Juan Pérez', 'A', ['XYZ-9']));
    expect(await usoDe('ABC-123')).toBeUndefined();
    expect(await medicosDe('XYZ-9')).toMatchObject([{ nombre: 'Juan Pérez', usos: 1 }]);
  });

  it('edición que cambia el ID (médico y descripción): reemplaza ambos', async () => {
    const antes = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, antes);
    await guardar(RUTA, antes, gestion('Ana Soto', 'B', ['ABC-123']));
    const r = resumenUso(await usoDe('ABC-123'));
    expect(r.medicos.map((m) => m.nombre)).toEqual(['Ana Soto']);
    expect(r.descripciones.map((d) => d.nombre)).toEqual(['B']);
  });

  it('eliminación de la última carga: el médico desaparece y el documento se borra', async () => {
    const g = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, g);
    await guardar(RUTA, g, null);
    expect(await usoDe('ABC-123')).toBeUndefined();
  });

  it('eliminar la carga de un médico mantiene a los demás y recalcula el último uso', async () => {
    const reciente = gestion('Juan Pérez', 'A', ['ABC-123'], '2026-11-06');
    await guardar(RUTA, null, gestion('Juan Pérez', 'A', ['ABC-123']));
    await guardar(RUTA_2, null, reciente);
    await guardar(RUTA_2, reciente, null);
    expect(await medicosDe('ABC-123')).toMatchObject([{ usos: 1, ultimoUso: '2026-11-05' }]);
  });

  it('referencia con "/" o que es ".": el ID del documento es válido y se conserva el texto', async () => {
    await guardar(RUTA, null, gestion('Juan Pérez', 'A', ['AB/12', '.']));
    const id = await idReferenciaUso('AB/12');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect((await usoDe('AB/12')).referencia).toBe('AB/12');
    expect((await usoDe('.')).referencia).toBe('.');
  });

  it('médico con punto en el nombre: la clave no lo lleva y se muestra tal cual', async () => {
    await guardar(RUTA, null, gestion('DR. PÉREZ', 'CX. DE RODILLA', ['ABC-123']));
    const uso = await usoDe('ABC-123');
    const claves = [...Object.keys(uso.medicos), ...Object.keys(uso.descripciones)];
    claves.forEach((c) => expect(c).toMatch(/^k[0-9a-f]{16}$/));
    expect(resumenUso(uso).medicos[0].nombre).toBe('DR. PÉREZ');
    expect(resumenUso(uso).descripciones[0].nombre).toBe('CX. DE RODILLA');
    expect(await claveDeTexto('dr. perez')).toBe(claves[0]);
  });

  it('la misma ruta de detalles en otro día son gestiones distintas', async () => {
    expect(await claveDeGestion(RUTA)).not.toBe(await claveDeGestion(RUTA_2));
    expect(await claveDeGestion(RUTA)).toMatch(/^g[0-9a-f]{24}$/);
  });

  it('sin ID o sin datos: no agrega asociación ni falla', async () => {
    await guardar(RUTA, null, gestion('P', 'P', ['ABC-123']));
    await guardar(RUTA_2, null, gestion('', undefined, ['ABC-123']));
    expect(await usoDe('ABC-123')).toBeUndefined();
  });

  it('solo con médico: agrega el médico y ninguna descripción', async () => {
    await guardar(RUTA, null, gestion('Juan Pérez', 'P', ['ABC-123']));
    const r = resumenUso(await usoDe('ABC-123'));
    expect(r.medicos).toHaveLength(1);
    expect(r.descripciones).toHaveLength(0);
  });

  it('al sincronizar el ID después, aparece la asociación', async () => {
    const pendiente = gestion('P', 'P', ['ABC-123']);
    await guardar(RUTA, null, pendiente);
    await guardar(RUTA, pendiente, gestion('Juan Pérez', 'A', ['ABC-123']));
    expect(await medicosDe('ABC-123')).toHaveLength(1);
  });

  it('un guardado que no cambia lo relevante no escribe', async () => {
    const g = gestion('Juan Pérez', 'A', ['ABC-123']);
    await guardar(RUTA, null, g);
    const conPrecio = { ...g, costo: 999 };
    expect(await aplicarCambioGestion(db, db.doc(RUTA), g, conPrecio)).toEqual({ cambio: false });
  });

  it('referencias sin valor ("P") no generan documento', async () => {
    const aportes = await aportesDeGestion(gestion('Juan Pérez', 'A', ['P', '', 'ABC-123']), RUTA);
    expect(aportes.referencias.map((r) => r.normalizada)).toEqual(['ABC-123']);
  });

  it('usa la fecha de la ruta si la gestión no trae una válida', () => {
    expect(fechaDeGestion({ fecha: 'P' }, RUTA)).toBe('2026-11-05');
    expect(fechaDeGestion({ fecha: 'P' }, 'otra/ruta')).toBe('');
  });

  describe('recalcular', () => {
    it('la simulación informa y no escribe', async () => {
      db.datos.set(RUTA, gestion('Juan Pérez', 'A', ['ABC-123'], '2026-11-05', 'ACME'));
      db.datos.set(RUTA_2, gestion('Ana Soto', 'B', ['ABC-123', 'XYZ-9'], '2026-11-06', 'OTRA'));
      const r = await recalcular(db);
      expect(r).toMatchObject({ totalGestiones: 2, referencias: 2, medicos: 2, descripciones: 2, aCrear: 2, aSobrescribir: 0 });
      expect(r.enVariasEmpresas).toEqual([{ referencia: 'ABC-123', empresas: ['ACME', 'OTRA'] }]);
      expect(await usoDe('ABC-123')).toBeUndefined();
    });

    it('sobrescribe desde cero: no duplica lo del trigger y corrige lo sobrante', async () => {
      const g = gestion('Juan Pérez', 'A', ['ABC-123']);
      await guardar(RUTA, null, g);
      const huerfano = await idReferenciaUso('YA-NO-EXISTE');
      db.datos.set(`${COLECCION_USO_CODIGOS}/${huerfano}`, { referencia: 'YA-NO-EXISTE', medicos: {}, descripciones: {} });
      const r = await recalcular(db, { aplicar: true });
      expect(r).toMatchObject({ aCrear: 0, aSobrescribir: 0, aBorrar: 1, sinCambios: 1 });
      expect((await medicosDe('ABC-123'))[0].usos).toBe(1);
      expect(await usoDe('YA-NO-EXISTE')).toBeUndefined();
    });

    it('repara un documento alterado y una segunda pasada no encuentra diferencias', async () => {
      db.datos.set(RUTA, gestion('Juan Pérez', 'A', ['ABC-123']));
      const id = await idReferenciaUso('ABC-123');
      db.datos.set(`${COLECCION_USO_CODIGOS}/${id}`, { referencia: 'ABC-123', referenciaNormalizada: 'ABC-123', medicos: { kfalso: { nombre: 'Otro', gestiones: { g1: '2020-01-01' } } }, descripciones: {} });
      expect(await recalcular(db, { aplicar: true })).toMatchObject({ aSobrescribir: 1 });
      expect((await medicosDe('ABC-123')).map((m) => m.nombre)).toEqual(['Juan Pérez']);
      expect(await recalcular(db)).toMatchObject({ aCrear: 0, aSobrescribir: 0, aBorrar: 0, sinCambios: 1 });
    });
  });
});
