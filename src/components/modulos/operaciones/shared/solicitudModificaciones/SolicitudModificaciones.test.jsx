// @vitest-environment jsdom
// Solicitudes de modificaciones: lecturas acotadas (un listener solo de los
// bloques con modificación pendiente), descarga sin volver a imputar (1
// escritura + 1 log por bloque + 1 historial) y copia sin escribir nada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const fs = vi.hoisted(() => ({ consultas: [], batch: null, getDocs: null }));

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (path) => ({ path, id: path.split('/').pop() });
  return {
    collection: (base, nombre) => ref(`${base?.path ? `${base.path}/` : ''}${nombre}/nuevo-${nombre}`),
    collectionGroup: (_db, nombre) => ({ grupo: nombre }),
    doc: (base, path) => (path ? ref(path) : ref(base.path)),
    documentId: () => '__name__',
    where: (campo, op, valor) => ({ where: [campo, op, valor] }),
    orderBy: (campo, dir) => ({ orderBy: [campo, dir] }),
    limit: (n) => ({ limit: n }),
    startAfter: (c) => ({ startAfter: c }),
    query: (base, ...partes) => { const q = { base, partes }; fs.consultas.push(q); return q; },
    getDocs: (...a) => fs.getDocs(...a),
    serverTimestamp: () => 'TS',
    writeBatch: () => fs.batch,
  };
});
const escuchar = vi.hoisted(() => ({ docs: [] }));
vi.mock('../../../../../hooks/useVisibleSnapshot', () => ({
  onSnapshotVisible: (q, cb) => { cb({ docs: escuchar.docs }); return () => {}; },
}));
const xlsx = vi.hoisted(() => ({ escritos: [] }));
vi.mock('xlsx', async (original) => {
  const real = await original();
  return { ...real, writeFile: (libro, nombre) => xlsx.escritos.push({ libro, nombre }) };
});

const permisos = vi.hoisted(() => ({ userData: {}, permitido: true }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: permisos.userData }) }));
const showToast = vi.hoisted(() => () => {});
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction: (_t, _m, ok) => ok() }) }));
vi.mock('../../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => permisos.permitido }) }));

const { fotoItems } = await import('./modificacionesSolicitud');
const { default: SolicitudModificaciones } = await import('./SolicitudModificaciones');
const { listarHistorialModificaciones, descargarCopia, COLECCION_MODIFICACIONES_EXPORTADAS } = await import('./useSolicitudModificacionesData');
const { MODULOS_GESTION } = await import('../modulosGestion');

const item = (id, extra = {}) => ({ id, codigo: `C${id}`, descriptorAuto: `PLACA ${id}`, cantidad: 1, precio: 100, venta: 150, lote: 'L', vencimiento: '', tipoVinculado: 'COT', ...extra });
const gestion = (id, foto, items) => ({
  id,
  ref: { path: `implantes_gestiones/2026/mes/octubre/detalles/${id}` },
  data: () => ({ gestionId: id, nombre: `PAC ${id}`, empresa: 'ACME', fecha: '2026-10-01', fechaSolicitud: '2026-10-05', periodo: 'Octubre 2026', solicitud: 'SOLICITADO', modificacionPendiente: true, itemsSolicitados: fotoItems(foto), cotizaciones: [{ items }] }),
});

beforeEach(() => {
  fs.consultas.length = 0;
  xlsx.escritos.length = 0;
  fs.batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) };
  fs.getDocs = vi.fn(async () => ({ docs: [] }));
  permisos.userData = { uid: 'u1', nombreCompleto: 'ANA PEREZ', permisos: { implantes: ['/implantes/solicitudImplantes'] } };
  permisos.permitido = true;
  escuchar.docs = [
    gestion('500', [item('a'), item('b')], [item('a', { cantidad: 3, venta: 450 })]),
    // Volvió a como estaba: no se muestra.
    gestion('501', [item('a')], [item('a')]),
  ];
});
afterEach(cleanup);

