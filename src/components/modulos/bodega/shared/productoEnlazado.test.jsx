// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  permisos: { btn_vincular: true, btn_crear: true, btn_desvincular: false },
  confirmAction: vi.fn(),
  showToast: vi.fn(),
  puedeCorregir: false,
  catalogos: {},
  api: { guardarProducto: vi.fn(), vincularCodigo: vi.fn(), obtenerProducto: vi.fn() },
}));

vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction: h.confirmAction }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: (_r, _s, a) => Boolean(h.permisos[a]) }) }));
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: (n) => ({ datos: h.catalogos[n] || [], cargando: false }) }));
vi.mock('./bodegaApi', () => ({ ...h.api, mensajeError: (e) => e.message, detalleError: (e) => e?.details || null }));
vi.mock('../../maestros/codigosBarra/CorregirCodigoModal', () => ({
  default: ({ aviso }) => <div>corregir: {aviso}</div>,
  usePuedeCorregirCodigo: () => h.puedeCorregir,
}));

import AvisoMaestroConProducto from './AvisoMaestroConProducto';
import ModalVincularCodigo from './ModalVincularCodigo';
import FormProducto from './FormProducto';
import { accionAvisoMaestro, avisoDesdeError, datosProductoEnlazado, maestrosConProducto } from './productoEnlazado';

const AVISO = { motivo: 'maestro-con-producto', productoId: 'p1', referencia: 'PU3033A', codigoMaestro: 'BOD-71', nombre: 'URETEROSCOPIO', activo: true };
const PRODUCTO = { id: 'p1', maestroCodigoId: 'm1', referencia: 'PU3033A', codigoMaestro: 'BOD-71', nombre: 'URETEROSCOPIO', activo: true, manejaLote: true };
const errorMaestro = () => Object.assign(new Error('ya tiene producto'), { details: AVISO });
const LECTURA = { codigo: '123456', clave: '123456', gs1: {} };

beforeEach(() => {
  vi.clearAllMocks();
  h.permisos = { btn_vincular: true, btn_crear: true, btn_desvincular: false };
  h.puedeCorregir = false;
  h.catalogos = {
    bodegaProductos: [PRODUCTO],
    bodegaCatalogos: [{ id: 'u1', tipo: 'UNIDAD', nombre: 'Unidad', activo: true }],
    codigos: [{ id: 'm1', codigo: '9891935', referencia: 'PU3033A', descriptorAuto: 'URETEROSCOPIO' }, { id: 'm2', codigo: '7777', referencia: 'LIBRE-1', descriptorAuto: 'INSUMO LIBRE' }],
  };
  h.api.obtenerProducto.mockResolvedValue(PRODUCTO);
  h.api.vincularCodigo.mockResolvedValue({ clave: '123456', productoId: 'p1' });
});
afterEach(cleanup);

describe('lógica del aviso', () => {
  it('con código y permiso ofrece agregar; sin permiso, nada', () => {
    expect(accionAvisoMaestro({ aviso: AVISO, codigo: '1', puedeVincular: true })).toBe('AGREGAR');
    expect(accionAvisoMaestro({ aviso: AVISO, codigo: '1', puedeVincular: false })).toBeNull();
  });
  it('sin código ofrece abrir, con o sin permiso', () => {
    expect(accionAvisoMaestro({ aviso: AVISO, codigo: '', puedeVincular: true })).toBe('ABRIR');
    expect(accionAvisoMaestro({ aviso: AVISO, codigo: '', puedeVincular: false })).toBe('ABRIR');
  });
  it('no ofrece agregar a un inactivo ni si no se sabe qué producto es', () => {
    expect(accionAvisoMaestro({ aviso: { ...AVISO, activo: false }, codigo: '1', puedeVincular: true })).toBeNull();
    expect(accionAvisoMaestro({ aviso: { ...AVISO, productoId: null }, codigo: '', puedeVincular: true })).toBeNull();
  });
  it('el producto que se edita no cuenta como dueño de su propio ítem', () => {
    expect(maestrosConProducto([PRODUCTO]).has('m1')).toBe(true);
    expect(maestrosConProducto([PRODUCTO], 'p1').has('m1')).toBe(false);
  });
  it('solo convierte el error del maestro clínico', () => {
    expect(avisoDesdeError(errorMaestro(), { extra: 1 })).toMatchObject({ productoId: 'p1', mensaje: 'ya tiene producto', extra: 1 });
    expect(avisoDesdeError(new Error('otro'))).toBeNull();
  });
  it('datos de la copia local iguales a los del servidor', () => {
    expect(datosProductoEnlazado(PRODUCTO)).toEqual({ productoId: 'p1', referencia: 'PU3033A', codigoMaestro: 'BOD-71', nombre: 'URETEROSCOPIO', activo: true });
  });
});

