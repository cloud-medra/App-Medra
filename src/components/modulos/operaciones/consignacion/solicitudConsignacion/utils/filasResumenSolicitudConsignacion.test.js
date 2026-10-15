import { describe, it, expect } from 'vitest';
import { construirFilasResumenSolicitudConsignacion } from './filasResumenSolicitudConsignacion';

const principal = (id, prevision, extra = {}) => ({
  id, gestionId: 'ADM-' + id, codigo: 'OC-' + id, cantidad: 1, ventaUnitaria: 100,
  medico: 'DR', fecha: '2026-10-01', descripcion: 'KIT', datosOriginales: { prevision }, ...extra
});
const guia = (id, gestionId) => ({
  id, esFilaGuia: true, gestionId, codigo: 'No lleva OC', cantidad: 2, ventaUnitaria: 0,
  medico: 'DR', fecha: '2026-10-01', descripcion: 'PRODUCTO'
});

describe('construirFilasResumenSolicitudConsignacion', () => {
  const items = [
    principal('a', 'FONASA'),
    guia('guia-d1-0', 'ADM-a'),
    guia('guia-d1-1', 'ADM-a'),
    principal('b', ''),
    guia('guia-d2-0', 'ADM-b')
  ];

  it('las filas "No lleva OC" llevan la previsión de su principal y Estado PAD', () => {
    const filas = construirFilasResumenSolicitudConsignacion(items, items, '15-10-2026');
    expect(filas.map(f => [f['Cód'], f['Previsión'], f['Estado']])).toEqual([
      ['OC-a', 'FONASA', 'CARGADO'],
      ['No lleva OC', 'FONASA', 'PAD'],
      ['No lleva OC', 'FONASA', 'PAD'],
      ['OC-b', 'P', 'CARGADO'],
      ['No lleva OC', '', 'PAD']
    ]);
  });

  it('resuelve la previsión aunque la fila principal no esté seleccionada', () => {
    const filas = construirFilasResumenSolicitudConsignacion([items[2]], items, '15-10-2026');
    expect(filas[0]['Previsión']).toBe('FONASA');
    expect(filas[0]['Estado']).toBe('PAD');
  });

  it('mantiene el orden de columnas de la hoja Resumen', () => {
    const [fila] = construirFilasResumenSolicitudConsignacion([items[0]], items, '15-10-2026');
    expect(Object.keys(fila)).toEqual([
      'Ingreso', 'Area', 'Previsión', 'Id', 'Cód', 'Cant', 'Venta', 'Médico', 'Fecha', 'Descripción', 'Estado'
    ]);
    expect(fila['Fecha']).toBe('01-10-2026');
  });
});
