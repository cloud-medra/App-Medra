// @vitest-environment jsdom
// Edición desde Listado Usuario (EditarUsuario, pantalla completa) con los
// mapas de permisos REALES: un usuario existente, guardado antes de las
// acciones y columnas nuevas, se edita (quitar una pestaña de Control
// Procesos, una acción y una columna de Maestros → Códigos), se guarda, se
// vuelve a abrir y se verifica que los permisos se apliquen en tiempo real.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Guardar pasa por la Cloud Function guardarPermisosUsuario: se registra lo
// que recibe (excepciones) y el permiso efectivo se calcula como lo hace la
// función (combinar, de functions/permisos/nucleo.mjs).
const llamadas = [];
let fallo = null; // error que devuelve la función (p. ej. nombre en uso)
vi.mock('firebase/functions', () => ({ httpsCallable: (_f, nombre) => async (datos) => { llamadas.push({ nombre, datos }); if (fallo) throw fallo; return { data: { ok: true } }; } }));
let plantillasDocs = [];
let escucharPlantillas = null;
const snapshotPlantillas = () => ({ docs: plantillasDocs.map(([id, p]) => ({ id, data: () => p })) });
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, col) => col),
  onSnapshot: (_ref, siguiente) => { escucharPlantillas = siguiente; siguiente(snapshotPlantillas()); return () => {}; },
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {}, functions: {} }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const confirmAction = vi.fn();
vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: () => ({ datos: [{ id: 'lab', nombre: 'LABORATORIO', estado: 'ACTIVO' }] }) }));
const { combinar } = await import('../../../../../functions/permisos/nucleo.mjs');
let usuarioSesion = null;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuarioSesion }) }));

const { default: EditarUsuario } = await import('./EditarUsuario');
const { useGranularPermission } = await import('../../../../hooks/useGranularPermission');
const { useColumnasPermitidas } = await import('../../../../hooks/useColumnasPermitidas');

const CP = '/laboratorio/archivosControlLaboratorio';
const PESTANAS = ['documentosRecibidos', 'iniciarProcesos', 'vinculacionCodigos', 'vinculacionOrdenes',
  'solicitudDiferencias', 'documentosListos', 'documentosImputados', 'documentosEdicion'];

// Usuario guardado con la estructura ANTERIOR: pestañas sin secciones,
// Con Código sin acciones/columnas, y Laboratorio Códigos en el menú sin
// entrada granular (estaba fuera del mapa). Encargado sin centro de costo
// (para un Operador el centro es obligatorio).
const usuarioExistente = () => ({
  id: 'u1',
  nombreCompleto: 'Usuario Prueba',
  nombreUsuario: 'uprueba',
  email: 'u@prueba.cl',
  rol: 'encargado',
  permisos: {
    laboratorio: [CP, '/laboratorio/codigoLaboratorio'],
    maestros: ['/maestros/codigosMaestros'],
  },
  permisosGranulares: {
    [CP]: { filtros_busqueda: { visible: true, elements: { input_busqueda: true } } },
    ...Object.fromEntries(PESTANAS.map((p) => [`${CP}/${p}`, {}])),
    '/maestros/codigosMaestros': {},
    '/maestros/codigosMaestros/conCodigo': {
      tabla_datos: { visible: true, elements: {} },
      barra_busqueda: { visible: false, elements: {} }, // restricción previa: debe conservarse
    },
    '/maestros/codigosMaestros/pendientes': {},
  },
});

const bloque = (aria) => screen.getByLabelText(aria).closest('.rounded-lg');
const expandir = (aria) => fireEvent.click(within(bloque(aria)).getByRole('button', { name: 'Expandir' }));
const casilla = (contenedor, texto) => within(contenedor).getByText(texto).closest('label').querySelector('input');

beforeEach(() => { llamadas.length = 0; plantillasDocs = []; confirmAction.mockClear(); });
// Lo que la función escribe en el usuario: rol, datos y permiso efectivo.
const guardadoPorLaFuncion = () => {
  const { datos } = llamadas.at(-1);
  return { ...datos.datos, rol: datos.rol, centroCostoId: datos.centroCostoId, excepciones: datos.excepciones, ...combinar(null, datos.excepciones) };
};
// Mismo criterio que useGranularPermission para una acción.
const permitido = (g, ruta, seccion, accion) => Boolean(g[ruta]) && g[ruta][seccion]?.visible !== false && g[ruta][seccion]?.elements?.[accion] !== false;
afterEach(cleanup);

