// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const prueba = vi.hoisted(() => ({ showToast: null, usuario: { rol: 'dev' } }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: prueba.showToast }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: prueba.usuario }) }));
vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: (_db, ruta) => ({ ruta }) }));
vi.mock('../respaldoDocumentos/respaldoService', () => ({ subirRespaldo: vi.fn() }));
vi.mock('../../implantes/gestionImplantes/utils/registrarLogImplantes', () => ({ registrarLogImplantes: vi.fn() }));
vi.mock('../../hemodinamia/gestionHemodinamia/utils/registrarLogHemodinamia', () => ({ registrarLogHemodinamia: vi.fn() }));
vi.mock('./documentosStorage', () => ({
  subirTandaAdmision: vi.fn(),
  obtenerBlobDocumento: vi.fn(async (ruta) => new Blob([ruta], { type: 'application/pdf' })),
  listarDocumentosAdmision: vi.fn(),
  eliminarDocumentoAdmision: vi.fn()
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
import { useDocumentosAdmision } from './useDocumentosAdmision';
import { listarDocumentosAdmision, eliminarDocumentoAdmision } from './documentosStorage';
import { registrarLogImplantes } from '../../implantes/gestionImplantes/utils/registrarLogImplantes';

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
  prueba.showToast = vi.fn();
  prueba.usuario = { rol: 'dev' };
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

// Con el hook real (useDocumentosAdmision), como lo monta el detalle de la gestión.
const ConHook = ({ modulo = 'implantes' }) => {
  const docs = useDocumentosAdmision(modulo, '100', true);
  return <DocumentosTab modulo={modulo} idAdmision="100" gestionId="100" nombre="ANA" refPathBloque="implantes_gestiones/x/detalles/b1" {...docs} />;
};
const LISTA_COT = [...LISTA, doc('100 - ANA - COT 2 - EMP.pdf', 'COT')];
const PESTANA = '/implantes/gestionImplantes/documentos';
const operador = (elements) => ({
  rol: 'operador',
  permisos: { implantes: ['/implantes/gestionImplantes'] },
  permisosGranulares: { [PESTANA]: { contenido: { visible: true, elements } } },
});

describe('DocumentosTab: eliminar', () => {
  beforeEach(() => {
    listarDocumentosAdmision.mockResolvedValue(LISTA_COT);
    eliminarDocumentoAdmision.mockReset();
    registrarLogImplantes.mockClear();
  });

  it('el botón Eliminar solo aparece con el permiso btn_eliminar_documento (denegado por defecto)', async () => {
    prueba.usuario = operador({});
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    expect(screen.queryAllByTitle('Eliminar')).toHaveLength(0);
    cleanup();

    prueba.usuario = operador({ btn_eliminar_documento: true });
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    expect(screen.getAllByTitle('Eliminar')).toHaveLength(4);
    cleanup();

    // Sin onDocumentoEliminado (otra pantalla que monte la pestaña), tampoco.
    renderTab({ lista: LISTA, cargando: false, error: null });
    expect(screen.queryAllByTitle('Eliminar')).toHaveLength(0);
  });

  it('confirma con el nombre, elimina y actualiza contadores, toast y log sin recargar', async () => {
    eliminarDocumentoAdmision.mockResolvedValue({ resultado: 'eliminado', rutaPapelera: 'implantes/100/eliminados/t_x.pdf' });
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('COT — Cotización').closest('td')).toHaveTextContent('· 2');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 100 - ANA - COT 1 - EMP.pdf' }));
    const dialogo = screen.getByRole('dialog', { name: 'Eliminar documento' });
    expect(dialogo).toHaveTextContent('¿Seguro que deseas eliminar 100 - ANA - COT 1 - EMP.pdf?');
    fireEvent.click(within(dialogo).getByRole('button', { name: /Eliminar/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(eliminarDocumentoAdmision).toHaveBeenCalledWith({ modulo: 'implantes', idAdmision: '100', ruta: 'implantes/100/documentos/100 - ANA - COT 1 - EMP.pdf' });
    expect(screen.queryByTitle('100 - ANA - COT 1 - EMP.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('COT — Cotización').closest('td')).toHaveTextContent('· 1');
    expect(listarDocumentosAdmision).toHaveBeenCalledTimes(1);
    expect(prueba.showToast).toHaveBeenCalledWith('Documento eliminado.', 'success');
    expect(registrarLogImplantes).toHaveBeenCalledWith(
      { ruta: 'implantes_gestiones/x/detalles/b1' },
      'DOCUMENTO_ELIMINADO',
      expect.objectContaining({ nombre: '100 - ANA - COT 1 - EMP.pdf', idAdmision: '100', archivoInexistente: false }),
      prueba.usuario
    );
  });

  it('Cancelar no elimina', async () => {
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 100 - ANA - DP.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(eliminarDocumentoAdmision).not.toHaveBeenCalled();
  });

  it('error (sin permiso en el servidor): toast de error y el listado no cambia', async () => {
    eliminarDocumentoAdmision.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/permission-denied' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 100 - ANA - DP.pdf' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Eliminar/ }));

    await waitFor(() => expect(prueba.showToast).toHaveBeenCalledWith('No tienes permiso para eliminar documentos.', 'error'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTitle('100 - ANA - DP.pdf')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(registrarLogImplantes).not.toHaveBeenCalled();
    console.error.mockRestore();
  });

  it('archivo que ya no existía: se quita del listado con aviso', async () => {
    eliminarDocumentoAdmision.mockResolvedValue({ resultado: 'inexistente' });
    render(<ConHook />);
    await screen.findByTitle('100 - ANA - DP.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 100 - ANA - DP.pdf' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Eliminar/ }));

    await waitFor(() => expect(screen.queryByTitle('100 - ANA - DP.pdf')).not.toBeInTheDocument());
    expect(screen.queryByText('DP — Datos Personales')).not.toBeInTheDocument();
    expect(prueba.showToast).toHaveBeenCalledWith(expect.stringMatching(/ya no existía/), 'warning');
    expect(registrarLogImplantes.mock.calls[0][2]).toMatchObject({ archivoInexistente: true });
  });
});
