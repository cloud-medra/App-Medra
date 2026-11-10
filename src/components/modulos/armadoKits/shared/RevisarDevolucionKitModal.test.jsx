// @vitest-environment jsdom
// Revisar devolución (Bodega > Tránsito): cantidades por línea, resumen antes
// de guardar y bloqueo de lo devuelto por sobre lo despachado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ gestionar: null }));
vi.mock('./kitsApi', () => ({ gestionarTransitoKit: (...a) => h.gestionar(...a) }));
vi.mock('../../bodega/shared/bodegaApi', () => ({ mensajeError: (e) => e.message }));

import RevisarDevolucionKitModal from './RevisarDevolucionKitModal';

const KIT = {
  id: 'F001', codigo: 'F001', referencia: 'KFH', modeloNombre: 'Kit Flexible Hombre', totalUnidades: 3, despacho: { centroNombre: 'Pabellón 1', salidaNumero: 4 },
  lineas: [
    { loteId: 'g', componenteNombre: 'Guía', referencia: 'HW-1', productoNombre: 'Guía', lote: 'G1', vencimiento: '2030-01-01', cantidad: 2, valor: 20000 },
    { loteId: 'n', componenteNombre: 'Dormia', referencia: 'NT-1', productoNombre: 'Nitinol', lote: 'N1', vencimiento: '2030-01-01', cantidad: 1, valor: 80000 },
  ],
};
const abrir = () => { const props = { onCerrar: vi.fn(), onHecho: vi.fn() }; render(<RevisarDevolucionKitModal kit={KIT} {...props} />); return props; };
const devuelto = (nombre, v) => fireEvent.change(screen.getByLabelText(new RegExp(`Devuelto ${nombre}`)), { target: { value: String(v) } });

beforeEach(() => { h.gestionar = vi.fn(async () => ({ resultado: 'PARCIAL', usado: 2, devuelto: 1 })); });
afterEach(cleanup);

describe('revisar devolución', () => {
  it('vuelve el nitinol: resumen con lo devuelto y lo usado, y guarda las cantidades por línea', async () => {
    const { onHecho } = abrir();
    devuelto('Nitinol', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    const resumen = screen.getByLabelText('Resumen de la revisión');
    expect(resumen.textContent).toMatch(/Devuelto: 1 unidad\(es\) · \$80\.000 · Usado: 2 unidad\(es\) · \$20\.000/);
    expect(resumen.textContent).toMatch(/Entregado parcial/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onHecho).toHaveBeenCalled());
    expect(h.gestionar).toHaveBeenCalledWith({ accion: 'REVISAR_DEVOLUCION', kitId: 'F001', devueltos: [{ loteId: 'g', devuelto: 0 }, { loteId: 'n', devuelto: 1 }], observacion: '' });
  });

  it('más de lo despachado no deja seguir', () => {
    abrir();
    devuelto('Guía', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText(/se despacharon 2 y no pueden volver 3/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('todo devuelto avisa que equivale a Rechazar; nada devuelto, a Recibir', () => {
    abrir();
    fireEvent.click(screen.getByText('Volvió todo'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByLabelText('Resumen de la revisión').textContent).toMatch(/equivale a Rechazar/);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByText('No volvió nada'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByLabelText('Resumen de la revisión').textContent).toMatch(/equivale a Recibir/);
  });
});
