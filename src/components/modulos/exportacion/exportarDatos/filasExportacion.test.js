import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  filasExportacion, filasPlanillaGestiones, filasPlanillaItems, construirLibroExportacion, celdaFecha, claveDe, COLUMNAS_TABLA,
} from './filasExportacion';

const gestion = (extra = {}) => ({
  gestionId: '00123', fecha: '2026-11-10', empresa: 'EMP', nombre: 'PACIENTE', costo: 5000, informe: 'DISPONIBLE', centro: 'PABELLON',
  convenio: 'CONV', prevision: 'ISAPRE', medico: 'DR', descripcion: 'DESC', registradoPor: 'Ana', estado: 'AGENDADO',
  cotizaciones: [{ items: [
    { id: 'p', esPad: true, referencia: 'PAD1', cantidad: 1, numCotizacion: 'C1', lote: 'PAD', vencimiento: 'PAD', estadoCarga: 'CARGADO', precio: 3000 },
    { id: 'c', padPadreId: 'p', referencia: 'R1', cantidad: 2, numCotizacion: 'C1', lote: 'L1', vencimiento: '2027-05-31', estadoCarga: 'PAD', precio: 0 },
    { id: 'n', referencia: 'R2', cantidad: 1, numCotizacion: 'C1', lote: 'L2', vencimiento: 'Sin fecha', estadoCarga: 'PENDIENTE', precio: 2000 },
  ] }],
  ...extra,
});
const registro = (extra = {}) => ({
  id: 'r1', gestionId: '777', fecha: '2026-11-03', empresa: 'PROV', nombre: 'OTRO', centro: 'PABELLON', referencia: 'X9', cantidad: 2,
  costo: 1500, numeroGuiaVinculada: '814761', loteGuiaVinculado: 'LG', vencimientoGuiaVinculado: '31-12-2027', estado: 'CARGADO', registradoPor: 'Luis',
  ...extra,
});

describe('Exportar datos: filas', () => {
  it('una fila por ítem con los datos de la gestión, segmento y tipo de línea', () => {
    const filas = filasExportacion({ implantes: [gestion()] });
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f.tipoLinea)).toEqual(['PAD PADRE', 'CONTENIDO PAD', 'NORMAL']);
    expect(filas[0]).toMatchObject({
      segmento: 'IMPLANTES', centro: 'PABELLON', admision: '00123', fecha: '2026-11-10', empresa: 'EMP', nombre: 'PACIENTE',
      totalCotizacion: 5000, informe: 'DISPONIBLE', numCotizacion: 'C1', referencia: 'PAD1', cantidad: 1, lote: 'PAD', clave: '00123|EMP|2026-11-10',
    });
  });

  it('gestión sin ítems: una fila sin datos de ítem', () => {
    const [f] = filasExportacion({ hemodinamia: [gestion({ cotizaciones: [] })] });
    expect(f).toMatchObject({ segmento: 'HEMODINAMIA', sinItems: true, admision: '00123' });
    expect(f.referencia).toBeUndefined();
  });

  it('consignación: N° guía, lote y vencimiento de la guía si no se escribieron, total de la línea', () => {
    const [f] = filasExportacion({ consignacion: [registro()] });
    expect(f).toMatchObject({ segmento: 'CONSIGNACION', admision: '777', numGuia: '814761', lote: 'LG', vencimiento: '31-12-2027', totalCotizacion: 3000, tipoLinea: 'NORMAL', informe: '' });
    expect(filasExportacion({ consignacion: [registro({ lote: 'PROPIO', vencimiento: '2028-01-01' })] })[0]).toMatchObject({ lote: 'PROPIO', vencimiento: '2028-01-01' });
  });

  it('orden: por fecha; en el mismo día Implantes, Consignación, Hemodinamia y por admisión', () => {
    const filas = filasExportacion({
      hemodinamia: [gestion({ cotizaciones: [], gestionId: '1' })],
      consignacion: [registro({ fecha: '2026-11-20' }), registro({ fecha: '2026-11-01', gestionId: '5' })],
      implantes: [gestion({ cotizaciones: [], fecha: '2026-11-15', gestionId: '9' }), gestion({ cotizaciones: [], fecha: '2026-11-15', gestionId: '10' })],
    });
    expect(filas.map((f) => `${f.fecha} ${f.segmento}:${f.admision}`)).toEqual([
      '2026-11-01 CONSIGNACION:5', '2026-11-10 HEMODINAMIA:1', '2026-11-15 IMPLANTES:9', '2026-11-15 IMPLANTES:10', '2026-11-20 CONSIGNACION:777',
    ]);
    // Mismo día: Implantes, Consignación, Hemodinamia.
    const mismoDia = filasExportacion({
      hemodinamia: [gestion({ cotizaciones: [], gestionId: '1' })],
      consignacion: [registro({ fecha: '2026-11-10' })],
      implantes: [gestion({ cotizaciones: [], gestionId: '2' })],
    });
    expect(mismoDia.map((f) => f.segmento)).toEqual(['IMPLANTES', 'CONSIGNACION', 'HEMODINAMIA']);
  });
});

