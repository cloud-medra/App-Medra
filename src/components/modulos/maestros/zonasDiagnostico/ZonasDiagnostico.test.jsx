// @vitest-environment jsdom
// Maestros → Zonas por diagnóstico: listado (orden, resaltado, filtro y
// búsqueda), asignar/confirmar zonas y permisos.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const ENTRADAS = [
  { id: 'a', descripcion: 'RUPTURA MANGUITO ROTADORES', zonas: ['hombro'], lado: 'no_especificado', estado: 'sugerida', gestiones: 33 },
  { id: 'b', descripcion: 'INESTABILIDAD CRONICA DE RODILLA', zonas: ['rodilla'], lado: 'no_especificado', estado: 'confirmada', gestiones: 25 },
  { id: 'c', descripcion: 'ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA', zonas: [], lado: 'no_especificado', estado: 'sin_asignar', gestiones: 4 },
  { id: 'd', descripcion: 'BIOPSIA', zonas: ['sin_zona_especifica'], lado: 'no_especificado', estado: 'confirmada', gestiones: 2 },
];
const escrituras = [];
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...ruta) => ruta.join('/'),
  doc: (_db, ...ruta) => ruta.join('/'),
  query: (c) => c, orderBy: vi.fn(), getDocs: async () => ({ docs: [] }),
  serverTimestamp: () => 'ahora',
  onSnapshot: (_ref, siguiente) => { siguiente({ docs: ENTRADAS.map((e) => ({ id: e.id, data: () => e })) }); return () => {}; },
  updateDoc: async (ref, datos) => { escrituras.push({ tipo: 'update', ref, datos }); },
  addDoc: async (ref, datos) => { escrituras.push({ tipo: 'log', ref, datos }); },
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana' } }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
let denegados = new Set();
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: (_r, s, el) => !denegados.has(`${s}.${el}`) }),
}));
vi.mock('../../../../hooks/useColumnasPermitidas', () => ({ useColumnasPermitidas: () => ({ ver: () => true }) }));

const { default: ZonasDiagnostico } = await import('./ZonasDiagnostico');

beforeEach(() => { escrituras.length = 0; denegados = new Set(); });
afterEach(cleanup);
const filas = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td').textContent);

