import { describe, it, expect } from 'vitest';
import {
  FUENTES_PENDIENTES, idAlertaPendientes, destinatariosDeRuta, destinatariosTicket, cambioAlertaPendientes,
  rutaDeAlerta, rutaActiva, RUTA_GESTION_TICKETS, RUTA_AYUDA_SOPORTE, RUTA_ALERTAS,
} from './nucleo.mjs';
import { sincronizarPendientes, aplicarCambioTicket } from './servicio.js';

// Notificaciones de la campana: destinatarios (quien puede abrir la
// pantalla + desarrolladores), una alerta agregada por fuente con la
// cantidad, y una por ticket nuevo; con Firestore simulado.

const USUARIOS = [
  { id: 'dev1', rol: 'dev' },
  { id: 'devInactivo', rol: 'dev', activo: false },
  { id: 'op1', rol: 'operador', permisos: { maestros: ['/maestros/zonasDiagnostico'], implantes: ['/implantes/solicitudImplantes'] } },
  { id: 'op2', rol: 'operador', permisos: { maestros: ['/maestros/descripcionesOcultas'] } },
  { id: 'adm1', rol: 'admin', permisos: { administracion: [RUTA_GESTION_TICKETS] } },
  { id: 'adm2', rol: 'admin', centrosAdministrados: ['C1'], permisos: {} },
  { id: 'adm3', rol: 'admin', permisos: {} },
];

describe('destinatarios', () => {
  it('quien tiene la ruta en su menú y los desarrolladores activos', () => {
    expect(destinatariosDeRuta(USUARIOS, 'maestros', '/maestros/zonasDiagnostico')).toEqual(['dev1', 'op1']);
    expect(destinatariosDeRuta(USUARIOS, 'maestros', '/maestros/descripcionesOcultas')).toEqual(['dev1', 'op2']);
  });

  it('ticket: gestores y administradores asignados al autor, nunca el autor', () => {
    expect(destinatariosTicket({ creadoPor: 'op1', administradores: ['adm3'] }, USUARIOS)).toEqual(['adm1', 'adm3', 'dev1']);
    expect(destinatariosTicket({ creadoPor: 'op1', administradores: [], centroAdministradores: 'C1' }, USUARIOS)).toEqual(['adm1', 'adm2', 'dev1']);
    expect(destinatariosTicket({ creadoPor: 'adm1', administradores: [] }, USUARIOS)).toEqual(['dev1']);
  });

  it('un ítem inactivo en Gestión de módulos no notifica', () => {
    expect(rutaActiva(null, 'maestros', '/maestros/zonasDiagnostico')).toBe(true);
    expect(rutaActiva({ itemsInactivos: ['/maestros/zonasDiagnostico'] }, 'maestros', '/maestros/zonasDiagnostico')).toBe(false);
    expect(rutaActiva({ modulosInactivos: ['implantes'] }, 'implantes', '/implantes/solicitudImplantes')).toBe(false);
  });
});

describe('cambioAlertaPendientes: una alerta por fuente, sin ruido', () => {
  const pendiente = (cantidad, noLeidas, destinatarios = ['dev1', 'op1']) => ({ estado: 'pendiente', datos: { cantidad }, destinatarios, noLeidas });

  it('sin alerta y con pendientes: se crea no leída para todos, con la cantidad en el título', () => {
    const c = cambioAlertaPendientes('zonas', null, 3, ['dev1', 'op1']);
    expect(c.accion).toBe('crear');
    expect(c.datos).toMatchObject({ tipo: 'pendientes', titulo: '3 zonas por diagnóstico por revisar', noLeidas: ['dev1', 'op1'], datos: { cantidad: 3, ruta: '/maestros/zonasDiagnostico' } });
    expect(cambioAlertaPendientes('zonas', null, 1, ['dev1']).datos.titulo).toBe('1 zona por diagnóstico por revisar');
  });

  it('si suben los pendientes vuelve a "no leída"; si bajan solo cambia la cantidad', () => {
    expect(cambioAlertaPendientes('zonas', pendiente(3, []), 5, ['dev1', 'op1'])).toMatchObject({ accion: 'crear', datos: { noLeidas: ['dev1', 'op1'] } });
    expect(cambioAlertaPendientes('zonas', pendiente(3, ['op1']), 2, ['dev1', 'op1'])).toMatchObject({ accion: 'actualizar', datos: { noLeidas: ['op1'], datos: { cantidad: 2 } } });
    // Un destinatario nuevo la recibe sin leer; uno que perdió el acceso sale.
    expect(cambioAlertaPendientes('zonas', pendiente(3, []), 3, ['dev1', 'op9'])).toMatchObject({ accion: 'actualizar', datos: { destinatarios: ['dev1', 'op9'], noLeidas: ['op9'] } });
    expect(cambioAlertaPendientes('zonas', pendiente(3, ['op1']), 3, ['dev1', 'op1'])).toBeNull();
  });

  it('sin pendientes se resuelve; si ya estaba resuelta no se toca', () => {
    expect(cambioAlertaPendientes('zonas', pendiente(3, []), 0, [])).toEqual({ accion: 'resolver', datos: { cantidad: 0 } });
    expect(cambioAlertaPendientes('zonas', { estado: 'resuelta' }, 0, [])).toBeNull();
    expect(cambioAlertaPendientes('zonas', null, 0, [])).toBeNull();
    // Reaparecen pendientes después de resuelta: se reabre sin leer.
    expect(cambioAlertaPendientes('zonas', { estado: 'resuelta', datos: { cantidad: 0 } }, 1, ['dev1']).accion).toBe('crear');
  });
});