describe('Listado Usuario → Editar usuario (pantalla completa)', () => {
  it('muestra lo nuevo marcado, guarda solo lo cambiado y se aplica al entrar', async () => {
    const usuario = usuarioExistente();
    const onVolver = vi.fn();
    render(<EditarUsuario usuario={usuario} onVolver={onVolver} />);

    // Encabezado fijo con identidad del usuario; sin cambios todavía.
    expect(screen.getByRole('heading', { name: 'Usuario Prueba' })).toBeInTheDocument();
    expect(screen.getByText('u@prueba.cl')).toBeInTheDocument();
    expect(screen.queryByText('Tienes cambios sin guardar')).not.toBeInTheDocument();
    // Laboratorio Códigos estaba sin configurar: se completa y se puede guardar ya.
    expect(screen.getByRole('button', { name: /Guardar cambios/ })).toBeEnabled();

    // Columna izquierda: módulos con contador; arranca en el primero con permisos (Laboratorio).
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    expect(within(nav).getByText('Laboratorio')).toBeInTheDocument();
    expect(within(bloque('Habilitar Maestro Códigos')).getByText('Pendiente de revisión')).toBeInTheDocument();

    // 1) Quitar la pestaña "Vinculación de Órdenes" de Control Procesos.
    expandir('Habilitar Control Procesos');
    ['Documentos Recibidos', 'Ingreso de Folios', 'Vinculación de Códigos', 'Vinculación de Órdenes',
      'Solicitud Diferencias', 'Documentos Listos', 'Documentos Imputados', 'Edición']
      .forEach((p) => expect(screen.getByLabelText(`Habilitar Pestaña: ${p}`)).toBeChecked());
    const vincOrd = screen.getByLabelText('Habilitar Pestaña: Vinculación de Órdenes');
    expect(vincOrd).toBeChecked();
    fireEvent.click(vincOrd);
    expect(vincOrd).not.toBeChecked();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();

    // 2) Maestros → Códigos → Con Código: acciones y columnas nuevas MARCADAS por defecto.
    fireEvent.click(within(nav).getByText('Maestros'));
    expandir('Habilitar Codigos');
    expandir('Habilitar Pestaña: Con Código (TabConCodigoV2.jsx)');
    const conCodigo = bloque('Habilitar Pestaña: Con Código (TabConCodigoV2.jsx)');
    expect(within(conCodigo).getByText('Marcar todo')).toBeInTheDocument();
    const eliminar = casilla(conCodigo, 'Eliminar');
    expect(eliminar).toBeChecked();
    expect(casilla(conCodigo, 'Editar')).toBeChecked();
    // Columnas: sub-bloque cerrado por defecto.
    expect(within(conCodigo).queryByText('Precio Neto')).not.toBeInTheDocument();
    fireEvent.click(within(conCodigo).getByText('Columnas de la tabla'));
    expect(within(conCodigo).getByText('14/14')).toBeInTheDocument();
    expect(casilla(conCodigo, 'Precio Neto')).toBeChecked();

    fireEvent.click(eliminar);
    fireEvent.click(casilla(conCodigo, 'Precio Neto'));
    expect(within(conCodigo).getByText('13/14')).toBeInTheDocument();

    // 3) Datos generales: cambiar el nombre.
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Usuario Editado' } });
    // El administrador puede cambiar el correo directamente (queda en la auditoría).
    expect(screen.getByLabelText('Correo')).not.toBeDisabled();

    // Salir con cambios pide confirmación.
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cambios sin guardar');
    fireEvent.click(screen.getByText('Seguir editando'));
    expect(onVolver).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await vi.waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].nombre).toBe('guardarPermisosUsuario');
    expect(llamadas[0].datos.uid).toBe('u1');
    const guardado = guardadoPorLaFuncion();
    const g = guardado.permisosGranulares;

    expect(guardado.nombreCompleto).toBe('Usuario Editado');
    expect(guardado.rol).toBe('encargado');
    expect(llamadas[0].datos.datos.email).toBeUndefined(); // sin cambio de correo
    // Lo desmarcado queda guardado como quitado.
    expect(g[`${CP}/vinculacionOrdenes`]).toBeUndefined();
    expect(g['/maestros/codigosMaestros/conCodigo'].tabla_datos.elements.action_eliminar).toBe(false);
    expect(g['/maestros/codigosMaestros/conCodigo'].tabla_datos.elements.col_precioNeto).toBe(false);
    // Lo no tocado se conserva (incluida una restricción previa) y lo nuevo queda permitido.
    expect(g['/maestros/codigosMaestros/conCodigo'].barra_busqueda.visible).toBe(false);
    expect(permitido(g, '/maestros/codigosMaestros/conCodigo', 'tabla_datos', 'action_editar')).toBe(true);
    expect(permitido(g, CP, 'filtros_busqueda', 'input_busqueda')).toBe(true);
    expect(permitido(g, `${CP}/documentosRecibidos`, 'tabla_documentos', 'btn_eliminar')).toBe(true);
    expect(permitido(g, '/laboratorio/codigoLaboratorio', 'tabla', 'btn_eliminar')).toBe(true);
    // Sin centro de costo: todos sus permisos quedan como propios (agregados).
    expect(guardado.centroCostoId).toBeNull();
    expect(guardado.excepciones.agregados).toContain(`m|maestros|/maestros/codigosMaestros`);
    expect(guardado.permisos).toEqual(usuario.permisos);
    await vi.waitFor(() => expect(screen.queryByText('Tienes cambios sin guardar')).not.toBeInTheDocument());

    // Volver a abrir con lo guardado: lo quitado sigue quitado.
    cleanup();
    const reabierto = { ...usuario, ...guardado };
    render(<EditarUsuario usuario={reabierto} onVolver={() => {}} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/ })).toBeDisabled();
    expandir('Habilitar Control Procesos');
    expect(screen.getByLabelText('Habilitar Pestaña: Vinculación de Órdenes')).not.toBeChecked();
    expect(within(bloque('Habilitar Maestro Códigos')).queryByText('Pendiente de revisión')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Módulos' })).getByText('Maestros'));
    expandir('Habilitar Codigos');
    expandir('Habilitar Pestaña: Con Código (TabConCodigoV2.jsx)');
    const conCodigo2 = bloque('Habilitar Pestaña: Con Código (TabConCodigoV2.jsx)');
    expect(casilla(conCodigo2, 'Eliminar')).not.toBeChecked();
    fireEvent.click(within(conCodigo2).getByText('Columnas de la tabla'));
    expect(casilla(conCodigo2, 'Precio Neto')).not.toBeChecked();

    // Al entrar con ese usuario, se aplica.
    usuarioSesion = reabierto;
    const { result } = renderHook(() => useGranularPermission());
    expect(result.current.hasAccesoProceso(`${CP}/vinculacionOrdenes`)).toBe(false);
    expect(result.current.hasAccesoProceso(`${CP}/documentosRecibidos`)).toBe(true);
    expect(result.current.hasPermission('/maestros/codigosMaestros/conCodigo', 'tabla_datos', 'action_eliminar')).toBe(false);
    expect(result.current.hasPermission('/laboratorio/codigoLaboratorio', 'tabla', 'btn_eliminar')).toBe(true);
    const { result: cols } = renderHook(() =>
      useColumnasPermitidas('/maestros/codigosMaestros/conCodigo', 'tabla_datos', [{ key: 'codigo' }, { key: 'precioNeto' }]));
    expect(cols.current.columnasVisibles.map((c) => c.key)).toEqual(['codigo']);
  });

  it('el buscador filtra módulos y vistas por cualquier permiso', () => {
    render(<EditarUsuario usuario={usuarioExistente()} onVolver={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    fireEvent.change(screen.getByLabelText('Buscar permisos'), { target: { value: 'vinculacion de ordenes' } });
    const visibles = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(visibles.some((t) => t.startsWith('Laboratorio'))).toBe(true);
    expect(visibles.some((t) => t.startsWith('Maestros'))).toBe(false);
    expect(screen.getByLabelText('Habilitar Control Procesos')).toBeInTheDocument();
    expect(screen.queryByLabelText('Habilitar Registro Empresas')).not.toBeInTheDocument();
  });
});

