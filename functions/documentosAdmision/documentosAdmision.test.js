import { describe, it, expect, vi } from 'vitest';
import { puedeEliminarDocumento, validarSolicitud, rutaPapelera, MODULOS_DOCUMENTOS } from './nucleo.mjs';
import { eliminarDocumento, ErrorDocumento } from './servicio.js';

// Eliminar PDF de la pestaña Documentos (Cloud Function
// eliminarDocumentoAdmision), con Storage y Firestore simulados: permiso,
// ruta de otra admisión, archivo inexistente y reversión ante fallas.

const VISTA = '/implantes/gestionImplantes';
const PESTANA = '/implantes/gestionImplantes/documentos';
const operador = (elements, extra = {}) => ({
  rol: 'operador',
  permisos: { implantes: [VISTA] },
  permisosGranulares: { [PESTANA]: { contenido: { visible: true, elements } } },
  ...extra,
});

describe('permiso btn_eliminar_documento', () => {
  it('denegado por defecto; solo con la acción marcada en la pestaña del módulo', () => {
    expect(puedeEliminarDocumento(operador({}), 'implantes')).toBe(false);
    expect(puedeEliminarDocumento(operador({ btn_eliminar_documento: false }), 'implantes')).toBe(false);
    expect(puedeEliminarDocumento(operador({ btn_eliminar_documento: true }), 'implantes')).toBe(true);
    // Sin la vista de Gestión en el menú, sin la pestaña, o inactivo.
    expect(puedeEliminarDocumento(operador({ btn_eliminar_documento: true }, { permisos: { implantes: [] } }), 'implantes')).toBe(false);
    expect(puedeEliminarDocumento({ ...operador({}), permisosGranulares: {} }, 'implantes')).toBe(false);
    expect(puedeEliminarDocumento(operador({ btn_eliminar_documento: true }, { activo: false }), 'implantes')).toBe(false);
    // Cada módulo con su propio permiso.
    expect(puedeEliminarDocumento(operador({ btn_eliminar_documento: true }), 'hemodinamia')).toBe(false);
    expect(puedeEliminarDocumento({ rol: 'admin', permisos: { implantes: [VISTA] }, permisosGranulares: { [PESTANA]: {} } }, 'implantes')).toBe(false);
    expect(puedeEliminarDocumento({ rol: 'dev' }, 'hemodinamia')).toBe(true);
    expect(puedeEliminarDocumento({ rol: 'dev' }, 'otro')).toBe(false);
  });
});

describe('validarSolicitud', () => {
  const base = { modulo: 'implantes', idAdmision: '115813' };
  it('acepta solo un PDF directo en la carpeta de ESA admisión', () => {
    expect(validarSolicitud({ ...base, ruta: 'implantes/115813/documentos/115813 - ANA - INF.pdf' }))
      .toMatchObject({ id: '115813', nombre: '115813 - ANA - INF.pdf' });
    expect(validarSolicitud({ ...base, ruta: 'implantes/999/documentos/a.pdf' }).error).toMatch(/no pertenece/);
    expect(validarSolicitud({ ...base, ruta: 'implantes/1158130/documentos/a.pdf' }).error).toMatch(/no pertenece/);
    expect(validarSolicitud({ ...base, ruta: 'hemodinamia/115813/documentos/a.pdf' }).error).toMatch(/no pertenece/);
    expect(validarSolicitud({ ...base, ruta: 'implantes/115813/eliminados/a.pdf' }).error).toMatch(/no pertenece/);
    expect(validarSolicitud({ ...base, ruta: 'implantes/115813/documentos/../../999/documentos/a.pdf' }).error).toBeTruthy();
    expect(validarSolicitud({ ...base, ruta: 'implantes/115813/documentos/' }).error).toBeTruthy();
    expect(validarSolicitud({ ...base, idAdmision: ' ', ruta: 'implantes//documentos/a.pdf' }).error).toMatch(/ID/);
    expect(validarSolicitud({ ...base, modulo: 'otro', ruta: 'x' }).error).toMatch(/Módulo/);
  });

  it('papelera fuera de /documentos, con fecha para no chocar', () => {
    expect(rutaPapelera(MODULOS_DOCUMENTOS.hemodinamia, '7', 'a.pdf', new Date('2026-10-20T14:05:09.123Z')))
      .toBe('hemodinamia/7/eliminados/2026-10-20T14-05-09-123Z_a.pdf');
  });
});

