// Receta de los kits: configuración, modelos y validación del contenido en el
// servidor (kitsGuardar no confía en la pantalla).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { crearDb } from '../testutils/firestoreMemoria.mjs';
import { idLote } from '../bodega/nucleo.mjs';
import {
  validarConfiguracion, modelosDisponibles, faltantesDelModelo, recetaDelModelo, validarContenidoKit, cambiosConfiguracion, normalizarReferencia,
} from './receta.mjs';
import { lotesParaKit } from './nucleo.mjs';

const require = createRequire(import.meta.url);
const { guardarKitComo } = require('./servicio');
const { guardarConfiguracionComo, guardarConfiguracion } = require('./configuracion');

const POR = { uid: 'dev', nombre: 'Dev', email: '' };
// Productos: 2 guías, vainas por variante, 1 dormia, 1 uretero y uno fuera de la receta.
const PRODUCTOS = {
  g1: 'HW-035150', g2: 'HW-038150', vh: 'FUS-107045', vm: 'FUS-107035', va: 'FUS-ASP45', d1: 'NGE-017115', u1: 'PU3033A', x: 'OTRO-1',
};
const lotes = {
  g1a: ['g1', 'G1A', '2030-01-01', 5], g2a: ['g2', 'G2A', '2029-01-01', 1], g2b: ['g2', 'G2B', '2031-01-01', 5],
  vh: ['vh', 'VH', '2030-01-01', 3], vm: ['vm', 'VM', '2030-01-01', 3], va: ['va', 'VA', '2030-01-01', 3],
  d1: ['d1', 'D1', '2030-01-01', 3], u1: ['u1', 'U1', '2030-01-01', 3], x: ['x', 'X', '2030-01-01', 3],
};
const L = Object.fromEntries(Object.entries(lotes).map(([k, [p, l, v]]) => [k, idLote(p, l, v)]));
const inicial = () => ({
  ...Object.fromEntries(Object.entries(PRODUCTOS).map(([id, referencia]) => [`bodega_productos/${id}`, { nombre: `Producto ${referencia}`, referencia, activo: true, disponible: 20, transito: 0, enCentro: 0, costoPromedio: 100, valorStock: 2000 }])),
  ...Object.fromEntries(Object.entries(lotes).map(([k, [p, l, v, n]]) => [`bodega_lotes/${L[k]}`, { productoId: p, lote: l, vencimiento: v, disponible: n }])),
  'usuarios/dev': { rol: 'dev', activo: true, nombreCompleto: 'Dev' },
  'usuarios/sin': { rol: 'operador', activo: true, permisos: { armadoKits: ['/armadoKits/flexibles'] }, permisosGranulares: { '/armadoKits/flexibles': {} } },
});
const MODELOS = [
  { referencia: 'kfh', nombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', activo: true },
  { referencia: 'KFM', nombre: 'Kit Flexible Mujer', genero: 'MUJER', vaina: 'NORMAL', activo: true },
];
const configuracion = (extra = {}) => ({
  familia: 'FLEXIBLE', versionEsperada: 0,
  componentes: [
    { nombre: 'Guía', cantidad: 2, referencias: ['hw-035150', ' HW-038150 '] },
    { nombre: 'Vaina', cantidad: 1, porVariante: true, referenciasPorVariante: { HOMBRE_NORMAL: ['FUS-107045'], MUJER_NORMAL: ['FUS-107035'], HOMBRE_ASPIRATIVA: ['FUS-ASP45'] } },
    { nombre: 'Dormia', cantidad: 1, referencias: ['NGE-017115'] },
    { nombre: 'Uretero', cantidad: 1, referencias: ['PU3033A'] },
  ],
  modelos: MODELOS,
  ...extra,
});

let db; let datos;
const config = () => datos.get('kits_configuracion/FLEXIBLE');
const kit = (id = 'F001') => datos.get(`kits_armados/${id}`);
const linea = (k, cantidad = 1, extra = {}) => ({ productoId: lotes[k][0], loteId: L[k], cantidad, ...extra });
// Kit completo: 2 guías por FEFO (G2A vence primero, luego G1A), la vaina de la variante, dormia y uretero.
const contenido = (vaina = 'vh') => [linea('g2a'), linea('g1a'), linea(vaina), linea('d1'), linea('u1')];
const crear = (genero, vaina, lineas, extra = {}) => guardarKitComo(db, POR, { familia: 'FLEXIBLE', genero, vaina, lineas, ...extra });
const movimientos = () => [...datos.keys()].filter((r) => /^bodega_movimientos\/[^/]+$/.test(r));

beforeEach(async () => {
  ({ db, datos } = crearDb(inicial()));
  await guardarConfiguracionComo(db, POR, configuracion());
});

describe('configuración', () => {
  it('normaliza mayúsculas y espacios, y resuelve cada referencia a su producto', () => {
    const c = config();
    expect(c.version).toBe(1);
    expect(c.componentes[0]).toMatchObject({ id: 'guia', nombre: 'Guía', cantidad: 2, orden: 1, referencias: [{ referencia: 'HW-035150', productoId: 'g1' }, { referencia: 'HW-038150', productoId: 'g2' }] });
    expect(c.componentes[1].referenciasPorVariante.MUJER_NORMAL).toEqual([{ referencia: 'FUS-107035', productoId: 'vm', nombre: 'Producto FUS-107035' }]);
    expect(c.modelos[0].referencia).toBe('KFH');
    expect(normalizarReferencia('  fus-107045 ')).toBe('FUS-107045');
  });

  it('rechaza una referencia que no existe en Bodega, sin guardar nada', async () => {
    const c = configuracion({ versionEsperada: 1 });
    c.componentes[2].referencias = ['NGE-07115'];
    await expect(guardarConfiguracionComo(db, POR, c)).rejects.toThrow(/NGE-07115 no existe en el maestro de Bodega/);
    expect(config().version).toBe(1);
  });

  it('rechaza un producto en dos componentes, modelos repetidos y datos inválidos', () => {
    const productos = Object.entries(PRODUCTOS).map(([id, referencia]) => ({ id, referencia }));
    const r = validarConfiguracion({
      componentes: [{ nombre: 'A', cantidad: 1, referencias: ['PU3033A'] }, { nombre: 'B', cantidad: 0, referencias: ['pu3033a'] }],
      modelos: [{ referencia: 'K1', nombre: 'x', genero: 'HOMBRE', vaina: 'NORMAL' }, { referencia: 'K2', nombre: 'y', genero: 'HOMBRE', vaina: 'NORMAL' }, { referencia: 'K 3', nombre: '', genero: 'OTRO', vaina: 'NORMAL' }],
    }, productos);
    expect(r.errores.join(' | ')).toMatch(/PU3033A está en A y en B/);
    expect(r.errores.join(' | ')).toMatch(/B: la cantidad/);
    expect(r.errores.join(' | ')).toMatch(/Hay dos modelos para Hombre · vaina normal/);
    expect(r.errores.join(' | ')).toMatch(/K 3: la referencia del kit/);
  });

  it('dos personas guardando a la vez: la segunda se rechaza', async () => {
    const r = await Promise.allSettled([
      guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 1, modelos: [...MODELOS, { referencia: 'KFHA', nombre: 'A', genero: 'HOMBRE', vaina: 'ASPIRATIVA' }] })),
      guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 1, modelos: [...MODELOS, { referencia: 'KFMA', nombre: 'B', genero: 'MUJER', vaina: 'ASPIRATIVA' }] })),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(r.find((x) => x.status === 'rejected').reason.details.motivo).toBe('cambio-concurrente');
    expect(config().version).toBe(2);
  });

  it('audita qué cambió, quién y cuándo; sin cambios no escribe', async () => {
    const c = configuracion({ versionEsperada: 1 });
    c.componentes[0].cantidad = 3;
    c.componentes[3].referencias = [];
    await guardarConfiguracionComo(db, POR, c);
    const log = [...datos.entries()].filter(([r]) => r.startsWith('kits_configuracion/FLEXIBLE/logs/')).map(([, v]) => v).find((l) => l.accion === 'CONFIGURACION_EDITADA');
    expect(log).toMatchObject({ usuario: 'Dev', detalle: { versionAnterior: 1, version: 2 } });
    expect(log.detalle.cambios).toEqual(expect.arrayContaining(['Guía: cantidad 2 → 3', 'Uretero: quitadas PU3033A']));
    expect(log.fecha).toBeTruthy();
    const r = await guardarConfiguracionComo(db, POR, { ...c, versionEsperada: 2 });
    expect(r.sinCambios).toBe(true);
    expect(cambiosConfiguracion(config(), config())).toEqual([]);
  });

  it('no se puede quitar un modelo con kits; sí desactivarlo', async () => {
    await crear('HOMBRE', 'NORMAL', contenido());
    await expect(guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 1, modelos: [MODELOS[1]] }))).rejects.toThrow(/KFH ya tiene kits/);
    await guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 1, modelos: [{ ...MODELOS[0], activo: false }, MODELOS[1]] }));
    expect(config().modelos[0].activo).toBe(false);
  });

  it('solo quien tiene el permiso guarda la configuración', async () => {
    await expect(guardarConfiguracion(db, 'sin', configuracion({ versionEsperada: 1 }))).rejects.toThrow(/permiso/);
  });
});

