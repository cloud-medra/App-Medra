import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDoc = vi.fn(async () => {});
const addDoc = vi.fn(async () => ({ id: 'nuevo' }));
vi.mock('firebase/firestore', () => ({
  collection: (...partes) => partes.slice(1).join('/'),
  doc: (...partes) => partes.slice(1).join('/'),
  addDoc: (...a) => addDoc(...a),
  updateDoc: (...a) => updateDoc(...a),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: () => 'TS'
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));

const { camposModificados, formDesdeRegistro, validarFormulario, avisosFormulario, valoresParaCrear } = await import('./camposCodigo');
const { guardarRegistroCodigo } = await import('./accionesCodigos');

const REGISTRO = {
  id: 'abc',
  codigo: '1001',
  referencia: 'REF-1',
  descriptorEmpresa: 'tornillo',
  empresa: 'ACME',
  tipo: 'COTIZACION',
  segmento: 'IMPLANTES',
  clase: 'IMPLANTE',
  descriptorAuto: 'REF-1 TORNILLO',
  precioNeto: 12500,
  cx: '',
  observacion: ''
};

describe('camposModificados', () => {
  it('sin tocar nada no hay cambios (aunque haya valores en minúsculas)', () => {
    const inicial = formDesdeRegistro(REGISTRO);
    expect(camposModificados(inicial, { ...inicial }, REGISTRO)).toEqual({});
  });

  it('devuelve solo los campos cambiados, normalizados', () => {
    const inicial = formDesdeRegistro(REGISTRO);
    const form = { ...inicial, precioNeto: '13.000', cx: 'cx9' };
    expect(camposModificados(inicial, form, REGISTRO)).toEqual({ precioNeto: 13000, cx: 'CX9' });
  });

  it('ignora una edición que vuelve al valor guardado', () => {
    const inicial = formDesdeRegistro(REGISTRO);
    expect(camposModificados(inicial, { ...inicial, precioNeto: '12500' }, REGISTRO)).toEqual({});
  });
});

describe('validación', () => {
  it('exige los campos obligatorios del modo', () => {
    const errores = validarFormulario(formDesdeRegistro({}), 'asignarCodigo');
    expect(Object.keys(errores).sort()).toEqual(['codigo', 'empresa', 'referencia']);
  });

  it('avisa si el código ya lo usa otro registro', () => {
    const avisos = avisosFormulario({ codigo: '1001' }, { id: 'otro' }, [REGISTRO]);
    expect(avisos.codigo).toMatch(/REF-1/);
    expect(avisosFormulario({ codigo: '1001' }, REGISTRO, [REGISTRO])).toEqual({});
  });

  it('nuevo pendiente arma el descriptor automático y no guarda código', () => {
    const valores = valoresParaCrear({ ...formDesdeRegistro({}), referencia: 'r1', descriptorEmpresa: 'placa', empresa: 'acme' }, 'nuevoPendiente');
    expect(valores.descriptorAuto).toBe('R1 PLACA');
    expect(valores).not.toHaveProperty('codigo');
  });
});

describe('guardarRegistroCodigo', () => {
  beforeEach(() => { updateDoc.mockClear(); addDoc.mockClear(); });

  it('editar escribe solo los campos modificados', async () => {
    const inicial = formDesdeRegistro(REGISTRO);
    await guardarRegistroCodigo({ modo: 'editarConCodigo', registro: REGISTRO, inicial, form: { ...inicial, precioNeto: '15.000' }, userData: {} });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toEqual({ precioNeto: 15000 });
  });

  it('sin cambios no escribe nada', async () => {
    const inicial = formDesdeRegistro(REGISTRO);
    const r = await guardarRegistroCodigo({ modo: 'editarConCodigo', registro: REGISTRO, inicial, form: inicial, userData: {} });
    expect(r.sinCambios).toBe(true);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('asignar código marca tieneCodigo y escribe solo lo cambiado', async () => {
    const pendiente = { ...REGISTRO, codigo: '' };
    const inicial = formDesdeRegistro(pendiente);
    await guardarRegistroCodigo({ modo: 'asignarCodigo', registro: pendiente, inicial, form: { ...inicial, codigo: '2002' }, userData: { nombreCompleto: 'Ana' } });
    expect(updateDoc.mock.calls[0][1]).toEqual({ codigo: '2002', tieneCodigo: true, fechaAsignacionCodigo: 'TS', asignadoPor: 'Ana' });
    expect(addDoc.mock.calls[0][1]).toMatchObject({ accion: 'ASIGNACION_CODIGO', detalles: { codigo: '2002', codigoAsignado: '2002' } });
  });

  it('modificar registro solo con motivo escribe el log y no el documento', async () => {
    const inicial = formDesdeRegistro(REGISTRO);
    await guardarRegistroCodigo({ modo: 'modificarRegistro', registro: REGISTRO, inicial, form: { ...inicial, motivo: 'revisión' }, userData: {} });
    expect(updateDoc).not.toHaveBeenCalled();
    expect(addDoc.mock.calls[0][1]).toMatchObject({ accion: 'ACTUALIZACION_REGISTRO', detalles: { observacionModificacion: 'revisión' } });
  });
});
