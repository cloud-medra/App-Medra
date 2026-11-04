// Solicitud de precios a TI: un documento por referencia (sin duplicados),
// costo y venta unitarios, aviso de precio cambiado y filas del Excel.
import { describe, it, expect } from 'vitest';
import {
  idSolicitudPrecio, puedeSolicitarPrecioCargas, solicitudDesdeItemCargas, puedeSolicitarPrecioConsignacion,
  solicitudDesdeItemConsignacion, cambioPrecio, mensajeSolicitudAgregada, filasExcelSolicitudes, COLUMNAS_EXCEL,
  ordenarSolicitudes, versionSolicitud
} from './solicitudesPrecio';

describe('idSolicitudPrecio', () => {
  it('la misma referencia con otros espacios o mayúsculas da el mismo documento', () => {
    expect(idSolicitudPrecio(' Tornillo 3.5 ')).toBe(idSolicitudPrecio('TORNILLO 3.5'));
    expect(idSolicitudPrecio('TORNILLO 3.5')).not.toBe(idSolicitudPrecio('TORNILLO 3.6'));
  });

  it('una "/" o un "." no rompen el ID', () => {
    expect(idSolicitudPrecio('AB/12')).toBe('ref_ab%2F12');
    expect(idSolicitudPrecio('.')).toBe('ref_.');
    expect(idSolicitudPrecio('   ')).toBe('');
  });
});

describe('desde Cargas de Implantes y Hemodinamia', () => {
  const fila = { referencia: ' REF-1 ', descriptorAuto: 'PLACA 3 HOYOS', detalle: 'Placa', precio: 1000, cantidad: 3, venta: 4500 };

  it('costo y venta unitarios (la venta de la fila es por la cantidad)', () => {
    expect(solicitudDesdeItemCargas(fila)).toEqual({ referencia: 'REF-1', descripcion: 'PLACA 3 HOYOS', costo: 1000, venta: 1500 });
  });

  it('sin descripción del maestro ("P") usa el detalle o queda vacía', () => {
    expect(solicitudDesdeItemCargas({ ...fila, descriptorAuto: 'P' }).descripcion).toBe('Placa');
    expect(solicitudDesdeItemCargas({ ...fila, descriptorAuto: 'P', detalle: 'P' }).descripcion).toBe('');
  });

  it('Hemodinamia: venta con el gross-up redondeada a pesos', () => {
    expect(solicitudDesdeItemCargas({ ...fila, precio: 50370, cantidad: 2, venta: (50370 / 0.73) * 2 }).venta).toBe(69000);
  });

  it('no aplica a contenido de PAD, detalle de lotes, SIN CARGO ni filas sin precio', () => {
    expect(puedeSolicitarPrecioCargas(fila)).toBe(true);
    expect(puedeSolicitarPrecioCargas({ ...fila, esPad: true })).toBe(true);
    expect(puedeSolicitarPrecioCargas({ ...fila, padPadreId: 'p' })).toBe(false);
    expect(puedeSolicitarPrecioCargas({ ...fila, lotePadreId: 'p' })).toBe(false);
    expect(puedeSolicitarPrecioCargas({ ...fila, estadoCarga: 'SIN CARGO' })).toBe(false);
    expect(puedeSolicitarPrecioCargas({ ...fila, precio: 0 })).toBe(false);
    expect(puedeSolicitarPrecioCargas({ ...fila, referencia: 'P' })).toBe(false);
  });
});

describe('desde Cargas de Consignación', () => {
  it('usa costo, descripción y la venta (guardada o calculada) por unidad', () => {
    const it_ = { referencia: 'REF-2', descripcion: 'TORNILLO', costo: 800, cantidad: 2 };
    expect(puedeSolicitarPrecioConsignacion(it_)).toBe(true);
    expect(puedeSolicitarPrecioConsignacion({ ...it_, costo: 0 })).toBe(false);
    expect(solicitudDesdeItemConsignacion(it_, 2400)).toEqual({ referencia: 'REF-2', descripcion: 'TORNILLO', costo: 800, venta: 1200 });
  });
});

describe('aviso al marcar', () => {
  const nueva = { referencia: 'R', descripcion: '', costo: 1000, venta: 1500 };

  it('nueva o con el mismo precio: aviso normal', () => {
    expect(mensajeSolicitudAgregada({ precioAnterior: null, nueva })).toEqual({
      mensaje: 'Se ha añadido a la solicitud de actualización de precios', tipo: 'success'
    });
    expect(cambioPrecio({ costo: 1000, venta: 1500 }, nueva)).toBe(false);
  });

  it('ya estaba con otro precio: advierte qué cambió', () => {
    expect(cambioPrecio({ costo: 1000, venta: 1400 }, nueva)).toBe(true);
    const { mensaje, tipo } = mensajeSolicitudAgregada({ precioAnterior: { costo: 1000, venta: 1400 }, nueva });
    expect(tipo).toBe('warning');
    expect(mensaje).toContain('Se ha añadido a la solicitud de actualización de precios');
    expect(mensaje).toContain('venta $1.400 → $1.500');
    expect(mensaje).not.toContain('costo');
  });
});

describe('Excel y lista', () => {
  const registros = [
    { id: 'a', referencia: 'REF-1', descripcion: 'PLACA', modulos: ['Implantes', 'Consignación'], costo: 1000, venta: 1500, agregadoEl: new Date('2026-11-03T15:30:00Z'), actualizadoEl: new Date(5) },
    { id: 'b', referencia: 'REF-2', modulos: ['Hemodinamia'], costo: 10, venta: 20, agregadoEl: new Date('2026-11-04T12:00:00Z') },
  ];

  it('columnas pedidas, con los módulos donde se marcó', () => {
    const [fila] = filasExcelSolicitudes(registros);
    expect(Object.keys(fila)).toEqual(COLUMNAS_EXCEL);
    expect(fila).toMatchObject({ Referencia: 'REF-1', 'Descripción': 'PLACA', 'Módulo': 'Implantes, Consignación', Costo: 1000, Venta: 1500 });
    expect(fila['Fecha agregada']).toMatch(/^03-11-2026/); // hora de Chile
  });

  it('ordena por fecha agregada, más recientes primero', () => {
    expect(ordenarSolicitudes(registros).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('versión = actualizadoEl (Timestamp o fecha)', () => {
    expect(versionSolicitud(registros[0])).toBe(5);
    expect(versionSolicitud({ actualizadoEl: { toDate: () => new Date(7) } })).toBe(7);
    expect(versionSolicitud({})).toBeNull();
  });
});