describe('Pendientes', () => {
  it('un solo listener: modificacionPendiente == true acotado al módulo; muestra solo bloques con cambios', () => {
    render(<SolicitudModificaciones modulo="implantes" />);
    const [q] = fs.consultas;
    expect(fs.consultas).toHaveLength(1);
    expect(q.base).toEqual({ grupo: 'detalles' });
    expect(q.partes).toContainEqual({ where: ['modificacionPendiente', '==', true] });
    expect(q.partes).toContainEqual({ where: ['__name__', '>=', 'implantes_gestiones/0000'] });
    expect(screen.getByLabelText('Seleccionar 500')).toBeInTheDocument();
    expect(screen.queryByLabelText('Seleccionar 501')).not.toBeInTheDocument();
    expect(screen.queryByText('501')).not.toBeInTheDocument();
    expect(screen.getByText('MODIFICADO')).toBeInTheDocument();
    expect(screen.getByText('ELIMINADO')).toBeInTheDocument();
  });

  it('descargar: solo las filas que cambiaron; foto = lo actual, sin marca, log y 1 historial; no toca imputadas', async () => {
    render(<SolicitudModificaciones modulo="implantes" />);
    fireEvent.click(screen.getByLabelText('Seleccionar 500'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Descargar modificaciones \(1\)/ })); });

    expect(xlsx.escritos).toHaveLength(1);
    expect(xlsx.escritos[0].nombre).toMatch(/^MODIFICACIONES_solicitud_implantes_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(xlsx.escritos[0].libro.SheetNames).toEqual(['Modificaciones']);

    const rutaBloque = 'implantes_gestiones/2026/mes/octubre/detalles/500';
    expect(fs.batch.update).toHaveBeenCalledTimes(1);
    expect(fs.batch.update).toHaveBeenCalledWith(expect.objectContaining({ path: rutaBloque }), expect.objectContaining({
      itemsSolicitados: fotoItems([item('a', { cantidad: 3, venta: 450 })]), modificacionPendiente: false,
    }));
    const sets = fs.batch.set.mock.calls;
    expect(sets).toHaveLength(2);
    const datosHistorial = sets.find(([r]) => r.path.startsWith(COLECCION_MODIFICACIONES_EXPORTADAS))[1];
    expect(datosHistorial).toMatchObject({ modulo: 'implantes', usuario: 'ANA PEREZ', usuarioUid: 'u1', totalFilas: 2 });
    expect(datosHistorial.filas.map((f) => f.MOVIMIENTO)).toEqual(['MODIFICADO', 'ELIMINADO']);
    const log = sets.find(([r]) => r.path.includes('/logs/'))[1];
    expect(log).toMatchObject({ accion: 'MODIFICACION_EXPORTADA' });
    // Nada contra las imputadas.
    [...fs.batch.update.mock.calls, ...sets].forEach(([r]) => expect(r.path).not.toMatch(/_imputadas/));
    expect(fs.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('sin el botón si tiene configuración propia de la vista y se le quitó', () => {
    permisos.userData = { ...permisos.userData, permisosGranulares: { '/implantes/solicitudModificacionesImplantes': {} } };
    permisos.permitido = false;
    render(<SolicitudModificaciones modulo="implantes" />);
    expect(screen.queryByRole('button', { name: /Descargar modificaciones/ })).not.toBeInTheDocument();
  });
});

describe('Historial', () => {
  it('no lee hasta abrir la pestaña; luego lee paginado por módulo', async () => {
    render(<SolicitudModificaciones modulo="implantes" />);
    expect(fs.getDocs).not.toHaveBeenCalled();
    fs.getDocs.mockResolvedValueOnce({ docs: [{ id: 'h1', data: () => ({ modulo: 'implantes', usuario: 'ANA PEREZ', nombreArchivo: 'MODIFICACIONES_solicitud_implantes_2026-10-20.xlsx', totalFilas: 2, bloques: [{ gestionId: '500', nombre: 'PAC', empresa: 'ACME', fecha: '2026-10-01' }], filas: [] }) }] });
    fireEvent.click(screen.getByRole('tab', { name: /Historial/ }));
    await waitFor(() => expect(screen.getByText(/por ANA PEREZ/)).toBeInTheDocument());
    expect(fs.getDocs).toHaveBeenCalledTimes(1);
    const q = fs.consultas.at(-1);
    expect(q.partes).toContainEqual({ where: ['modulo', '==', 'implantes'] });
    expect(q.partes).toContainEqual({ orderBy: ['fecha', 'desc'] });
    expect(q.partes).toContainEqual({ limit: 11 });
  });

  it('paginación: 11 resultados → 10 entradas y hay más; el cursor es el último mostrado', async () => {
    const docs = Array.from({ length: 11 }, (_, i) => ({ id: `h${i}`, data: () => ({}) }));
    fs.getDocs.mockResolvedValueOnce({ docs });
    const r = await listarHistorialModificaciones('hemodinamia');
    expect(r.entradas).toHaveLength(10);
    expect(r.hayMas).toBe(true);
    expect(r.cursor).toBe(docs[9]);
  });

  it('descargar copia: mismas filas, COPIA en nombre y título, sin escribir nada', () => {
    const filas = [{ MOVIMIENTO: 'AGREGADO', 'DIFERENCIA CANTIDAD': 1, 'DIFERENCIA VENTA': 100 }];
    descargarCopia(MODULOS_GESTION.implantes, { nombreArchivo: 'MODIFICACIONES_solicitud_implantes_2026-10-20.xlsx', subtitulo: 'x', filas });
    expect(xlsx.escritos[0].nombre).toBe('MODIFICACIONES_COPIA_solicitud_implantes_2026-10-20.xlsx');
    expect(xlsx.escritos[0].libro.Sheets.Modificaciones.A1.v).toMatch(/^COPIA/);
    expect(fs.batch.set).not.toHaveBeenCalled();
    expect(fs.batch.update).not.toHaveBeenCalled();
  });
});
