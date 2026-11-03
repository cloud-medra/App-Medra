import { describe, it, expect } from 'vitest';
import { planificarImportacion, entradaSnapshot } from './planificarImportacion';
import { asignarIdsFilas } from './idFilaDetalleOC';

// Fila ya normalizada (como la entrega leerFilasDeBuffer), sin id.
const fila = (extra = {}) => ({
  id: '', admision: '114584', paciente: 'PACIENTE UNO', medico: 'DR X', fecha_cx: new Date(2026, 8, 15),
  proveedor: 'MEDTRONIC', codigo: '510012', descripcion: 'TORNILLO', cantidad: 1, precio_u: 1000,
  atributo: '', oc: '', oc_monto: 0, estado: '', fecha_recepcion: null, fecha_cargo: null,
  numero_guia: '', numero_factura: '', fecha_emision: null, fecha_ingreso: null, lote: '', fecha_vencimiento: null,
  ...extra
});
const leer = (filas) => asignarIdsFilas(filas.map((f, i) => ({ ...f, _filaExcel: i + 2 })));

// Snapshot como quedaría tras aplicar un plan (lo que hace la importación).
const aplicar = (plan, snapshot = {}) => {
  const s = { ...snapshot };
  plan.nuevas.forEach(({ id, fila: f, valores }) => { s[id] = entradaSnapshot(f, valores); });
  plan.actualizadas.forEach(({ id, combinados }) => { s[id] = { ...s[id], v: combinados }; });
  plan.fechasCambiadas.forEach(({ idAntes, idNuevo, fila: f, combinados }) => { delete s[idAntes]; s[idNuevo] = entradaSnapshot(f, combinados); });
  return s;
};

