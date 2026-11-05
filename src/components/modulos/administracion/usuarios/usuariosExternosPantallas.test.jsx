// @vitest-environment jsdom
// Crear usuario, Editar usuario y Listado con usuarios externos, y que para un
// interno lo que se envía a las funciones siga siendo igual que antes.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const llamadas = [];
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f, nombre) => async (datos) => {
    llamadas.push({ nombre, datos });
    return { data: nombre === 'crearUsuario' ? { uid: 'nuevo' } : { ok: true } };
  },
}));
let usuariosLista = [];
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, col) => col), query: (ref) => ref, orderBy: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  onSnapshot: (ref, siguiente) => {
    siguiente({ docs: ref === 'usuarios' ? usuariosLista.map((u) => ({ id: u.id, data: () => u })) : [] });
    return () => {};
  },
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {}, functions: {} }));
const showToast = vi.fn();
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const confirmAction = vi.fn();
vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
const CATALOGOS = {
  empresas: [{ id: 'acme', nombre: 'ACME', estado: 'ACTIVO' }, { id: 'zeta', nombre: 'ZETA', estado: 'INACTIVO' }],
  centros: [{ id: 'lab', nombre: 'LABORATORIO', estado: 'ACTIVO' }],
};
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: (nombre) => ({ datos: CATALOGOS[nombre] || [] }) }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'dev1', rol: 'dev' } }) }));

const { default: CrearUsuario } = await import('./CrearUsuario');
const { default: EditarUsuario } = await import('./EditarUsuario');
const { default: ListadoUsuario } = await import('./ListadoUsuario');

beforeEach(() => { llamadas.length = 0; showToast.mockClear(); confirmAction.mockClear(); });
afterEach(cleanup);

const opciones = (select) => within(select).getAllByRole('option').map((o) => o.textContent);

describe('Crear usuario', () => {
  const llenar = () => {
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Beto Soto' } });
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'bsoto' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'beto@acme.cl' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto1' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'secreto1' } });
  };
  const crear = () => fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));

  it('por defecto es interno: pide rol y centro, y no empresa', () => {
    render(<CrearUsuario />);
    expect(screen.getByLabelText('Tipo de usuario')).toHaveValue('interno');
    expect(screen.getByLabelText('Rol')).toBeInTheDocument();
    expect(screen.getByText('Centro de costo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Empresa')).toBeNull();
  });

  it('externo: oculta rol y centro, ofrece solo empresas activas y sin permisos', () => {
    render(<CrearUsuario />);
    fireEvent.change(screen.getByLabelText('Tipo de usuario'), { target: { value: 'externo' } });
    expect(screen.queryByLabelText('Rol')).toBeNull();
    expect(screen.queryByText('Centro de costo')).toBeNull();
    expect(opciones(screen.getByLabelText('Empresa'))).toEqual(['Selecciona una empresa', 'ACME']);
    expect(screen.getByRole('tab', { name: /Permisos/ })).toBeDisabled();
  });

  it('externo sin empresa: no crea la cuenta', async () => {
    render(<CrearUsuario />);
    fireEvent.change(screen.getByLabelText('Tipo de usuario'), { target: { value: 'externo' } });
    llenar();
    crear();
    expect(showToast).toHaveBeenCalledWith('La empresa es obligatoria para un usuario externo.', 'error');
    expect(llamadas).toHaveLength(0);
  });

  it('externo con empresa: envía tipo, empresa y Operador, sin guardar permisos', async () => {
    render(<CrearUsuario />);
    fireEvent.change(screen.getByLabelText('Tipo de usuario'), { target: { value: 'externo' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'acme' } });
    llenar();
    crear();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toMatchObject({ nombre: 'crearUsuario', datos: { tipoUsuario: 'externo', empresaId: 'acme', rol: 'operador', nombreUsuario: 'bsoto' } });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Deberá cambiar su contraseña'), 'success'));
    expect(llamadas.map((l) => l.nombre)).toEqual(['crearUsuario']);
  });

  it('volver a interno borra la empresa elegida', () => {
    render(<CrearUsuario />);
    const tipo = screen.getByLabelText('Tipo de usuario');
    fireEvent.change(tipo, { target: { value: 'externo' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'acme' } });
    fireEvent.change(tipo, { target: { value: 'interno' } });
    fireEvent.change(tipo, { target: { value: 'externo' } });
    expect(screen.getByLabelText('Empresa')).toHaveValue('');
  });

  it('interno: lo que se envía no cambia', async () => {
    render(<CrearUsuario />);
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'encargado' } });
    llenar();
    crear();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).toEqual({ nombreCompleto: 'Beto Soto', nombreUsuario: 'bsoto', email: 'beto@acme.cl', password: 'secreto1', rol: 'encargado' });
  });
});

