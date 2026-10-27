// @vitest-environment jsdom
// Reporte Info → columna "Gestión implante": badge por estado, filtro con
// contador (admisiones distintas), exportación a Excel y detalle de la
// gestión dentro de Reporte Info (abrir / volver con el estado conservado,
// varias gestiones, no encontrada, URL y permisos).
// Descripciones ocultas: consulta por módulo, "Mostrar ocultas", contadores,
// exportación, acción rápida y excepción de admisiones con gestión.
// Columna "Gestión consignación": misma marca con la colección de
// Consignación (oculta en los tests de Implantes para no mezclar badges).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const RUTA_200 = 'implantes_gestiones/2026/mes/10/dia/05/admision/200/empresa/ACME/detalles/g1';
const MARCAS = {
  200: { estado: 'gestionada', cantidad: 1, itemsPendientes: 2, gestiones: { [RUTA_200.replaceAll('/', '|')]: {} } },
  300: { estado: 'cargada', cantidad: 2, itemsPendientes: 0, gestiones: { 'a|1': {}, 'a|2': {} } },
  400: { estado: 'imputada', cantidad: 1, itemsPendientes: 0, gestiones: { 'b|1': {} } },
};
const MARCAS_CONSIGNACION = {
  100: { estado: 'gestionada', cantidad: 2, itemsPendientes: 1 },
  300: { estado: 'imputada', cantidad: 1, itemsPendientes: 0 },
};
// Gestiones (por ruta) del detalle: 200 tiene una; 300 dos; la de 400 ya no existe.
const item = (id, extra = {}) => ({ id, codigo: `C-${id}`, cantidad: 1, recargoEncontrado: true, estadoCarga: 'PENDIENTE', totalItem: 0, ...extra });
const GESTIONES = {
  [RUTA_200]: {
    gestionId: '200', nombre: 'BETO PEREZ', medico: 'DR. GOMEZ', empresa: 'ACME', fecha: '2026-10-05', estado: 'AGENDADO',
    descripcion: 'Osteosíntesis de clavícula', observacion: 'Traer set completo', solicitud: 'PENDIENTE',
    cotizaciones: [{ id: 'c1', numCotizacion: 'COT-1', totalCotizacion: 300, items: [
      item('i1', { referencia: 'TORNILLO', totalItem: 100, estadoCarga: 'CARGADO' }),
      item('i2', { referencia: 'PLACA', totalItem: 200 }),
      item('p1', { referencia: 'PAD TRAUMA', esPad: true }),
      item('p1c', { referencia: 'CONTENIDO A', padPadreId: 'p1', cantidad: 2 }),
    ] }],
  },
  'a/1': { gestionId: '300', nombre: 'CARLA', empresa: 'EMPRESA UNO', fecha: '2026-10-03', cotizaciones: [{ id: 'c', numCotizacion: 'COT-U', items: [item('u1', { referencia: 'UNO', estadoCarga: 'CARGADO' })] }] },
  'a/2': { gestionId: '300', nombre: 'CARLA', empresa: 'EMPRESA DOS', fecha: '2026-10-04', solicitud: 'SOLICITADO', cotizaciones: [{ id: 'c', numCotizacion: 'COT-D', items: [item('d1', { referencia: 'DOS', estadoCarga: 'CARGADO' })] }] },
};
const VISIBLE = { ocultaImplantes: false, ocultaDocumentos: false, descripcionOcultaImplantes: false };
// r2: CESAREA oculta en Implantes, pero su admisión tiene gestión (aviso).
// r6: CESAREA oculta en Implantes (sin gestión); visible en Documentos.
const REGISTROS = [
  { id: 'r1', Fecha: '2026-10-05', 'Admisión': 100, Paciente: 'ANA', 'Descripción': 'RODILLA', ...VISIBLE },
  { id: 'r2', Fecha: '2026-10-05', 'Admisión': 200, Paciente: 'BETO', 'Descripción': 'CESAREA', ...VISIBLE, descripcionOcultaImplantes: true },
  { id: 'r3', Fecha: '2026-10-04', 'Admisión': 300, Paciente: 'CARLA', 'Descripción': 'RODILLA', ...VISIBLE },
  { id: 'r4', Fecha: '2026-10-04', 'Admisión': '300', Paciente: 'CARLA', 'Descripción': 'Rodilla', ...VISIBLE },
  { id: 'r5', Fecha: '2026-10-03', 'Admisión': 400, Paciente: 'DANI', 'Descripción': 'HOMBRO', ...VISIBLE },
  { id: 'r6', Fecha: '2026-10-04', 'Admisión': 500, Paciente: 'EVA', 'Descripción': 'CESAREA', ...VISIBLE, ocultaImplantes: true, descripcionOcultaImplantes: true },
];
const filtrar = (ref) => {
  const w = ref.filtros?.[0];
  return w ? REGISTROS.filter((r) => r[w.campo] === w.valor) : REGISTROS;
};
const consultasRegistros = [];
const lecturasDetalle = [];
const escrituras = [];
const lecturasMarcas = [];
const lecturasMarcasConsignacion = [];
const docs = (lista) => ({ docs: lista.map(({ id, ...d }) => ({ id, data: () => d })) });
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...ruta) => ruta.join('/'),
  doc: (_db, ...ruta) => ruta.join('/'),
  query: (c, ...filtros) => ({ c, filtros }),
  where: (campo, _op, valor) => ({ campo, valor }),
  documentId: () => '__id__',
  writeBatch: vi.fn(), serverTimestamp: () => 'ahora',
  updateDoc: async (ref, datos) => { escrituras.push({ ref, datos }); },
  getDoc: async (ruta) => {
    lecturasDetalle.push(ruta);
    const [col, id] = ruta.split('/');
    const datos = col === 'admisiones_gestionadas_implantes' ? MARCAS[id]
      : col === 'maestros_descripciones_reporte' ? { filas: 7 }
        : GESTIONES[ruta];
    return { exists: () => Boolean(datos), data: () => datos };
  },
  getCountFromServer: async (ref) => ({ data: () => ({ count: filtrar(ref).length }) }),
  getDocs: async (ref) => {
    const ruta = typeof ref === 'string' ? ref : ref.c;
    if (ruta === 'documentos_reportesInfo') return docs([{ id: '2026' }]);
    if (ruta === 'documentos_reportesInfo/2026/meses') return docs([{ id: 'octubre' }]);
    if (ruta.endsWith('/registros')) { consultasRegistros.push(ref.filtros[0]); return docs(filtrar(ref)); }
    if (ruta === 'admisiones_gestionadas_implantes') {
      const ids = ref.filtros[0].valor;
      lecturasMarcas.push(ids);
      return docs(ids.filter((id) => MARCAS[id]).map((id) => ({ id, ...MARCAS[id] })));
    }
    if (ruta === 'admisiones_gestionadas_consignacion') {
      const ids = ref.filtros[0].valor;
      lecturasMarcasConsignacion.push(ids);
      return docs(ids.filter((id) => MARCAS_CONSIGNACION[id]).map((id) => ({ id, ...MARCAS_CONSIGNACION[id] })));
    }
    throw new Error(`ruta inesperada ${ruta}`);
  },
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, auth: {} }));
vi.mock('react-dropzone', () => ({ useDropzone: () => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false }) }));
const excel = { filas: null, archivo: null };
vi.mock('xlsx', () => ({
  utils: { json_to_sheet: (f) => { excel.filas = f; return {}; }, book_new: () => ({}), book_append_sheet: () => {} },
  writeFile: (_l, nombre) => { excel.archivo = nombre; },
  read: vi.fn(),
}));
let usuario;
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
// showToast estable: cargarPrimeraPagina depende de él.
const toast = { showToast: vi.fn() };
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));
let denegados;
vi.mock('../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: (_r, s, el) => !denegados.has(`${s}.${el}`) }),
}));
let columnasOcultas;
vi.mock('../../../../../hooks/useColumnasPermitidas', () => ({
  useColumnasPermitidas: (_r, _t, cols) => ({ columnasVisibles: cols.filter((c) => !columnasOcultas.has(c.key)), ver: (k) => !columnasOcultas.has(k) }),
}));

