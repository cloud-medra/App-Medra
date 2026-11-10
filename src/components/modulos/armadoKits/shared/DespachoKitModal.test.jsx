// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ kit: null, permiso: true, gestionar: vi.fn() }));
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: () => ({ datos: [{ id: 'c1', nombre: 'Pabellón 1', estado: 'ACTIVO' }, { id: 'c2', nombre: 'Cerrado', estado: 'INACTIVO' }] }) }));
vi.mock('../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => h.permiso }) }));
vi.mock('../../../../hooks/useColumnResize', () => ({ useColumnResize: (cols) => ({ anchos: Object.fromEntries(cols.map((c) => [c.key, c.ancho])), handleResize: () => {}, restablecerAnchos: () => {}, personalizados: false }) }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u' } }) }));
vi.mock('./kitsApi', () => ({ leerKit: vi.fn(async () => h.kit), gestionarTransitoKit: (...a) => h.gestionar(...a) }));
vi.mock('../../bodega/shared/bodegaApi', () => ({ mensajeError: (e) => e.message, detalleError: (e) => e?.details || null }));

import DespachoKitModal from './DespachoKitModal';
import { leerCodigoKit } from '../../../../../functions/armadoKits/codigoKit.mjs';

const KIT = {
  id: 'F001', codigo: 'F001', referencia: 'KFH', estado: 'ARMADO', version: 1, cantidadLineas: 2, totalUnidades: 4,
  lineas: [
    { productoId: 'a', loteId: 'la', referencia: 'REF-A', productoNombre: 'Insumo A', lote: 'A1', vencimiento: '2030-01-01', cantidad: 3 },
    { productoId: 'b', loteId: 'lb', referencia: 'REF-B', productoNombre: 'Insumo B', lote: 'B1', vencimiento: '2031-01-01', cantidad: 1 },
  ],
};
const abrir = (texto = 'KITF001V1', centro = { id: 'c1', nombre: 'Pabellón 1' }) => {
  const props = { onCerrar: vi.fn(), onDespachado: vi.fn() };
  render(<DespachoKitModal lectura={leerCodigoKit(texto)} centroInicial={centro} {...props} />);
  return props;
};

beforeEach(() => { h.kit = structuredClone(KIT); h.permiso = true; h.gestionar = vi.fn(async () => ({ codigo: 'F001', salidaNumero: 7, centroNombre: 'Pabellón 1' })); });
afterEach(cleanup);

describe('despacho de un kit escaneado', () => {
  it('muestra ID, referencia y contenido, y despacha el kit completo con la versión escaneada', async () => {
    const { onDespachado } = abrir();
    await screen.findByText('Insumo A');
    expect(screen.getByText(/KFH - Kit Flexible Hombre/)).toBeTruthy();
    expect(screen.getByText('Insumo B')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Para pabellón' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));
    await waitFor(() => expect(onDespachado).toHaveBeenCalled());
    expect(h.gestionar).toHaveBeenCalledWith({ accion: 'DESPACHAR', kitId: 'F001', versionImpresa: 1, centroId: 'c1', observacion: 'Para pabellón', confirmarAdvertencias: false });
  });

  it('un código de kit inexistente lo informa y no ofrece despachar', async () => {
    h.kit = null;
    abrir('KITF999V1');
    await screen.findByText('No existe un kit con el ID F999.');
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).toBeNull();
  });

  it('una hoja de otra versión queda bloqueada, con la versión impresa y la actual', async () => {
    h.kit.version = 3;
    abrir('KITF001V2');
    await screen.findByText(/La hoja escaneada es la versión 2 del kit F001, pero su contenido actual es la versión 3/);
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).toBeNull();
  });

  it('un kit ya en tránsito no se despacha de nuevo', async () => {
    h.kit.estado = 'EN_TRANSITO';
    abrir();
    await screen.findByText(/está en tránsito: no se puede despachar/);
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).toBeNull();
  });

  it('con líneas vencidas o sin vencimiento exige marcar la confirmación', async () => {
    h.kit.lineas[0].vencimiento = '2020-01-01';
    h.kit.lineas[1].vencimiento = null;
    abrir();
    await screen.findByText(/1 línea\(s\) vencida\(s\) y 1 sin vencimiento/);
    const boton = screen.getByRole('button', { name: 'Confirmar despacho' });
    expect(boton.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(h.gestionar).toHaveBeenCalledWith(expect.objectContaining({ confirmarAdvertencias: true })));
  });

  it('sin centro elegido no se puede confirmar; los centros inactivos no se ofrecen', async () => {
    abrir('KITF001V1', null);
    await screen.findByText('Insumo A');
    expect(screen.getByRole('button', { name: 'Confirmar despacho' }).disabled).toBe(true);
    expect(screen.queryByRole('option', { name: 'Cerrado' })).toBeNull();
  });

  it('sin permiso no se puede despachar', async () => {
    h.permiso = false;
    abrir();
    await screen.findByText('No tienes permiso para despachar kits.');
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).toBeNull();
  });

  it('si el servidor rechaza, muestra el motivo y no cierra', async () => {
    h.gestionar = vi.fn(async () => { throw Object.assign(new Error('El kit F001 está en tránsito'), { details: { motivo: 'estado' } }); });
    const { onDespachado } = abrir();
    await screen.findByText('Insumo A');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));
    await screen.findByText('El kit F001 está en tránsito');
    expect(onDespachado).not.toHaveBeenCalled();
  });
});
