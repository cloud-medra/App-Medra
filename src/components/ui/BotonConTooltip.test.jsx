// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BotonConTooltip } from './BotonConTooltip';

afterEach(cleanup);

describe('BotonConTooltip', () => {
  it('lleva aria-label y no title (un solo tooltip)', () => {
    render(<BotonConTooltip texto="Ver historial">x</BotonConTooltip>);
    const boton = screen.getByRole('button', { name: 'Ver historial' });
    expect(boton.getAttribute('title')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('aparece al instante con el cursor y se va al salir', () => {
    render(<BotonConTooltip texto="Entregar (usado)">x</BotonConTooltip>);
    const boton = screen.getByRole('button');
    fireEvent.mouseEnter(boton);
    expect(screen.getByRole('tooltip').textContent).toBe('Entregar (usado)');
    fireEvent.mouseLeave(boton);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('aparece con el foco del teclado y el clic lo oculta y ejecuta la acción', () => {
    const onClick = vi.fn();
    render(<BotonConTooltip texto="Devolver" onClick={onClick}>x</BotonConTooltip>);
    const boton = screen.getByRole('button');
    fireEvent.focus(boton);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