const { default: ReportesInfo } = await import('./ReportesInfo');

beforeEach(() => {
  lecturasMarcas.length = 0; lecturasMarcasConsignacion.length = 0; excel.filas = null; excel.archivo = null;
  denegados = new Set(); columnasOcultas = new Set(['gestionConsignacion']);
  consultasRegistros.length = 0; escrituras.length = 0; lecturasDetalle.length = 0;
  window.history.replaceState(null, '', '/');
  usuario = { uid: 'u1', rol: 'usuario', permisos: { implantes: ['/implantes/gestionImplantes', '/implantes/reportesInfo'] } };
});
afterEach(cleanup);

const montar = async (props = {}, pathVista = '/implantes/reportesInfo') => {
  render(<ReportesInfo pathVista={pathVista} {...props} />);
  const [anio, mes] = screen.getAllByRole('combobox');
  await waitFor(() => expect(within(anio).getByText('2026')).toBeInTheDocument());
  fireEvent.change(anio, { target: { value: '2026' } });
  await waitFor(() => expect(within(mes).getByText('octubre')).toBeInTheDocument());
  fireEvent.change(mes, { target: { value: 'octubre' } });
  await waitFor(() => expect(document.querySelector('[data-estado="imputada"]')).toBeInTheDocument());
};
const estados = () => [...document.querySelectorAll('tbody [data-estado]')].map((b) => b.dataset.estado);