describe('Editar usuario con centro de costo (plantilla + excepciones)', () => {
  const MC = '/laboratorio/codigoLaboratorio';
  const PLANTILLA = { permisos: { laboratorio: [MC] }, permisosGranulares: { [MC]: { formulario: { visible: true, elements: { btn_cancelar: false } } } } };
  const conCentro = () => ({
    id: 'u2', nombreCompleto: 'Ana Lab', nombreUsuario: 'alab', email: 'a@lab.cl', rol: 'operador',
    centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] }, ...combinar(PLANTILLA),
  });
  const origenDe = (input) => input.closest('label').querySelector('[data-origen]')?.dataset.origen ?? null;

  it('distingue heredado / agregado / quitado, guarda solo las excepciones y restablece a la plantilla', async () => {
    plantillasDocs = [['lab__operador', PLANTILLA]];
    render(<EditarUsuario usuario={conCentro()} onVolver={() => {}} />);
    expect(screen.getByText('Hereda la plantilla de este centro y rol.')).toBeInTheDocument();
    expect(screen.getByText('Sin permisos personalizados')).toBeInTheDocument();
    const vista = bloque('Habilitar Maestro Códigos');
    expect(vista.querySelector('[data-origen]').dataset.origen).toBe('heredado');

    expandir('Habilitar Maestro Códigos');
    const codigo = casilla(vista, 'Código');
    const cancelar = casilla(vista, 'Botón Cancelar');
    expect(codigo).toBeChecked();
    expect(origenDe(codigo)).toBe('heredado');
    expect(cancelar).not.toBeChecked(); // la plantilla no lo da

    fireEvent.click(codigo); // quitar uno heredado
    fireEvent.click(cancelar); // agregar uno que la plantilla no da
    expect(origenDe(casilla(vista, 'Código'))).toBe('quitado');
    expect(origenDe(casilla(vista, 'Botón Cancelar'))).toBe('agregado');
    expect(screen.getByText('2 personalizado(s): +1 / −1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await vi.waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).toMatchObject({
      uid: 'u2',
      centroCostoId: 'lab',
      excepciones: { agregados: [`e|${MC}|formulario|btn_cancelar`], quitados: [`e|${MC}|formulario|input_codigo`] },
    });

    // Restablecer a la plantilla (con confirmación).
    fireEvent.click(screen.getByRole('button', { name: /Restablecer a la plantilla/ }));
    expect(confirmAction).toHaveBeenCalledWith('Restablecer a la plantilla', expect.any(String), expect.any(Function), expect.any(Object));
    await act(async () => { confirmAction.mock.calls.at(-1)[2](); });
    expect(screen.getByText('Sin permisos personalizados')).toBeInTheDocument();
    expect(casilla(vista, 'Código')).toBeChecked();
  });

  it('si la plantilla cambia mientras se edita, se ve y no se vuelve excepción', async () => {
    plantillasDocs = [['lab__operador', PLANTILLA]];
    render(<EditarUsuario usuario={conCentro()} onVolver={() => {}} />);
    expandir('Habilitar Maestro Códigos');
    expect(casilla(bloque('Habilitar Maestro Códigos'), 'Botón Cancelar')).not.toBeChecked();
    // Otro administrador guarda la plantilla: llega por el listener.
    plantillasDocs = [['lab__operador', { ...PLANTILLA, permisosGranulares: { [MC]: { formulario: { visible: true, elements: { btn_cancelar: true } } } } }]];
    await act(async () => { escucharPlantillas(snapshotPlantillas()); });
    const cancelar = casilla(bloque('Habilitar Maestro Códigos'), 'Botón Cancelar');
    expect(cancelar).toBeChecked();
    expect(origenDe(cancelar)).toBe('heredado');
    expect(screen.getByText('Sin permisos personalizados')).toBeInTheDocument();
  });

  it('al cambiar de centro con excepciones avisa y ofrece limpiarlas', () => {
    plantillasDocs = [['lab__operador', PLANTILLA]];
    const u = { ...conCentro(), excepciones: { agregados: [`e|${MC}|formulario|btn_cancelar`], quitados: [] } };
    render(<EditarUsuario usuario={u} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar centro de costo' }));
    expect(confirmAction).toHaveBeenCalledWith('Cambiar centro de costo', expect.stringContaining('+1 agregado, −0 quitados'), expect.any(Function),
      expect.objectContaining({ confirmText: 'Limpiar excepciones', cancelText: 'Mantenerlas' }));
  });
});

