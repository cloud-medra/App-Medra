// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResumenImportacion } from './ResumenImportacion';

const base = { nuevas: 0, actualizadas: 0, sinCambios: 1, errores: [], lecturasFirestore: 1, escriturasFirestore: 0 };
const yaNoVienen = [
  { id: 'a_2', refPath: 'documentos_sistema/2026/meses/10/x/a_2', admision: '116020', fecha: '2026-10-22', proveedor: 'CLP', codigo: '711163', oc: '', monto: 32550, enGrupoPresente: true },
  { id: 'b_1', refPath: 'documentos_sistema/2026/meses/10/x/b_1', admision: '116021', fecha: '2026-10-23', proveedor: 'CLP', codigo: '1', oc: '', monto: 100, enGrupoPresente: false }
];

describe('ResumenImportacion — ya no vienen', () => {
  afterEach(cleanup);

  it('sin permiso es solo informativa (sin casillas)', () => {
    render(<ResumenImportacion resumen={{ ...base, yaNoVienen }} />);
    expect(screen.getByText(/Registradas que ya no vienen/)).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('por defecto nada seleccionado; "Seleccionar todas" y eliminar pasa las elegidas', () => {
    const onEliminar = vi.fn();
    render(<ResumenImportacion resumen={{ ...base, yaNoVienen }} onEliminarYaNoVienen={onEliminar} />);
    const boton = screen.getByRole('button', { name: /Eliminar seleccionadas \(0\)/ });
    expect(boton.disabled).toBe(true);
    expect(screen.getAllByRole('checkbox').every(c => !c.checked)).toBe(true);

    fireEvent.click(screen.getByLabelText('Seleccionar todas'));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar seleccionadas \(2\)/ }));
    expect(onEliminar).toHaveBeenCalledWith(yaNoVienen);
  });

  it('elegir una sola fila', () => {
    const onEliminar = vi.fn();
    render(<ResumenImportacion resumen={{ ...base, yaNoVienen }} onEliminarYaNoVienen={onEliminar} />);
    fireEvent.click(screen.getByText(/711163/));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar seleccionadas \(1\)/ }));
    expect(onEliminar).toHaveBeenCalledWith([yaNoVienen[0]]);
  });
});
