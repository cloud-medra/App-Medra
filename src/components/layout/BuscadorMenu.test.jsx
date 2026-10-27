// @vitest-environment jsdom
// Buscador del sidebar: resultados con código, nombre y módulo; flechas y
// Enter; código exacto + Enter abre el ítem; Escape limpia o cierra.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import BuscadorMenu, { BuscadorMenuModal } from './BuscadorMenu';

const INDICE = [
  { id: 'm:laboratorio', tipo: 'modulo', entrada: 'laboratorio', codigo: 'LAB', nombre: 'Laboratorio', modulo: null },
  { id: 'i:folios', tipo: 'item', entrada: 'laboratorio', ruta: '/lab/folios', codigo: 'LABFOL', nombre: 'Ingreso de Folios', modulo: 'Laboratorio' },
  { id: 'i:vco', tipo: 'item', entrada: 'laboratorio', ruta: '/lab/vco', codigo: 'LABVCO', nombre: 'Vinculación de Códigos', modulo: 'Laboratorio' },
  { id: 'i:vor', tipo: 'item', entrada: 'laboratorio', ruta: '/lab/vor', codigo: 'LABVOR', nombre: 'Vinculación de Órdenes', modulo: 'Laboratorio' },
];
afterEach(cleanup);

const montar = (props = {}) => {
  const onElegir = vi.fn();
  render(<BuscadorMenu indice={INDICE} onElegir={onElegir} {...props}><p>Lista de módulos</p></BuscadorMenu>);
  return { onElegir, campo: screen.getByRole('combobox', { name: 'Buscar en el menú' }) };
};
const opciones = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('BuscadorMenu', () => {
  it('sin texto muestra la lista de módulos; con texto, resultados con código, nombre y módulo', () => {
    const { campo } = montar();
    expect(screen.getByText('Lista de módulos')).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: 'VINCULACION' } });
    expect(screen.queryByText('Lista de módulos')).toBeNull();
    expect(opciones()).toEqual(['LABVCOVinculación de CódigosLaboratorio', 'LABVORVinculación de ÓrdenesLaboratorio']);
  });

  it('código exacto + Enter abre el ítem directo y limpia el campo', () => {
    const { campo, onElegir } = montar();
    fireEvent.change(campo, { target: { value: 'labfol' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LABFOL' }));
    expect(campo).toHaveValue('');
  });

  it('flechas mueven la selección (con vuelta) y Enter abre la marcada', () => {
    const { campo, onElegir } = montar();
    fireEvent.change(campo, { target: { value: 'LAB' } });
    expect(opciones()).toHaveLength(4); // el módulo y sus ítems
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(campo, { key: 'ArrowUp' });
    fireEvent.keyDown(campo, { key: 'ArrowUp' });
    fireEvent.keyDown(campo, { key: 'ArrowUp' });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LABVOR' }));
  });

  it('clic en un resultado lo abre; sin coincidencias, aviso', () => {
    const { campo, onElegir } = montar();
    fireEvent.change(campo, { target: { value: 'xyz' } });
    expect(screen.getByText('Sin resultados en tu menú.')).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: 'folios' } });
    fireEvent.mouseDown(screen.getByRole('option'));
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LABFOL' }));
  });

  it('Escape limpia el texto', () => {
    const { campo } = montar();
    fireEvent.change(campo, { target: { value: 'lab' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo).toHaveValue('');
    expect(screen.getByText('Lista de módulos')).toBeInTheDocument();
  });

  it('oculto (sidebar colapsado): solo la lista, sin campo', () => {
    render(<BuscadorMenu indice={INDICE} onElegir={vi.fn()} oculto><p>Lista de módulos</p></BuscadorMenu>);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Lista de módulos')).toBeInTheDocument();
  });

  it('modal: enfocado al abrir, Escape sin texto lo cierra y elegir lo cierra', () => {
    const onCerrar = vi.fn();
    const onElegir = vi.fn();
    render(<BuscadorMenuModal indice={INDICE} onElegir={onElegir} onCerrar={onCerrar} />);
    const campo = screen.getByRole('combobox', { name: 'Buscar en el menú' });
    expect(campo).toHaveFocus();
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    fireEvent.change(campo, { target: { value: 'LABFOL' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onCerrar).toHaveBeenCalledTimes(2);
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LABFOL' }));
  });
});