describe('Exportar datos: hojas para la planilla', () => {
  const filas = filasExportacion({ implantes: [gestion(), gestion({ gestionId: '00999', cotizaciones: [] })], consignacion: [registro({ fecha: '2026-11-12' }), registro({ id: 'r2', referencia: 'X8', cantidad: 1, fecha: '2026-11-12' })] });

  it('Gestiones: una fila por CLAVE en las letras de la planilla (H vacía)', () => {
    const g = filasPlanillaGestiones(filas);
    expect(g).toHaveLength(3);
    const [imp, sinItems, consig] = g;
    expect(imp[0]).toBe(claveDe({ admision: '00123', empresa: 'EMP', fecha: '2026-11-10' }));
    expect([imp[1], imp[3], imp[4], imp[5], imp[6], imp[7], imp[8], imp[9]]).toEqual(['00123', 'EMP', 'PACIENTE', 5000, 'DISPONIBLE', undefined, 'PABELLON', 'IMPLANTES']);
    expect(imp[2]).toEqual(celdaFecha('2026-11-10'));
    expect(imp[16]).toBe('');                // Estado sin ítems: solo sin ítems
    expect(sinItems[16]).toBe('AGENDADO');
    expect(imp[22]).toBe('Ana');             // W Registrado por
    // Consignación: total = suma de sus líneas (1500×2 + 1500×1).
    expect(consig[5]).toBe(4500);
    expect(consig[9]).toBe('CONSIGNACION');
  });

  it('Ítems: N° de línea desde el inicial y Línea padre a esos números', () => {
    const it = filasPlanillaItems(filas, 26);
    expect(it.map((f) => f[0])).toEqual([26, 27, 28, 29, 30]);
    // Letras de la planilla desde el 25-11-2026: G Nombre paciente (fórmula,
    // vacía aquí), H Estado carga, I CLAVE, J Tipo, K Línea padre, … AC Registrado por.
    expect(it[0][6]).toBeUndefined();
    expect(it[0][7]).toBe('CARGADO');        // H Estado carga
    expect(it[0][8]).toBe('00123|EMP|2026-11-10'); // I CLAVE
    expect(it.map((f) => f[9])).toEqual(['PAD PADRE', 'CONTENIDO PAD', 'NORMAL', 'NORMAL', 'NORMAL']);
    expect(it[1][10]).toBe(26);              // K Línea padre del contenido = el PAD
    expect(it[0][10]).toBe('');
    expect([it[0][18], it[1][18], it[2][18]]).toEqual([3000, '', 2000]); // S Precio manual (no en el contenido)
    expect(it[3][14]).toBe('814761');        // O N° guía
    expect(it[3][16]).toBe('LG');            // Q Lote
    expect(it[1][17]).toEqual(celdaFecha('2027-05-31'));
    expect(it[2][17]).toBe('Sin fecha');
    expect(it[0][28]).toBe('Ana');           // AC Registrado por
  });

  it('el libro trae la tabla y las dos hojas para pegar', () => {
    const libro = construirLibroExportacion(filas, { lineaInicial: 1 });
    expect(libro.SheetNames).toEqual(['Datos', 'Para Gestiones', 'Para Ítems']);
    const datos = XLSX.utils.sheet_to_json(libro.Sheets.Datos, { header: 1 });
    expect(datos[0]).toEqual(COLUMNAS_TABLA.map(([, t]) => t));
    expect(datos).toHaveLength(1 + filas.length);
    expect(libro.Sheets.Datos.D2).toMatchObject({ t: 'n', z: 'dd-mm-yyyy' });
    const g = XLSX.utils.sheet_to_json(libro.Sheets['Para Gestiones'], { header: 1, defval: '' });
    expect(g[1][7]).toBe('Estado (no pegar)');
    expect(g[2][1]).toBe('00123');
    const i = XLSX.utils.sheet_to_json(libro.Sheets['Para Ítems'], { header: 1, defval: '' });
    expect(i[1].slice(6, 9)).toEqual(['Nombre paciente (no pegar)', 'Estado carga', 'CLAVE']);
    expect(i[1][28]).toBe('Registrado por');
  });

  it('fecha ISO como fecha de Excel; otro texto tal cual', () => {
    expect(celdaFecha('2026-11-10')).toEqual({ t: 'n', v: 46336, z: 'dd-mm-yyyy' });
    expect(celdaFecha('PAD')).toBe('PAD');
  });
});