describe('Reporte Info → Gestión implante', () => {
  it('muestra el badge de cada admisión con su tooltip, leyendo solo las admisiones del mes', async () => {
    await montar();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Gestión implante');
    expect(estados()).toEqual(['pendiente', 'gestionada', 'cargada', 'cargada', 'imputada']);
    expect(lecturasMarcas).toEqual([['100', '200', '300', '400']]);
    const gestionada = document.querySelector('tbody [data-estado="gestionada"]');
    expect(gestionada).toHaveTextContent('Gestionada');
    expect(gestionada.title).toMatch(/faltan 2 ítem/);
    expect(document.querySelector('tbody [data-estado="pendiente"]').title).toBe('Sin gestión en Implantes');
    expect(document.querySelector('tbody [data-estado="imputada"] svg')).toBeInTheDocument(); // candado
  });

  it('marcar "Revisado" no vuelve a leer las marcas', async () => {
    await montar();
    const consultas = lecturasMarcas.length;
    const fila = document.querySelector('tbody [data-estado="pendiente"]').closest('tr');
    fireEvent.change(within(fila).getByRole('combobox'), { target: { value: 'Revisado' } });
    await waitFor(() => expect(within(fila).getByRole('combobox')).toHaveValue('Revisado'));
    expect(lecturasMarcas.length).toBe(consultas);
  });

  it('filtra por estado con contador de admisiones distintas', async () => {
    await montar();
    const filtro = screen.getByLabelText('Filtrar por gestión implante');
    expect([...filtro.options].map((o) => o.textContent)).toEqual([
      'Gestión implante (Todas)', 'Pendiente (1 adm.)', 'Gestionada (1 adm.)', 'Cargada (1 adm.)', 'Imputada (1 adm.)',
    ]);
    fireEvent.change(filtro, { target: { value: 'cargada' } });
    expect(estados()).toEqual(['cargada', 'cargada']);
    fireEvent.change(filtro, { target: { value: 'pendiente' } });
    expect(estados()).toEqual(['pendiente']);
  });

  it('exporta a Excel lo filtrado con estado, gestiones e ítems pendientes', async () => {
    await montar();
    fireEvent.change(screen.getByLabelText('Filtrar por gestión implante'), { target: { value: 'gestionada' } });
    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }));
    expect(excel.archivo).toBe('reportes_info_2026_octubre.xlsx');
    expect(excel.filas).toHaveLength(1);
    expect(excel.filas[0]).toMatchObject({ 'Admisión': 200, 'Gestión implante': 'Gestionada', Gestiones: 1, 'Ítems pendientes': 2 });
  });

  it('sin el permiso de exportar no aparece el botón; sin la columna, ni el badge ni el filtro', async () => {
    denegados = new Set(['cabecera_acciones.btn_exportar']);
    columnasOcultas = new Set(['gestionImplante']);
    render(<ReportesInfo pathVista="/documentos/reportesInfo" />);
    await waitFor(() => expect(within(screen.getAllByRole('combobox')[0]).getByText('2026')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Exportar Excel/ })).toBeNull();
    expect(screen.queryByLabelText('Filtrar por gestión implante')).toBeNull();
    expect(screen.queryAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Gestión implante');
  });

  it('el ícono de detalle está en las filas con gestión (no en la pendiente)', async () => {
    await montar();
    expect(screen.getAllByRole('button', { name: 'Ver el detalle de la gestión' })).toHaveLength(4);
  });

  it('sin acceso a Gestiones no se muestra el enlace', async () => {
    usuario = { uid: 'u2', rol: 'usuario', permisos: { documentos: ['/documentos/reportesInfo'] } };
    await montar({ onAbrirGestionImplante: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Ver el detalle de la gestión' })).toBeNull();
  });
});

