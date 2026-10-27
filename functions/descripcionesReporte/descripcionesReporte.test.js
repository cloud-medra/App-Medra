import { describe, it, expect } from 'vitest';
import { estadoDescripcion, esPendiente, COLECCION_DESCRIPCIONES, idDescripcionReporte } from './nucleo.mjs';
import { aplicarCambioFila } from './servicio.js';

// Descripciones ocultas: estado de revisión (pendiente / visible / oculta) y
// la marca `pendienteDesde` que pone el trigger de fila al crear una
// descripción nueva, con Firestore simulado.

const crearDb = (existentes = {}) => {
  const docs = new Map(Object.entries(existentes));
  const lecturas = [];
  const escrituras = [];
  const ref = (path) => ({
    path,
    get: async () => { lecturas.push(path); return { exists: docs.has(path), data: () => docs.get(path) }; },
    set: async (datos) => { escrituras.push({ path, tipo: 'set', datos }); docs.set(path, { ...(docs.get(path) || {}), ...datos }); },
    update: async (datos) => { escrituras.push({ path, tipo: 'update', datos }); },
  });
  return { db: { collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }) }, ref, lecturas, escrituras };
};
const rutaDescripcion = (texto) => `${COLECCION_DESCRIPCIONES}/${idDescripcionReporte(texto)}`;
const FILA = 'documentos_reportesInfo/2026/meses/octubre/registros/r1';
const setsDelMaestro = (escrituras) => escrituras.filter((e) => e.path.startsWith(COLECCION_DESCRIPCIONES));

describe('estadoDescripcion', () => {
  it('pendiente: creada por el trigger y sin tocar; revisada en cuanto se escribe actualizadoEl', () => {
    expect(estadoDescripcion({ pendienteDesde: 't' })).toBe('pendiente');
    expect(estadoDescripcion({ pendienteDesde: 't', actualizadoEl: 't2' })).toBe('visible');
    expect(estadoDescripcion({ pendienteDesde: 't', actualizadoEl: 't2', ocultaDocumentos: true })).toBe('oculta');
    expect(esPendiente({ pendienteDesde: 't', actualizadoEl: 't2' })).toBe(false);
  });

  it('las entradas sin pendienteDesde (anteriores) cuentan como revisadas con su estado', () => {
    expect(estadoDescripcion({ descripcion: 'X', filas: 3 })).toBe('visible');
    expect(estadoDescripcion({ ocultaImplantes: true })).toBe('oculta');
    expect(estadoDescripcion({ ocultaImplantes: false, ocultaDocumentos: false })).toBe('visible');
  });
});

describe('aplicarCambioFila: marca de descripción nueva', () => {
  it('una fila con una descripción que no está en el Maestro la crea pendiente', async () => {
    const { db, ref, escrituras } = crearDb();
    await aplicarCambioFila(db, ref(FILA), null, { 'Descripción': 'Artroscopia rodilla', 'Admisión': '' });
    const [set] = setsDelMaestro(escrituras);
    expect(set.path).toBe(rutaDescripcion('Artroscopia rodilla'));
    expect(set.datos).toHaveProperty('pendienteDesde');
    expect(set.datos.descripcion).toBe('ARTROSCOPIA RODILLA');
  });

  it('una descripción que ya existe solo suma la fila (no vuelve a quedar pendiente)', async () => {
    const { db, ref, escrituras } = crearDb({ [rutaDescripcion('ARTROSCOPIA RODILLA')]: { descripcion: 'ARTROSCOPIA RODILLA', filas: 4, ocultaImplantes: true } });
    await aplicarCambioFila(db, ref(FILA), null, { 'Descripción': 'ARTROSCOPIA RODILLA', 'Admisión': '' });
    const [set] = setsDelMaestro(escrituras);
    expect(set.datos).not.toHaveProperty('pendienteDesde');
    // Los campos de la fila se calculan con la entrada leída antes de sumar.
    expect(escrituras.find((e) => e.path === FILA).datos).toMatchObject({ ocultaImplantes: true, descripcionOcultaImplantes: true });
  });

  it('una edición que no toca descripción ni admisión no lee ni escribe el Maestro', async () => {
    const { db, ref, lecturas, escrituras } = crearDb();
    const fila = { 'Descripción': 'X', 'Admisión': '', descripcionNorm: 'X', admisionClave: '', ocultaImplantes: false, ocultaDocumentos: false, descripcionOcultaImplantes: false };
    await aplicarCambioFila(db, ref(FILA), fila, { ...fila, Revisado: true });
    expect(lecturas).toEqual([]);
    expect(escrituras).toEqual([]);
  });

  it('al eliminar la fila solo resta del contador', async () => {
    const { db, ref, lecturas, escrituras } = crearDb();
    await aplicarCambioFila(db, ref(FILA), { 'Descripción': 'X' }, null);
    expect(lecturas).toEqual([]);
    expect(setsDelMaestro(escrituras)).toHaveLength(1);
    expect(setsDelMaestro(escrituras)[0].datos).not.toHaveProperty('pendienteDesde');
  });
});