describe('rutaDeAlerta (clic en la campana)', () => {
  it('cada tipo lleva a su pantalla', () => {
    expect(rutaDeAlerta({ tipo: 'pendientes', datos: { ruta: '/maestros/zonasDiagnostico' } }, () => true)).toBe('/maestros/zonasDiagnostico');
    expect(rutaDeAlerta({ tipo: 'ticket' }, (r) => r === RUTA_GESTION_TICKETS)).toBe(RUTA_GESTION_TICKETS);
    expect(rutaDeAlerta({ tipo: 'ticket' }, () => false)).toBe(RUTA_AYUDA_SOPORTE);
    expect(rutaDeAlerta({ tipo: 'solicitud' }, () => true)).toBe(RUTA_ALERTAS);
  });
});

// ── Firestore simulado ────────────────────────────────────────────────
const crearDb = ({ conteos = {}, docs = {}, usuarios = USUARIOS, descripciones = [] } = {}) => {
  const datos = new Map([...usuarios.map((u) => [`usuarios/${u.id}`, u]), ...Object.entries(docs)]);
  const escrituras = [];
  const consultasUsuarios = [];
  const ref = (path) => ({
    path,
    get: async () => ({ exists: datos.has(path), data: () => datos.get(path), get: (k) => datos.get(path)?.[k] }),
    set: async (d) => { escrituras.push({ path, tipo: 'set', datos: d }); datos.set(path, d); },
    update: async (d) => { escrituras.push({ path, tipo: 'update', datos: d }); datos.set(path, { ...datos.get(path), ...d }); },
  });
  const consulta = (nombre, filtros = []) => ({
    where: (campo, op, valor) => consulta(nombre, [...filtros, [String(campo), op, valor]]),
    select: () => consulta(nombre, filtros),
    count: () => ({ get: async () => ({ data: () => ({ count: conteos[clave(nombre, filtros)] ?? 0 }) }) }),
    get: async () => {
      let lista = [];
      if (nombre === 'usuarios') {
        consultasUsuarios.push(filtros);
        lista = usuarios.filter((u) => filtros.every(([c, op, v]) => (op === '==' ? u[c] === v
          : c.startsWith('permisos.') ? (u.permisos?.[c.slice(9)] || []).includes(v) : (u[c] || []).includes(v))));
      } else if (nombre === 'maestros_descripciones_reporte') lista = descripciones;
      return { size: lista.length, docs: lista.map((u) => ({ id: u.id, data: () => u, ref: ref(`${nombre}/${u.id}`) })) };
    },
  });
  // Clave legible de un conteo: colección + filtro principal (sin documentId).
  const clave = (nombre, filtros) => [nombre, ...filtros.filter(([c]) => c !== '__name__').map(([c, op, v]) => `${c}${op}${v}`)].join('|');
  const db = {
    collection: (nombre) => ({ ...consulta(nombre), doc: (id) => ref(`${nombre}/${id}`) }),
    collectionGroup: (nombre) => consulta(`grupo:${nombre}`),
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const ops = [];
      return {
        update: (r, d) => ops.push({ path: r.path, tipo: 'lote', datos: d }),
        commit: async () => { escrituras.push(...ops); },
      };
    },
  };
  return { db, escrituras, consultasUsuarios, datos };
};
const ZONAS = 'maestros_zonas_diagnostico|estadoinsin_asignar,sugerida';
const SOL_IMPL = 'grupo:detalles|solicitud==SOLICITAR';

