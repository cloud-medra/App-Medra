// @vitest-environment jsdom
// Administración → Permisos por centro: listado de centros, configurar uno
// (guardar con aviso de usuarios afectados, copiar de otro centro, cancelar),
// "Ver usuarios" y acceso solo admin/dev.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const LAB = '/laboratorio/codigoLaboratorio';
// Plantillas por centro + rol (id: centro__rol).
const PLANTILLAS = {
  lab__operador: { permisos: { laboratorio: [LAB] }, permisosGranulares: { [LAB]: {} } },
  urg__operador: { permisos: { maestros: ['/maestros/codigosMaestros'], laboratorio: [LAB] }, permisosGranulares: { '/maestros/codigosMaestros': {}, [LAB]: {} } },
  urg__encargado: { permisos: { maestros: ['/maestros/codigosMaestros'] }, permisosGranulares: { '/maestros/codigosMaestros': {} } },
};
const USUARIOS = [
  { id: 'ana', nombreCompleto: 'Ana Lab', nombreUsuario: 'ana', rol: 'operador', centroCostoId: 'lab', excepciones: { agregados: ['v|/x'], quitados: [] } },
  { id: 'luis', nombreCompleto: 'Luis Lab', nombreUsuario: 'luis', rol: 'operador', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] } },
  { id: 'jefa', nombreCompleto: 'Jefa Lab', nombreUsuario: 'jefa', rol: 'encargado', centroCostoId: 'lab' },
  { id: 'eva', nombreCompleto: 'Eva Vac', nombreUsuario: 'eva', rol: 'encargado', centroCostoId: 'vac' },
];
const lecturas = [];
vi.mock('firebase/firestore', () => ({
  collection: (_db, nombre) => nombre, query: (c) => c, orderBy: vi.fn(),
  onSnapshot: (ref, siguiente) => {
    lecturas.push(ref);
    if (ref === 'usuarios') siguiente({ docs: USUARIOS.map((u) => ({ id: u.id, data: () => u })) });
    else siguiente({ docs: Object.entries(PLANTILLAS).map(([id, p]) => ({ id, data: () => p })) });
    return () => {};
  },
}));
const llamadas = [];
vi.mock('firebase/functions', () => ({ httpsCallable: (_f, nombre) => async (datos) => { llamadas.push({ nombre, datos }); return { data: { usuarios: 2 } }; } }));
vi.mock('../../../../firebaseConfig', () => ({ db: {}, functions: {} }));
let rol = 'admin';
let permisos = { administracion: ['/administracion/permisosCentro'] };
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { rol, permisos } }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const confirmAction = vi.fn();
vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
vi.mock('../../../../hooks/useCatalogo', () => ({
  useCatalogo: () => ({ datos: [
    { id: 'lab', nombre: 'LABORATORIO', estado: 'ACTIVO' },
    { id: 'urg', nombre: 'URGENCIAS', estado: 'ACTIVO' },
    { id: 'vac', nombre: 'VACUNATORIO', estado: 'ACTIVO', usarEnGestiones: false },
    { id: 'old', nombre: 'ANTIGUO', estado: 'INACTIVO' },
  ] }),
}));

const { default: PermisosPorCentro } = await import('./PermisosPorCentro');

beforeEach(() => { rol = 'admin'; permisos = { administracion: ['/administracion/permisosCentro'] }; llamadas.length = 0; lecturas.length = 0; confirmAction.mockClear(); });
afterEach(cleanup);
const fila = (nombre) => screen.getByRole('button', { name: nombre }).closest('tr');
const confirmar = async () => { await act(async () => { await confirmAction.mock.calls.at(-1)[2](); }); };

