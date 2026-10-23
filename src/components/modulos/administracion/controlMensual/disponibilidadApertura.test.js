import { describe, it, expect } from 'vitest';
import {
  estadoMesModulo, modulosDisponiblesParaMes, mesesDisponiblesApertura,
  periodosAbiertosDeModulos, mensajeBloqueoApertura
} from './disponibilidadApertura';
import { MODULOS } from './constants';

const TODOS = MODULOS.map(m => m.id);
const conEstado = (estado) => Object.fromEntries(TODOS.map(id => [id, { agosto: { estado } }]));

describe('disponibilidad de apertura por módulo', () => {
  const estados = {
    implantes: { septiembre: { estado: 'ABIERTO' }, agosto: { estado: 'CERRADO' } },
    hemodinamia: { septiembre: { estado: 'REABIERTO' } },
    laboratorio: { octubre: { estado: 'SIN_INICIAR' } }
  };

  it('oculta el mes solo para los módulos donde ya tiene estado', () => {
    expect(modulosDisponiblesParaMes(estados, 'septiembre')).toEqual(['laboratorio', 'consignacion', 'vacunatorio', 'bodega']);
    expect(modulosDisponiblesParaMes(estados, 'agosto')).toEqual(['laboratorio', 'consignacion', 'vacunatorio', 'hemodinamia', 'bodega']);
  });

  it('SIN_INICIAR cuenta como sin estado', () => {
    expect(estadoMesModulo(estados, 'laboratorio', 'octubre')).toBeNull();
    expect(modulosDisponiblesParaMes(estados, 'octubre')).toEqual(TODOS);
  });

  it('el mes sigue en la lista mientras quede algún módulo disponible', () => {
    const ids = mesesDisponiblesApertura(estados).map(m => m.id);
    expect(ids).toContain('agosto');
    expect(ids).toContain('septiembre');
    expect(ids).toHaveLength(12);
  });

  it.each(['ABIERTO', 'REABIERTO', 'CERRADO'])('un mes %s en todos los módulos desaparece', (estado) => {
    const ids = mesesDisponiblesApertura(conEstado(estado)).map(m => m.id);
    expect(ids).not.toContain('agosto');
    expect(ids).toHaveLength(11);
  });

  it('los períodos abiertos que bloquean son solo los de los módulos marcados', () => {
    expect(periodosAbiertosDeModulos(estados, TODOS)).toEqual([
      { modId: 'implantes', mesId: 'septiembre', estado: 'ABIERTO' },
      { modId: 'hemodinamia', mesId: 'septiembre', estado: 'REABIERTO' }
    ]);
    expect(periodosAbiertosDeModulos(estados, ['hemodinamia'])).toEqual([
      { modId: 'hemodinamia', mesId: 'septiembre', estado: 'REABIERTO' }
    ]);
    // Un mes CERRADO no bloquea; un módulo no marcado tampoco.
    expect(periodosAbiertosDeModulos(estados, ['laboratorio', 'consignacion'])).toEqual([]);
    expect(periodosAbiertosDeModulos({ implantes: { agosto: { estado: 'CERRADO' } } }, TODOS)).toEqual([]);
    expect(periodosAbiertosDeModulos(null, TODOS)).toEqual([]);
  });

  it('el aviso dice qué módulo tiene qué mes abierto', () => {
    expect(mensajeBloqueoApertura({ modId: 'hemodinamia', mesId: 'septiembre', estado: 'ABIERTO' }, '2026'))
      .toBe('Hemodinamia tiene Septiembre 2026 abierto. Ciérralo antes de abrir otro mes.');
    expect(mensajeBloqueoApertura({ modId: 'implantes', mesId: 'agosto', estado: 'REABIERTO' }, '2026'))
      .toBe('Implantes tiene Agosto 2026 reabierto. Ciérralo antes de abrir otro mes.');
  });
});
