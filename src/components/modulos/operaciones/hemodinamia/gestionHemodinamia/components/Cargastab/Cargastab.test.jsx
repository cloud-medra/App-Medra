// @vitest-environment jsdom
// Hemodinamia → Cargas (igual que Implantes) → ingreso de ítems con el teclado: después de agregar un ítem (o
// registrar una línea del contenido de un PAD) el foco vuelve a su campo
// Referencia; con un error de validación va al primer campo con error y no
// se pierde lo ingresado. Enter en el último campo agrega / registra.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const SUGERENCIAS = [
  { id: 's1', referencia: 'TORNILLO 3.5', codigo: 'C-1', precioNeto: 1000, empresa: 'ACME', clase: 'IMPLANTE' },
  { id: 's2', referencia: 'PAD RODILLA', codigo: 'C-2', precioNeto: 5000, empresa: 'ACME', clase: 'PAD' },
];
// Sugerencias en memoria (el hook real lee el catálogo de Firestore).
vi.mock('./useAutocompleteReferencia', () => ({
  useAutocompleteReferencia: (texto) => {
    const t = String(texto || '').trim().toUpperCase();
    const sugerencias = t ? SUGERENCIAS.filter((s) => s.referencia.includes(t)) : [];
    return {
      sugerencias, buscando: false, mostrarSug: sugerencias.length > 0 && !SUGERENCIAS.some((s) => s.referencia === t),
      setMostrarSug: () => {}, containerRef: { current: null }, portalRef: { current: null }, skipNext: { current: false },
    };
  },
}));
vi.mock('./verificacionPeriodoBloque', () => ({ verificarPeriodosBloque: vi.fn() }));
vi.mock('../../../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => true, hasAccesoProceso: () => false }),
}));
vi.mock('./CotizacionCard', () => ({ CotizacionCard: () => null }));

const { CargasTab } = await import('./Cargastab');

