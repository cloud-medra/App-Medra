// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const cargarUsoCodigo = vi.fn();
const cargarLogsCodigo = vi.fn();
vi.mock('./accionesCodigos', () => ({ cargarUsoCodigo, cargarLogsCodigo }));

const { default: PanelHistorial } = await import('./PanelHistorial');

const registro = { id: 'c1', codigo: 'C-1', referencia: 'ABC-123', empresa: 'ACME' };
const abrir = () => render(<PanelHistorial abierto registro={registro} onCerrar={() => {}} />);
const abrirUso = async () => {
  abrir();
  fireEvent.click(await screen.findByRole('tab', { name: 'Historial de uso' }));
};

beforeEach(() => { cargarLogsCodigo.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PanelHistorial → Historial de uso', () => {
  it('no lee el uso hasta abrir su pestaña', async () => {
    cargarUsoCodigo.mockResolvedValue(null);
    abrir();
    await screen.findByText('Este registro no tiene historial.');
    expect(cargarUsoCodigo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Historial de uso' }));
    expect(cargarUsoCodigo).toHaveBeenCalledWith('ABC-123');
  });

  it('muestra médicos y descripciones con cantidad y último uso', async () => {
    cargarUsoCodigo.mockResolvedValue({
      medicos: {
        k1: { nombre: 'Juan Pérez', gestiones: { g1: '2026-11-05', g2: '2026-10-12' } },
        k2: { nombre: 'Ana Soto', gestiones: { g3: '2026-09-01' } },
      },
      descripciones: { k3: { nombre: 'ARTROSCOPIA', gestiones: { g1: '2026-11-05' } } },
    });
    await abrirUso();
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('2 usos · último uso: 05-11-2026')).toBeInTheDocument();
    expect(screen.getByText('Ana Soto')).toBeInTheDocument();
    expect(screen.getByText('ARTROSCOPIA')).toBeInTheDocument();
    expect(screen.getByText('Médicos (2)')).toBeInTheDocument();
    expect(screen.getByText('Descripción / Nota Operatoria (1)')).toBeInTheDocument();
  });

  it('cada descripción muestra sus médicos y sus usos, sin fecha', async () => {
    cargarUsoCodigo.mockResolvedValue({
      medicos: {
        k1: { nombre: 'Juan Pérez', gestiones: { g1: '2026-11-05' } },
        k2: { nombre: 'Ana Soto', gestiones: { g2: '2026-11-06' } },
        k3: { nombre: 'Luis Rojas', gestiones: { g3: '2026-11-07' } },
      },
      descripciones: { k4: { nombre: 'ARTROSCOPIA', gestiones: { g1: '2026-11-05', g2: '2026-11-06' } } },
    });
    await abrirUso();
    const fila = (await screen.findByText('ARTROSCOPIA')).closest('li');
    expect(fila).toHaveTextContent('Médicos: Ana Soto, Juan Pérez');
    expect(fila).toHaveTextContent('2 usos');
    expect(fila).not.toHaveTextContent('Luis Rojas');
    expect(fila).not.toHaveTextContent('último uso');
    expect(fila).not.toHaveTextContent('2026');
  });

  it('una descripción larga se recorta con "Ver más" y una corta no', async () => {
    const larga = 'A'.repeat(200);
    cargarUsoCodigo.mockResolvedValue({
      medicos: {},
      descripciones: {
        k1: { nombre: larga, gestiones: { g1: '2026-11-05' } },
        k2: { nombre: 'CORTA', gestiones: { g2: '2026-11-05' } },
      },
    });
    await abrirUso();
    await screen.findByText('CORTA');
    expect(screen.queryByText(larga)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ver más' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(screen.getByText(larga)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.queryByText(larga)).not.toBeInTheDocument();
  });

  it('avisa si el código aún no tiene usos', async () => {
    cargarUsoCodigo.mockResolvedValue(null);
    await abrirUso();
    expect(await screen.findByText('Este código aún no tiene usos registrados en Implantes.')).toBeInTheDocument();
  });

  it('informa si falla la lectura', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cargarUsoCodigo.mockRejectedValue(new Error('sin permiso'));
    await abrirUso();
    expect(await screen.findByText('No se pudo cargar el historial de uso.')).toBeInTheDocument();
  });
});