describe('Reporte Info → selector de días', () => {
  const dias = () => [...screen.getByLabelText('Filtrar por día').options].map((o) => o.value).filter(Boolean);

  it('muestra solo los días con filas que cumplen los filtros; sin filtros, todos', async () => {
    await montar();
    expect(dias()).toEqual(['03', '04', '05']);
    fireEvent.change(screen.getByLabelText('Filtrar por gestión implante'), { target: { value: 'cargada' } });
    expect(dias()).toEqual(['04']);
    fireEvent.change(screen.getByLabelText('Filtrar por revisado'), { target: { value: 'Revisado' } });
    expect(dias()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Filtrar por revisado'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filtrar por gestión implante'), { target: { value: '' } });
    expect(dias()).toEqual(['03', '04', '05']);
  });

  it('si el día elegido se queda sin filas (se revisó la última pendiente) vuelve a "Todos" con aviso', async () => {
    await montar();
    fireEvent.change(screen.getByLabelText('Filtrar por revisado'), { target: { value: 'Pendiente' } });
    fireEvent.change(screen.getByLabelText('Filtrar por día'), { target: { value: '03' } });
    expect(estados()).toEqual(['imputada']);
    toast.showToast.mockClear();
    const fila = document.querySelector('tbody [data-estado="imputada"]').closest('tr');
    fireEvent.change(within(fila).getByRole('combobox'), { target: { value: 'Revisado' } });
    await waitFor(() => expect(screen.getByLabelText('Filtrar por día')).toHaveValue(''));
    expect(dias()).toEqual(['04', '05']);
    expect(estados()).toEqual(['pendiente', 'gestionada', 'cargada', 'cargada']);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringMatching(/día 03 ya no tiene filas/), 'info');
  });
});

describe('Reporte Info → Gestión consignación', () => {
  const estadosConsignacion = () => [...document.querySelectorAll('tbody tr')]
    .map((tr) => tr.lastElementChild.querySelector('[data-estado]')?.dataset.estado);

  it('columna aparte junto a la de implantes, leyendo solo las admisiones del mes', async () => {
    columnasOcultas = new Set();
    await montar();
    const cabeceras = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(cabeceras.slice(-2)).toEqual(['Gestión implante', 'Gestión consignación']);
    expect(estadosConsignacion()).toEqual(['gestionada', 'pendiente', 'imputada', 'imputada', 'pendiente']);
    expect(lecturasMarcasConsignacion).toEqual([['100', '200', '300', '400']]);
    const fila100 = screen.getAllByText('ANA')[0].closest('tr');
    expect(fila100.lastElementChild.querySelector('[data-estado]').title).toMatch(/2 carga\(s\) en Consignación · faltan 1 carga/);
    // Sin detalle en Consignación: el ícono sigue solo en la columna de implantes.
    expect(screen.getAllByRole('button', { name: 'Ver el detalle de la gestión' })).toHaveLength(4);
  });

  it('filtra con su propio contador y exporta su estado al Excel', async () => {
    columnasOcultas = new Set();
    await montar();
    const filtro = screen.getByLabelText('Filtrar por gestión consignación');
    expect([...filtro.options].map((o) => o.textContent)).toEqual([
      'Gestión consignación (Todas)', 'Pendiente (2 adm.)', 'Gestionada (1 adm.)', 'Cargada (0 adm.)', 'Imputada (1 adm.)',
    ]);
    fireEvent.change(filtro, { target: { value: 'imputada' } });
    expect(estadosConsignacion()).toEqual(['imputada', 'imputada']);
    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }));
    expect(excel.filas[0]).toMatchObject({ 'Admisión': 300, 'Gestión implante': 'Cargada', 'Gestión consignación': 'Imputada', 'Cargas consignación': 1, 'Cargas pendientes': 0 });
  });

  it('sin la columna no lee las marcas de Consignación', async () => {
    await montar();
    expect(lecturasMarcasConsignacion).toEqual([]);
    expect(screen.queryByLabelText('Filtrar por gestión consignación')).toBeNull();
  });
});