const onAgregarItem = vi.fn();
beforeEach(() => { vi.useFakeTimers(); onAgregarItem.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const montar = () => render(
  <CargasTab
    formData={{ bloques: [{ cotizaciones: [], solicitud: '' }] }}
    bloqueActivoIndex={0}
    onAgregarItem={onAgregarItem}
    periodoAbierto={{ anio: 2026, mes: 'OCTUBRE' }}
    cargandoPeriodo={false}
  />
);
const escribir = (label, valor) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
// El foco se pone después del re-render (setTimeout 0).
const esperarFoco = () => act(async () => { vi.runAllTimers(); });
const agregar = async () => { fireEvent.click(screen.getByTitle('Agregar ítem')); await esperarFoco(); };
const elegirSugerencia = (texto) => fireEvent.click(screen.getByText(texto).closest('button'));
const llenarItem = (referencia = 'TORNILLO 3.5') => {
  escribir('N° Cotización', 'COT-1');
  escribir('Referencia', referencia);
  escribir('Cantidad', '2');
};

describe('Cargas: foco después de "Agregar ítem"', () => {
  it('agregado: el ítem se envía y el foco queda en Referencia, vacía', async () => {
    montar();
    llenarItem();
    await agregar();
    expect(onAgregarItem).toHaveBeenCalledTimes(1);
    expect(onAgregarItem.mock.calls[0][1]).toMatchObject({ referencia: 'TORNILLO 3.5', cantidad: 2 });
    expect(screen.getByLabelText('Referencia')).toHaveFocus();
    expect(screen.getByLabelText('Referencia')).toHaveValue('');
    expect(screen.getByLabelText('N° Cotización')).toHaveValue('COT-1'); // como antes, se conserva
  });

  it('error: foco en el primer campo con error y no se pierde lo ingresado', async () => {
    montar();
    escribir('Referencia', 'TORNILLO 3.5');
    await agregar();
    expect(onAgregarItem).not.toHaveBeenCalled();
    expect(screen.getByLabelText('N° Cotización')).toHaveFocus();
    expect(screen.getByLabelText('Referencia')).toHaveValue('TORNILLO 3.5');

    escribir('N° Cotización', 'COT-1');
    await agregar();
    expect(screen.getByLabelText('Cantidad')).toHaveFocus();
    expect(screen.getByLabelText('Referencia')).toHaveValue('TORNILLO 3.5');
  });

  it('Enter en Vencimiento agrega el ítem y vuelve a Referencia', async () => {
    montar();
    llenarItem();
    fireEvent.keyDown(screen.getByLabelText('Vencimiento'), { key: 'Enter' });
    await esperarFoco();
    expect(onAgregarItem).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Referencia')).toHaveFocus();
  });

  it('Enter con error en Vencimiento no agrega: va al campo con error', async () => {
    montar();
    escribir('N° Cotización', 'COT-1');
    fireEvent.keyDown(screen.getByLabelText('Vencimiento'), { key: 'Enter' });
    await esperarFoco();
    expect(onAgregarItem).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Referencia')).toHaveFocus();
  });

  it('Enter en Referencia o en una sugerencia nunca agrega el ítem; la sugerencia se selecciona', async () => {
    montar();
    escribir('N° Cotización', 'COT-1');
    escribir('Referencia', 'TORN');
    escribir('Cantidad', '1');
    fireEvent.keyDown(screen.getByLabelText('Referencia'), { key: 'Enter' });
    const sugerencia = screen.getByText('TORNILLO 3.5').closest('button');
    fireEvent.keyDown(sugerencia, { key: 'Enter' });
    await esperarFoco();
    expect(onAgregarItem).not.toHaveBeenCalled();
    // Enter sobre un botón enfocado lo activa (click del navegador): selecciona.
    elegirSugerencia('TORNILLO 3.5');
    expect(screen.getByLabelText('Referencia')).toHaveValue('TORNILLO 3.5');
    expect(onAgregarItem).not.toHaveBeenCalled();
  });

  it('otras teclas en Vencimiento no hacen nada', () => {
    montar();
    llenarItem();
    fireEvent.keyDown(screen.getByLabelText('Vencimiento'), { key: 'Tab' });
    expect(onAgregarItem).not.toHaveBeenCalled();
  });
});

describe('Cargas: contenido de un PAD', () => {
  const abrirPad = () => {
    montar();
    escribir('N° Cotización', 'COT-1');
    escribir('Referencia', 'PAD');
    elegirSugerencia('PAD RODILLA');
    escribir('Cantidad', '1');
  };
  const registrar = async () => { fireEvent.click(screen.getByTitle('Registrar esta línea de contenido')); await esperarFoco(); };

  it('registrar una línea deja el foco en "Referencia contenido" (no en la principal)', async () => {
    abrirPad();
    escribir('Referencia contenido', 'TORNILLO 3.5');
    escribir('Cantidad contenido', '3');
    await registrar();
    expect(screen.getByLabelText('Referencia contenido')).toHaveFocus();
    expect(screen.getByLabelText('Referencia contenido')).toHaveValue('');
    expect(screen.getByText('TORNILLO 3.5')).toBeInTheDocument(); // línea registrada
    expect(onAgregarItem).not.toHaveBeenCalled(); // el PAD aún no se agrega
    expect(screen.getByLabelText('Referencia')).toHaveValue('PAD RODILLA');
  });

  it('error: foco en el primer campo con error del contenido, sin perder datos', async () => {
    abrirPad();
    escribir('Cantidad contenido', '2');
    await registrar();
    expect(screen.getByLabelText('Referencia contenido')).toHaveFocus();
    expect(screen.getByLabelText('Cantidad contenido')).toHaveValue(2);
    escribir('Referencia contenido', 'TORNILLO 3.5');
    escribir('Cantidad contenido', '');
    await registrar();
    expect(screen.getByLabelText('Cantidad contenido')).toHaveFocus();
    expect(screen.getByLabelText('Referencia contenido')).toHaveValue('TORNILLO 3.5');
  });

  it('Enter en Vencimiento del contenido registra la línea; no agrega el ítem principal', async () => {
    abrirPad();
    escribir('Referencia contenido', 'TORNILLO 3.5');
    escribir('Cantidad contenido', '1');
    fireEvent.keyDown(screen.getByLabelText('Vencimiento contenido'), { key: 'Enter' });
    await esperarFoco();
    expect(screen.getByLabelText('Referencia contenido')).toHaveFocus();
    expect(screen.getByLabelText('Referencia contenido')).toHaveValue('');
    expect(onAgregarItem).not.toHaveBeenCalled();
  });

  it('agregar el PAD (con su contenido) vuelve a la Referencia principal', async () => {
    abrirPad();
    escribir('Referencia contenido', 'TORNILLO 3.5');
    escribir('Cantidad contenido', '1');
    await registrar();
    await agregar();
    expect(onAgregarItem).toHaveBeenCalledTimes(2); // PAD + 1 línea de contenido
    expect(screen.getByLabelText('Referencia')).toHaveFocus();
    expect(screen.queryByLabelText('Referencia contenido')).not.toBeInTheDocument();
  });
});

describe('Hemodinamia Cargas: igual que Implantes', () => {
  it('muestra las notas de la admisión', () => {
    render(
      <CargasTab
        formData={{ bloques: [{ cotizaciones: [], solicitud: '' }], descripcion: 'ANGIOPLASTIA', observacion: 'SIN OBS' }}
        bloqueActivoIndex={0}
        onAgregarItem={onAgregarItem}
        periodoAbierto={{ anio: 2026, mes: 'OCTUBRE' }}
        cargandoPeriodo={false}
      />
    );
    expect(screen.getByText('Notas de la admisión')).toBeInTheDocument();
  });

  it('las líneas ya registradas del contenido del PAD se pueden editar', async () => {
    montar();
    escribir('N° Cotización', 'COT-1');
    escribir('Referencia', 'PAD');
    elegirSugerencia('PAD RODILLA');
    escribir('Cantidad', '1');
    escribir('Referencia contenido', 'TORNILLO 3.5');
    escribir('Cantidad contenido', '2');
    fireEvent.click(screen.getByTitle('Registrar esta línea de contenido'));
    await esperarFoco();
    expect(screen.getByRole('table', { name: 'Contenido del PAD registrado' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar TORNILLO 3.5' }));
    expect(screen.getByRole('group', { name: 'Editar TORNILLO 3.5' })).toBeInTheDocument();
  });
});

