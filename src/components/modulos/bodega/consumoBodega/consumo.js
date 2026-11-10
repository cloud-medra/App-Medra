// Agrupación del reporte de consumo (entregas). Lógica pura.
import { TIPOS_REPOSICION_CENTRO } from '../../../../../functions/bodega/nucleo.mjs';

export const esReposicion = (m) => TIPOS_REPOSICION_CENTRO.includes(m?.tipo);

// movimientos -> [{ centroId, centroNombre, unidades, valor, repuesto,
// valorRepuesto, neto, valorNeto, productos: [{ productoId, productoNombre,
// codigoMaestro, unidades, valor, entregas, repuesto, valorRepuesto, neto,
// valorNeto }] }], centros y productos ordenados por unidades usadas (mayor
// primero). `unidades`/`valor`: lo usado (entregas; en un kit, solo lo usado,
// con el valor con que salió de Bodega). `repuesto`: lo que el centro repuso
// con stock suyo de lo usado en un kit (REPOSICION_KIT). Neto = usado − repuesto.
export const agruparConsumo = (movimientos) => {
  const centros = new Map();
  const vacio = () => ({ unidades: 0, valor: 0, repuesto: 0, valorRepuesto: 0, entregas: 0 });
  const sumar = (x, m) => {
    if (esReposicion(m)) { x.repuesto += m.cantidad || 0; x.valorRepuesto += Number(m.valor) || 0; }
    else { x.unidades += m.cantidad || 0; x.valor += Number(m.valor) || 0; x.entregas += 1; }
  };
  const conNeto = (x) => ({ ...x, neto: x.unidades - x.repuesto, valorNeto: x.valor - x.valorRepuesto });
  movimientos.forEach((m) => {
    const c = centros.get(m.centroId) || { centroId: m.centroId, centroNombre: m.centroNombre || m.centroId, ...vacio(), productos: new Map() };
    const p = c.productos.get(m.productoId) || { productoId: m.productoId, productoNombre: m.productoNombre, codigoMaestro: m.codigoMaestro, ...vacio() };
    sumar(p, m);
    sumar(c, m);
    c.productos.set(m.productoId, p);
    centros.set(m.centroId, c);
  });
  return [...centros.values()]
    .map((c) => conNeto({ ...c, productos: [...c.productos.values()].map(conNeto).sort((a, b) => b.unidades - a.unidades || a.productoNombre.localeCompare(b.productoNombre, 'es')) }))
    .sort((a, b) => b.unidades - a.unidades || a.centroNombre.localeCompare(b.centroNombre, 'es'));
};

export const primerDiaDelMes = (hoy) => `${hoy.slice(0, 8)}01`;
