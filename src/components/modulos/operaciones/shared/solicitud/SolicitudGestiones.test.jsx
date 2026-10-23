// @vitest-environment jsdom
// Solicitud de Hemodinamia = Solicitud de Implantes: misma pantalla (mismas
// columnas y validaciones), mismo Excel (hojas, columnas y orden); solo
// cambia lo propio del módulo (colecciones, centro, atributo, nombres).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
let datosHook = {};
const modulosPedidos = [];
vi.mock('./useSolicitudGestionesData', async (original) => ({
  ...(await original()),
  useSolicitudGestionesData: (modulo) => {
    modulosPedidos.push(modulo);
    return {
      bloques: [], cargando: false, exportando: false, seleccionados: new Set(),
      toggleSeleccion: vi.fn(), toggleSeleccionarTodos: vi.fn(), handleExportarYMarcarSolicitado: vi.fn(), ...datosHook,
    };
  },
}));
vi.mock('../usePeriodoAbiertoModulo', () => ({ usePeriodoAbiertoModulo: (m) => ({ periodoAbierto: { anio: 2026, mes: 'octubre', modulo: m }, cargandoPeriodo: false }) }));

const { default: SolicitudGestiones } = await import('./SolicitudGestiones');
const { construirFilasExcelSolicitud } = await import('./useSolicitudGestionesData');
const { MODULOS_GESTION, rangoGestiones } = await import('../modulosGestion');

afterEach(() => { cleanup(); datosHook = {}; modulosPedidos.length = 0; });

const encabezados = () => screen.getAllByRole('columnheader').map((th) => th.textContent.trim());
const bloque = (items) => ({
  refPath: 'x/1', gestionId: '123', nombre: 'ANA', medico: 'DR', empresa: 'ACME', fecha: '2026-10-01', centro: 'C', prevision: 'FONASA',
  numCotizacion: 'COT', fechaRegistroAdmision: null, items,
});
const item = { id: 'i1', codigo: 'C-1', referencia: 'REF-1', descriptorAuto: 'TORNILLO', cantidad: 2, precio: 10, venta: 20, tipoVinculado: 'T', lote: 'L', vencimiento: '2027-01-01' };

describe('Solicitud: misma pantalla en Implantes y Hemodinamia', () => {
  it('mismas columnas, en el mismo orden; título y período del módulo', () => {
    render(<SolicitudGestiones modulo="implantes" />);
    const implantes = encabezados();
    expect(screen.getByText(/SOLICITUD DE IMPLANTES/)).toBeInTheDocument();
    expect(screen.getByText(/Período abierto para Implantes/)).toBeInTheDocument();
    cleanup();
    render(<SolicitudGestiones modulo="hemodinamia" />);
    expect(encabezados()).toEqual(implantes);
    expect(screen.getByText(/SOLICITUD DE HEMODINAMIA/)).toBeInTheDocument();
    expect(screen.getByText(/Período abierto para Hemodinamia/)).toBeInTheDocument();
    expect(modulosPedidos).toEqual(['implantes', 'hemodinamia']);
  });

  it.each(['implantes', 'hemodinamia'])('%s: "Descripción" muestra descriptorAuto (criterio de Implantes)', (modulo) => {
    datosHook = { bloques: [bloque([item])] };
    render(<SolicitudGestiones modulo={modulo} />);
    const fila = screen.getByText('TORNILLO').closest('tr');
    expect(within(fila).queryByText('REF-1')).not.toBeInTheDocument();
  });

  it.each(['implantes', 'hemodinamia'])('%s: el texto de la tabla se puede seleccionar (sin select-none)', (modulo) => {
    datosHook = { bloques: [bloque([item])] };
    render(<SolicitudGestiones modulo={modulo} />);
    let el = screen.getByText('TORNILLO');
    for (; el; el = el.parentElement) expect(el.className || '').not.toMatch(/\bselect-none\b/);
  });
});

describe('Solicitud: Excel', () => {
  it('dos hojas con las mismas columnas y orden para cualquier módulo', () => {
    const { filas, filasResumen } = construirFilasExcelSolicitud([bloque([item]), bloque([])], '13-10-2026');
    expect(Object.keys(filas[0])).toEqual(['ID', 'PACIENTE', 'MEDICO', 'FECHA', 'EMPRESA', 'CODIGO', 'DESCRIPCION', 'CANTIDAD', 'PRECIO', 'ATRIBUTO', 'FECHA REGISTRO', 'FECHA CARGA', 'N° COTIZACION', 'FECHA INGRESO', 'LOTE', 'VENCIMIENTO']);
    expect(Object.keys(filas[1])).toEqual(Object.keys(filas[0]));
    expect(Object.keys(filasResumen[0])).toEqual(['Ingreso', 'Area', 'Previsión', 'Id', 'Cód', 'Cant', 'Venta', 'Médico', 'Fecha', 'Descripción', 'Estado']);
    expect(filas[0]).toMatchObject({ DESCRIPCION: 'TORNILLO', FECHA: '01-10-2026', VENCIMIENTO: '01-01-2027' });
  });

  it('nombres de hoja y archivo por módulo', () => {
    expect(MODULOS_GESTION.implantes).toMatchObject({ hojaSolicitud: 'Solicitud Implantes', archivoSolicitud: 'solicitud_implantes' });
    expect(MODULOS_GESTION.hemodinamia).toMatchObject({ hojaSolicitud: 'Solicitud Hemodinamia', archivoSolicitud: 'solicitud_hemodinamia' });
  });
});

describe('modulosGestion: lo propio de cada módulo', () => {
  it('colecciones, centro y atributo', () => {
    const { implantes, hemodinamia } = MODULOS_GESTION;
    expect([implantes.coleccionGestiones, implantes.coleccionImputadas]).toEqual(['implantes_gestiones', 'implantes_imputadas']);
    expect([hemodinamia.coleccionGestiones, hemodinamia.coleccionImputadas]).toEqual(['hemodinamia_gestiones', 'hemodinamia_imputadas']);
    expect(implantes.centroDe({ centro: 'UCI' })).toBe('UCI');
    expect(implantes.centroDe({})).toBe('PABELLON');
    expect(hemodinamia.centroDe({ centro: 'UCI' })).toBe('HEMODINAMIA');
    expect([implantes.atributoPorDefecto, hemodinamia.atributoPorDefecto]).toEqual(['IMPLANTES', 'HEMODINAMIA']);
  });

  it('rango de documentId() del collectionGroup acotado a la colección del módulo', () => {
    expect(rangoGestiones(MODULOS_GESTION.hemodinamia)).toEqual({ min: 'hemodinamia_gestiones/0000', max: 'hemodinamia_gestiones/9999' });
  });
});
