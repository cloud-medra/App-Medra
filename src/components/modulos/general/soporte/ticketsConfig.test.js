import { describe, it, expect } from 'vitest';
import {
  codigoTicket, numeroDesdeBusqueda, validarTicketNuevo, cambioDeEstado, respuesta, contextoTecnico, ESTADOS_TICKET
} from './ticketsConfig';
import { moduloDesdeContexto, opcionesModuloTicket, etiquetaModuloTicket, MODULO_AJUSTES, MODULO_GENERAL } from './modulosTicket';

const AUTOR = { uid: 'g1', nombreCompleto: 'Gestor' };
const TICKET = { id: 't1', estado: 'NUEVO', mensajes: [] };

describe('tickets: numeración y búsqueda', () => {
  it('código correlativo legible', () => {
    expect(codigoTicket(1)).toBe('TK-0001');
    expect(codigoTicket(12345)).toBe('TK-12345');
  });
  it('reconoce un número de ticket en la búsqueda', () => {
    expect(numeroDesdeBusqueda('TK-0012')).toBe(12);
    expect(numeroDesdeBusqueda('tk 12')).toBe(12);
    expect(numeroDesdeBusqueda('12')).toBe(12);
    expect(numeroDesdeBusqueda('error al guardar')).toBeNull();
  });
});

describe('tickets: validación del ticket nuevo', () => {
  it('exige tipo, título, descripción, prioridad y módulo; máximo 3 capturas', () => {
    const errores = validarTicketNuevo({ tipo: 'X', titulo: ' ', descripcion: '', prioridad: '', modulo: '', capturas: [1, 2, 3, 4] });
    expect(Object.keys(errores).sort()).toEqual(['capturas', 'descripcion', 'modulo', 'prioridad', 'tipo', 'titulo']);
    expect(validarTicketNuevo({ tipo: 'ERROR', titulo: 'No guarda', descripcion: 'Al guardar…', prioridad: 'ALTA', modulo: 'implantes' })).toEqual({});
  });
  it('el contexto técnico incluye pantalla, navegador, versión y fecha', () => {
    const c = contextoTecnico({ vista: '/implantes/gestionImplantes', ahora: new Date('2026-10-26T12:00:00Z') });
    expect(c).toMatchObject({ vista: '/implantes/gestionImplantes', fechaCliente: '2026-10-26T12:00:00.000Z' });
    expect(c.versionApp).toBeTruthy();
    expect(c).toHaveProperty('navegador');
  });
});

describe('tickets: estados y conversación', () => {
  it('estados en el orden pedido', () => {
    expect(ESTADOS_TICKET.map((e) => e.id)).toEqual(['NUEVO', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTO', 'RESPONDIDO', 'RECHAZADO']);
  });
  it('rechazar exige motivo; el cambio queda en la conversación con usuario y fecha y avisa al creador', () => {
    expect(cambioDeEstado(TICKET, 'RECHAZADO', { autor: AUTOR, motivo: '  ' }).error).toMatch(/motivo/);
    const fecha = new Date('2026-10-26T10:00:00Z');
    const { cambios } = cambioDeEstado(TICKET, 'RECHAZADO', { autor: AUTOR, motivo: 'Duplicado', fecha });
    expect(cambios).toMatchObject({ estado: 'RECHAZADO', noLeidoUsuario: true, pendienteGestor: false });
    expect(cambios.mensajes[0]).toMatchObject({
      tipo: 'estado', autorUid: 'g1', autorNombre: 'Gestor', deGestor: true,
      estadoAnterior: 'NUEVO', estadoNuevo: 'RECHAZADO', motivo: 'Duplicado', fecha
    });
  });
  it('no permite cambiar al mismo estado', () => {
    expect(cambioDeEstado(TICKET, 'NUEVO', { autor: AUTOR }).error).toBeTruthy();
  });
  it('la respuesta del gestor avisa al usuario; la del usuario queda pendiente para quien gestiona', () => {
    expect(respuesta(TICKET, 'Hola', { autor: AUTOR, deGestor: true }).cambios).toMatchObject({ noLeidoUsuario: true, pendienteGestor: false });
    const r = respuesta({ ...TICKET, mensajes: [{ id: 'a' }] }, 'Gracias', { autor: { uid: 'u1' }, deGestor: false });
    expect(r.cambios).toMatchObject({ noLeidoUsuario: false, pendienteGestor: true });
    expect(r.cambios.mensajes).toHaveLength(2);
    expect(respuesta(TICKET, '   ', { autor: AUTOR }).error).toBeTruthy();
  });
});

describe('tickets: módulo relacionado', () => {
  it('se preselecciona según la pantalla donde estaba el usuario', () => {
    expect(moduloDesdeContexto({ entrada: 'implantes' })).toBe('implantes');
    expect(moduloDesdeContexto({ vista: '/maestros/codigosMaestros' })).toBe('maestros');
    expect(moduloDesdeContexto({ vista: '/administracion/controlMensual' })).toBe('finanzas');
    expect(moduloDesdeContexto({ vista: '/settings/ajusteTema' })).toBe(MODULO_AJUSTES);
    expect(moduloDesdeContexto({ vista: 'dashboard' })).toBe(MODULO_GENERAL);
  });
  it('las opciones usan los nombres visibles del sidebar', () => {
    const opciones = opcionesModuloTicket();
    expect(opciones.find((o) => o.id === 'administracion').label).toBe('Herramientas');
    expect(etiquetaModuloTicket('finanzas')).toBe('Finanzas');
  });
});
