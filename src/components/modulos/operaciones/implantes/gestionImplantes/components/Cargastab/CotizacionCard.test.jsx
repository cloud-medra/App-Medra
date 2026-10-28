// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CotizacionCard } from './CotizacionCard';

afterEach(cleanup);

// El autocompletado de referencia usa Firestore (onSnapshot) por debajo;
// no es relevante para probar la carga masiva y no queremos tocar la red.
vi.mock('./useAutocompleteReferencia', () => ({
  useAutocompleteReferencia: () => ({
    sugerencias: [],
    buscando: false,
    mostrarSug: false,
    setMostrarSug: () => {},
    containerRef: { current: null },
    portalRef: { current: null },
    skipNext: { current: false }
  })
}));

const itemBase = (overrides) => ({
  id: 'id',
  referencia: 'Ref',
  codigo: 'COD-1',
  cantidad: 1,
  precio: 100,
  venta: 100,
  totalItem: 100,
  vecesCosto: 1,
  recargoEncontrado: true,
  sinCodigo: false,
  estadoCarga: 'PENDIENTE',
  lote: 'L-1',
  vencimiento: '2026-01-01',
  ...overrides
});

const construirCotizacion = () => ({
  id: 'cot_1',
  numCotizacion: 'COT-1',
  totalCotizacion: 0,
  items: [
    itemBase({ id: 'item_1', estadoCarga: 'PENDIENTE' }),
    itemBase({ id: 'item_2', estadoCarga: 'REVISAR' }),
    itemBase({ id: 'item_3', estadoCarga: 'PENDIENTE' }),
    itemBase({ id: 'pad_1', esPad: true, referencia: 'Kit PAD', estadoCarga: 'PENDIENTE' }),
    itemBase({ id: 'pad_contenido_1', padPadreId: 'pad_1', referencia: 'Pieza PAD', sinCodigo: false })
  ]
});

const renderCard = (onActualizarEstadoItem) => render(
  <CotizacionCard
    cotizacion={construirCotizacion()}
    bloqueEmpresa="EMPRESA X"
    gestionId="123"
    bloqueFecha="2026-01-01"
    recargosActivos={[]}
    periodoAbierto={{ anio: 2026, mes: 'enero' }}
    onAgregarItem={() => {}}
    onEliminarItem={() => {}}
    onEliminarCotizacion={() => {}}
    onActualizarEstadoItem={onActualizarEstadoItem}
    onEditarItem={() => {}}
    defaultOpen={true}
  />
);

describe('CotizacionCard - carga masiva "Marcar todos como Cargado"', () => {
  it('al confirmar, actualiza TODOS los ítems no-PAD (no solo el primero) y ninguno de los PAD', () => {
    const onActualizarEstadoItem = vi.fn();
    renderCard(onActualizarEstadoItem);

    fireEvent.click(screen.getByRole('button', { name: /marcar todos como cargado/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    const idsActualizados = onActualizarEstadoItem.mock.calls.map(call => call[0]);

    expect(onActualizarEstadoItem).toHaveBeenCalledTimes(3);
    expect(idsActualizados.sort()).toEqual(['item_1', 'item_2', 'item_3']);
    expect(onActualizarEstadoItem.mock.calls.every(call => call[1] === 'CARGADO')).toBe(true);

    expect(idsActualizados).not.toContain('pad_1');
    expect(idsActualizados).not.toContain('pad_contenido_1');
  });

  it('no vuelve a tocar ítems que ya están en estado CARGADO', () => {
    const onActualizarEstadoItem = vi.fn();
    const cotizacion = construirCotizacion();
    cotizacion.items[0].estadoCarga = 'CARGADO';

    render(
      <CotizacionCard
        cotizacion={cotizacion}
        bloqueEmpresa="EMPRESA X"
        gestionId="123"
        bloqueFecha="2026-01-01"
        recargosActivos={[]}
        periodoAbierto={{ anio: 2026, mes: 'enero' }}
        onAgregarItem={() => {}}
        onEliminarItem={() => {}}
        onEliminarCotizacion={() => {}}
        onActualizarEstadoItem={onActualizarEstadoItem}
        onEditarItem={() => {}}
        defaultOpen={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /marcar todos como cargado/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    const idsActualizados = onActualizarEstadoItem.mock.calls.map(call => call[0]);
    expect(idsActualizados.sort()).toEqual(['item_2', 'item_3']);
  });
});

// Primera celda de cada fila de ítems (columna N°).
const numerosDeFila = () => screen.getAllByRole('row')
  .filter(fila => fila.closest('tbody'))
  .map(fila => fila.querySelector('td')?.textContent);

describe('CotizacionCard - columna N°', () => {
  it('numera las filas en el orden en que se ven, sin saltos, y se renumera al quitar una', () => {
    const props = {
      bloqueEmpresa: 'EMPRESA X', gestionId: '123', bloqueFecha: '2026-01-01', recargosActivos: [],
      periodoAbierto: { anio: 2026, mes: 'enero' }, onAgregarItem: () => {}, onEliminarItem: () => {},
      onEliminarCotizacion: () => {}, onActualizarEstadoItem: () => {}, onEditarItem: () => {}, defaultOpen: true,
    };
    const { rerender } = render(<CotizacionCard cotizacion={construirCotizacion()} {...props} />);

    expect(screen.getByRole('columnheader', { name: 'N°' })).toBeTruthy();
    expect(numerosDeFila()).toEqual(['1', '2', '3', '4', '5']);

    const cotizacion = construirCotizacion();
    cotizacion.items = cotizacion.items.filter(it => it.id !== 'item_2');
    rerender(<CotizacionCard cotizacion={cotizacion} {...props} />);
    expect(numerosDeFila()).toEqual(['1', '2', '3', '4']);
  });

  it('modo lectura: el contenido de un PAD plegado no cuenta hasta que se despliega', () => {
    render(
      <CotizacionCard cotizacion={construirCotizacion()} bloqueEmpresa="EMPRESA X" gestionId="123"
        bloqueFecha="2026-01-01" recargosActivos={[]} defaultOpen={true} modoLectura={true} />
    );
    expect(numerosDeFila()).toEqual(['1', '2', '3', '4']);

    fireEvent.click(screen.getByRole('button', { name: /ver contenido del pad/i }));
    expect(numerosDeFila()).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('fila SIN CARGO', () => {
  it('muestra el código real con la marca "Sin cargo, no lleva OC" (no el texto guardado)', () => {
    const cotizacion = { id: 'cot_1', numCotizacion: 'COT-1', totalCotizacion: 0, items: [
      itemBase({ id: 'sc', estadoCarga: 'SIN CARGO', codigo: 'No lleva OC', precio: 0, venta: 0, totalItem: 0, sinCargoOriginal: { codigo: '0301001', precio: 100 } }),
    ] };
    for (const modoLectura of [false, true]) {
      render(<CotizacionCard cotizacion={cotizacion} bloqueEmpresa="EMPRESA X" gestionId="123" bloqueFecha="2026-01-01" recargosActivos={[]} defaultOpen={true} modoLectura={modoLectura}
        onAgregarItem={() => {}} onEliminarItem={() => {}} onEliminarCotizacion={() => {}} onActualizarEstadoItem={() => {}} onEditarItem={() => {}} />);
      expect(screen.getByText('0301001')).toBeTruthy();
      expect(screen.getByText('Sin cargo, no lleva OC')).toBeTruthy();
      expect(screen.queryByText('No lleva OC')).toBeNull();
      cleanup();
    }
  });
});
