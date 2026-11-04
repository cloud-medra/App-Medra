// Solicitud de precios a TI: un documento por referencia (sin duplicados),
// código, costo exacto, veces costo y venta unitaria, aviso de precio
// cambiado, completado de las antiguas y filas del Excel.
import { describe, it, expect } from 'vitest';
import {
  idSolicitudPrecio, puedeSolicitarPrecioCargas, solicitudDesdeItemCargas, puedeSolicitarPrecioConsignacion,
  solicitudDesdeItemConsignacion, cambioPrecio, mensajeSolicitudAgregada, filasExcelSolicitudes, COLUMNAS_EXCEL,
  ordenarSolicitudes, versionSolicitud, formatearVecesCosto, codigoDelCatalogo, vecesCostoSegunModulo, completarSolicitud
} from './solicitudesPrecio';

const RECARGOS = [
  { desde: 17696, hasta: 29492, vecesCosto: 3, estado: 'ACTIVO' },
  { desde: 117965, hasta: 235929, vecesCosto: 1.3, estado: 'ACTIVO' },
  { desde: 235930, hasta: 589822, vecesCosto: 1.3, estado: 'ACTIVO' },
  { desde: 0, hasta: 351, vecesCosto: 7.5, estado: 'INACTIVO' },
];

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
  const fila = { referencia: ' REF-1 ', codigo: '56425', descriptorAuto: 'PLACA 3 HOYOS', detalle: 'Placa', precio: 1000, vecesCosto: 1.5, cantidad: 3, venta: 4500 };

  it('código, costo exacto, el veces costo guardado y venta unitaria', () => {
    expect(solicitudDesdeItemCargas(fila)).toEqual({
      referencia: 'REF-1', codigo: '56425', descripcion: 'PLACA 3 HOYOS', costo: 1000, vecesCosto: 1.5, venta: 1500
    });
  });

  it('el costo conserva los decimales del maestro', () => {
    expect(solicitudDesdeItemCargas({ ...fila, precio: 22604.4, cantidad: 1, venta: 67813.2 })).toMatchObject({ costo: 22604.4, venta: 67813 });
  });

  it('sin código ("", "No lleva OC" o "0") queda vacío', () => {
    expect(solicitudDesdeItemCargas({ ...fila, codigo: '' }).codigo).toBe('');
    expect(solicitudDesdeItemCargas({ ...fila, codigo: 'No lleva OC' }).codigo).toBe('');
    expect(solicitudDesdeItemCargas({ ...fila, codigo: '0' }).codigo).toBe('');
  });

  it('sin descripción del maestro ("P") usa el detalle o queda vacía', () => {
    expect(solicitudDesdeItemCargas({ ...fila, descriptorAuto: 'P' }).descripcion).toBe('Placa');
    expect(solicitudDesdeItemCargas({ ...fila, descriptorAuto: 'P', detalle: 'P' }).descripcion).toBe('');
  });

  it('Hemodinamia: guarda el multiplicador exacto (1/0,73) y la venta redondeada a pesos', () => {
    const hemo = solicitudDesdeItemCargas({ ...fila, precio: 50370, cantidad: 2, vecesCosto: 1 / 0.73, venta: 69000 * 2 });
    expect(hemo.vecesCosto).toBe(1 / 0.73);
    expect(hemo.venta).toBe(69000);
    expect(formatearVecesCosto(hemo.vecesCosto)).toBe('1,3699');
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
  it('usa código, costo exacto, el veces costo y la venta (guardados o calculados) por unidad', () => {
    const it_ = { referencia: 'REF-2', codigo: '7548260', descripcion: 'TORNILLO', costo: 800.5, cantidad: 2 };
    expect(puedeSolicitarPrecioConsignacion(it_)).toBe(true);
    expect(puedeSolicitarPrecioConsignacion({ ...it_, costo: 0 })).toBe(false);
    expect(solicitudDesdeItemConsignacion(it_, 4803, 3)).toEqual({
      referencia: 'REF-2', codigo: '7548260', descripcion: 'TORNILLO', costo: 800.5, vecesCosto: 3, venta: 2402
    });
    expect(solicitudDesdeItemConsignacion(it_, 4803, null).vecesCosto).toBeNull();
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

  it('ya estaba con otro precio: advierte qué cambió (con decimales si los hay)', () => {
    expect(cambioPrecio({ costo: 1000, venta: 1400 }, nueva)).toBe(true);
    const { mensaje, tipo } = mensajeSolicitudAgregada({ precioAnterior: { costo: 1000, venta: 1400 }, nueva });
    expect(tipo).toBe('warning');
    expect(mensaje).toContain('Se ha añadido a la solicitud de actualización de precios');
    expect(mensaje).toContain('venta $1.400 → $1.500');
    expect(mensaje).not.toContain('costo');
    const conDecimales = mensajeSolicitudAgregada({ precioAnterior: { costo: 22604, venta: 1500 }, nueva: { ...nueva, costo: 22604.4 } });
    expect(conDecimales.mensaje).toContain('costo $22.604 → $22.604,4');
  });
});

describe('referencias guardadas sin código ni veces costo', () => {
  const CATALOGO = [
    { referencia: 'EGIA60AMT', codigo: '56425', estado: 'ACTIVO' },
    { referencia: 'unvca12stf ', codigo: '41201380', estado: 'ACTIVO' },
    { referencia: 'UNVCA12STF', codigo: '0', estado: 'INACTIVO' },
    { referencia: 'DOBLE', codigo: 'A1' },
    { referencia: 'DOBLE', codigo: 'A2' },
    { referencia: 'VIEJA', codigo: 'X9', estado: 'INACTIVO' },
  ];

  it('código del catálogo: solo activos con código real; con dos códigos distintos, vacío', () => {
    expect(codigoDelCatalogo(CATALOGO, 'EGIA60AMT')).toBe('56425');
    expect(codigoDelCatalogo(CATALOGO, ' UNVCA12STF')).toBe('41201380');
    expect(codigoDelCatalogo(CATALOGO, 'DOBLE')).toBe('');
    expect(codigoDelCatalogo(CATALOGO, 'VIEJA')).toBe('');
    expect(codigoDelCatalogo(CATALOGO, 'NO-EXISTE')).toBe('');
  });

  it('veces costo con la regla del módulo (no venta ÷ costo)', () => {
    expect(vecesCostoSegunModulo('Consignación', 22604.4, RECARGOS)).toBe(3);
    expect(vecesCostoSegunModulo('Consignación', 296548.2, RECARGOS)).toBe(1.3);
    expect(vecesCostoSegunModulo('Consignación', 100, RECARGOS)).toBeNull(); // sin rango activo
    expect(vecesCostoSegunModulo('Implantes', 100, RECARGOS)).toBe(1); // Implantes usa 1 sin rango
    expect(vecesCostoSegunModulo('Hemodinamia', 50370, RECARGOS)).toBe(1 / 0.73);
    expect(vecesCostoSegunModulo(null, 1000, RECARGOS)).toBeNull();
  });

  it('completa solo lo que falta; lo guardado manda', () => {
    const antigua = { referencia: 'EGIA60AMT', modulos: ['Consignación'], costo: 144900, venta: 188370 };
    expect(completarSolicitud(antigua, { catalogo: CATALOGO, recargos: RECARGOS })).toMatchObject({ codigo: '56425', vecesCosto: 1.3 });
    const nueva = { ...antigua, codigo: 'OTRO', vecesCosto: 1.25, ultimoModulo: 'Implantes', modulos: ['Consignación', 'Implantes'] };
    expect(completarSolicitud(nueva, { catalogo: CATALOGO, recargos: RECARGOS })).toMatchObject({ codigo: 'OTRO', vecesCosto: 1.25 });
    // Varios módulos sin último módulo: no se sabe qué regla aplicar.
    expect(completarSolicitud({ ...antigua, modulos: ['Consignación', 'Implantes'] }, { catalogo: CATALOGO, recargos: RECARGOS }).vecesCosto).toBeNull();
    // Con último módulo se usa su regla.
    expect(completarSolicitud({ ...antigua, ultimoModulo: 'Hemodinamia', modulos: ['Consignación', 'Hemodinamia'] }, { catalogo: [], recargos: RECARGOS }))
      .toMatchObject({ codigo: '', vecesCosto: 1 / 0.73 });
  });
});

describe('Excel y lista', () => {
  const registros = [
    { id: 'a', codigo: '56425', referencia: 'REF-1', descripcion: 'PLACA', modulos: ['Implantes', 'Consignación'], costo: 1000.5, vecesCosto: 1.3, venta: 1301, agregadoEl: new Date('2026-11-03T15:30:00Z'), actualizadoEl: new Date(5) },
    { id: 'b', referencia: 'REF-2', modulos: ['Hemodinamia'], costo: 10, venta: 20, agregadoEl: new Date('2026-11-04T12:00:00Z') },
  ];

  it('columnas en el orden pedido, con código, módulos y veces costo', () => {
    const [fila, sinDatos] = filasExcelSolicitudes(registros);
    expect(COLUMNAS_EXCEL).toEqual(['Código', 'Referencia', 'Descripción', 'Módulo', 'Costo', 'Veces costo', 'Venta', 'Fecha agregada']);
    expect(Object.keys(fila)).toEqual(COLUMNAS_EXCEL);
    expect(fila).toMatchObject({ 'Código': '56425', Referencia: 'REF-1', 'Descripción': 'PLACA', 'Módulo': 'Implantes, Consignación', Costo: 1000.5, 'Veces costo': 1.3, Venta: 1301 });
    expect(fila['Fecha agregada']).toMatch(/^03-11-2026/); // hora de Chile
    expect(sinDatos).toMatchObject({ 'Código': '', 'Veces costo': '' });
  });

  it('veces costo en pantalla: hasta 4 decimales', () => {
    expect(formatearVecesCosto(1.3)).toBe('1,3');
    expect(formatearVecesCosto(3)).toBe('3');
    expect(formatearVecesCosto(null)).toBe('');
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
