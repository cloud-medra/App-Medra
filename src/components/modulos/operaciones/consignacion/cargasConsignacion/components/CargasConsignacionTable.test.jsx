// @vitest-environment jsdom
// Columna ORDEN de Cargas de Consignación (una fila = un registro).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CargasConsignacionTable } from './CargasConsignacionTable';

afterEach(cleanup);

const registro = (id, extra) => ({ id, gestionId: `ADM-${id}`, nombre: 'JUAN', fecha: '2026-09-15', empresa: 'MEDTRONIC', ...extra });
const celdaOrden = (id) => {
  const fila = screen.getByText(`ADM-${id}`).closest('tr');
  const indice = screen.getAllByRole('columnheader').findIndex(th => th.textContent.trim() === 'Orden');
  return within(fila).getAllByRole('cell')[indice];
};

describe('columna ORDEN', () => {
  it('muestra una orden, varias separadas por coma, sin repetir, y "—" si no hay', () => {
    render(<CargasConsignacionTable registros={[
      registro('una', { orden: '4500001', ordenOrigen: 'oc' }),
      registro('dos', { orden: '12345,12356', ordenOrigen: 'manual' }),
      registro('repetida', { orden: '12345, 12345' }),
      registro('sin', { orden: '' }),
      registro('sinCampo', {})
    ]} />);
    expect(celdaOrden('una')).toHaveTextContent(/^4500001$/);
    expect(celdaOrden('una')).toHaveAttribute('title', '4500001 · Sincronizada desde OC');
    expect(celdaOrden('dos')).toHaveTextContent(/^12345, 12356$/);
    expect(celdaOrden('repetida')).toHaveTextContent(/^12345$/);
    expect(celdaOrden('sin')).toHaveTextContent(/^—$/);
    expect(celdaOrden('sinCampo')).toHaveTextContent(/^—$/);
  });
});