// Storage y Firestore simulados. `fallas` decide qué operación falla.
const simular = ({ existe = true, fallas = {} } = {}) => {
  const archivos = new Map();
  const auditorias = new Map();
  const RUTA = 'implantes/115813/documentos/115813 - ANA - INF.pdf';
  if (existe) archivos.set(RUTA, 'pdf');
  const fallo = (op) => {
    const f = fallas[op];
    if (f) throw f === true ? new Error(`falla ${op}`) : f;
  };
  const bucket = {
    file: (ruta) => ({
      ruta,
      exists: vi.fn(async () => [archivos.has(ruta)]),
      copy: vi.fn(async (destino) => { fallo('copy'); archivos.set(destino.ruta, archivos.get(ruta)); }),
      delete: vi.fn(async (opciones) => {
        if (ruta === RUTA) fallo('delete');
        if (!archivos.has(ruta) && !opciones?.ignoreNotFound) throw Object.assign(new Error('No such object'), { code: 404 });
        archivos.delete(ruta);
      }),
    }),
  };
  let n = 0;
  const db = {
    collection: (col) => ({
      doc: () => {
        const id = `${col}/a${++n}`;
        return {
          id,
          set: vi.fn(async (datos) => { fallo('set'); auditorias.set(id, datos); }),
          delete: vi.fn(async () => { auditorias.delete(id); }),
        };
      },
    }),
  };
  const ejecutar = () => eliminarDocumento({
    bucket,
    db,
    datos: { modulo: 'implantes', idAdmision: '115813', ruta: RUTA },
    usuario: { uid: 'u1', email: 'ana@x.cl', nombre: 'Ana' },
    ahora: new Date('2026-10-20T14:05:09.000Z'),
    marcaTiempo: 'TS',
  });
  return { archivos, auditorias, ejecutar, RUTA };
};

describe('eliminarDocumento', () => {
  it('mueve el PDF a la papelera y registra quién, cuándo y qué', async () => {
    const s = simular();
    const r = await s.ejecutar();
    const papelera = 'implantes/115813/eliminados/2026-10-20T14-05-09-000Z_115813 - ANA - INF.pdf';
    expect(r).toMatchObject({ resultado: 'eliminado', rutaPapelera: papelera });
    expect([...s.archivos.keys()]).toEqual([papelera]);
    expect([...s.auditorias.values()]).toEqual([{
      modulo: 'implantes', idAdmision: '115813', nombre: '115813 - ANA - INF.pdf',
      rutaOriginal: s.RUTA, rutaPapelera: papelera, archivoInexistente: false,
      eliminadoPorUid: 'u1', eliminadoPorEmail: 'ana@x.cl', eliminadoPorNombre: 'Ana', eliminadoEl: 'TS',
    }]);
    expect([...s.auditorias.keys()][0]).toMatch(/^implantes_documentos_eliminados\//);
  });

  it('ruta de otra admisión: rechaza sin tocar Storage ni Firestore', async () => {
    const s = simular();
    await expect(eliminarDocumento({
      bucket: null, db: null,
      datos: { modulo: 'implantes', idAdmision: '115813', ruta: 'implantes/999/documentos/a.pdf' },
      usuario: { uid: 'u1' },
    })).rejects.toMatchObject({ codigo: 'invalid-argument' });
    expect(s.archivos.size).toBe(1);
  });

  it('archivo inexistente: solo auditoría marcada, y lo informa', async () => {
    const s = simular({ existe: false });
    const r = await s.ejecutar();
    expect(r.resultado).toBe('inexistente');
    expect(s.archivos.size).toBe(0);
    expect([...s.auditorias.values()][0]).toMatchObject({ archivoInexistente: true, rutaPapelera: null });
  });

  it('falla la copia: no cambia nada', async () => {
    const s = simular({ fallas: { copy: true } });
    await expect(s.ejecutar()).rejects.toBeInstanceOf(ErrorDocumento);
    expect([...s.archivos.keys()]).toEqual([s.RUTA]);
    expect(s.auditorias.size).toBe(0);
  });

  it('falla la auditoría: se borra la copia y el original queda', async () => {
    const s = simular({ fallas: { set: true } });
    await expect(s.ejecutar()).rejects.toMatchObject({ codigo: 'internal' });
    expect([...s.archivos.keys()]).toEqual([s.RUTA]);
    expect(s.auditorias.size).toBe(0);
  });

  it('falla el borrado del original: revierte copia y auditoría', async () => {
    const s = simular({ fallas: { delete: true } });
    await expect(s.ejecutar()).rejects.toMatchObject({ codigo: 'internal', message: expect.stringMatching(/No se hicieron cambios/) });
    expect([...s.archivos.keys()]).toEqual([s.RUTA]);
    expect(s.auditorias.size).toBe(0);
  });

  it('el original desapareció entre medio (404 al borrar): vale como eliminado', async () => {
    const s = simular({ fallas: { delete: Object.assign(new Error('No such object'), { code: 404 }) } });
    const r = await s.ejecutar();
    expect(r.resultado).toBe('eliminado');
    expect(s.auditorias.size).toBe(1);
  });
});