describe('sincronizarPendientes', () => {
  it('crea una alerta por fuente con pendientes, con quien puede abrir la pantalla', async () => {
    const { db, escrituras } = crearDb({
      conteos: { [ZONAS]: 4, [SOL_IMPL]: 2 },
      descripciones: [{ id: 'a', pendienteDesde: 't' }, { id: 'b', pendienteDesde: 't', actualizadoEl: 't2' }],
    });
    const r = await sincronizarPendientes(db);
    expect(r.zonas).toEqual({ cantidad: 4, accion: 'crear' });
    expect(r.descripciones).toEqual({ cantidad: 1, accion: 'crear' });
    expect(r.solicitudConsignacion).toEqual({ cantidad: 0, accion: null });
    const zonas = escrituras.find((e) => e.path === `alertas/${idAlertaPendientes('zonas')}`);
    expect(zonas.datos).toMatchObject({ estado: 'pendiente', destinatarios: ['dev1', 'op1'], noLeidas: ['dev1', 'op1'], titulo: '4 zonas por diagnóstico por revisar' });
    expect(escrituras.find((e) => e.path === `alertas/${idAlertaPendientes('solicitudImplantes')}`).datos.destinatarios).toEqual(['dev1', 'op1']);
    expect(escrituras.find((e) => e.path === `alertas/${idAlertaPendientes('descripciones')}`).datos.destinatarios).toEqual(['dev1', 'op2']);
  });

  it('a las descripciones ya revisadas les quita pendienteDesde (la consulta no crece)', async () => {
    const { db, escrituras } = crearDb({
      descripciones: [{ id: 'a', pendienteDesde: 't' }, { id: 'b', pendienteDesde: 't', actualizadoEl: 't2' }, { id: 'c', pendienteDesde: 't', actualizadoEl: 't3' }],
    });
    const r = await sincronizarPendientes(db);
    expect(r.descripciones.cantidad).toBe(1);
    const lote = escrituras.filter((e) => e.tipo === 'lote');
    expect(lote.map((e) => e.path)).toEqual(['maestros_descripciones_reporte/b', 'maestros_descripciones_reporte/c']);
    expect(Object.keys(lote[0].datos)).toEqual(['pendienteDesde']);
    // FieldValue.delete(): borra el campo, no lo deja en null.
    expect(lote[0].datos.pendienteDesde).not.toBeNull();
  });

  it('sin cambios en la cantidad (y destinatarios recientes) no lee usuarios ni escribe', async () => {
    const ahora = Date.now();
    const previa = { estado: 'pendiente', datos: { cantidad: 4 }, destinatarios: ['dev1', 'op1'], noLeidas: [], destinatariosEl: { toMillis: () => ahora - 1000 } };
    const { db, escrituras, consultasUsuarios } = crearDb({ conteos: { [ZONAS]: 4 }, docs: { [`alertas/${idAlertaPendientes('zonas')}`]: previa } });
    await sincronizarPendientes(db, { ahora });
    expect(escrituras).toEqual([]);
    expect(consultasUsuarios).toEqual([]);
  });

  it('sin pendientes resuelve la alerta (sale de la campana)', async () => {
    const previa = { estado: 'pendiente', datos: { cantidad: 2 }, destinatarios: ['dev1'], noLeidas: ['dev1'] };
    const { db, escrituras } = crearDb({ docs: { [`alertas/${idAlertaPendientes('zonas')}`]: previa } });
    const r = await sincronizarPendientes(db);
    expect(r.zonas.accion).toBe('resolver');
    expect(escrituras[0].datos).toMatchObject({ estado: 'resuelta', noLeidas: [] });
  });

  it('un ítem inactivo cuenta como 0', async () => {
    const { db, escrituras } = crearDb({
      conteos: { [ZONAS]: 4 },
      docs: { 'configuracion_sistema/modulosActivos': { itemsInactivos: ['/maestros/zonasDiagnostico'] } },
    });
    const r = await sincronizarPendientes(db);
    expect(r.zonas).toEqual({ cantidad: 0, accion: null });
    expect(escrituras).toEqual([]);
  });

  it('las fuentes cubren las 5 pantallas pedidas', () => {
    expect(Object.values(FUENTES_PENDIENTES).map((f) => f.ruta)).toEqual([
      '/maestros/zonasDiagnostico', '/implantes/solicitudImplantes', '/consignacion/solicitudConsignacion',
      '/hemodinamia/solicitudHemodinamia', '/maestros/descripcionesOcultas',
    ]);
  });
});

describe('aplicarCambioTicket', () => {
  const ticket = { numero: 'TK-0007', titulo: 'No carga el Excel', estado: 'NUEVO', creadoPor: 'op1', creadoPorNombre: 'Ana', administradores: ['adm3'], tipo: 'ERROR', prioridad: 'ALTA' };

  it('ticket nuevo: una alerta para ese caso', async () => {
    const { db, escrituras } = crearDb();
    expect(await aplicarCambioTicket(db, 't1', null, ticket)).toEqual({ accion: 'crear', destinatarios: 3 });
    expect(escrituras[0]).toMatchObject({
      path: 'alertas/ticket_t1', tipo: 'set',
      datos: { tipo: 'ticket', titulo: 'Ticket nuevo TK-0007: No carga el Excel', destinatarios: ['adm1', 'adm3', 'dev1'], estado: 'pendiente' },
    });
  });

  it('al dejar de ser NUEVO se resuelve; los mensajes no leen nada', async () => {
    const { db, escrituras } = crearDb({ docs: { 'alertas/ticket_t1': { estado: 'pendiente' } } });
    expect(await aplicarCambioTicket(db, 't1', ticket, { ...ticket, mensajes: [1] })).toEqual({ accion: null });
    expect(escrituras).toEqual([]);
    expect(await aplicarCambioTicket(db, 't1', ticket, { ...ticket, estado: 'EN_REVISION' })).toEqual({ accion: 'resolver' });
    expect(escrituras[0].datos).toMatchObject({ estado: 'resuelta', resultado: 'EN_REVISION', noLeidas: [] });
  });
});
