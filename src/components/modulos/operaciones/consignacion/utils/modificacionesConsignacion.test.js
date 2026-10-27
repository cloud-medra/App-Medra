import { describe, it, expect } from 'vitest';
import {
  itemComparableConsignacion, fotoRegistroConsignacion, camposModificacionConsignacion, CONFIG_MODIFICACIONES_CONSIGNACION
} from './modificacionesConsignacion';
import { construirFilasModificaciones, diferenciasContraFoto } from '../../shared/solicitudModificaciones/modificacionesSolicitud';
import { configModificaciones, opcionesFilas } from '../../shared/solicitudModificaciones/useSolicitudModificacionesData';
import { MODULOS_GESTION } from '../../shared/modulosGestion';

// Solicitudes de modificaciones de Consignación: cada registro es un bloque
// de un solo ítem, con los campos traducidos a los de la foto de Implantes.
const REGISTRO = {
  gestionId: '123', nombre: 'PACIENTE', empresa: 'EMP', fecha: '2026-10-05',
  codigo: 'C1', referencia: 'R1', descripcion: 'TORNILLO', cantidad: 2, costo: 1000, venta: 3000,
  lote: 'L1', vencimiento: '2027-01-01', atributo: 'CONSIGNACION', numeroGuiaVinculada: 555,
  periodoAnio: 2026, periodoMes: 'octubre',
};

describe('itemComparableConsignacion', () => {
  it('traduce costo, descripción y atributo a los campos de la foto', () => {
    expect(itemComparableConsignacion('d1', REGISTRO)).toMatchObject({
      id: 'd1', precio: 1000, descriptorAuto: 'TORNILLO', tipoVinculado: 'CONSIGNACION', numCotizacion: '555',
    });
  });

  it('la foto tiene un solo ítem con el id del registro', () => {
    const foto = fotoRegistroConsignacion('d1', REGISTRO);
    expect(foto).toHaveLength(1);
    expect(foto[0]).toMatchObject({ id: 'd1', cantidad: 2, precio: 1000, venta: 3000 });
  });
});

describe('camposModificacionConsignacion (guardar un registro SOLICITADO)', () => {
  const conFoto = { ...REGISTRO, itemsSolicitados: fotoRegistroConsignacion('d1', REGISTRO) };

  it('marca la modificación si cambia un campo comparado', () => {
    const r = camposModificacionConsignacion('d1', conFoto, { cantidad: 3, venta: 4500 });
    expect(r.modificacionPendiente).toBe(true);
    expect(r.itemsSolicitados).toEqual(conFoto.itemsSolicitados);
  });

  it('si vuelve a como estaba, quita la marca', () => {
    const editado = { ...conFoto, cantidad: 3 };
    expect(camposModificacionConsignacion('d1', editado, { cantidad: 2 }).modificacionPendiente).toBe(false);
  });

  it('sin foto (solicitado antes de este cambio) la base es el registro antes de editar', () => {
    const r = camposModificacionConsignacion('d1', REGISTRO, { lote: 'L2' });
    expect(r).toEqual({ itemsSolicitados: fotoRegistroConsignacion('d1', REGISTRO), modificacionPendiente: true });
  });
});

describe('pantalla compartida con Consignación', () => {
  it('configModificaciones: Consignación trae su config; Implantes y Hemodinamia siguen igual', () => {
    expect(configModificaciones('consignacion')).toBe(CONFIG_MODIFICACIONES_CONSIGNACION);
    expect(configModificaciones('implantes')).toBe(MODULOS_GESTION.implantes);
    expect(configModificaciones('hemodinamia')).toBe(MODULOS_GESTION.hemodinamia);
    expect(opcionesFilas(MODULOS_GESTION.implantes)).toEqual({});
  });

  it('el Excel lleva solo el cambio, con el N° de guía en vez de la cotización', () => {
    const items = CONFIG_MODIFICACIONES_CONSIGNACION.itemsDe('d1', { ...REGISTRO, cantidad: 3, venta: 4500 });
    const bloque = { ...REGISTRO, itemsSolicitados: fotoRegistroConsignacion('d1', REGISTRO), items };
    expect(diferenciasContraFoto(bloque.itemsSolicitados, items)).toHaveLength(1);
    const [fila] = construirFilasModificaciones([bloque], '27-10-2026', opcionesFilas(CONFIG_MODIFICACIONES_CONSIGNACION));
    expect(fila).toMatchObject({ MOVIMIENTO: 'MODIFICADO', 'DIFERENCIA CANTIDAD': 1, 'DIFERENCIA VENTA': 1500, 'N GUIA': '555' });
    expect(fila).not.toHaveProperty('N° COTIZACION');
  });
});