describe('Zonas por diagnóstico', () => {
  it('lista con columnas, sin asignar primero y resaltada; filtra por estado y busca', () => {
    render(<ZonasDiagnostico />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Descripción', 'Zona(s)', 'Lateralidad', 'Estado', 'Gestiones', 'Acciones']);
    expect(filas()).toEqual(['ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA', 'RUPTURA MANGUITO ROTADORES', 'INESTABILIDAD CRONICA DE RODILLA', 'BIOPSIA']);
    const sinZona = screen.getByText('ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA').closest('tr');
    expect(sinZona.className).toMatch(/amber/);
    expect(within(sinZona).getByText('Sin asignar')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'sugerida' } });
    expect(filas()).toEqual(['RUPTURA MANGUITO ROTADORES']);
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'todos' } });
    fireEvent.change(screen.getByLabelText('Buscar descripción'), { target: { value: 'rodílla' } });
    expect(filas()).toEqual(['INESTABILIDAD CRONICA DE RODILLA']);
  });

  it('la búsqueda inicial viene del Bodymap', () => {
    render(<ZonasDiagnostico busquedaInicial="ARTROSCOPIA DIAGNOSTICA" />);
    expect(filas()).toEqual(['ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA']);
  });

  it('asignar zonas y lado: queda Confirmada y se registra en el historial', async () => {
    render(<ZonasDiagnostico />);
    fireEvent.click(screen.getByLabelText('Editar ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA'));
    const editor = screen.getByRole('dialog', { name: 'Asignar zonas' });
    fireEvent.click(within(editor).getByLabelText('Rodilla'));
    fireEvent.change(within(editor).getByLabelText('Lateralidad'), { target: { value: 'bilateral' } });
    expect(editor.querySelectorAll('path[data-activa]').length).toBeGreaterThan(0); // vista previa
    await act(async () => { fireEvent.click(within(editor).getByRole('button', { name: /Guardar/ })); });
    expect(escrituras[0]).toMatchObject({ tipo: 'update', ref: 'maestros_zonas_diagnostico/c', datos: { zonas: ['rodilla'], lado: 'bilateral', estado: 'confirmada', actualizadoPor: 'Ana' } });
    expect(escrituras[1]).toMatchObject({ tipo: 'log', ref: 'maestros_zonas_diagnostico/c/logs', datos: { accion: 'EDICION', antes: { zonas: [] }, despues: { zonas: ['rodilla'] } } });
  });

  it('confirmar una sugerencia de un clic', async () => {
    render(<ZonasDiagnostico />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Confirmar RUPTURA MANGUITO ROTADORES')); });
    expect(escrituras[0]).toMatchObject({ datos: { zonas: ['hombro'], estado: 'confirmada' } });
    expect(escrituras[1].datos.accion).toBe('CONFIRMACION');
  });

  it('sin permiso de editar ni confirmar no hay acciones de escritura', () => {
    denegados = new Set(['tabla_datos.action_editar', 'tabla_datos.action_confirmar']);
    render(<ZonasDiagnostico />);
    expect(screen.queryByLabelText(/^Editar /)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Confirmar /)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Historial de /)).toHaveLength(4);
  });

  it('"Sin zona específica": su propia categoría en la tabla y en el filtro, sin resaltar como pendiente', () => {
    render(<ZonasDiagnostico />);
    const fila = screen.getByText('BIOPSIA').closest('tr');
    expect(fila.className).not.toMatch(/amber/);
    expect(within(fila).getByText('Sin zona específica')).toBeInTheDocument();
    expect(within(fila).getByText('Confirmada')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'sin_zona_especifica' } });
    expect(filas()).toEqual(['BIOPSIA']);
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'confirmada' } });
    expect(filas()).toEqual(['INESTABILIDAD CRONICA DE RODILLA', 'BIOPSIA']);
  });

  it('asignar "Sin zona específica": excluye las demás zonas, lado no especificado y queda Confirmada', async () => {
    render(<ZonasDiagnostico />);
    fireEvent.click(screen.getByLabelText('Editar ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA'));
    const editor = screen.getByRole('dialog', { name: 'Asignar zonas' });
    fireEvent.click(within(editor).getByLabelText('Rodilla'));
    fireEvent.change(within(editor).getByLabelText('Lateralidad'), { target: { value: 'bilateral' } });
    fireEvent.click(within(editor).getByLabelText(/Sin zona específica/));
    expect(within(editor).getByLabelText('Rodilla')).not.toBeChecked();
    expect(within(editor).getByLabelText('Lateralidad')).toBeDisabled();
    expect(editor).toHaveTextContent('Quedará Confirmada: Sin zona específica');
    await act(async () => { fireEvent.click(within(editor).getByRole('button', { name: /Guardar/ })); });
    expect(escrituras[0].datos).toMatchObject({ zonas: ['sin_zona_especifica'], lado: 'no_especificado', estado: 'confirmada' });
  });

  it('marcar una zona real desmarca "Sin zona específica"', async () => {
    render(<ZonasDiagnostico />);
    fireEvent.click(screen.getByLabelText('Editar BIOPSIA'));
    const editor = screen.getByRole('dialog', { name: 'Asignar zonas' });
    expect(within(editor).getByLabelText(/Sin zona específica/)).toBeChecked();
    fireEvent.click(within(editor).getByLabelText('Rodilla'));
    expect(within(editor).getByLabelText(/Sin zona específica/)).not.toBeChecked();
    await act(async () => { fireEvent.click(within(editor).getByRole('button', { name: /Guardar/ })); });
    expect(escrituras[0].datos).toMatchObject({ zonas: ['rodilla'], estado: 'confirmada' });
  });
});
