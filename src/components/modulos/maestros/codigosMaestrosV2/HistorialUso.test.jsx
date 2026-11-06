// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const cargarUsoCodigo = vi.fn();
const cargarLogsCodigo = vi.fn();
vi.mock('./accionesCodigos', () => ({ cargarUsoCodigo, cargarLogsCodigo }));

const { default: PanelHistorial } = await import('./PanelHistorial');

const registro = { id: 'c1', codigo: 'C-1', referencia: 'ABC-123', empresa: 'ACME', descriptorEmpresa: 'TORNILLO 5 MM', descriptorAuto: 'ABC-123 TORNILLO 5 MM' };
const abrir = () => render(<PanelHistorial abierto registro={registro} onCerrar={() => {}} />);
const abrirUso = async () => {
  abrir();
  fireEvent.click(await screen.findByRole('tab', { name: 'Historial de uso' }));
};
const seccion = (nombre) => screen.findByRole('region', { name: nombre });
const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent);
const filasDe = (region) => within(region).getAllByRole('row').slice(1);

const USO = {
  medicos: {
    k1: { nombre: 'Ana Soto', gestiones: { g3: '2026-09-01' } },
    k2: { nombre: 'Juan Pérez', gestiones: { g1: '2026-11-05', g2: '2026-10-12' } },
  },
  descripciones: { k3: { nombre: 'ARTROSCOPIA', gestiones: { g1: '2026-11-05', g3: '2026-09-01' } } },
};

// `n` médicos de un uso cada uno.
const usoConMedicos = (n) => ({
  medicos: Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { nombre: `Médico ${String(i).padStart(2, '0')}`, gestiones: { [`g${i}`]: '2026-11-05' } }])),
  descripciones: {},
});

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

  it('el encabezado muestra referencia y descripción; el de cambios, el código', async () => {
    cargarUsoCodigo.mockResolvedValue(USO);
    abrir();
    expect(screen.getByRole('heading', { name: 'C-1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Historial de uso' }));
    expect(screen.getByRole('heading', { name: 'ABC-123' })).toBeInTheDocument();
    expect(screen.getByText('TORNILLO 5 MM')).toBeInTheDocument();
    await seccion('Médicos');
  });

  it('muestra los indicadores sin contar dos veces una gestión', async () => {
    cargarUsoCodigo.mockResolvedValue(USO);
    await abrirUso();
    await seccion('Médicos');
    const valor = (etiqueta) => screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling.textContent;
    expect(valor('Total de usos')).toBe('3');
    expect(valor('Médicos distintos')).toBe('2');
    expect(valor('Descripciones distintas')).toBe('1');
    expect(valor('Último uso')).toBe('05-11-2026');
  });

  it('la tabla de médicos va ordenada por usos, con fecha dd-mm-aaaa', async () => {
    cargarUsoCodigo.mockResolvedValue(USO);
    await abrirUso();
    const region = await seccion('Médicos');
    expect(within(region).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Médico', 'Usos', 'Último uso']);
    expect(filasDe(region).map(celdas)).toEqual([
      ['Juan Pérez', '2', '05-11-2026'],
      ['Ana Soto', '1', '01-09-2026'],
    ]);
  });

  it('cada descripción muestra usos y solo sus médicos, sin fecha', async () => {
    cargarUsoCodigo.mockResolvedValue({
      ...USO,
      medicos: { ...USO.medicos, k9: { nombre: 'Luis Rojas', gestiones: { g9: '2026-08-01' } } },
    });
    await abrirUso();
    const region = await seccion('Descripción / Nota Operatoria');
    expect(within(region).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Descripción', 'Usos', 'Médicos']);
    expect(filasDe(region).map(celdas)).toEqual([['ARTROSCOPIA', '2', 'Ana Soto, Juan Pérez']]);
    expect(region).not.toHaveTextContent('2026');
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

  it('con más de 10 filas muestra 10 y "Ver todos (N)"', async () => {
    cargarUsoCodigo.mockResolvedValue(usoConMedicos(12));
    await abrirUso();
    const region = await seccion('Médicos');
    expect(filasDe(region)).toHaveLength(10);
    fireEvent.click(within(region).getByRole('button', { name: 'Ver todos (12)' }));
    expect(filasDe(region)).toHaveLength(12);
    fireEvent.click(within(region).getByRole('button', { name: 'Ver menos' }));
    expect(filasDe(region)).toHaveLength(10);
  });

  it('con 10 filas o menos no ofrece "Ver todos"', async () => {
    cargarUsoCodigo.mockResolvedValue(usoConMedicos(10));
    await abrirUso();
    const region = await seccion('Médicos');
    expect(filasDe(region)).toHaveLength(10);
    expect(within(region).queryByRole('button', { name: /Ver todos/ })).not.toBeInTheDocument();
  });

  it('mientras carga muestra el esqueleto, sin texto suelto', async () => {
    cargarUsoCodigo.mockReturnValue(new Promise(() => {}));
    await abrirUso();
    expect(screen.getByRole('status', { name: 'Cargando historial de uso' })).toBeInTheDocument();
  });

  it('avisa si el código aún no tiene usos', async () => {
    cargarUsoCodigo.mockResolvedValue(null);
    await abrirUso();
    expect(await screen.findByText('Este código aún no tiene usos registrados')).toBeInTheDocument();
  });

  it('informa si falla la lectura', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cargarUsoCodigo.mockRejectedValue(new Error('sin permiso'));
    await abrirUso();
    expect(await screen.findByText('No se pudo cargar el historial de uso.')).toBeInTheDocument();
  });
});
