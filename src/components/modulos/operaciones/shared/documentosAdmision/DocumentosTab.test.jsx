// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { rol: 'dev' } }) }));
vi.mock('../../implantes/respaldoDocumentos/respaldoService', () => ({ subirRespaldo: vi.fn() }));
vi.mock('./documentosStorage', () => ({
  subirTandaAdmision: vi.fn(),
  obtenerBlobDocumento: vi.fn(async (ruta) => new Blob([ruta], { type: 'application/pdf' }))
}));
// La zona de subida simulada expone los archivos de prueba en `globalThis.__archivosPrueba`.
vi.mock('./ZonaSubidaPdf', () => ({
  ZonaSubidaPdf: ({ onArchivos }) => (
    <div data-testid="zona-subida">
      <button type="button" onClick={() => onArchivos(globalThis.__archivosPrueba || [])}>simular subida</button>
    </div>
  )
}));

import { DocumentosTab } from './DocumentosTab';

const doc = (nombre, tipo) => ({ nombre, ruta: `implantes/100/documentos/${nombre}`, tipo });
const LISTA = [
  doc('100 - ANA - COT 1 - EMP.pdf', 'COT'),
  doc('100 - ANA - DP.pdf', 'DP'),
  doc('100 - ANA - OTRO.pdf', null)
];

const renderTab = (documentos) => render(
  <DocumentosTab idAdmision="100" gestionId="100" nombre="ANA" documentos={documentos} onRecargar={vi.fn()} onDocumentosSubidos={vi.fn()} />
);

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn((blob) => `blob:${blob.size}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe('DocumentosTab', () => {
  it('muestra encabezado con total y agrupa por tipo con su cantidad', () => {
    renderTab({ lista: LISTA, cargando: false, error: null });

    expect(screen.getByText('Documentos de la Admisión')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('DP — Datos Personales')).toBeInTheDocument();
    expect(screen.getByText('COT — Cotización')).toBeInTheDocument();
    expect(screen.getByText('Sin tipo')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Tipo' })).not.toBeInTheDocument();
    expect(screen.getByTitle('100 - ANA - DP.pdf')).toBeInTheDocument();
    // La zona de subida está plegada si ya hay documentos.
    expect(screen.queryByTestId('zona-subida')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Subir documentos/ }));
    expect(screen.getByTestId('zona-subida')).toBeInTheDocument();
  });

  it('estado vacío con la zona de subida abierta, y estado de carga', () => {
    renderTab({ lista: [], cargando: false, error: null });
    expect(screen.getByText('Esta admisión aún no tiene documentos')).toBeInTheDocument();
    expect(screen.getByTestId('zona-subida')).toBeInTheDocument();
    cleanup();

    renderTab({ lista: [], cargando: true, error: null });
    expect(screen.getByLabelText('Cargando documentos')).toBeInTheDocument();
  });

  it('Ver abre un solo visor y navega al siguiente documento sin cerrarlo', async () => {
    renderTab({ lista: LISTA, cargando: false, error: null });

    fireEvent.click(screen.getAllByTitle('Ver')[0]);
    const visor = await screen.findByRole('dialog');
    // Orden en pantalla: DP, COT, Sin tipo.
    expect(within(visor).getByText(/1 de 3/)).toBeInTheDocument();
    await waitFor(() => expect(visor.querySelectorAll('iframe')).toHaveLength(1));
    expect(within(visor).getByTitle('Documento anterior (←)')).toBeDisabled();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(visor).getByText(/2 de 3/)).toBeInTheDocument();
    expect(within(visor).getByRole('heading')).toHaveTextContent('100 - ANA - COT 1 - EMP.pdf');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la categoría va en la primera fila del grupo y abarca todas sus filas, con ícono PDF', () => {
    renderTab({ lista: [...LISTA, doc('100 - ANA - COT 2 - EMP.pdf', 'COT')], cargando: false, error: null });

    const celdaCot = screen.getByText('COT — Cotización').closest('td');
    expect(celdaCot).toHaveAttribute('rowspan', '2');
    expect(celdaCot).toHaveTextContent('· 2');
    expect(screen.getAllByText('COT — Cotización')).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: 'PDF' })).toHaveLength(4);
  });

  it('un PDF de otra admisión se puede enviar al respaldo, con sus datos leídos del nombre', async () => {
    const { subirTandaAdmision } = await import('./documentosStorage');
    subirTandaAdmision.mockResolvedValue({ lista: [], subidos: [], fallidos: [], sinPermiso: false });
    globalThis.__archivosPrueba = [new File(['x'], '555 - LUIS SOTO - COT 9 - EMP.pdf', { type: 'application/pdf' })];
    renderTab({ lista: [], cargando: false, error: null });
    fireEvent.click(screen.getByText('simular subida'));
    const boton = await screen.findByRole('button', { name: /Enviar 1 a respaldo/ });
    fireEvent.click(boton);
    const dialogo = screen.getByRole('dialog', { name: 'Subir al respaldo de documentos' });
    expect(within(dialogo).getByDisplayValue('555')).toBeInTheDocument();
    expect(within(dialogo).getByDisplayValue('LUIS SOTO')).toBeInTheDocument();
    expect(within(dialogo).getByDisplayValue('COT — Cotización')).toBeInTheDocument();
    expect(within(dialogo).getByText('555 - LUIS SOTO - COT.pdf')).toBeInTheDocument();
    delete globalThis.__archivosPrueba;
  });
});

describe('DocumentosTab en Hemodinamia', () => {
  it('sube a la carpeta del módulo (modulo = hemodinamia)', async () => {
    const { subirTandaAdmision } = await import('./documentosStorage');
    subirTandaAdmision.mockClear();
    subirTandaAdmision.mockResolvedValue({ lista: [], subidos: [], fallidos: [], sinPermiso: false });
    globalThis.__archivosPrueba = [new File(['x'], '100 - ANA - DP.pdf', { type: 'application/pdf' })];
    render(<DocumentosTab modulo="hemodinamia" idAdmision="100" gestionId="100" nombre="ANA" documentos={{ lista: [], cargando: false, error: null }} onRecargar={vi.fn()} onDocumentosSubidos={vi.fn()} />);
    fireEvent.click(screen.getByText('simular subida'));
    await waitFor(() => expect(subirTandaAdmision).toHaveBeenCalledWith(expect.objectContaining({ modulo: 'hemodinamia', idAdmision: '100' })));
    delete globalThis.__archivosPrueba;
  });
});