const ids = () => [...document.querySelectorAll('tbody tr')].map((tr) => within(tr).queryByText(/ANA|BETO|CARLA|DANI|EVA/)?.textContent);
const fila = (paciente) => screen.getAllByText(paciente)[0].closest('tr');
const pie = () => document.querySelector('.border-t.p-2') || document.body;

describe('Reporte Info → Descripciones ocultas', () => {
  it('Implantes consulta solo las visibles y cuenta las ocultas; no cuentan en los contadores', async () => {
    await montar();
    expect(consultasRegistros).toContainEqual({ campo: 'ocultaImplantes', valor: false });
    expect(ids()).toEqual(['ANA', 'BETO', 'CARLA', 'CARLA', 'DANI']);
    expect(screen.getByRole('switch', { name: /Mostrar ocultas \(1\)/ })).not.toBeChecked();
    expect(pie()).toHaveTextContent('Ocultas: 1');
    expect(pie()).toHaveTextContent('Pendiente: 5');
  });

  it('"Mostrar ocultas" las muestra atenuadas, con etiqueta y sin "Revisado"; los contadores no cambian', async () => {
    await montar();
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar ocultas/ }));
    await waitFor(() => expect(screen.getByText('EVA')).toBeInTheDocument());
    const eva = fila('EVA');
    expect(eva).toHaveAttribute('data-oculta', 'true');
    expect(within(eva).getByText('Oculta')).toBeInTheDocument();
    expect(within(eva).getByText('No requiere')).toBeInTheDocument();
    expect(within(eva).queryByRole('combobox')).toBeNull();
    expect(pie()).toHaveTextContent('Pendiente: 5');
    expect([...screen.getByLabelText('Filtrar por gestión implante').options].map((o) => o.textContent)).toContain('Pendiente (1 adm.)');
    expect(consultasRegistros).toContainEqual({ campo: 'ocultaImplantes', valor: true });
  });

  it('la exportación excluye las ocultas salvo con "Mostrar ocultas"', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }));
    expect(excel.filas).toHaveLength(5);
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar ocultas/ }));
    await waitFor(() => expect(screen.getByText('EVA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }));
    expect(excel.filas).toHaveLength(6);
    expect(excel.filas.find((f) => f.Paciente === 'EVA')).toMatchObject({ Oculta: 'Sí', Revisado: 'No requiere' });
  });

  it('Documentos consulta su propio campo: la oculta en Implantes sí se ve, sin aviso', async () => {
    await montar({}, '/documentos/reportesInfo');
    expect(consultasRegistros).toContainEqual({ campo: 'ocultaDocumentos', valor: false });
    expect(ids()).toContain('EVA');
    expect(document.querySelector('[data-aviso="gestion"]')).toBeNull();
  });

  it('excepción: descripción oculta con gestión en Implantes se muestra con aviso', async () => {
    await montar();
    expect(within(fila('BETO')).getByTitle(/la admisión tiene gestión/)).toBeInTheDocument();
    expect(within(fila('BETO')).queryByRole('button', { name: 'Ocultar esta descripción' })).toBeNull();
  });

  it('"Ocultar esta descripción": confirma con las filas afectadas, oculta en el módulo y deja visibles las que tienen gestión', async () => {
    await montar();
    fireEvent.click(within(fila('ANA')).getByRole('button', { name: 'Ocultar esta descripción' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ocultar descripción' });
    await waitFor(() => expect(dialogo).toHaveTextContent('Afecta 7 fila(s) en total (3 en este mes)'));
    expect(dialogo).toHaveTextContent('2 fila(s) de este mes tienen gestión en Implantes');
    fireEvent.click(within(dialogo).getByRole('button', { name: /Ocultar/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(escrituras[0]).toMatchObject({ ref: 'maestros_descripciones_reporte/RODILLA', datos: { ocultaImplantes: true } });
    expect(escrituras[0].datos).not.toHaveProperty('ocultaDocumentos');
    expect(ids()).toEqual(['BETO', 'CARLA', 'CARLA', 'DANI']);
    expect(within(fila('CARLA')).getByTitle(/la admisión tiene gestión/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Mostrar ocultas \(2\)/ })).toBeInTheDocument();
  });

  it('sin permiso no hay switch ni acción rápida', async () => {
    denegados = new Set(['filas_ocultas.switch_mostrarOcultas', 'filas_ocultas.action_ocultarDescripcion']);
    await montar();
    expect(screen.queryByRole('switch', { name: /Mostrar ocultas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ocultar esta descripción' })).toBeNull();
  });
});

const abrirDe = (paciente) => fireEvent.click(within(fila(paciente)).getByRole('button', { name: 'Ver el detalle de la gestión' }));
const enDetalle = () => screen.queryByLabelText('Detalle de la gestión');
const tablaVisible = () => !screen.getByPlaceholderText(/Buscar por Admisión/).closest('.hidden');

describe('Reporte Info → detalle de la gestión (sin salir de Reporte Info)', () => {
  it('abre el detalle (lee solo esa gestión), muestra encabezado, resumen, notas e ítems en modo lectura', async () => {
    const onAbrir = vi.fn();
    await montar({ onAbrirGestionImplante: onAbrir });
    lecturasDetalle.length = 0;
    abrirDe('BETO');
    const detalle = enDetalle();
    expect(detalle).toBeInTheDocument();
    expect(tablaVisible()).toBe(false);
    expect(within(detalle).getByLabelText('Cargando gestión')).toBeInTheDocument();
    await waitFor(() => expect(within(detalle).getByText('BETO PEREZ')).toBeInTheDocument());
    expect(lecturasDetalle).toEqual(['admisiones_gestionadas_implantes/200', RUTA_200]);
    expect(window.location.search).toContain('detalle=200');
    expect(detalle).toHaveTextContent('Admisión 200');
    expect(detalle).toHaveTextContent('DR. GOMEZ');
    expect(detalle).toHaveTextContent('ACME');
    expect(within(detalle).getByLabelText('Resumen de la carga')).toHaveTextContent(/Ítems3Cargados1Pendientes2Monto total\$300ImputadaNo/);
    expect(detalle).toHaveTextContent('Osteosíntesis de clavícula');
    expect(detalle).toHaveTextContent('Traer set completo');
    // Tabla de Cargas en lectura: sin Acciones ni selects; PAD plegado.
    const encabezados = within(detalle).getAllByRole('columnheader').map((h) => h.textContent);
    expect(encabezados).toContain('Estado Carga');
    expect(encabezados).not.toContain('Acciones');
    expect(within(detalle).queryByRole('combobox')).toBeNull();
    expect(within(detalle).queryByText('CONTENIDO A')).toBeNull();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Ver contenido del PAD PAD TRAUMA' }));
    expect(within(detalle).getByText('CONTENIDO A')).toBeInTheDocument();
    fireEvent.click(within(detalle).getByRole('button', { name: /Abrir en Gestiones/ }));
    expect(onAbrir).toHaveBeenCalledWith({ admision: '200', refPath: RUTA_200 });
  });

  it('"Volver" deja la tabla exactamente como estaba, sin releer, con la fila resaltada', async () => {
    await montar();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por Admisión/), { target: { value: 'CARLA' } });
    await waitFor(() => expect(ids()).toEqual(['CARLA', 'CARLA']));
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar ocultas/ }));
    const consultas = consultasRegistros.length;
    abrirDe('CARLA');
    await waitFor(() => expect(within(enDetalle()).getAllByRole('tab')).toHaveLength(2));
    fireEvent.click(within(enDetalle()).getByRole('button', { name: /Volver a Reporte Info/ }));
    await waitFor(() => expect(enDetalle()).toBeNull());
    expect(tablaVisible()).toBe(true);
    expect(screen.getByPlaceholderText(/Buscar por Admisión/)).toHaveValue('CARLA');
    expect(screen.getByRole('switch', { name: /Mostrar ocultas/ })).toBeChecked();
    expect(ids()).toEqual(['CARLA', 'CARLA']);
    expect(document.querySelector('tr[data-origen]')).toHaveTextContent('CARLA');
    expect(consultasRegistros.length).toBe(consultas);
    expect(window.location.search).toBe('');
  });

  it('Escape y el "atrás" del navegador también vuelven a la tabla', async () => {
    await montar();
    abrirDe('BETO');
    await waitFor(() => expect(within(enDetalle()).getByText('BETO PEREZ')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(enDetalle()).toBeNull());
    abrirDe('BETO');
    expect(enDetalle()).toBeInTheDocument();
    window.history.back();
    await waitFor(() => expect(enDetalle()).toBeNull());
    expect(tablaVisible()).toBe(true);
  });

  it('varias gestiones: pestañas con empresa, fecha y estado; se cambia entre ellas', async () => {
    await montar();
    abrirDe('CARLA');
    const detalle = enDetalle();
    await waitFor(() => expect(within(detalle).getAllByRole('tab')).toHaveLength(2));
    const [uno, dos] = within(detalle).getAllByRole('tab');
    expect(uno).toHaveTextContent('EMPRESA UNO03-10-2026Cargada');
    expect(dos).toHaveTextContent('EMPRESA DOS04-10-2026Imputada');
    expect(uno).toHaveAttribute('aria-selected', 'true');
    expect(within(detalle).getByText('UNO')).toBeInTheDocument();
    fireEvent.click(dos);
    expect(within(detalle).getByText('DOS')).toBeInTheDocument();
    expect(within(detalle).getByLabelText('Resumen de la carga')).toHaveTextContent(/Imputada\s*Sí/);
  });

  it('gestión no encontrada (eliminada): mensaje claro', async () => {
    await montar();
    abrirDe('DANI');
    await waitFor(() => expect(within(enDetalle()).getByRole('alert')).toHaveTextContent('Gestión no encontrada'));
  });

  it('al recargar con ?detalle= se abre el mismo detalle; sin permiso de Gestiones, no', async () => {
    window.history.replaceState(null, '', '/?vista=%2Fimplantes%2FreportesInfo&detalle=200&anio=2026&mes=octubre');
    render(<ReportesInfo pathVista="/implantes/reportesInfo" />);
    await waitFor(() => expect(within(enDetalle()).getByText('BETO PEREZ')).toBeInTheDocument());
    fireEvent.click(within(enDetalle()).getByRole('button', { name: /Volver a Reporte Info/ }));
    await waitFor(() => expect(enDetalle()).toBeNull());
    expect(window.location.search).toBe('');
    await waitFor(() => expect(ids()).toHaveLength(5)); // el mes de la URL
    cleanup();
    usuario = { uid: 'u2', rol: 'usuario', permisos: { implantes: ['/implantes/reportesInfo'] } };
    window.history.replaceState(null, '', '/?vista=%2Fimplantes%2FreportesInfo&detalle=200');
    render(<ReportesInfo pathVista="/implantes/reportesInfo" />);
    expect(enDetalle()).toBeNull();
  });

  it('funciona igual en Reporte Info de Documentos', async () => {
    await montar({}, '/documentos/reportesInfo');
    abrirDe('BETO');
    await waitFor(() => expect(within(enDetalle()).getByText('BETO PEREZ')).toBeInTheDocument());
    expect(window.location.search).toContain('vista=%2Fdocumentos%2FreportesInfo');
  });
});