describe('aviso en pantalla', () => {
  it('con código y permiso: muestra referencia y nombre, sin el ID, y confirma con código y producto', () => {
    const onAgregar = vi.fn();
    render(<AvisoMaestroConProducto aviso={AVISO} codigo="123456" onAgregar={onAgregar} onCerrar={() => {}} />);
    expect(screen.getByRole('dialog').textContent).toContain('PU3033A');
    expect(screen.getByRole('dialog').textContent).toContain('URETEROSCOPIO');
    expect(screen.getByRole('dialog').textContent).not.toContain('p1');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar este código a PU3033A' }));
    expect(onAgregar).not.toHaveBeenCalled();
    const [, mensaje, confirmar] = h.confirmAction.mock.calls[0];
    expect(mensaje).toContain('123456');
    expect(mensaje).toContain('PU3033A · URETEROSCOPIO');
    confirmar();
    expect(onAgregar).toHaveBeenCalledOnce();
  });

  it('con código y sin permiso de vincular: no hay botón e informa', () => {
    h.permisos.btn_vincular = false;
    render(<AvisoMaestroConProducto aviso={AVISO} codigo="123456" onAgregar={() => {}} onCerrar={() => {}} />);
    expect(screen.queryByRole('button', { name: /Agregar este código/ })).toBeNull();
    expect(screen.getByText(/No tienes permiso/)).toBeTruthy();
  });

  it('sin código: "Abrir producto"', () => {
    const onAbrir = vi.fn();
    render(<AvisoMaestroConProducto aviso={AVISO} onAbrir={onAbrir} onCerrar={() => {}} />);
    expect(screen.queryByRole('button', { name: /Agregar este código/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir producto' }));
    expect(onAbrir).toHaveBeenCalledWith('p1');
  });
});

describe('modal de código sin vincular', () => {
  const abrir = (props = {}) => {
    const onVinculado = vi.fn();
    render(<ModalVincularCodigo lectura={LECTURA} onVinculado={onVinculado} onCerrar={() => {}} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Crear producto nuevo/ }));
    return { onVinculado };
  };
  const llenarYCrear = () => {
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByLabelText('Unidad de medida *'), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y vincular código/ }));
  };
  const elegirItem = (texto) => {
    fireEvent.click(screen.getByRole('button', { name: /Completar desde el maestro clínico/ }));
    fireEvent.change(screen.getByPlaceholderText(/Buscar en el maestro clínico/), { target: { value: texto } });
  };

  it('creación normal: igual que antes, sin aviso', async () => {
    h.api.guardarProducto.mockResolvedValue({ id: 'n1', producto: { codigoMaestro: 'BOD-72', nombre: 'Nuevo' } });
    const { onVinculado } = abrir();
    llenarYCrear();
    await waitFor(() => expect(onVinculado).toHaveBeenCalled());
    expect(h.api.guardarProducto.mock.calls[0][0].codigos).toEqual(['123456']);
    expect(onVinculado.mock.calls[0][0]).toMatchObject({ id: 'n1' });
    expect(screen.queryByText('Este ítem ya tiene producto')).toBeNull();
  });

  it('el servidor rechaza por ítem con producto: aviso, y agregar usa el vínculo normal sin perder el ingreso', async () => {
    h.api.guardarProducto.mockRejectedValue(errorMaestro());
    const { onVinculado } = abrir({ conPrecioNeto: true });
    fireEvent.change(screen.getByLabelText('Precio neto'), { target: { value: '5000' } });
    llenarYCrear();
    await screen.findByText('Este ítem ya tiene producto');
    expect(onVinculado).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre *').value).toBe('Nuevo');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar este código a PU3033A' }));
    h.confirmAction.mock.calls[0][2]();
    await waitFor(() => expect(onVinculado).toHaveBeenCalled());
    expect(h.api.vincularCodigo).toHaveBeenCalledWith({ productoId: 'p1', codigoLeido: '123456', reasignar: false, esperadoProductoId: null });
    expect(onVinculado.mock.calls[0][0]).toMatchObject({ id: 'p1', manejaLote: true, codigosBarra: ['123456'] });
    expect(onVinculado.mock.calls[0][1]).toEqual({ precioNeto: '5000' });
  });

  it('el código escaneado ya es de otro producto: informa y no entrega el producto', async () => {
    h.api.guardarProducto.mockRejectedValue(errorMaestro());
    h.api.vincularCodigo.mockRejectedValue(Object.assign(new Error('El código 123456 ya está vinculado a la referencia OTRA'), { details: { motivo: 'vinculado-a-otro', productoId: 'p9' } }));
    const { onVinculado } = abrir();
    llenarYCrear();
    await screen.findByText('Este ítem ya tiene producto');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar este código a PU3033A' }));
    h.confirmAction.mock.calls[0][2]();
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('referencia OTRA'), 'error'));
    expect(onVinculado).not.toHaveBeenCalled();
  });

  it('el código ya es de otro y puede corregir: abre la corrección', async () => {
    h.puedeCorregir = true;
    h.api.guardarProducto.mockRejectedValue(errorMaestro());
    h.api.vincularCodigo.mockRejectedValue(Object.assign(new Error('ya vinculado a OTRA'), { details: { motivo: 'vinculado-a-otro', productoId: 'p9' } }));
    abrir();
    llenarYCrear();
    await screen.findByText('Este ítem ya tiene producto');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar este código a PU3033A' }));
    h.confirmAction.mock.calls[0][2]();
    await screen.findByText(/corregir: ya vinculado a OTRA/);
  });

  it('otros errores del guardado siguen como aviso breve', async () => {
    h.api.guardarProducto.mockRejectedValue(new Error('La categoría no existe'));
    abrir();
    llenarYCrear();
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('La categoría no existe', 'error'));
    expect(screen.queryByText('Este ítem ya tiene producto')).toBeNull();
  });

  it('elegir en el buscador un ítem con producto lleva al aviso, sin llamar al servidor ni llenar el formulario', async () => {
    abrir();
    elegirItem('PU3033A');
    expect(screen.getByText(/Ya tiene producto en Bodega: PU3033A/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /9891935/ }));
    await screen.findByText('Este ítem ya tiene producto');
    expect(screen.getByRole('button', { name: 'Agregar este código a PU3033A' })).toBeTruthy();
    expect(h.api.guardarProducto).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre *').value).toBe('');
  });
});