describe('Editar usuario: centro sin configurar', () => {
  it('avisa y enlaza a Permisos por centro', () => {
    plantillasDocs = []; // ningún centro configurado
    const onIrAPermisosCentro = vi.fn();
    const u = { id: 'u3', nombreCompleto: 'Eva', nombreUsuario: 'eva', email: 'e@x.cl', rol: 'operador', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] }, permisos: {}, permisosGranulares: {} };
    render(<EditarUsuario usuario={u} onVolver={() => {}} onIrAPermisosCentro={onIrAPermisosCentro} />);
    expect(screen.getByText('Esta combinación no tiene permisos configurados: no otorga permisos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent('LABORATORIO – Operador aún no tiene permisos configurados');
    fireEvent.click(within(aviso).getByRole('button', { name: /Configurar en Permisos por centro/ }));
    expect(onIrAPermisosCentro).toHaveBeenCalled(); // sin cambios: va directo
  });
});

describe('Editar usuario: centro + rol', () => {
  const MC = '/laboratorio/codigoLaboratorio';
  const OPERADOR = { permisos: { laboratorio: [MC] }, permisosGranulares: { [MC]: { formulario: { visible: true, elements: { btn_cancelar: false } } } } };
  const ENCARGADO = { permisos: { laboratorio: [MC], maestros: ['/maestros/codigosMaestros'] }, permisosGranulares: { [MC]: {}, '/maestros/codigosMaestros': {} } };
  const exc = { agregados: ['e|/laboratorio/codigoLaboratorio|formulario|btn_cancelar', 'm|administracion|/administracion/notasAdmin', 'v|/administracion/notasAdmin'], quitados: ['e|/laboratorio/codigoLaboratorio|formulario|input_codigo'] };
  const usuario = () => ({ id: 'u5', nombreCompleto: 'Ana', nombreUsuario: 'ana', email: 'a@x.cl', rol: 'operador', centroCostoId: 'lab', excepciones: exc, ...combinar(OPERADOR, exc) });

  it('al cambiar el rol usa la plantilla del nuevo rol al instante, muestra las excepciones y las conserva', async () => {
    plantillasDocs = [['lab__operador', OPERADOR], ['lab__encargado', ENCARGADO]];
    render(<EditarUsuario usuario={usuario()} onVolver={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    expect(within(nav).queryByText('Maestros')?.closest('button')).toHaveTextContent('0/');
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'encargado' } });
    expect(confirmAction).toHaveBeenCalledWith('Cambiar rol', expect.stringContaining('+3 agregados, −1 quitado'), expect.any(Function),
      expect.objectContaining({ confirmText: 'Limpiar excepciones', cancelText: 'Mantenerlas' }));
    expect(confirmAction.mock.calls.at(-1)[1]).toContain('la plantilla de LABORATORIO – Encargado de centro');
    expect(screen.getByText('Hereda los permisos de LABORATORIO – Encargado de centro (ver pestaña Permisos).')).toBeInTheDocument();
    // Mantenerlas (no se confirma): el permiso efectivo ya es Encargado + excepciones.
    fireEvent.click(screen.getByRole('tab', { name: /Permisos/ }));
    expect(within(screen.getByRole('navigation', { name: 'Módulos' })).getByText('Maestros').closest('button')).not.toHaveTextContent(/\b0\//);
    expect(screen.getByText('4 personalizado(s): +3 / −1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await vi.waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].datos).toMatchObject({ uid: 'u5', rol: 'encargado', centroCostoId: 'lab', excepciones: exc });
  });

  it('limpiar las excepciones al cambiar de rol deja solo la plantilla del nuevo rol', async () => {
    plantillasDocs = [['lab__operador', OPERADOR], ['lab__encargado', ENCARGADO]];
    render(<EditarUsuario usuario={usuario()} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'encargado' } });
    await act(async () => { confirmAction.mock.calls.at(-1)[2](); });
    fireEvent.click(screen.getByRole('tab', { name: /Permisos/ }));
    expect(screen.getByText('Sin permisos personalizados')).toBeInTheDocument();
  });

  it('una combinación sin plantilla muestra el aviso; admin/dev no usan plantilla', () => {
    plantillasDocs = [['lab__operador', OPERADOR]];
    render(<EditarUsuario usuario={{ ...usuario(), excepciones: { agregados: [], quitados: [] } }} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'encargado' } });
    expect(screen.getByRole('alert')).toHaveTextContent('LABORATORIO – Encargado de centro aún no tiene permisos configurados');
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'admin' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Su rol (Administrador del sistema) no usa la plantilla del centro: solo sus permisos propios.')).toBeInTheDocument();
  });
});

