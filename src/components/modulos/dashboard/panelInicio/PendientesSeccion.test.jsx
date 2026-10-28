// @vitest-environment jsdom
// Inicio → Pendientes (pantalla): resumen de cantidades, Al día, No
// disponible, cirugías por módulo (HEM), uso de fibras por referencia y
// navegación con filtro. Las lecturas se simulan en LECTURAS
// (usePendientesInicioData), con su caché real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const getDocs = vi.fn();
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(), documentId: vi.fn(), getCountFromServer: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: (...a) => getDocs(...a),
}));
vi.mock('../../operaciones/implantes/fibras/fibrasTransacciones', () => ({ leerTodasLasFibras: vi.fn() }));
vi.mock('../../operaciones/implantes/fibras/useFibrasReutilizablesData', () => ({ leerCodigosFibra: vi.fn() }));

const { LECTURAS, olvidarPendientesInicio, recordar, TTL_MS } = await import('./usePendientesInicioData');
const { default: PendientesSeccion } = await import('./PendientesSeccion.jsx');

afterEach(cleanup);

const todos = { implantes: true, abreSolicitud: true, cirugias: ['implantes', 'hemodinamia'], fibras: true };
const linea = (texto) => screen.getByText(texto).closest('button, div');
const FIBRAS_OK = {
  referencias: [
    { referencia: 'FL-1000', uso: { consumidos: 8, totales: 10, alerta: null } },
    { referencia: 'FL-365', uso: { consumidos: 4, totales: 5, alerta: 'ambar' } },
    { referencia: 'FL-600', uso: { consumidos: 2, totales: 10, alerta: 'rojo' } },
    { referencia: 'FL-200', uso: null },
  ],
};

const espiar = (valores) => {
  Object.entries(valores).forEach(([k, v]) => vi.spyOn(LECTURAS, k).mockImplementation(v));
};

