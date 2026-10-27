// @vitest-environment jsdom
// Bodymap de una gestión: una zona, varias zonas, sin zona (con y sin
// permiso para asignarla), lado de la gestión y sin descripción.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let maestro = {};
const escuchados = [];
vi.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => ({ col, id }),
  onSnapshot: (ref, siguiente) => {
    escuchados.push(ref.id);
    const datos = maestro[ref.id];
    siguiente({ exists: () => Boolean(datos), data: () => datos });
    return () => {};
  },
}));
vi.mock('../../../../../../../firebaseConfig', () => ({ db: {} }));
let permisos = { editar: true };
vi.mock('../../../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: (_r, _s, el) => (el === 'action_editar' ? permisos.editar : true) }),
}));

const { BodymapTab } = await import('./BodymapTab');
const { idDescripcion } = await import('../../../../../../../../functions/bodymap/nucleo.mjs');

afterEach(() => { cleanup(); escuchados.length = 0; maestro = {}; permisos = { editar: true }; });
const activas = (vista) => [...document.querySelectorAll(`svg[data-vista="${vista}"] path[data-activa]`)];

describe('Bodymap', () => {
  it('RUPTURA MANGUITO ROTADORES: el hombro resaltado en el cuerpo completo y en el detalle; sin lado, ambos', () => {
    maestro[idDescripcion('RUPTURA MANGUITO ROTADORES')] = { zonas: ['hombro'], lado: 'no_especificado', estado: 'confirmada' };
    render(<BodymapTab descripcion="Ruptura manguito rotadores" lado="no_especificado" />);
    expect(escuchados).toEqual([idDescripcion('RUPTURA MANGUITO ROTADORES')]);
    expect(screen.getByText('RUPTURA MANGUITO ROTADORES')).toBeInTheDocument();
    expect(screen.getByText('Lado no especificado: se resaltan ambos lados.')).toBeInTheDocument();
    const cuerpo = screen.getByRole('region', { name: 'Cuerpo completo' });
    const hombros = [...cuerpo.querySelectorAll('path[data-activa]')];
    expect(hombros.map((p) => `${p.dataset.zona}-${p.dataset.lado}`).sort()).toEqual(['hombro-der', 'hombro-der', 'hombro-izq', 'hombro-izq']);
    expect(screen.getByRole('region', { name: 'Detalle: Hombro' })).toBeInTheDocument();
    // Tooltip con el nombre de la zona.
    expect(cuerpo.querySelector('path[data-zona="hombro"][data-lado="der"] title').textContent).toBe('Hombro derecho');
  });

  it('el lado de la gestión tiene prioridad: solo el lado derecho', () => {
    maestro[idDescripcion('LUXOFRACTURA TOBILLO')] = { zonas: ['tobillo'], lado: 'izquierdo', estado: 'confirmada' };
    render(<BodymapTab descripcion="LUXOFRACTURA TOBILLO" lado="derecho" />);
    expect(screen.getByText(/de la gestión/)).toBeInTheDocument();
    expect(new Set(activas('anterior').map((p) => p.dataset.lado))).toEqual(new Set(['der']));
  });

  it('varias zonas: todas resaltadas y un detalle por zona; "Sugerida" si no está confirmada', () => {
    maestro[idDescripcion('ARTROTOMIA HOMBRO O CADERA')] = { zonas: ['hombro', 'cadera'], lado: 'no_especificado', estado: 'sugerida' };
    render(<BodymapTab descripcion="ARTROTOMIA HOMBRO O CADERA" />);
    expect(screen.getByRole('region', { name: 'Detalle: Hombro' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Detalle: Cadera' })).toBeInTheDocument();
    expect(new Set(activas('anterior').map((p) => p.dataset.zona))).toEqual(new Set(['hombro', 'cadera']));
    expect(screen.getByText('Sugerida')).toBeInTheDocument();
  });

  it('sin zona asignada: aviso y enlace al Maestro solo con permiso', () => {
    const onAbrirMaestro = vi.fn();
    render(<BodymapTab descripcion="Artroscopia diagnostica" onAbrirMaestro={onAbrirMaestro} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Esta descripción aún no tiene una zona asignada.');
    fireEvent.click(screen.getByRole('button', { name: /Asignar en Zonas por diagnóstico/ }));
    expect(onAbrirMaestro).toHaveBeenCalledWith('ARTROSCOPIA DIAGNOSTICA');
    expect(document.querySelector('svg[data-vista]')).toBeNull();

    cleanup();
    permisos = { editar: false };
    render(<BodymapTab descripcion="Artroscopia diagnostica" onAbrirMaestro={onAbrirMaestro} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asignar/ })).not.toBeInTheDocument();
  });

  it('"Sin zona específica": la muestra como zona, sin lado, sin cuerpo y sin aviso de pendiente', () => {
    maestro[idDescripcion('BIOPSIA')] = { zonas: ['sin_zona_especifica'], lado: 'no_especificado', estado: 'confirmada' };
    render(<BodymapTab descripcion="Biopsia" onAbrirMaestro={vi.fn()} />);
    expect(screen.getByText('Sin zona específica')).toBeInTheDocument();
    expect(screen.getByText(/Diagnóstico sin zona específica: depende de cada caso/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Lado/)).toBeNull();
    expect(document.querySelector('svg[data-vista]')).toBeNull();
  });

  it('la entrada existe pero sin zonas también muestra el aviso; sin descripción ("P") no consulta', () => {
    maestro[idDescripcion('RETIRO MATERIAL OSTEOSINTESIS')] = { zonas: [], lado: 'no_especificado', estado: 'sin_asignar' };
    render(<BodymapTab descripcion="RETIRO MATERIAL OSTEOSINTESIS" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    cleanup();
    escuchados.length = 0;
    render(<BodymapTab descripcion="P" />);
    expect(screen.getByText(/Esta gestión no tiene descripción/)).toBeInTheDocument();
    expect(escuchados).toEqual([]);
  });
});
