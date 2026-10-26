// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useHistorialVistaModulo } from './useHistorialVistaModulo';
import { vistaDeModulo } from '../config/vistaModulo';

// Simula el estado del Dashboard (vista y módulo abiertos).
const usarDashboard = () => {
  const [vista, setVista] = useState('/implantes/gestionImplantes');
  const [modulo, setModulo] = useState('implantes');
  const abrirModulo = (entrada) => { setModulo(entrada); setVista(vistaDeModulo(entrada)); };
  const entrada = useHistorialVistaModulo({
    vista, modulo, ajustes: false,
    restaurar: (s) => { setModulo(s.modulo); setVista(s.vista); },
    abrirModulo,
  });
  return { vista, setVista, abrirModulo, entrada };
};

const atras = () => act(async () => { window.history.back(); });
const adelante = () => act(async () => { window.history.forward(); });

beforeEach(() => window.history.replaceState(null, '', '/plataforma'));

describe('useHistorialVistaModulo', () => {
  it('la vista de acceso rápido tiene su URL y el botón atrás/adelante la recorre', async () => {
    const { result } = renderHook(usarDashboard);
    act(() => result.current.abrirModulo('implantes'));
    expect(window.location.search).toBe('?modulo=implantes');
    expect(result.current.entrada).toBe('implantes');

    // Desde la vista de acceso rápido se abre una pantalla: la URL vuelve a /plataforma.
    act(() => result.current.setVista('/implantes/resumenImplantes'));
    expect(window.location.search).toBe('');

    await atras();
    await waitFor(() => expect(result.current.vista).toBe(vistaDeModulo('implantes')));
    expect(window.location.search).toBe('?modulo=implantes');

    await atras();
    await waitFor(() => expect(result.current.vista).toBe('/implantes/gestionImplantes'));

    await adelante();
    await waitFor(() => expect(result.current.vista).toBe(vistaDeModulo('implantes')));
  });

  it('un cambio de pantalla fuera de la vista de acceso rápido no agrega entradas al historial', () => {
    const { result } = renderHook(usarDashboard);
    const largo = window.history.length;
    act(() => result.current.setVista('/implantes/resumenImplantes'));
    act(() => result.current.setVista('/implantes/solicitudImplantes'));
    expect(window.history.length).toBe(largo);
  });
});