describe('buscador del formulario', () => {
  const montar = (props = {}) => render(<FormProducto esNuevo onGuardar={() => {}} {...props} />);
  const buscar = (texto) => {
    fireEvent.click(screen.getByRole('button', { name: /Completar desde el maestro clínico/ }));
    fireEvent.change(screen.getByPlaceholderText(/Buscar en el maestro clínico/), { target: { value: texto } });
  };

  it('un ítem libre no lleva marca y completa el formulario como siempre', () => {
    const onMaestroConProducto = vi.fn();
    montar({ onMaestroConProducto });
    buscar('LIBRE');
    expect(screen.queryByText(/Ya tiene producto en Bodega/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /7777/ }));
    expect(onMaestroConProducto).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre *').value).toBe('INSUMO LIBRE');
    expect(screen.getByLabelText('Referencia').value).toBe('LIBRE-1');
  });

  it('sin código escaneado entrega el aviso con el producto que tiene el enlace', () => {
    const onMaestroConProducto = vi.fn();
    montar({ onMaestroConProducto });
    buscar('PU3033A');
    fireEvent.click(screen.getByRole('button', { name: /9891935/ }));
    expect(onMaestroConProducto).toHaveBeenCalledWith({ productoId: 'p1', referencia: 'PU3033A', codigoMaestro: 'BOD-71', nombre: 'URETEROSCOPIO', activo: true });
  });

  it('al editar, el ítem del propio producto no se marca', () => {
    montar({ esNuevo: false, inicial: { id: 'p1', nombre: 'X', unidadId: 'u1' } });
    buscar('PU3033A');
    expect(screen.queryByText(/Ya tiene producto en Bodega/)).toBeNull();
  });
});