describe('Inicio — Pendientes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    olvidarPendientesInicio();
    espiar({
      porImputar: async () => ({ n: 4 }),
      incompletas: async () => ({ n: 0 }),
      enRevision: async () => ({ n: 2 }),
      agendadasVencidas: async () => ({ n: 1 }),
      cirugias: async (modulo, dia) => ({ n: modulo === 'implantes' ? (dia.endsWith('-28') ? 1 : 3) : 2 }),
      fibras: async () => FIBRAS_OK,
    });
  });

  it('Implantes: solo nombre y número, "Al día" en 0 y Por revisar sumado', async () => {
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    await waitFor(() => expect(linea('Por imputar').textContent).toBe('Por imputar4'));
    expect(linea('Incompletas').textContent).toContain('Al día');
    expect(linea('Por revisar').textContent).toBe('Por revisar3');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cirugías: solo cantidades de hoy y mañana, con una línea HEM aparte', async () => {
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    const impl = screen.getByLabelText('Cirugías Implantes');
    const hem = screen.getByLabelText('Cirugías Hemodinamia');
    await waitFor(() => expect(hem.textContent).toContain('2'));
    expect(within(impl).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Hoy \d\d-\d\d\d+$/), expect.stringMatching(/^Mañana \d\d-\d\d\d+$/),
    ]);
    expect(impl.textContent).not.toContain('HEM');
    expect(within(hem).getAllByText('HEM')).toHaveLength(2);
    expect(screen.queryByText(/Ver todas/)).toBeNull();
    expect(document.querySelectorAll('li')).toHaveLength(0);
  });

  it('fibras: una línea por referencia con su uso, el color de la alerta y "Sin fibra en uso"', async () => {
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    await waitFor(() => expect(linea('FL-1000').textContent).toBe('FL-10008/10'));
    expect(screen.getByText('4/5').className).toMatch(/amber/);
    expect(screen.getByText('2/10').className).toMatch(/red/);
    expect(screen.getByText('8/10').className).not.toMatch(/amber|red/);
    expect(linea('FL-200').textContent).toContain('Sin fibra en uso');
    expect(screen.queryByText(/último uso|Vencidas|Por comprar/)).toBeNull();
  });

  it('una lectura fallida muestra "No disponible" con aviso, nunca 0 ni "Al día"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    espiar({
      incompletas: async () => { throw new Error('FAILED_PRECONDITION'); },
      cirugias: async () => { throw new Error('x'); },
      fibras: async () => { throw new Error('x'); },
    });
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    await waitFor(() => expect(linea('Incompletas').textContent).toContain('No disponible'));
    expect(linea('Incompletas').textContent).not.toContain('Al día');
    await waitFor(() => expect(screen.getByLabelText('Cirugías Implantes').textContent).toContain('No disponible'));
    expect(screen.getByLabelText('Cirugías Implantes').textContent).not.toMatch(/\d\d-\d\d0/);
    expect(linea('Uso de fibras').textContent).toContain('No disponible');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('cada línea abre su pantalla con el filtro', async () => {
    const onAbrir = vi.fn();
    render(<PendientesSeccion bloques={todos} onAbrir={onAbrir} />);
    await waitFor(() => expect(linea('FL-200').tagName).toBe('BUTTON'));
    fireEvent.click(linea('Incompletas'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/gestionImplantes', expect.objectContaining({ estados: ['INCOMPLETO'] }));
    fireEvent.click(linea('Por imputar'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/solicitudImplantes');
    fireEvent.click(linea('Por revisar'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/gestionImplantes', expect.objectContaining({ rango: 'todos' }));
    fireEvent.click(within(screen.getByLabelText('Cirugías Hemodinamia')).getByText(/^Mañana/).closest('button'));
    expect(onAbrir).toHaveBeenLastCalledWith('hemodinamia', '/hemodinamia/gestionHemodinamia', expect.objectContaining({ rango: 'desdeManana' }));
    fireEvent.click(linea('FL-365'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/fibrasReutilizables', { texto: 'FL-365' });
  });

  it('sin Solicitud, Por imputar se ve pero no abre nada', async () => {
    render(<PendientesSeccion bloques={{ ...todos, abreSolicitud: false }} onAbrir={vi.fn()} />);
    await waitFor(() => expect(linea('Por imputar').textContent).toContain('4'));
    expect(linea('Por imputar').tagName).toBe('DIV');
  });

  it('solo pide y muestra los bloques permitidos (solo Hemodinamia: una línea HEM)', async () => {
    render(<PendientesSeccion bloques={{ implantes: false, abreSolicitud: false, cirugias: ['hemodinamia'], fibras: false }} onAbrir={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Cirugías Hemodinamia').textContent).toContain('2'));
    expect(screen.queryByLabelText('Cirugías Implantes')).toBeNull();
    expect(screen.queryByText('Por imputar')).toBeNull();
    expect(screen.queryByText('Fibras')).toBeNull();
    expect(LECTURAS.porImputar).not.toHaveBeenCalled();
    expect(LECTURAS.fibras).not.toHaveBeenCalled();
    expect(LECTURAS.cirugias.mock.calls.map((c) => c[0])).toEqual(['hemodinamia', 'hemodinamia']);
  });
});

describe('cirugías sin nombres de pacientes', () => {
  beforeEach(() => { vi.restoreAllMocks(); olvidarPendientesInicio(); });

  it('la lectura devuelve solo la cantidad de admisiones distintas', async () => {
    const doc = (id, datos) => ({ ref: { path: `implantes_gestiones/x/${id}` }, get: (c) => datos[c], data: () => datos });
    getDocs.mockResolvedValue({ docs: [
      doc('a', { gestionId: '10', nombre: 'Ana Pérez', medico: 'Dr. Soto' }),
      doc('b', { gestionId: '10', nombre: 'Ana Pérez', medico: 'Dr. Soto' }),
      doc('c', { gestionId: '11', nombre: 'Luis Rojas', medico: 'Dra. Vera' }),
    ] });
    const r = await LECTURAS.cirugias('implantes', '2026-10-28');
    expect(r).toEqual({ n: 2 });
    expect(JSON.stringify(r)).not.toMatch(/Ana|Luis|Soto|Vera/);
  });
});

describe('caché de 5 minutos', () => {
  beforeEach(() => olvidarPendientesInicio());

  it('no vuelve a leer dentro de 5 minutos y sí después', async () => {
    const leer = vi.fn(async () => ({ n: 1 }));
    await recordar('k', leer, 0);
    await recordar('k', leer, TTL_MS - 1);
    expect(leer).toHaveBeenCalledTimes(1);
    await recordar('k', leer, TTL_MS + 1);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it('un error no queda guardado', async () => {
    const leer = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ n: 2 });
    await expect(recordar('e', leer, 0)).rejects.toThrow('x');
    await expect(recordar('e', leer, 1)).resolves.toEqual({ n: 2 });
  });
});
