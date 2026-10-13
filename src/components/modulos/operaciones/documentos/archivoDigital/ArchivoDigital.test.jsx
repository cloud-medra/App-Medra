// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const permisosDenegados = new Set();
const confirmAction = vi.fn();
vi.mock('../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: (_r, sec, el) => !permisosDenegados.has(el ? `${sec}.${el}` : sec) })
}));
vi.mock('../../../../../hooks/useColumnasPermitidas', () => ({
  useColumnasPermitidas: (_r, _s, columnas) => ({ columnasVisibles: columnas, ver: () => true })
}));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { nombreCompleto: 'Ana' } }) }));
vi.mock('../../shared/documentosAdmision/documentosStorage', () => ({ obtenerBlobDocumento: vi.fn() }));

// Inicio: Contratos/ (Empresa X/ con contrato.pdf, resumen.png), leeme.pdf
const NODOS = [
  { id: 'c1', tipo: 'carpeta', nombre: 'Contratos', padreId: null, eliminado: false },
  { id: 'c2', tipo: 'carpeta', nombre: 'Empresa X', padreId: 'c1', eliminado: false },
  { id: 'a1', tipo: 'archivo', nombre: 'contrato.pdf', padreId: 'c2', tamano: 2048, eliminado: false },
  { id: 'a2', tipo: 'archivo', nombre: 'resumen.png', padreId: 'c1', tamano: 100, contentType: 'image/png', eliminado: false },
  { id: 'a3', tipo: 'archivo', nombre: 'leeme.pdf', padreId: null, tamano: 100, eliminado: false },
  { id: 'x1', tipo: 'archivo', nombre: 'viejo.pdf', padreId: null, eliminado: true, eliminadoGrupo: 'x1', eliminadoPor: 'Luis' },
];
const servicio = vi.hoisted(() => ({
  escucharNodos: vi.fn(), crearCarpeta: vi.fn(), subirArchivo: vi.fn(), renombrarNodo: vi.fn(), moverNodo: vi.fn(),
  enviarAPapelera: vi.fn(), restaurarGrupo: vi.fn(), eliminarGrupoDefinitivo: vi.fn(),
}));
vi.mock('./archivoService', () => servicio);

import ArchivoDigital from './ArchivoDigital';

const filas = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent.trim());

beforeEach(() => {
  permisosDenegados.clear();
  servicio.escucharNodos.mockImplementation((onDatos) => { onDatos(NODOS); return () => {}; });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ArchivoDigital', () => {
  it('carpetas primero, navegación por carpetas y ruta', () => {
    render(<ArchivoDigital />);
    expect(filas()).toEqual(['Contratos', 'leeme.pdf']);
    fireEvent.click(screen.getByRole('button', { name: 'Contratos' }));
    expect(filas()).toEqual(['Empresa X', 'resumen.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Empresa X' }));
    const ruta = screen.getByRole('navigation', { name: 'Ruta' });
    expect(ruta).toHaveTextContent('Inicio');
    expect(ruta).toHaveTextContent('Contratos');
    expect(within(ruta).getByText('Empresa X')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(ruta).getByRole('button', { name: /Inicio/ }));
    expect(filas()).toEqual(['Contratos', 'leeme.pdf']);
  });

  it('la búsqueda recorre todo el árbol y muestra la ubicación', () => {
    render(<ArchivoDigital />);
    fireEvent.change(screen.getByLabelText('Buscar en todo el archivo'), { target: { value: 'contrat' } });
    expect(filas()).toEqual(['ContratosInicio', 'contrato.pdfInicio / Contratos / Empresa X']);
  });

  it('eliminar una carpeta con contenido pide confirmación con lo que contiene', async () => {
    render(<ArchivoDigital />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Contratos' }));
    expect(confirmAction).toHaveBeenCalledTimes(1);
    const [titulo, mensaje, onConfirm] = confirmAction.mock.calls[0];
    expect(titulo).toBe('Eliminar carpeta');
    expect(mensaje).toMatch(/Contiene 2 archivos y 1 subcarpeta/);
    onConfirm();
    await waitFor(() => expect(servicio.enviarAPapelera).toHaveBeenCalled());
    const [nodo, contenido] = servicio.enviarAPapelera.mock.calls[0];
    expect(nodo.id).toBe('c1');
    expect(contenido.map((n) => n.id).sort()).toEqual(['a1', 'a2', 'c2']);
  });

  it('TIFF/HEIC: mensaje con los formatos permitidos y no se sube', async () => {
    render(<ArchivoDigital />);
    const tiff = new File(['x'], 'escaneo.tiff', { type: 'image/tiff' });
    fireEvent.change(screen.getByTestId('input-archivos'), { target: { files: [tiff] } });
    expect(await screen.findByText(/Formato no permitido \(TIFF\).*PDF, JPG, PNG, WEBP/)).toBeInTheDocument();
    expect(servicio.subirArchivo).not.toHaveBeenCalled();
  });

  it('sube con nombre único dentro de la carpeta actual', async () => {
    servicio.subirArchivo.mockResolvedValue();
    render(<ArchivoDigital />);
    fireEvent.change(screen.getByTestId('input-archivos'), { target: { files: [new File(['x'], 'leeme.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(servicio.subirArchivo).toHaveBeenCalled());
    expect(servicio.subirArchivo.mock.calls[0][0]).toMatchObject({ nombre: 'leeme (2).pdf', padreId: null, usuarioNombre: 'Ana' });
  });

  it('papelera y permisos: sin eliminar definitivo solo se ve Restaurar; sin subir no aparece el botón', () => {
    permisosDenegados.add('papelera.btn_eliminar_definitivo');
    permisosDenegados.add('archivos.btn_subir');
    render(<ArchivoDigital />);
    expect(screen.queryByRole('button', { name: /Subir archivos/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Papelera \(1\)/ }));
    expect(filas()).toEqual(['viejo.pdf']);
    expect(screen.getByRole('button', { name: 'Restaurar viejo.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar definitivamente viejo.pdf' })).not.toBeInTheDocument();
  });
});
