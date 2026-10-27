// @vitest-environment jsdom
// Maestros → Descripciones ocultas: listado con filas, buscador normalizado,
// estado (Pendiente / Visible / Oculta) con su filtro y conteo, orden por
// cantidad de filas, switches por módulo y "Marcar como revisada" (con permiso).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const ENTRADAS = [
  { id: 'CESAREA', descripcion: 'CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA', filas: 40, ocultaImplantes: true, ocultaDocumentos: false },
  { id: 'RODILLA', descripcion: 'ARTROSCOPIA RODILLA', filas: 120 },
  { id: 'HOMBRO', descripcion: 'ARTROSCOPIA HOMBRO', filas: 8, ocultaImplantes: false, ocultaDocumentos: false },
  // Nueva, creada por el trigger y sin revisar.
  { id: 'LUMBAR', descripcion: 'HERNIA LUMBAR', filas: 3, pendienteDesde: 't' },
  // Nueva pero ya revisada (alguien la tocó).
  { id: 'CADERA', descripcion: 'PROTESIS CADERA', filas: 2, pendienteDesde: 't', actualizadoEl: 't2' },
];
const escrituras = [];
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...ruta) => ruta.join('/'),
  doc: (_db, ...ruta) => ruta.join('/'),
  serverTimestamp: () => 'ahora',
  onSnapshot: (_ref, siguiente) => { siguiente({ docs: ENTRADAS.map((e) => ({ id: e.id, data: () => e })) }); return () => {}; },
  updateDoc: async (ref, datos) => { escrituras.push({ ref, datos }); },
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana' } }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
let denegados = new Set();
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: (_r, s, el) => !denegados.has(`${s}.${el}`) }),
}));
vi.mock('../../../../hooks/useColumnasPermitidas', () => ({ useColumnasPermitidas: () => ({ ver: () => true }) }));

const { default: DescripcionesOcultas } = await import('./DescripcionesOcultas');

beforeEach(() => { escrituras.length = 0; denegados = new Set(); });
afterEach(cleanup);
const filas = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('[data-descripcion]').textContent);
const estados = () => Object.fromEntries(screen.getAllByRole('row').slice(1).map((r) => [r.querySelector('[data-descripcion]').textContent, r.dataset.estado]));

describe('Descripciones ocultas', () => {
  it('lista con columnas, ordena por filas y filtra por estado; busca sin tildes', () => {
    render(<DescripcionesOcultas />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Descripción', 'Filas', 'Ocultar en Implantes', 'Ocultar en Documentos']);
    expect(filas()).toEqual(['ARTROSCOPIA RODILLA', 'CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA', 'ARTROSCOPIA HOMBRO', 'HERNIA LUMBAR', 'PROTESIS CADERA']);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por cantidad de filas' }));
    expect(filas()).toEqual(['PROTESIS CADERA', 'HERNIA LUMBAR', 'ARTROSCOPIA HOMBRO', 'CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA', 'ARTROSCOPIA RODILLA']);
    fireEvent.change(screen.getByLabelText('Filtrar descripciones'), { target: { value: 'oculta' } });
    expect(filas()).toEqual(['CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA']);
    fireEvent.change(screen.getByLabelText('Filtrar descripciones'), { target: { value: 'visible' } });
    expect(filas()).toEqual(['PROTESIS CADERA', 'ARTROSCOPIA HOMBRO', 'ARTROSCOPIA RODILLA']);
    fireEvent.change(screen.getByLabelText('Filtrar descripciones'), { target: { value: 'pendiente' } });
    expect(filas()).toEqual(['HERNIA LUMBAR']);
    fireEvent.change(screen.getByLabelText('Filtrar descripciones'), { target: { value: 'todas' } });
    fireEvent.change(screen.getByLabelText('Buscar descripción'), { target: { value: 'cesárea  c/s' } });
    expect(filas()).toEqual(['CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA']);
  });

  it('un switch por módulo: ocultar en Documentos y volver a mostrar en Implantes', async () => {
    render(<DescripcionesOcultas />);
    const cesarea = screen.getByText('CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA').closest('tr');
    const [impl, docs] = within(cesarea).getAllByRole('switch');
    expect(impl).toHaveAttribute('aria-checked', 'true');
    expect(docs).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(docs); });
    expect(escrituras[0]).toMatchObject({ ref: 'maestros_descripciones_reporte/CESAREA', datos: { ocultaDocumentos: true, actualizadoPor: 'Ana' } });
    await act(async () => { fireEvent.click(impl); });
    expect(escrituras[1].datos).toMatchObject({ ocultaImplantes: false });
    // Una descripción nueva (sin switches guardados) se ve como visible.
    const nueva = screen.getByText('ARTROSCOPIA RODILLA').closest('tr');
    within(nueva).getAllByRole('switch').forEach((s) => expect(s).toHaveAttribute('aria-checked', 'false'));
  });

  it('estado de cada una: las anteriores al campo nuevo cuentan como revisadas; conteo por estado', () => {
    render(<DescripcionesOcultas />);
    expect(estados()).toEqual({
      'ARTROSCOPIA RODILLA': 'visible',
      'CESAREA C/S SALPINGOLIGADURA O SALPINGECTOMIA': 'oculta',
      'ARTROSCOPIA HOMBRO': 'visible',
      'HERNIA LUMBAR': 'pendiente',
      'PROTESIS CADERA': 'visible',
    });
    const conteo = screen.getByLabelText('Cantidad por estado');
    expect(conteo).toHaveTextContent('5 descripciones');
    ['1 pendientes', '3 visibles', '1 ocultas'].forEach((t) => expect(within(conteo).getByText(t)).toBeInTheDocument());
    expect(within(screen.getByLabelText('Filtrar descripciones')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Todas (5)', 'Pendientes (1)', 'Visibles (3)', 'Ocultas (1)']);
  });

  it('"Marcar como revisada" solo en las pendientes y escribe solo la firma de revisión', async () => {
    render(<DescripcionesOcultas />);
    const botones = screen.getAllByRole('button', { name: /^Marcar como revisada/ });
    expect(botones).toHaveLength(1);
    await act(async () => { fireEvent.click(botones[0]); });
    expect(escrituras[0]).toEqual({
      ref: 'maestros_descripciones_reporte/LUMBAR',
      datos: { actualizadoPor: 'Ana', actualizadoPorUid: 'u1', actualizadoEl: 'ahora' },
    });
  });

  it('sin permiso de edición, los switches quedan deshabilitados y no se puede marcar revisada', () => {
    denegados = new Set(['tabla_datos.action_editar']);
    render(<DescripcionesOcultas />);
    screen.getAllByRole('switch').forEach((s) => expect(s).toBeDisabled());
    expect(screen.queryByRole('button', { name: /^Marcar como revisada/ })).toBeNull();
  });
});
