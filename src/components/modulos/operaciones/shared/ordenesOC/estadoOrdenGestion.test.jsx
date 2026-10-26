// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Listener simulado: `emitir` hace de snapshot del documento ordenesOC/registroPdf.
const escucharRegistroPdfOC = vi.fn();
let emitir = null;
let emitirError = null;
const cerrar = vi.fn();
vi.mock('./registroPdfOC', () => ({
  escucharRegistroPdfOC: (onDatos, onError) => {
    escucharRegistroPdfOC();
    emitir = onDatos;
    emitirError = onError;
    return cerrar;
  }
}));

const { estadoOrdenGestion, useRegistroPdfGestiones } = await import('./estadoOrdenGestion');
const { GestionesTable } = await import('../gestion/GestionesTable');

// Gestión con un ítem por OC (ocsDeGestion lee cotizaciones[0].items + ocPorItem).
const gestion = (id, ocs = []) => ({
  id, gestionId: id, nombre: `Paciente ${id}`, fecha: '2026-10-20', empresa: 'ACME',
  cotizaciones: [{ items: ocs.map((_, n) => ({ id: `it${n}`, codigo: 'C1' })) }],
  ocPorItem: Object.fromEntries(ocs.map((oc, n) => [`it${n}`, oc]))
});

afterEach(() => { cleanup(); escucharRegistroPdfOC.mockReset(); cerrar.mockReset(); emitir = null; });

describe('estadoOrdenGestion', () => {
  const pdfs = { 4500123: {}, 4500999: {} };
  it('verde con orden y PDF, naranjo con orden sin PDF, gris sin orden', () => {
    expect(estadoOrdenGestion(gestion('a', ['4500123']), pdfs)).toBe('conPdf');
    expect(estadoOrdenGestion(gestion('b', ['4500555']), pdfs)).toBe('sinPdf');
    expect(estadoOrdenGestion(gestion('c'), pdfs)).toBe('sinOrden');
  });
  it('con varias OC, verde solo si todas tienen PDF; usa la clave canónica (ceros a la izquierda)', () => {
    expect(estadoOrdenGestion(gestion('d', ['4500123', '04500999']), pdfs)).toBe('conPdf');
    expect(estadoOrdenGestion(gestion('e', ['4500123', '4500555']), pdfs)).toBe('sinPdf');
  });
  it('mientras no se leyó el registro, las filas con orden quedan "cargando"', () => {
    expect(estadoOrdenGestion(gestion('f', ['4500123']), null)).toBe('cargando');
    expect(estadoOrdenGestion(gestion('g'), null)).toBe('sinOrden');
  });
});

describe('useRegistroPdfGestiones', () => {
  it('abre un único listener y se actualiza solo cuando cambia el registro (PDF de otro usuario)', () => {
    const { result, rerender, unmount } = renderHook(() => useRegistroPdfGestiones(true));
    expect(result.current.pdfs).toBeNull(); // cargando hasta el primer snapshot
    act(() => emitir({ 4500123: {} }));
    expect(result.current.pdfs).toEqual({ 4500123: {} });
    act(() => emitir({ 4500123: {}, 4500555: { subidoPor: 'otro@x.cl' } }));
    expect(result.current.pdfs).toHaveProperty('4500555');
    rerender();
    expect(escucharRegistroPdfOC).toHaveBeenCalledTimes(1);
    unmount();
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
  it('informa el error si no se puede escuchar', () => {
    const { result } = renderHook(() => useRegistroPdfGestiones(true));
    act(() => emitirError(new Error('sin permiso')));
    expect(result.current.error).toMatch(/No se pudo cargar/);
  });
  it('deshabilitado no abre el listener', () => {
    renderHook(() => useRegistroPdfGestiones(false));
    expect(escucharRegistroPdfOC).not.toHaveBeenCalled();
  });
});

describe('GestionesTable: colores por Orden', () => {
  const props = { handleCopiarTexto: vi.fn(), abrirHistorialLogs: vi.fn(), iniciarEdicion: vi.fn(), handleDelete: vi.fn() };
  it('colorea cada fila, muestra la orden como badge y la leyenda', () => {
    const filas = [gestion('1', ['4500123']), gestion('2', ['4500555']), gestion('3')];
    const { container } = render(<GestionesTable implantesFiltrados={filas} pdfsOC={{ 4500123: {} }} {...props} />);
    const estados = [...container.querySelectorAll('tbody tr')].map(tr => tr.dataset.estadoOrden);
    expect(estados).toEqual(['conPdf', 'sinPdf', 'sinOrden']);
    expect(screen.getByText('4500123').className).toMatch(/emerald/);
    expect(screen.getByText('4500555').className).toMatch(/orange/);
    ['Con orden y PDF', 'Con orden, sin PDF', 'Sin orden'].forEach(t => expect(screen.getByText(t)).toBeInTheDocument());
  });
});
