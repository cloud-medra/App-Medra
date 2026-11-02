import { describe, it, expect } from 'vitest';
import { ordenarFilasPorAdmision, deliveryDeFilaGuia } from './ordenFilasSolicitudConsignacion';
import { construirFilasResumenSolicitudConsignacion } from './filasResumenSolicitudConsignacion';

const solo = (id, adm, prevision = 'FONASA') => ({ id, gestionId: adm, codigo: id, delivery: '', datosOriginales: { prevision } });
const pad = (id, adm, delivery, prevision = 'ISAPRE') => ({ id, gestionId: adm, codigo: id, delivery, datosOriginales: { prevision } });
const guia = (delivery, idx, adm) => ({ id: `guia-${delivery}-${idx}`, esFilaGuia: true, gestionId: adm, codigo: 'No lleva OC' });
const ids = (filas) => filas.map((f) => f.id);

describe('ordenarFilasPorAdmision', () => {
  it('admisión 116050: código solo, después el PAD y al final sus "No lleva OC"', () => {
    // Como sale hoy: PAD, sus guías y el código solo al final.
    const hoy = [pad('989179', '116050', '1482928401'), guia('1482928401', 0, '116050'), guia('1482928401', 1, '116050'), solo('41201380', '116050')];
    expect(ids(ordenarFilasPorAdmision(hoy))).toEqual(['41201380', '989179', 'guia-1482928401-0', 'guia-1482928401-1']);
  });

  it('mantiene el orden entre admisiones y el de cada grupo', () => {
    const lista = [
      solo('A1', '1'), pad('A2', '1', 'D1'), guia('D1', 0, '1'), solo('A3', '1'),
      pad('B1', '2', 'D2'), guia('D2', 0, '2'), solo('B2', '2'), solo('B3', '2'),
      solo('C1', '3'),
    ];
    expect(ids(ordenarFilasPorAdmision(lista))).toEqual([
      'A1', 'A3', 'A2', 'guia-D1-0',
      'B2', 'B3', 'B1', 'guia-D2-0',
      'C1',
    ]);
  });

  it('con dos PAD, cada uno lleva debajo las filas de la guía de su delivery', () => {
    const lista = [pad('P1', '9', 'D1'), guia('D1', 0, '9'), pad('P2', '9', 'D2'), guia('D2', 0, '9'), guia('D2', 1, '9'), solo('S', '9')];
    expect(ids(ordenarFilasPorAdmision(lista))).toEqual(['S', 'P1', 'guia-D1-0', 'P2', 'guia-D2-0', 'guia-D2-1']);
  });

  it('no junta tramos separados de la misma admisión ni filas sin admisión', () => {
    const lista = [pad('X1', '5', 'D'), guia('D', 0, '5'), solo('Y', '6'), solo('X2', '5'), solo('S1', 'P'), solo('S2', 'P')];
    expect(ids(ordenarFilasPorAdmision(lista))).toEqual(['X1', 'guia-D-0', 'Y', 'X2', 'S1', 'S2']);
  });

  it('no modifica la lista original', () => {
    const lista = [pad('P', '1', 'D'), solo('S', '1')];
    ordenarFilasPorAdmision(lista);
    expect(ids(lista)).toEqual(['P', 'S']);
  });

  it('el delivery sale del id de la fila de guía', () => {
    expect(deliveryDeFilaGuia(guia('1482928401', 3, '1'))).toBe('1482928401');
    expect(deliveryDeFilaGuia(solo('S', '1'))).toBeNull();
  });

  it('las dos hojas del Excel quedan en el mismo orden y la guía toma la previsión de su PAD', () => {
    const ordenadas = ordenarFilasPorAdmision([pad('989179', '116050', 'D', 'ISAPRE'), guia('D', 0, '116050'), solo('41201380', '116050', 'FONASA')]);
    // Ambas hojas se arman con los seleccionados en el orden de la lista.
    const resumen = construirFilasResumenSolicitudConsignacion(ordenadas, ordenadas, '02-11-2026');
    expect(resumen.map((f) => f['Cód'])).toEqual(ordenadas.map((f) => f.codigo));
    expect(resumen.map((f) => f['Previsión'])).toEqual(['FONASA', 'ISAPRE', 'ISAPRE']);
  });
});
