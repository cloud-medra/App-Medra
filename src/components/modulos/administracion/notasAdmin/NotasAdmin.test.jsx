// @vitest-environment jsdom
// Notas Admin: roles destinatarios (obligatorio, Desarrollador no se elige),
// estilo con vista previa y aviso de contraste, y etiquetas de roles en el listado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockCommit = vi.fn();
const mockUpdateDoc = vi.fn();
const mockShowToast = vi.fn();
const mockRefrescar = vi.fn();
const mockRemoveLocal = vi.fn();
let notas = [];
let usuario = { rol: 'admin', nombreCompleto: 'Ana Admin' };

vi.mock('../../../../firebaseConfig', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db, col, id) => ({ col, id: id ?? 'nueva' }),
  addDoc: vi.fn(),
  updateDoc: (...a) => mockUpdateDoc(...a),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'TS',
  writeBatch: () => ({ set: mockSet, update: mockUpdate, commit: mockCommit }),
  where: (...a) => a,
}));
vi.mock('../../../../stores/catalogosStore', () => ({ removeLocal: (...a) => mockRemoveLocal(...a) }));
vi.mock('./useNotasPanel', () => ({ useNotasPanel: () => ({ notas, cargando: false, refrescar: mockRefrescar }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));

const { default: NotasAdmin } = await import('./NotasAdmin');

beforeEach(() => {
  vi.clearAllMocks();
  notas = [];
  usuario = { rol: 'admin', nombreCompleto: 'Ana Admin' };
});
afterEach(cleanup);

const escribir = (texto) => fireEvent.change(screen.getByPlaceholderText('Escribe el mensaje...'), { target: { value: texto } });
const publicar = () => fireEvent.click(screen.getByRole('button', { name: /Publicar Nota/ }));

describe('Notas Admin — roles', () => {
  it('ofrece Administrador, Operador y Encargado Centro (no Desarrollador)', () => {
    render(<NotasAdmin />);
    expect(screen.getByLabelText('Administrador')).not.toBeChecked();
    expect(screen.getByLabelText('Operador')).toBeInTheDocument();
    expect(screen.getByLabelText('Encargado Centro')).toBeInTheDocument();
    expect(screen.queryByLabelText('Desarrollador')).not.toBeInTheDocument();
  });

  it('sin roles no guarda y muestra el error', () => {
    render(<NotasAdmin />);
    escribir('Aviso');
    publicar();
    expect(screen.getByRole('alert')).toHaveTextContent('Debes elegir al menos un rol.');
    expect(mockCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Operador'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('guarda rolesVisibles (orden fijo) y el estilo elegido', async () => {
    render(<NotasAdmin />);
    escribir('Aviso');
    fireEvent.click(screen.getByLabelText('Encargado Centro'));
    fireEvent.click(screen.getByLabelText('Administrador'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fondo' })).getByRole('radio', { name: '#FEF3C7' }));
    fireEvent.click(screen.getByLabelText(/Texto en negrita/));
    publicar();
    await waitFor(() => expect(mockCommit).toHaveBeenCalled());
    expect(mockSet.mock.calls[0][1]).toMatchObject({
      contenido: 'Aviso',
      rolesVisibles: ['admin', 'encargado'],
      estilo: { fondo: '#FEF3C7', texto: null, negrita: true },
    });
    expect(mockShowToast).toHaveBeenCalledWith('Nota publicada correctamente', 'success');
  });

  it('avisa si el autor no está entre los destinatarios', async () => {
    render(<NotasAdmin />);
    escribir('Solo operadores');
    fireEvent.click(screen.getByLabelText('Operador'));
    publicar();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/no la verás/), 'success'));
  });

  it('"Todos" marca los tres roles', () => {
    render(<NotasAdmin />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    ['Administrador', 'Operador', 'Encargado Centro'].forEach((r) => expect(screen.getByLabelText(r)).toBeChecked());
  });
});

describe('Notas Admin — solo desarrolladores', () => {
  it('"Solo desarrolladores" desmarca los demás roles y guarda ["dev"]', async () => {
    usuario = { rol: 'dev', nombreCompleto: 'Dev' };
    render(<NotasAdmin />);
    escribir('Privada');
    fireEvent.click(screen.getByLabelText('Operador'));
    fireEvent.click(screen.getByLabelText('Administrador'));
    fireEvent.click(screen.getByLabelText(/Solo desarrolladores/));
    ['Administrador', 'Operador', 'Encargado Centro'].forEach((r) => expect(screen.getByLabelText(r)).not.toBeChecked());
    expect(screen.getByText('Nota privada: ningún otro rol la verá.')).toBeInTheDocument();
    publicar();
    await waitFor(() => expect(mockCommit).toHaveBeenCalled());
    expect(mockSet.mock.calls[0][1].rolesVisibles).toEqual(['dev']);
    expect(mockShowToast).toHaveBeenCalledWith('Nota publicada correctamente', 'success');
  });

  it('marcar un rol quita "Solo desarrolladores"; desmarcarlo deja sin roles (no se guarda)', () => {
    render(<NotasAdmin />);
    escribir('x');
    fireEvent.click(screen.getByLabelText(/Solo desarrolladores/));
    fireEvent.click(screen.getByLabelText('Encargado Centro'));
    expect(screen.getByLabelText(/Solo desarrolladores/)).not.toBeChecked();
    expect(screen.getByLabelText('Encargado Centro')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Encargado Centro'));
    fireEvent.click(screen.getByLabelText(/Solo desarrolladores/));
    fireEvent.click(screen.getByLabelText(/Solo desarrolladores/));
    publicar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('en el listado se distingue con la etiqueta "Solo desarrolladores" y al editar queda marcada', () => {
    usuario = { rol: 'dev' };
    notas = [{ id: 'd', titulo: 'Privada', tipo: 'texto', contenido: 'Solo devs', orden: 0, rolesVisibles: ['dev'] }];
    render(<NotasAdmin />);
    const etiquetas = screen.getByLabelText('Roles que ven la nota');
    expect(etiquetas).toHaveTextContent(/^Solo desarrolladores$/);
    fireEvent.click(screen.getByTitle('Editar'));
    expect(screen.getByLabelText(/Solo desarrolladores/)).toBeChecked();
    expect(screen.getByLabelText('Operador')).not.toBeChecked();
  });
});

describe('Notas Admin — listado y edición', () => {
  it('muestra los roles destinatarios y aplica el estilo; nota vieja sin roles = todos', () => {
    notas = [
      { id: 'a', titulo: 'Con estilo', tipo: 'texto', contenido: 'Hola', orden: 0, autor: 'X',
        rolesVisibles: ['operador'], estilo: { fondo: '#1E3A8A', texto: '#FFFFFF', negrita: true } },
      { id: 'b', titulo: 'Vieja', tipo: 'texto', contenido: 'Chao', orden: 1, autor: 'X' },
    ];
    render(<NotasAdmin />);
    const [conEstilo, vieja] = screen.getAllByLabelText('Roles que ven la nota');
    expect(within(conEstilo).getAllByText(/./).map((e) => e.textContent)).toEqual(['Operador']);
    expect(within(vieja).getAllByText(/./).map((e) => e.textContent)).toEqual(['Administrador', 'Operador', 'Encargado Centro']);
    const p = screen.getByText('Hola');
    expect(p).toHaveStyle({ color: '#FFFFFF', fontWeight: 700 });
    expect(screen.getByText('Chao').getAttribute('style')).toBeNull();
  });

  it('al editar carga roles y estilo, y no permite dejarla sin roles', async () => {
    notas = [{ id: 'a', titulo: 'T', tipo: 'texto', contenido: 'Hola', orden: 0, rolesVisibles: ['admin', 'operador'],
      estilo: { fondo: '#FFFFFF', texto: '#FDE68A', negrita: false } }];
    render(<NotasAdmin />);
    fireEvent.click(screen.getByTitle('Editar'));
    expect(screen.getByLabelText('Administrador')).toBeChecked();
    expect(screen.getByLabelText('Operador')).toBeChecked();
    expect(screen.getByLabelText('Encargado Centro')).not.toBeChecked();
    // Vista previa con aviso de bajo contraste.
    expect(screen.getByTestId('vista-previa-nota')).toHaveStyle({ backgroundColor: '#FFFFFF' });
    expect(screen.getByRole('status')).toHaveTextContent(/Contraste bajo/);

    fireEvent.click(screen.getByLabelText('Administrador'));
    fireEvent.click(screen.getByLabelText('Operador'));
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/ }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Administrador'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Texto' })).getByRole('radio', { name: '#111827' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/ }));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
    expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({
      rolesVisibles: ['admin'], estilo: { fondo: '#FFFFFF', texto: '#111827', negrita: false },
    });
  });
});