describe('Editar usuario', () => {
  const EXTERNO = { id: 'beto', tipoUsuario: 'externo', empresaId: 'acme', nombreCompleto: 'Beto', nombreUsuario: 'beto', email: 'b@a.cl', rol: 'operador', centroCostoId: null, excepciones: { agregados: [], quitados: [] }, permisos: {}, permisosGranulares: {} };
  const INTERNO = { id: 'ana', nombreCompleto: 'Ana', nombreUsuario: 'ana', email: 'a@a.cl', rol: 'encargado', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] }, permisos: {}, permisosGranulares: {} };
  const guardar = () => fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

  it('externo: abre en datos, sin rol ni centro', () => {
    render(<EditarUsuario usuario={EXTERNO} onVolver={vi.fn()} />);
    expect(screen.getByLabelText('Tipo de usuario')).toHaveValue('externo');
    expect(screen.getByLabelText('Empresa')).toHaveValue('acme');
    expect(screen.queryByLabelText('Rol')).toBeNull();
    expect(screen.queryByText('Centro de costo')).toBeNull();
  });

  it('externo: la pestaña Permisos ofrece solo Portal Proveedores', () => {
    render(<EditarUsuario usuario={EXTERNO} onVolver={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Permisos/ }));
    expect(screen.getAllByText('Portal Proveedores').length).toBeGreaterThan(0);
    expect(screen.queryByText('Implantes')).toBeNull();
    expect(screen.queryByText('Bodega')).toBeNull();
  });

  it('externo: guarda solo datos, tipo, empresa y sus módulos', async () => {
    render(<EditarUsuario usuario={EXTERNO} onVolver={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: '' } });
    guardar();
    expect(await screen.findByText('La empresa es obligatoria para un usuario externo.')).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Beto Soto' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'acme' } });
    guardar();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).toEqual({
      uid: 'beto', tipoUsuario: 'externo', empresaId: 'acme', excepciones: { agregados: [], quitados: [] },
      datos: { nombreCompleto: 'Beto Soto', nombreUsuario: 'beto', activo: true },
    });
  });

  it('con la empresa asignada inactiva, se mantiene a la vista', () => {
    render(<EditarUsuario usuario={{ ...EXTERNO, empresaId: 'zeta' }} onVolver={vi.fn()} />);
    expect(opciones(screen.getByLabelText('Empresa'))).toContain('ZETA (empresa inactiva)');
    expect(screen.getByLabelText('Empresa')).toHaveValue('zeta');
  });

  it('pasar a externo pide confirmación y exige empresa', async () => {
    render(<EditarUsuario usuario={INTERNO} onVolver={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Tipo de usuario'), { target: { value: 'externo' } });
    expect(confirmAction).toHaveBeenCalledWith('Pasar a usuario externo', expect.stringContaining('sin ningún permiso de módulos internos'), expect.any(Function), expect.anything());
    expect(screen.getByLabelText('Tipo de usuario')).toHaveValue('interno');
    act(() => { confirmAction.mock.calls[0][2](); });
    expect(screen.queryByLabelText('Rol')).toBeNull();
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'acme' } });
    guardar();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).toMatchObject({ uid: 'ana', tipoUsuario: 'externo', empresaId: 'acme' });
    expect(llamadas[0].datos.rol).toBeUndefined();
    expect(llamadas[0].datos.centroCostoId).toBeUndefined();
  });

  it('volver a interno exige centro de costo', async () => {
    render(<EditarUsuario usuario={EXTERNO} onVolver={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Tipo de usuario'), { target: { value: 'interno' } });
    expect(screen.getByLabelText('Rol')).toHaveValue('operador');
    guardar();
    expect(await screen.findByText('El centro de costo es obligatorio para un Operador.')).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  it('interno: lo que se envía no cambia (sin tipo ni empresa)', async () => {
    render(<EditarUsuario usuario={INTERNO} onVolver={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana María' } });
    guardar();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).not.toHaveProperty('tipoUsuario');
    expect(llamadas[0].datos).not.toHaveProperty('empresaId');
    expect(llamadas[0].datos).toMatchObject({ uid: 'ana', rol: 'encargado', centroCostoId: 'lab' });
  });
});

describe('Listado de usuarios', () => {
  beforeEach(() => {
    usuariosLista = [
      { id: 'ana', nombreCompleto: 'Ana Lab', nombreUsuario: 'ana', email: 'a@x.cl', rol: 'operador', centroCostoId: 'lab', administradoresAsignados: [] },
      { id: 'beto', nombreCompleto: 'Beto Ext', nombreUsuario: 'beto', email: 'b@x.cl', rol: 'operador', tipoUsuario: 'externo', empresaId: 'acme', centroCostoId: null },
      { id: 'caro', nombreCompleto: 'Caro Ext', nombreUsuario: 'caro', email: 'c@x.cl', rol: 'operador', tipoUsuario: 'externo', empresaId: 'zeta', centroCostoId: null },
      { id: 'dani', nombreCompleto: 'Dani Ext', nombreUsuario: 'dani', email: 'd@x.cl', rol: 'operador', tipoUsuario: 'externo', empresaId: 'borrada', centroCostoId: null },
    ];
  });
  const fila = (nombre) => screen.getByText(nombre).closest('tr');

  it('muestra tipo y empresa, y avisa si la empresa está inactiva o eliminada', () => {
    render(<ListadoUsuario />);
    expect(screen.getByRole('columnheader', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Empresa' })).toBeInTheDocument();
    expect(within(fila('Ana Lab')).getByText('Interno')).toBeInTheDocument();
    expect(within(fila('Beto Ext')).getByText('Externo')).toBeInTheDocument();
    expect(within(fila('Beto Ext')).getByText('ACME')).toBeInTheDocument();
    expect(within(fila('Caro Ext')).getByText('Empresa inactiva')).toBeInTheDocument();
    expect(within(fila('Dani Ext')).getByText('Empresa eliminada')).toBeInTheDocument();
  });

  it('un externo no aparece "por reasignar" ni se puede elegir para asignaciones masivas', () => {
    render(<ListadoUsuario />);
    expect(within(fila('Beto Ext')).queryByText('Por reasignar')).toBeNull();
    expect(within(fila('Beto Ext')).queryByText('Sin centro')).toBeNull();
    expect(screen.queryByLabelText('Seleccionar Beto Ext')).toBeNull();
    expect(screen.getByLabelText('Seleccionar Ana Lab')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Seleccionar todos'));
    expect(screen.getByRole('region', { name: 'Asignación masiva' })).toHaveTextContent('1 seleccionado(s)');
  });

  it('filtra por tipo', () => {
    render(<ListadoUsuario />);
    const filtro = screen.getByLabelText('Filtrar por tipo de usuario');
    fireEvent.change(filtro, { target: { value: 'externo' } });
    expect(screen.queryByText('Ana Lab')).toBeNull();
    expect(screen.getByText('Beto Ext')).toBeInTheDocument();
    fireEvent.change(filtro, { target: { value: 'interno' } });
    expect(screen.getByText('Ana Lab')).toBeInTheDocument();
    expect(screen.queryByText('Beto Ext')).toBeNull();
  });
});