describe('modelos', () => {
  it('un modelo incompleto o inactivo no está disponible y el servidor lo rechaza', async () => {
    await guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 1, modelos: [...MODELOS, { referencia: 'KFMA', nombre: 'Kit Flexible Mujer Aspirativa', genero: 'MUJER', vaina: 'ASPIRATIVA' }] }));
    expect(modelosDisponibles(config()).map((m) => m.referencia)).toEqual(['KFH', 'KFM']);
    expect(faltantesDelModelo(config(), { genero: 'MUJER', vaina: 'ASPIRATIVA' })).toEqual(['Vaina']);
    await expect(crear('MUJER', 'ASPIRATIVA', contenido('vm'))).rejects.toThrow(/KFMA está incompleto: falta configurar Vaina/);
    await guardarConfiguracionComo(db, POR, configuracion({ versionEsperada: 2, modelos: [MODELOS[0], { ...MODELOS[1], activo: false }] }));
    expect(modelosDisponibles(config()).map((m) => m.referencia)).toEqual(['KFH']);
    await expect(crear('MUJER', 'NORMAL', contenido('vm'))).rejects.toThrow(/KFM está inactivo/);
  });

  it('sin configuración no se puede crear', async () => {
    datos.delete('kits_configuracion/FLEXIBLE');
    await expect(crear('HOMBRE', 'NORMAL', contenido())).rejects.toThrow(/Falta configurar la receta/);
  });

  it('la referencia del kit sale del género y la vaina; una que no corresponde se rechaza', async () => {
    await expect(crear('HOMBRE', 'NORMAL', contenido(), { referencia: 'KFM' })).rejects.toThrow(/KFM no corresponde a Hombre · vaina normal \(es KFH\)/);
    await expect(crear('HOMBRE', 'OTRA', contenido())).rejects.toThrow(/género y el tipo de vaina/);
  });
});

