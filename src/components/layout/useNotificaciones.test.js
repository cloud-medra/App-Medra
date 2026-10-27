import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebaseConfig', () => ({ db: {} }));
const { aNotificacion } = await import('./useNotificaciones');

describe('aNotificacion', () => {
  it('título, detalle, leída según noLeidas y la ruta de destino de cada tipo', () => {
    const agregada = { id: 'pendientes_zonas', tipo: 'pendientes', titulo: '3 zonas', resumen: 'Maestros', noLeidas: ['u1'], datos: { ruta: '/maestros/zonasDiagnostico' } };
    expect(aNotificacion(agregada, 'u1', () => true)).toMatchObject({ id: 'pendientes_zonas', titulo: '3 zonas', detalle: 'Maestros', leida: false, ruta: '/maestros/zonasDiagnostico' });
    expect(aNotificacion({ ...agregada, noLeidas: [] }, 'u1', () => true).leida).toBe(true);
    expect(aNotificacion({ id: 't', tipo: 'ticket', titulo: 'T' }, 'u1', () => false).ruta).toBe('/ajustes/ayudaSoporte');
    expect(aNotificacion({ id: 's', tipo: 'solicitud', titulo: 'S' }, 'u1', () => true).ruta).toBe('/administracion/alertas');
  });
});
