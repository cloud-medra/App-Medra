import { describe, it, expect } from 'vitest';
import { validarSolicitud, validarMotivo, TIPOS_SOLICITUD, MAX_MOTIVO } from './tipos.mjs';
import { resolverAprobadores, motivoReasignar, administradoresDelCentro } from './destinatarios.mjs';
import { analizarAccesoAdministradores } from '../permisos/revisionAdministradores.mjs';

// Tipos de solicitud (genéricos), aprobadores y la revisión previa del
// cambio de rol del Administrador. Lo mismo corre en las funciones y en la
// pantalla.
describe('tipos de solicitud', () => {
  it('normaliza y valida cada tipo; rechaza el mismo valor y tipos desconocidos', () => {
    expect(validarSolicitud('nombreUsuario', ' ana ', 'pedro')).toEqual({ valor: 'ana', error: null });
    expect(validarSolicitud('nombreUsuario', 'ana@x', 'pedro').error).toMatch(/@/);
    expect(validarSolicitud('nombreCompleto', '  Ana   María  ', 'Ana')).toEqual({ valor: 'Ana María', error: null });
    expect(validarSolicitud('nombreCompleto', '', 'Ana').error).toMatch(/obligatorio/);
    expect(validarSolicitud('email', ' Ana@X.CL ', 'b@x.cl')).toEqual({ valor: 'ana@x.cl', error: null });
    expect(validarSolicitud('email', 'no-es-correo', 'b@x.cl').error).toMatch(/no es válido/);
    expect(validarSolicitud('email', 'B@x.cl', 'b@x.cl').error).toBe('Es igual al valor actual.');
    expect(validarSolicitud('telefono', '1', '2').error).toBe('Tipo de solicitud inválido.');
    expect(TIPOS_SOLICITUD.email.requiereConfirmacion).toBe(true);
  });

  it('el motivo es obligatorio y acotado', () => {
    expect(validarMotivo('  ').error).toBeTruthy();
    expect(validarMotivo('x'.repeat(MAX_MOTIVO + 1)).error).toBeTruthy();
    expect(validarMotivo(' ok ')).toEqual({ motivo: 'ok', error: null });
  });
});

describe('aprobadores', () => {
  const U = [
    { uid: 'd', rol: 'dev' },
    { uid: 'dx', rol: 'dev', activo: false },
    { uid: 'a1', rol: 'admin', centrosAdministrados: ['lab'] },
    { uid: 'a2', rol: 'admin', centrosAdministrados: ['lab', 'vac'] },
    { uid: 'a3', rol: 'admin', centrosAdministrados: ['vac'] },
    { uid: 'ai', rol: 'admin', centrosAdministrados: ['lab'], activo: false },
    { uid: 'e', rol: 'encargado', centroCostoId: 'lab', centrosAdministrados: ['lab'] },
  ];
  const aprob = (u) => resolverAprobadores(u, U);

  it('operador: asignados válidos, o todos los del centro; más desarrolladores activos', () => {
    expect(aprob({ uid: 'o', rol: 'operador', centroCostoId: 'lab' })).toEqual({ aprobadores: ['a1', 'a2', 'd'], motivo: 'centro' });
    expect(aprob({ uid: 'o', centroCostoId: 'lab', administradoresAsignados: ['a2', 'a3'] })).toEqual({ aprobadores: ['a2', 'd'], motivo: 'asignados' });
    expect(aprob({ uid: 'o', centroCostoId: 'lab', administradoresAsignados: ['a3', 'ai'] })).toEqual({ aprobadores: ['a1', 'a2', 'd'], motivo: 'centro' });
    expect(aprob({ uid: 'o', centroCostoId: 'lab', administradoresAsignados: ['a1'], todosLosAdministradoresDelCentro: true }).aprobadores).toEqual(['a1', 'a2', 'd']);
    expect(aprob({ uid: 'o', rol: 'operador' })).toEqual({ aprobadores: ['a1', 'a2', 'a3', 'd'], motivo: 'sinCentro' });
  });

  it('administrador y desarrollador: solo desarrolladores, nunca a sí mismo', () => {
    expect(aprob({ uid: 'a1', rol: 'admin' })).toEqual({ aprobadores: ['d'], motivo: 'desarrolladores' });
    expect(aprob({ uid: 'd', rol: 'dev' }).aprobadores).toEqual([]);
  });

  it('el Encargado no es administrador asignable', () => {
    expect(administradoresDelCentro(U, 'lab').map((u) => u.uid)).toEqual(['a1', 'a2']);
  });

  it('"Por reasignar": operador sin centro, centro sin administradores o asignado inválido', () => {
    expect(motivoReasignar({ rol: 'operador' }, U)).toMatch(/Sin centro/);
    expect(motivoReasignar({ rol: 'operador', centroCostoId: 'otro' }, U)).toMatch(/no tiene administradores/);
    expect(motivoReasignar({ rol: 'operador', centroCostoId: 'lab', administradoresAsignados: ['a3'] }, U)).toMatch(/ya no administran/);
    expect(motivoReasignar({ rol: 'operador', centroCostoId: 'lab', administradoresAsignados: ['a1'] }, U)).toBeNull();
    expect(motivoReasignar({ rol: 'operador', activo: false }, U)).toBeNull();
    expect(motivoReasignar({ rol: 'encargado' }, U)).toBeNull();
  });
});

describe('revisarAccesoAdministradores (solo lectura)', () => {
  it('cuenta desarrolladores activos y lista lo que perdería cada Administrador', () => {
    const r = analizarAccesoAdministradores([
      { uid: 'd', rol: 'dev', activo: false },
      { uid: 'a', rol: 'admin', permisos: { administracion: ['/administracion/listadoUsuario'], laboratorio: ['/laboratorio/x'] }, permisosGranulares: { '/administracion/listadoUsuario': {} } },
    ]);
    expect(r.desarrolladores).toEqual([]);
    const [a] = r.administradores;
    expect(a.modulos).toEqual(['administracion', 'laboratorio']);
    expect(a.pierde).toContain('Administración → Permisos por centro (no asignado)');
    expect(a.vistasSinConfigurar).toEqual(['/laboratorio/x']);
    expect(a.accionesSinMarcar).toEqual(['/administracion/listadoUsuario → btn_desbloquear']);
  });
});
