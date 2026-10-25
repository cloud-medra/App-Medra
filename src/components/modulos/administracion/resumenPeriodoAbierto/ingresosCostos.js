// Período actual → tarjeta "Ingresos − costos del período". Solo resta los
// totales que la pantalla ya calcula por grupo (resumenPorGrupo): Consumos es
// lo que consumió el cliente (ingreso) y Facturación lo que pagamos (costo).
// Bodega no entra: su saldo no es un monto imputado.
export const resumenIngresosCostos = (resumenPorGrupo) => {
  const ingresos = resumenPorGrupo?.find((g) => g.grupoId === 'consumos');
  const costos = resumenPorGrupo?.find((g) => g.grupoId === 'facturacion');
  if (!ingresos || !costos) return null;
  const nombres = (g) => g.desgloseModulos.map((m) => m.moduloNombre);
  return {
    ingresos: ingresos.montoTotal,
    costos: costos.montoTotal,
    diferencia: ingresos.montoTotal - costos.montoTotal,
    modulosIngresos: nombres(ingresos),
    modulosCostos: nombres(costos),
  };
};
