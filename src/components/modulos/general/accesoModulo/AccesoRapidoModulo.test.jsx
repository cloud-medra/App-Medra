// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AccesoRapidoModulo from './AccesoRapidoModulo';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { itemsDelSidebar } from '../../../../config/menuSidebar';

afterEach(cleanup);

describe('AccesoRapidoModulo', () => {
  // Usuario con algunos ítems de Implantes, en un orden propio (como el sidebar).
  const usuario = {
    rol: 'operador',
    permisos: { implantes: ['/implantes/gestionImplantes', '/implantes/resumenImplantes', '/implantes/solicitudImplantes'] },
    ordenSubItems: { implantes: ['/implantes/resumenImplantes', '/implantes/gestionImplantes'] },
  };

  it('muestra los mismos ítems y en el mismo orden que el sidebar, y abre el elegido', () => {
    const items = itemsDelSidebar(usuario, 'implantes', null);
    const onAbrir = vi.fn();
    render(<AccesoRapidoModulo etiqueta="Implantes" icono={MODULES.implantes.icon} color={MODULES.implantes.color} items={items} onAbrir={onAbrir} />);
    const botones = within(screen.getByRole('list', { name: 'Pantallas de Implantes' })).getAllByRole('button');
    expect(botones.map((b) => b.title)).toEqual(items.map((i) => i.label));
    expect(botones.map((b) => b.title)).toEqual(['Resumen', 'Gestion', 'Solicitud']);
    fireEvent.click(screen.getByTitle('Gestion'));
    expect(onAbrir).toHaveBeenCalledWith('/implantes/gestionImplantes');
  });

  it('muestra la descripción si el ítem la tiene', () => {
    render(<AccesoRapidoModulo etiqueta="X" items={[{ label: 'A', path: '/a', descripcion: 'Detalle de A' }]} onAbrir={() => {}} />);
    expect(screen.getByText('Detalle de A')).toBeInTheDocument();
  });

  it('sin ítems permitidos lo indica', () => {
    render(<AccesoRapidoModulo etiqueta="X" items={[]} onAbrir={() => {}} />);
    expect(screen.getByText(/No tienes pantallas disponibles/)).toBeInTheDocument();
  });
});
