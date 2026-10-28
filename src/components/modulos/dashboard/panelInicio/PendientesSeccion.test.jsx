// @vitest-environment jsdom
// Inicio → Pendientes (pantalla): números, Al día, No disponible, cirugías
// con "Ver todas" y navegación con filtro. Las lecturas se simulan en
// LECTURAS (usePendientesInicioData), con su caché real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../operaciones/implantes/fibras/fibrasTransacciones', () => ({ leerTodasLasFibras: vi.fn() }));
vi.mock('../../operaciones/implantes/fibras/useFibrasReutilizablesData', () => ({ leerCodigosFibra: vi.fn() }));

const { LECTURAS, olvidarPendientesInicio, recordar, TTL_MS } = await import('./usePendientesInicioData');
const { default: PendientesSeccion } = await import('./PendientesSeccion.jsx');

afterEach(cleanup);

const todos = { implantes: true, abreSolicitud: true, cirugias: ['implantes', 'hemodinamia'], fibras: true };
const caja = (etiqueta) => screen.getByText(etiqueta).parentElement;
const FIBRAS_OK = { indicadores: { ultimoUso: { n: 1, referencias: ['R1'] }, vencenPronto: { n: 0, referencias: [] }, vencidas: { n: 2, referencias: ['R3', 'R4'] }, bodegaSinUso: { n: 0, referencias: [] }, sinDisponibles: { n: 0, referencias: [] } } };

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
      cirugias: async (modulo) => ({
        lista: Array.from({ length: modulo === 'implantes' ? 4 : 3 }, (_, i) => ({
          clave: `${modulo}:${i}`, modulo, gestionId: String(100 + i), paciente: `${modulo === 'implantes' ? 'P' : 'H'}${i}`, medico: 'Dr. X',
        })),
      }),
      fibras: async () => FIBRAS_OK,
    });
  });

  it('muestra los números, "Al día" en los que están en 0 y la suma de Por revisar', async () => {
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    await waitFor(() => expect(caja('Por imputar').textContent).toContain('4'));
    expect(caja('Incompletas').textContent).toContain('Al día');
    expect(caja('Por revisar').textContent).toContain('3');
    expect(caja('Vencidas').textContent).toContain('2');
    expect(caja('Vencen en 30 días').textContent).toContain('Al día');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('una lectura fallida muestra "No disponible" con aviso, nunca 0 ni "Al día"', async () => {
    espiar({ incompletas: async () => { throw new Error('FAILED_PRECONDITION'); }, fibras: async () => { throw new Error('x'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PendientesSeccion bloques={todos} onAbrir={vi.fn()} />);
    await waitFor(() => expect(caja('Incompletas').textContent).toContain('No disponible'));
    expect(caja('Incompletas').textContent).not.toContain('Al día');
    expect(caja('En su último uso').textContent).toContain('No disponible');
    expect(caja('Por comprar').textContent).not.toMatch(/\b0\b/);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('cirugías: lista las primeras 5 (con HEM), la cantidad total y "Ver todas" por módulo', async () => {
    const onAbrir = vi.fn();
    render(<PendientesSeccion bloques={todos} onAbrir={onAbrir} />);
    const hoy = await screen.findByLabelText(/^Hoy/);
    await waitFor(() => expect(hoy.textContent).toContain('7'));
    expect(hoy.querySelectorAll('li')).toHaveLength(5);
    expect(hoy.textContent).toContain('HEM');
    expect(hoy.textContent).toContain('ID 100');
    fireEvent.click(screen.getAllByText('Ver todas en Hemodinamia')[0]);
    expect(onAbrir).toHaveBeenCalledWith('hemodinamia', '/hemodinamia/gestionHemodinamia', expect.objectContaining({ rango: 'soloHoy' }));
  });

  it('cada indicador abre su pantalla con el filtro', async () => {
    const onAbrir = vi.fn();
    render(<PendientesSeccion bloques={todos} onAbrir={onAbrir} />);
    await waitFor(() => expect(caja('En su último uso').textContent).toContain('1'));
    fireEvent.click(caja('Incompletas'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/gestionImplantes', expect.objectContaining({ estados: ['INCOMPLETO'] }));
    fireEvent.click(caja('Por imputar'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/solicitudImplantes');
    fireEvent.click(caja('En su último uso'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/fibrasReutilizables', { texto: 'R1' });
    fireEvent.click(caja('Vencidas'));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/fibrasReutilizables', null);
    fireEvent.click(screen.getByText(/agendadas sin cargar/));
    expect(onAbrir).toHaveBeenLastCalledWith('implantes', '/implantes/gestionImplantes', expect.objectContaining({ rango: 'hastaAyer' }));
  });

  it('sin Solicitud, Por imputar se ve pero no abre nada', async () => {
    render(<PendientesSeccion bloques={{ ...todos, abreSolicitud: false }} onAbrir={vi.fn()} />);
    await waitFor(() => expect(caja('Por imputar').textContent).toContain('4'));
    expect(caja('Por imputar').tagName).toBe('DIV');
  });

  it('solo pide y muestra los bloques permitidos', async () => {
    render(<PendientesSeccion bloques={{ implantes: false, abreSolicitud: false, cirugias: ['hemodinamia'], fibras: false }} onAbrir={vi.fn()} />);
    await screen.findByLabelText(/^Hoy/);
    expect(screen.queryByText('Por imputar')).toBeNull();
    expect(screen.queryByText('Vencidas')).toBeNull();
    expect(LECTURAS.porImputar).not.toHaveBeenCalled();
    expect(LECTURAS.fibras).not.toHaveBeenCalled();
    expect(LECTURAS.cirugias.mock.calls.map((c) => c[0])).toEqual(['hemodinamia', 'hemodinamia']);
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