describe('crear con la receta', () => {
  it('kit hombre con su vaina: líneas por componente y en orden', async () => {
    const r = await crear('HOMBRE', 'NORMAL', contenido(), { referencia: 'kfh' });
    expect(r).toMatchObject({ codigo: 'F001', referencia: 'KFH' });
    expect(kit()).toMatchObject({ referencia: 'KFH', modeloNombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', tipo: 'HOMBRE_NORMAL', versionReceta: 1, totalUnidades: 5 });
    expect(kit().lineas.map((l) => [l.componenteNombre, l.lote])).toEqual([['Guía', 'G2A'], ['Guía', 'G1A'], ['Vaina', 'VH'], ['Dormia', 'D1'], ['Uretero', 'U1']]);
  });

  it('kit mujer con su vaina', async () => {
    await crear('MUJER', 'NORMAL', contenido('vm'));
    expect(kit()).toMatchObject({ referencia: 'KFM', tipo: 'MUJER_NORMAL' });
    expect(kit().lineas.find((l) => l.componenteId === 'vaina').lote).toBe('VM');
  });

  it('rechaza la vaina del otro género o de otro tipo, sin consumir número ni stock', async () => {
    await expect(crear('HOMBRE', 'NORMAL', contenido('vm'))).rejects.toThrow(/FUS-107035 Producto FUS-107035 no está permitido|no está permitido/);
    await expect(crear('MUJER', 'NORMAL', contenido('vh'))).rejects.toThrow(/no está permitido/);
    await expect(crear('HOMBRE', 'NORMAL', contenido('va'))).rejects.toThrow(/no está permitido/);
    expect(kit()).toBeUndefined();
    expect(movimientos()).toHaveLength(0);
    expect(datos.get('bodega_control/kits_correlativos')).toBeUndefined();
  });

  it('una referencia fuera de la receta enviada directamente al servidor se rechaza', async () => {
    await expect(crear('HOMBRE', 'NORMAL', [...contenido(), linea('x')])).rejects.toThrow(/no está permitido/);
    expect(movimientos()).toHaveLength(0);
  });

  it('cantidades incompletas o en exceso se rechazan', async () => {
    await expect(crear('HOMBRE', 'NORMAL', [linea('g2a'), linea('vh'), linea('d1'), linea('u1')])).rejects.toThrow(/Guía: faltan 1 \(lleva 1 de 2\)/);
    await expect(crear('HOMBRE', 'NORMAL', [linea('g2a'), linea('g1a', 2), linea('vh'), linea('d1'), linea('u1')])).rejects.toThrow(/Guía: sobran 1 \(lleva 3 de 2\)/);
    await expect(crear('HOMBRE', 'NORMAL', [linea('g2a'), linea('g1a'), linea('vh')])).rejects.toThrow(/Dormia: faltan 1.*Uretero: faltan 1/);
    expect(movimientos()).toHaveLength(0);
  });

  it('2 guías desde 2 lotes de referencias distintas', async () => {
    await crear('HOMBRE', 'NORMAL', contenido());
    const guias = kit().lineas.filter((l) => l.componenteId === 'guia');
    expect(guias.map((l) => [l.productoId, l.cantidad])).toEqual([['g2', 1], ['g1', 1]]);
  });

  it('FEFO mezcla las referencias del componente: tomar otra guía antes de la que vence primero pide confirmación', async () => {
    const elegibles = lotesParaKit(['g1', 'g2'].flatMap((p) => Object.entries(lotes).filter(([, x]) => x[0] === p).map(([k, [, lote, vencimiento, disponible]]) => ({ id: L[k], productoId: p, lote, vencimiento, disponible }))), '2026-11-10');
    expect(elegibles.map((l) => l.lote)).toEqual(['G2A', 'G1A', 'G2B']);
    await expect(crear('HOMBRE', 'NORMAL', [linea('g1a', 2), linea('vh'), linea('d1'), linea('u1')])).rejects.toMatchObject({ details: { motivo: 'fuera-fefo', loteIds: [L.g1a] } });
    await crear('HOMBRE', 'NORMAL', [linea('g1a', 2, { confirmarFueraFEFO: true }), linea('vh'), linea('d1'), linea('u1')]);
    expect(kit().lineas[0]).toMatchObject({ componenteId: 'guia', fueraDeFEFO: true });
  });
});

describe('editar y cambios de configuración', () => {
  it('cambiar la configuración no modifica un kit armado', async () => {
    await crear('HOMBRE', 'NORMAL', contenido());
    const antes = JSON.stringify(kit());
    const c = configuracion({ versionEsperada: 1 });
    c.componentes[0].cantidad = 3;
    c.componentes[1].referenciasPorVariante.HOMBRE_NORMAL = ['FUS-ASP45'];
    c.componentes[1].referenciasPorVariante.HOMBRE_ASPIRATIVA = [];
    c.componentes[0].nombre = 'Guías';
    await guardarConfiguracionComo(db, POR, c);
    expect(JSON.stringify(kit())).toBe(antes);
  });

  it('al editar manda la receta vigente; una línea que se conserva sigue valiendo aunque ya no esté permitida', async () => {
    await crear('HOMBRE', 'NORMAL', contenido());
    const c = configuracion({ versionEsperada: 1 });
    c.componentes[0].cantidad = 3;
    c.componentes[1].referenciasPorVariante.HOMBRE_NORMAL = ['FUS-ASP45'];
    c.componentes[1].referenciasPorVariante.HOMBRE_ASPIRATIVA = [];
    await guardarConfiguracionComo(db, POR, c);
    const lineas = kit().lineas.map((l) => ({ productoId: l.productoId, loteId: l.loteId, cantidad: l.cantidad }));
    await expect(guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas })).rejects.toThrow(/Guía: faltan 1 \(lleva 2 de 3\)/);
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: [...lineas, linea('g2b', 1, { confirmarFueraFEFO: true })] });
    expect(kit().lineas.find((l) => l.loteId === L.vh).componenteId).toBe('vaina');
    expect(kit().version).toBe(2);
    // Aumentar una línea que ya no está permitida no se acepta.
    const nuevas = kit().lineas.map((l) => ({ productoId: l.productoId, loteId: l.loteId, cantidad: l.loteId === L.vh ? 2 : l.cantidad }));
    await expect(guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: nuevas })).rejects.toThrow(/no está permitido/);
  });

  it('la receta del modelo se arma por variante', () => {
    const c = config();
    expect(recetaDelModelo(c, { genero: 'MUJER', vaina: 'NORMAL' }).find((x) => x.id === 'vaina').referencias.map((r) => r.referencia)).toEqual(['FUS-107035']);
    const { errores } = validarContenidoKit(recetaDelModelo(c, { genero: 'MUJER', vaina: 'NORMAL' }), [{ productoId: 'vm', loteId: 'a', cantidad: 1 }]);
    expect(errores).toEqual(['Guía: faltan 2 (lleva 0 de 2).', 'Dormia: faltan 1 (lleva 0 de 1).', 'Uretero: faltan 1 (lleva 0 de 1).']);
  });
});
