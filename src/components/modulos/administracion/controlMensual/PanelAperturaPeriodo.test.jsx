// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import PanelAperturaPeriodo from './PanelAperturaPeriodo';
import { MODULOS } from './constants';

// Estados de cierres_periodos por año, como los entrega useCierresAnio;
// cada test los define. El panel ofrece el año actual y el siguiente.
let ESTADOS_POR_ANIO = {};
const anioPedido = vi.fn();
vi.mock('./cierresAnioStore', () => ({
  useCierresAnio: (anio) => {
    anioPedido(anio);
    return { estadosModulos: ESTADOS_POR_ANIO[anio] ?? {}, cargando: false, error: null };
  }
}));

const anioActual = new Date().getFullYear();

const Panel = ({ anioInicial, mesInicial, onConfirm }) => {
  const [anio, setAnio] = useState(anioInicial);
  const [mes, setMes] = useState(mesInicial);
  const [modulos, setModulos] = useState(MODULOS.map(m => m.id));
  return (
    <PanelAperturaPeriodo
      isOpen onClose={() => {}}
      anioApertura={anio} setAnioApertura={setAnio}
      mesApertura={mes} setMesApertura={setMes}
      modulosSeleccionados={modulos} setModulosSeleccionados={setModulos}
      onConfirm={onConfirm}
    />
  );
};

const selects = () => screen.getAllByRole('combobox');
const opcionesMes = () => [...selects()[1].options].map(o => o.value);
const AVISO = /Ciérralo antes de abrir otro mes/;
const botonConfirmar = () => screen.getByText('Confirmar Apertura').closest('button');

afterEach(() => { cleanup(); anioPedido.mockClear(); ESTADOS_POR_ANIO = {}; });

describe('PanelAperturaPeriodo', () => {
  it('usa los estados del año elegido en el panel, no los de la tabla', () => {
    // Año actual: un mes abierto (aviso). Año siguiente: enero cerrado en
    // todos los módulos y nada abierto.
    ESTADOS_POR_ANIO[anioActual] = {
      implantes: { septiembre: { estado: 'ABIERTO' } }
    };
    ESTADOS_POR_ANIO[anioActual + 1] = Object.fromEntries(
      MODULOS.map(m => [m.id, { enero: { estado: 'CERRADO' } }])
    );

    render(<Panel anioInicial={String(anioActual)} mesInicial="octubre" onConfirm={() => {}} />);
    expect(anioPedido).toHaveBeenLastCalledWith(String(anioActual));
    expect(screen.queryByText(AVISO)).not.toBeNull();
    expect(opcionesMes()).toContain('enero');

    fireEvent.change(selects()[0], { target: { value: String(anioActual + 1) } });
    expect(anioPedido).toHaveBeenLastCalledWith(String(anioActual + 1));
    // Enero está cerrado en todos los módulos del año siguiente, y ahí no
    // hay meses abiertos: no hay aviso.
    expect(opcionesMes()).not.toContain('enero');
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it('un mes con estado en un módulo sigue disponible para los demás', () => {
    ESTADOS_POR_ANIO[anioActual] = { hemodinamia: { agosto: { estado: 'CERRADO' } } };
    const onConfirm = vi.fn();
    render(<Panel anioInicial={String(anioActual)} mesInicial="agosto" onConfirm={onConfirm} />);

    expect(opcionesMes()).toContain('agosto');
    const filaHemodinamia = screen.getByText('Hemodinamia').closest('div');
    expect(filaHemodinamia.getAttribute('aria-disabled')).toBe('true');
    expect(filaHemodinamia.textContent).toContain('CERRADO');

    fireEvent.click(filaHemodinamia);
    fireEvent.click(screen.getByText('Confirmar Apertura'));
    expect(onConfirm).toHaveBeenCalledWith({
      mesId: 'agosto',
      modulos: ['laboratorio', 'implantes', 'consignacion', 'vacunatorio', 'bodega']
    });
  });

  it('si el mes guardado ya no está disponible, confirma el que muestra el selector', () => {
    ESTADOS_POR_ANIO[anioActual] = Object.fromEntries(
      MODULOS.map(m => [m.id, { enero: { estado: 'CERRADO' } }])
    );
    const onConfirm = vi.fn();
    render(<Panel anioInicial={String(anioActual)} mesInicial="enero" onConfirm={onConfirm} />);

    expect(selects()[1].value).toBe('febrero');
    fireEvent.click(screen.getByText('Confirmar Apertura'));
    expect(onConfirm).toHaveBeenCalledWith({ mesId: 'febrero', modulos: MODULOS.map(m => m.id) });
  });

  it('solo bloquean los módulos marcados, y el aviso dice cuáles', () => {
    ESTADOS_POR_ANIO[anioActual] = {
      hemodinamia: { septiembre: { estado: 'ABIERTO' } },
      implantes: { agosto: { estado: 'REABIERTO' } }
    };
    const onConfirm = vi.fn();
    render(<Panel anioInicial={String(anioActual)} mesInicial="octubre" onConfirm={onConfirm} />);

    expect(screen.getByText(`⚠️ Hemodinamia tiene Septiembre ${anioActual} abierto. Ciérralo antes de abrir otro mes.`)).not.toBeNull();
    expect(screen.getByText(`⚠️ Implantes tiene Agosto ${anioActual} reabierto. Ciérralo antes de abrir otro mes.`)).not.toBeNull();
    expect(botonConfirmar().disabled).toBe(true);

    // Desmarcar Hemodinamia quita solo su aviso; Implantes sigue bloqueando.
    fireEvent.click(screen.getByText('Hemodinamia'));
    expect(screen.queryByText(/Hemodinamia tiene/)).toBeNull();
    expect(botonConfirmar().disabled).toBe(true);

    fireEvent.click(screen.getByText('Implantes'));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(botonConfirmar().disabled).toBe(false);

    fireEvent.click(botonConfirmar());
    expect(onConfirm).toHaveBeenCalledWith({ mesId: 'octubre', modulos: ['laboratorio', 'consignacion', 'vacunatorio', 'bodega'] });
  });

  it('un mes cerrado en un módulo marcado no bloquea', () => {
    ESTADOS_POR_ANIO[anioActual] = { hemodinamia: { septiembre: { estado: 'CERRADO' } } };
    render(<Panel anioInicial={String(anioActual)} mesInicial="octubre" onConfirm={() => {}} />);
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(botonConfirmar().disabled).toBe(false);
  });
});