describe('planificarImportacion', () => {
  it('primera importación: todo nuevo', () => {
    const plan = planificarImportacion(leer([fila(), fila({ codigo: '510013' })]), {});
    expect(plan.nuevas.map(n => n.id)).toEqual(['114584_20260915_medtronic_510012_1', '114584_20260915_medtronic_510013_1']);
    expect(plan.actualizadas).toEqual([]);
  });

  it('reimportar el mismo archivo sin cambios: 0 escrituras', () => {
    const archivo = [fila(), fila({ codigo: '510013' }), fila(), fila({ admision: '200', fecha_cx: new Date(2026, 9, 2) })];
    const snap = aplicar(planificarImportacion(leer(archivo), {}));
    const plan = planificarImportacion(leer(archivo), snap);
    expect(plan.nuevas).toEqual([]);
    expect(plan.actualizadas).toEqual([]);
    expect(plan.fechasCambiadas).toEqual([]);
    expect(plan.sinCambios).toBe(4);
    expect(plan.yaNoVienen).toEqual([]);
  });

  it('repetidos en otro orden: no cambian, y completar la factura de uno actualiza solo ese', () => {
    const a = fila({ cantidad: 1, lote: 'L1' });
    const b = fila({ cantidad: 2, lote: 'L2' });
    const snap = aplicar(planificarImportacion(leer([a, b]), {}));
    const idDeB = Object.keys(snap).find(id => snap[id].v.cantidad === 2);

    const reordenado = planificarImportacion(leer([b, a]), snap);
    expect(reordenado.actualizadas).toEqual([]);
    expect(reordenado.sinCambios).toBe(2);

    const conFactura = planificarImportacion(leer([{ ...b, numero_factura: 'F-99' }, a]), snap);
    expect(conFactura.actualizadas).toHaveLength(1);
    expect(conFactura.actualizadas[0]).toMatchObject({ id: idDeB, campos: ['numero_factura'], cambios: { numero_factura: 'F-99' } });
  });

  it('repetidos idénticos (misma cantidad) siguen sin cambios al reordenar', () => {
    const snap = aplicar(planificarImportacion(leer([fila(), fila(), fila({ codigo: '9' })]), {}));
    const plan = planificarImportacion(leer([fila({ codigo: '9' }), fila(), fila()]), snap);
    expect(plan.sinCambios).toBe(3);
    expect(plan.nuevas).toEqual([]);
  });

  it('solo se actualizan los campos que cambiaron; un vacío no pisa un valor guardado', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ numero_factura: 'F-1', lote: 'L1' })]), {}));
    const plan = planificarImportacion(leer([fila({ numero_factura: '', lote: 'L1', numero_guia: 'G-7', fecha_emision: new Date(2026, 8, 20) })]), snap);
    expect(plan.actualizadas).toHaveLength(1);
    expect(plan.actualizadas[0].campos.sort()).toEqual(['fecha_emision', 'numero_guia']);
    expect(plan.actualizadas[0].combinados).toMatchObject({ numero_factura: 'F-1', numero_guia: 'G-7', fecha_emision: '2026-09-20' });
    expect(plan.noSobrescritos).toEqual([{ id: '114584_20260915_medtronic_510012_1', filaExcel: 2, campo: 'numero_factura', valorGuardado: 'F-1' }]);
  });

  it('un 0 escrito en el Excel sobrescribe precio, cantidad y monto guardados', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ precio_u: 141184, cantidad: 2, oc_monto: 282368 })]), {}));
    const plan = planificarImportacion(leer([fila({ precio_u: 0, cantidad: 0, oc_monto: 0, _vacios: [] })]), snap);
    expect(plan.nuevas).toEqual([]);
    expect(plan.actualizadas).toHaveLength(1);
    expect(plan.actualizadas[0].cambios).toEqual({ precio_u: 0, cantidad: 0, oc_monto: 0 });
    expect(plan.actualizadas[0].combinados).toMatchObject({ precio_u: 0, cantidad: 0, oc_monto: 0 });
    expect(plan.noSobrescritos).toEqual([]);
  });

  it('una celda numérica vacía no pisa el valor guardado (se informa)', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ precio_u: 141184, oc_monto: 141184 })]), {}));
    const plan = planificarImportacion(leer([fila({ precio_u: 0, oc_monto: 0, _vacios: ['precio_u', 'oc_monto'] })]), snap);
    expect(plan.actualizadas).toEqual([]);
    expect(plan.sinCambios).toBe(1);
    expect(plan.noSobrescritos.map(n => [n.campo, n.valorGuardado])).toEqual([['precio_u', 141184], ['oc_monto', 141184]]);
  });

  it('solo un vacío sobre un valor: sin escrituras, pero se informa', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ numero_factura: 'F-1' })]), {}));
    const plan = planificarImportacion(leer([fila()]), snap);
    expect(plan.actualizadas).toEqual([]);
    expect(plan.sinCambios).toBe(1);
    expect(plan.noSobrescritos).toHaveLength(1);
  });

  it('cambio de OC: se actualiza y se informa (una OC nueva sobre vacío no es "cambio")', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ oc: '4500001' }), fila({ codigo: '2' })]), {}));
    const plan = planificarImportacion(leer([fila({ oc: '4500009' }), fila({ codigo: '2', oc: '4500010' })]), snap);
    expect(plan.actualizadas.map(a => a.cambios.oc)).toEqual(['4500009', '4500010']);
    expect(plan.ocCambiadas).toEqual([expect.objectContaining({ admision: '114584', fecha: '2026-09-15', codigo: '510012', ocAntes: '4500001', ocDespues: '4500009' })]);
  });

  it('cambio de fecha con una única coincidencia: se mueve (sin duplicar) y conserva valores', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ numero_factura: 'F-1' })]), {}));
    const plan = planificarImportacion(leer([fila({ fecha_cx: new Date(2026, 9, 2) })]), snap);
    expect(plan.nuevas).toEqual([]);
    expect(plan.fechasCambiadas).toEqual([expect.objectContaining({
      idAntes: '114584_20260915_medtronic_510012_1', idNuevo: '114584_20261002_medtronic_510012_1',
      fechaAntes: '2026-09-15', fechaDespues: '2026-10-02'
    })]);
    expect(plan.fechasCambiadas[0].combinados.numero_factura).toBe('F-1');
    expect(plan.idsFueraDelIndice).toContain('114584_20260915_medtronic_510012_1');
    expect(plan.yaNoVienen).toEqual([]);
  });

  it('cambio de fecha con más de una coincidencia: no se mueve, va como nueva y se reporta', () => {
    const snap = aplicar(planificarImportacion(leer([fila(), fila({ fecha_cx: new Date(2026, 8, 20) })]), {}));
    const plan = planificarImportacion(leer([fila({ fecha_cx: new Date(2026, 9, 2) })]), snap);
    expect(plan.fechasCambiadas).toEqual([]);
    expect(plan.nuevas).toHaveLength(1);
    expect(plan.fechasAmbiguas[0].candidatos).toHaveLength(2);
  });

  it('archivo general con varios meses: nuevas en su mes, y las que no vienen solo se informan', () => {
    const sep = fila();
    const oct = fila({ admision: '300', fecha_cx: new Date(2026, 9, 5) });
    const nov = fila({ admision: '400', fecha_cx: new Date(2026, 10, 1) });
    const snap = aplicar(planificarImportacion(leer([sep, oct, nov]), {}));
    // El general trae sep y oct (con factura) + una nueva de oct; nov no viene y nov no está en el archivo.
    const general = [{ ...oct, numero_factura: 'F-5' }, sep, fila({ admision: '301', fecha_cx: new Date(2026, 9, 9) })];
    const plan = planificarImportacion(leer(general), snap);
    expect(plan.meses).toEqual(['2026-09', '2026-10']);
    expect(plan.nuevas.map(n => n.id)).toEqual(['301_20261009_medtronic_510012_1']);
    expect(plan.actualizadas.map(a => a.campos)).toEqual([['numero_factura']]);
    expect(plan.sinCambios).toBe(1);
    expect(plan.yaNoVienen).toEqual([]); // nov no está cubierto por el archivo

    // Una de septiembre que falta: se informa, no se borra.
    const plan2 = planificarImportacion(leer([oct]), aplicar(plan, snap));
    expect(plan2.yaNoVienen.map(y => y.admision).sort()).toEqual(['301']);
  });

  it('repetido que falta dentro de un grupo presente: se informa y sale del índice; el id no se reutiliza', () => {
    const snap = aplicar(planificarImportacion(leer([fila({ cantidad: 1 }), fila({ cantidad: 2 })]), {}));
    const plan = planificarImportacion(leer([fila({ cantidad: 1 })]), snap);
    expect(plan.yaNoVienen).toEqual([expect.objectContaining({ id: '114584_20260915_medtronic_510012_2', enGrupoPresente: true })]);
    expect(plan.idsFueraDelIndice).toEqual(['114584_20260915_medtronic_510012_2']);
    const conNueva = planificarImportacion(leer([fila({ cantidad: 1 }), fila({ cantidad: 5 })]), snap);
    expect(conNueva.nuevas).toEqual([]); // la de cantidad 5 se empareja con la guardada _2 (cambió la cantidad)
  });
});