describe('Editar usuario: nombre de usuario', () => {
  const editar = (u, nombreUsuario) => {
    render(<EditarUsuario usuario={u} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: nombreUsuario } });
  };
  const guardar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ })); });

  it.each([
    ['u@prueba.cl', 'El nombre de usuario no puede contener "@".'],
    ['u prueba', 'El nombre de usuario no puede contener espacios.'],
    ['  ', 'El nombre de usuario es obligatorio.'],
  ])('"%s" no se guarda: %s', async (nombreUsuario, mensaje) => {
    editar(usuarioExistente(), nombreUsuario);
    await guardar();
    expect(llamadas).toEqual([]);
    expect(screen.getByText(mensaje)).toBeInTheDocument();
  });

  it('si ya está en uso, lo indica en el campo', async () => {
    fallo = Object.assign(new Error('Ese nombre de usuario ya está en uso.'), { code: 'functions/already-exists' });
    editar(usuarioExistente(), 'otro');
    await guardar();
    fallo = null;
    expect(llamadas.at(-1).datos.datos.nombreUsuario).toBe('otro');
    expect(screen.getByText('Ese nombre de usuario ya está en uso.')).toBeInTheDocument();
  });
});

describe('Editar usuario: correo, centro y administradores', () => {
  const guardar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ })); });
  const ADMINS = [
    { id: 'a1', nombreCompleto: 'Admin Lab', rol: 'admin', centrosAdministrados: ['lab'] },
    { id: 'a2', nombreCompleto: 'Admin Otro', rol: 'admin', centrosAdministrados: ['otro'] },
    { id: 'a3', nombreCompleto: 'Admin Inactivo', rol: 'admin', centrosAdministrados: ['lab'], activo: false },
  ];
  const operador = (extra = {}) => ({ id: 'op', nombreCompleto: 'Op', nombreUsuario: 'op', email: 'op@x.cl', rol: 'operador', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] }, permisos: {}, permisosGranulares: {}, ...extra });

  it('un Operador sin centro no se guarda', async () => {
    render(<EditarUsuario usuario={operador({ centroCostoId: null })} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Op 2' } });
    await guardar();
    expect(llamadas).toEqual([]);
    expect(screen.getByText('El centro de costo es obligatorio para un Operador.')).toBeInTheDocument();
  });

  it('ofrece solo los administradores activos de su centro y guarda los elegidos', async () => {
    render(<EditarUsuario usuario={operador()} usuarios={ADMINS} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    expect(screen.queryByLabelText('Admin Otro')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Admin Inactivo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Admin Lab'));
    await guardar();
    expect(llamadas[0].datos).toMatchObject({ administradoresAsignados: ['a1'], todosLosAdministradoresDelCentro: false });
  });

  it('cambiar el correo lo envía (la función lo cambia en Auth)', async () => {
    render(<EditarUsuario usuario={operador()} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'Nuevo@X.cl' } });
    await guardar();
    expect(llamadas[0].datos.datos.email).toBe('Nuevo@X.cl');
  });

  it('un Administrador elige los centros que administra', async () => {
    render(<EditarUsuario usuario={{ ...operador(), rol: 'admin', centrosAdministrados: [] }} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Datos generales/ }));
    fireEvent.click(screen.getByLabelText('LABORATORIO'));
    await guardar();
    expect(llamadas[0].datos.centrosAdministrados).toEqual(['lab']);
  });
});
