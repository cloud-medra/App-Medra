// @vitest-environment jsdom
// Dashboard: Accesos rápidos a la izquierda y Notas a la derecha (y al
// apilar, Accesos primero); las notas se ven con su estilo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let notas = [];
vi.mock('../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn(), where: vi.fn() }));
vi.mock('../../../stores/catalogosStore', () => ({ upsertLocal: vi.fn() }));
vi.mock('../administracion/notasAdmin/useNotasPanel', () => ({ useNotasPanel: () => ({ notas }) }));
vi.mock('./generales/BienvenidaCard', () => ({ default: () => null }));
vi.mock('./generales/BrandingCard', () => ({ default: () => null }));
vi.mock('./generales/AgendaCarrusel', () => ({ default: () => <div>Agenda</div> }));
vi.mock('./generales/AtajosCard', () => ({ default: () => <div>Accesos rápidos</div> }));

const { default: ResumenGeneral } = await import('./ResumenGeneral');
afterEach(cleanup);

describe('Dashboard — Accesos rápidos y Notas', () => {
  it('Accesos rápidos va en la columna izquierda y antes que Notas en el orden del documento', () => {
    render(<ResumenGeneral userData={{ rol: 'operador' }} />);
    const accesos = screen.getByText('Accesos rápidos');
    const notasCard = screen.getByText('Notas del Panel');
    expect(accesos.compareDocumentPosition(notasCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(accesos.closest('.lg\\:col-span-2')).not.toBeNull();
    expect(notasCard.closest('.lg\\:col-span-2')).toBeNull();
    expect(screen.getByText('Agenda').compareDocumentPosition(notasCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('aplica el estilo de la nota (y el de siempre si no tiene)', () => {
    notas = [
      { id: 'a', tipo: 'texto', titulo: 'Aviso', contenido: 'Con estilo', estilo: { fondo: '#FEF3C7', texto: '#B91C1C', negrita: true } },
      { id: 'b', tipo: 'texto', contenido: 'Sin estilo' },
    ];
    render(<ResumenGeneral userData={{ rol: 'operador' }} />);
    expect(screen.getByText('Con estilo')).toHaveStyle({ color: '#B91C1C', fontWeight: 700 });
    expect(screen.getByText('Aviso')).toHaveStyle({ color: '#B91C1C' });
    expect(screen.getByText('Con estilo').parentElement).toHaveStyle({ backgroundColor: '#FEF3C7' });
    const sinEstilo = screen.getByText('Sin estilo');
    expect(sinEstilo.getAttribute('style')).toBeNull();
    expect(sinEstilo.className).toMatch(/text-gray-600/);
  });
});