describe('Permisos por centro: listado', () => {
  it('muestra el estado y los usuarios por rol; resalta los centros con usuarios sin permisos', () => {
    render(<PermisosPorCentro />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Centro', 'Estado por rol', 'Módulos con acceso', 'Usuarios por rol', 'Usuarios con permisos personalizados']);
    expect(screen.queryByText('ANTIGUO')).not.toBeInTheDocument(); // inactivo
    const celdas = (nombre) => within(fila(nombre)).getAllByRole('cell').map((c) => c.textContent);
    expect(celdas('LABORATORIO').slice(1)).toEqual([
      'Operador: Configurada · Encargado de centro: Sin configurar',
      'Operador: 1 · Encargado de centro: —',
      'Operador: 2 · Encargado de centro: 1',
      '1',
    ]);
    expect(celdas('URGENCIAS')[1]).toBe('Operador: Configurada · Encargado de centro: Configurada');
    expect(fila('LABORATORIO')).toHaveAttribute('data-alerta'); // la encargada no recibe permisos
    expect(fila('VACUNATORIO')).toHaveAttribute('data-alerta'); // ningún rol configurado
    expect(fila('URGENCIAS')).not.toHaveAttribute('data-alerta');
    expect(screen.getByText(/1 centro\(s\) sin configurar · 2 usuario\(s\) sin permisos de su centro y rol/)).toBeInTheDocument();
  });

  it('busca por nombre de centro (sin importar tildes ni mayúsculas)', () => {
    render(<PermisosPorCentro />);
    fireEvent.change(screen.getByLabelText('Buscar centro'), { target: { value: 'urgéncias' } });
    expect(screen.getByRole('button', { name: 'URGENCIAS' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'LABORATORIO' })).not.toBeInTheDocument();
  });
});

describe('Permisos por centro: configurar un centro por rol', () => {
  const abrir = (nombre) => { render(<PermisosPorCentro />); fireEvent.click(screen.getByRole('button', { name: nombre })); };

  it('una pestaña por rol; guardar avisa a cuántos usuarios afecta la combinación y guarda ese rol', async () => {
    abrir('LABORATORIO');
    expect(screen.getByRole('heading', { name: 'LABORATORIO' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Operador (2)', 'Encargado de centro (1)Sin configurar', 'Ver usuarios (3)']);
    expect(screen.getByRole('button', { name: /^Guardar$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: /Encargado de centro/ }));
    // Permisos por centro se ofrece como cualquier ítem (solo sirve con rol
    // Administrador, que no usa plantilla).
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Módulos' })).getByText('Herramientas'));
    expect(screen.getByLabelText('Habilitar Permisos por centro')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Habilitar Listado de usuarios'));
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    expect(confirmAction).toHaveBeenCalledWith('Guardar permisos del centro',
      expect.stringContaining('Afectará a 1 usuario(s) de LABORATORIO con rol Encargado de centro.'), expect.any(Function), expect.any(Object));
    expect(llamadas).toHaveLength(0); // nada sin confirmar
    await confirmar();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ nombre: 'guardarPlantillaCentroCosto', datos: { centroId: 'lab', rol: 'encargado' } });
    expect(llamadas[0].datos.plantilla.permisos).toEqual({ administracion: ['/administracion/listadoUsuario'] });
  });

  it('copiar desde otro rol (Operador → Encargado) y luego sumarle permisos', async () => {
    abrir('LABORATORIO');
    fireEvent.click(screen.getByRole('tab', { name: /Encargado de centro/ }));
    const desdeRol = screen.getByLabelText('Copiar desde otro rol');
    expect(within(desdeRol).getAllByRole('option').map((o) => o.textContent)).toEqual(['Copiar desde otro rol…', 'Operador']);
    fireEvent.change(desdeRol, { target: { value: 'operador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar rol' }));
    expect(screen.getByLabelText('Habilitar Maestro Códigos')).toBeChecked();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Módulos' })).getByText('Herramientas'));
    fireEvent.click(screen.getByLabelText('Habilitar Notas del panel'));
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    await confirmar();
    expect(llamadas[0].datos.rol).toBe('encargado');
    expect(llamadas[0].datos.plantilla.permisos).toEqual({ laboratorio: [LAB], administracion: ['/administracion/notasAdmin'] });
  });

  it('copiar desde otro centro eligiendo centro y rol', async () => {
    abrir('VACUNATORIO');
    const desdeCentro = screen.getByLabelText('Copiar desde otro centro');
    expect(within(desdeCentro).getAllByRole('option').map((o) => o.textContent)).toEqual(
      ['Copiar desde otro centro…', 'LABORATORIO – Operador', 'URGENCIAS – Operador', 'URGENCIAS – Encargado de centro']);
    fireEvent.change(desdeCentro, { target: { value: 'urg__encargado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar centro' }));
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    expect(confirmAction.mock.calls.at(-1)[1]).toContain('Afectará a 0 usuario(s) de VACUNATORIO con rol Operador.');
    await confirmar();
    expect(llamadas[0].datos).toMatchObject({ centroId: 'vac', rol: 'operador' });
    expect(llamadas[0].datos.plantilla.permisos).toEqual(PLANTILLAS.urg__encargado.permisos);
  });

  it('con cambios en dos roles, el aviso indica cada combinación y se guardan ambos', async () => {
    abrir('LABORATORIO');
    fireEvent.click(screen.getByLabelText('Habilitar Maestro Códigos')); // Operador: quitar
    fireEvent.click(screen.getByRole('tab', { name: /Encargado de centro/ }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Módulos' })).getByText('Laboratorio'));
    fireEvent.click(screen.getByLabelText('Habilitar Maestro Códigos')); // Encargado: agregar
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    const aviso = confirmAction.mock.calls.at(-1)[1];
    expect(aviso).toContain('Afectará a 2 usuario(s) de LABORATORIO con rol Operador.');
    expect(aviso).toContain('Afectará a 1 usuario(s) de LABORATORIO con rol Encargado de centro.');
    await confirmar();
    expect(llamadas.map((l) => l.datos.rol)).toEqual(['operador', 'encargado']);
  });

  it('cancelar con cambios pide confirmación; sin cambios vuelve al listado', () => {
    abrir('LABORATORIO');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('columnheader', { name: 'Centro' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'LABORATORIO' }));
    fireEvent.click(screen.getByLabelText('Habilitar Maestro Códigos'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cambios sin guardar');
    fireEvent.click(screen.getByText('Salir sin guardar'));
    expect(screen.getByRole('columnheader', { name: 'Centro' })).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  it('"Ver usuarios" lista los del centro, filtra por rol y enlaza a su edición', () => {
    const onEditarUsuario = vi.fn();
    render(<PermisosPorCentro onEditarUsuario={onEditarUsuario} />);
    fireEvent.click(screen.getByRole('button', { name: 'LABORATORIO' }));
    fireEvent.click(screen.getByRole('tab', { name: /Ver usuarios \(3\)/ }));
    expect(screen.getByText('Ana Lab')).toBeInTheDocument();
    expect(screen.getByText('+1 / −0')).toBeInTheDocument();
    expect(screen.queryByText('Eva Vac')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar usuarios por rol'), { target: { value: 'encargado' } });
    expect(screen.getByText('Jefa Lab')).toBeInTheDocument();
    expect(screen.queryByText('Ana Lab')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Editar a Jefa Lab'));
    expect(onEditarUsuario).toHaveBeenCalledWith('jefa');
  });
});

describe('Permisos por centro: acceso', () => {
  it.each(['operador', 'encargado'])('un %s no ve la vista ni lee datos, aunque tenga el ítem', (r) => {
    rol = r;
    render(<PermisosPorCentro />);
    expect(screen.getByText('Solo un administrador con acceso a Permisos por centro puede configurarlos.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(lecturas).toEqual([]);
  });

  it('un Administrador sin el ítem tampoco', () => {
    permisos = { administracion: ['/administracion/listadoUsuario'] };
    render(<PermisosPorCentro />);
    expect(screen.getByText('Solo un administrador con acceso a Permisos por centro puede configurarlos.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(lecturas).toEqual([]);
  });

  it('un dev sí, sin el ítem', () => {
    rol = 'dev';
    permisos = {};
    render(<PermisosPorCentro />);
    expect(screen.getByRole('button', { name: 'LABORATORIO' })).toBeInTheDocument();
  });
});
