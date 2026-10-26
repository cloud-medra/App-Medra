// @vitest-environment jsdom
// Resumen de Hemodinamia = Resumen de Implantes: misma pantalla y columnas;
// cada módulo lee sus imputadas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const colecciones = [];
vi.mock('../useResumenImputadas', () => ({
  TODOS_LOS_MESES: 'TODOS',
  useResumenImputadas: (coleccion) => {
    colecciones.push(coleccion);
    return {
      anio: '2026', setAnio: vi.fn(), mes: 'TODOS', setMes: vi.fn(),
      aniosDisponibles: ['2026'], mesesDelAnioActual: [], documentos: [], cargando: false, actualizar: vi.fn(),
    };
  },
}));

const { default: ResumenGestiones } = await import('./ResumenGestiones');
afterEach(() => { cleanup(); colecciones.length = 0; });

const encabezados = () => screen.queryAllByRole('columnheader').map((th) => th.textContent.trim());

describe('Resumen compartido', () => {
  it('mismas columnas en ambos módulos; título y colección de cada uno', () => {
    render(<ResumenGestiones modulo="implantes" />);
    expect(screen.getByText('IMPUTADOS DE IMPLANTES')).toBeInTheDocument();
    const implantes = encabezados();
    expect(implantes.length).toBeGreaterThan(5);
    cleanup();
    render(<ResumenGestiones modulo="hemodinamia" />);
    expect(screen.getByText('IMPUTADOS DE HEMODINAMIA')).toBeInTheDocument();
    expect(encabezados()).toEqual(implantes);
    expect([...new Set(colecciones)]).toEqual(['implantes_imputadas', 'hemodinamia_imputadas']);
  });
});
