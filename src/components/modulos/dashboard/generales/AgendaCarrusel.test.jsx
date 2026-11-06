// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AgendaCarrusel from './AgendaCarrusel';

afterEach(cleanup);

// Reproduce el mismo estado/handlers que ResumenGeneral.jsx monta de
// verdad (currentDate/selectedDate + handlers de mes/año), para probar
// AgendaCarrusel exactamente como lo usa la app real, no con props sueltas.
const ArnesResumenGeneral = ({ fechaInicial }) => {
  const [currentDate, setCurrentDate] = useState(fechaInicial);
  const [selectedDate, setSelectedDate] = useState(fechaInicial);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  return (
    <AgendaCarrusel
      currentDate={currentDate}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      handlePrevMonth={() => setCurrentDate(new Date(year, month - 1, 1))}
      handleNextMonth={() => setCurrentDate(new Date(year, month + 1, 1))}
      handleMonthChange={(e) => setCurrentDate(new Date(year, parseInt(e.target.value), 1))}
      handleYearChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), month, 1))}
    />
  );
};

describe('AgendaCarrusel', () => {
  it('arranca en la Hoja 1 (calendario) intacta', () => {
    render(<ArnesResumenGeneral fechaInicial={new Date(2026, 8, 15)} />);
    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.queryByText('Información del día')).not.toBeInTheDocument();
  });

  it('"Siguiente" lleva a la Hoja 2 con los datos de la fecha seleccionada', async () => {
    render(<ArnesResumenGeneral fechaInicial={new Date(2026, 8, 22)} />); // 22-09-2026 = martes

    fireEvent.click(screen.getByText('Siguiente'));

    const info = await screen.findByText('Información del día');
    const card = info.closest('div').parentElement;

    expect(within(card).getByText('22 de Septiembre de 2026')).toBeInTheDocument();
    expect(within(card).getByText('Martes')).toBeInTheDocument();
    expect(within(card).getByText(/Día 265 de 365/)).toBeInTheDocument();
    // 22 de septiembre ya es Primavera (cambia el 21).
    expect(within(card).getByText('Primavera')).toBeInTheDocument();
  });

  it('"Anterior" desde la Hoja 2 vuelve a mostrar el calendario', async () => {
    render(<ArnesResumenGeneral fechaInicial={new Date(2026, 8, 15)} />);
    fireEvent.click(screen.getByText('Siguiente'));
    await screen.findByText('Información del día');

    fireEvent.click(screen.getByText('Anterior'));

    await screen.findByText('Agenda');
    expect(screen.queryByText('Información del día')).not.toBeInTheDocument();
  });

  it('cambiar el día seleccionado en la Hoja 1 actualiza la Hoja 2 a esa fecha', async () => {
    render(<ArnesResumenGeneral fechaInicial={new Date(2026, 8, 1)} />);

    // Selecciona el día 25 del mes visible (septiembre 2026) en el calendario.
    fireEvent.click(screen.getByRole('button', { name: '25' }));

    fireEvent.click(screen.getByText('Siguiente'));

    const info = await screen.findByText('Información del día');
    const card = info.closest('div').parentElement;
    expect(within(card).getByText('25 de Septiembre de 2026')).toBeInTheDocument();
  });

  it('los puntos indicadores navegan directo a cada hoja', async () => {
    render(<ArnesResumenGeneral fechaInicial={new Date(2026, 8, 15)} />);

    const dots = screen.getAllByLabelText(/Ir a hoja/);
    expect(dots).toHaveLength(2);

    fireEvent.click(dots[1]);
    await screen.findByText('Información del día');

    fireEvent.click(dots[0]);
    await screen.findByText('Agenda');
  });
});
