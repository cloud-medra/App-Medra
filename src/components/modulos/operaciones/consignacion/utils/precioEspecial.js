// Precio especial de una carga de Consignación: el precio (`costo`) se puede
// editar en la carga sin tocar el maestro de códigos. Se guarda también el
// precio del maestro (`costoMaestro`) y la marca `precioEspecial` cuando
// difieren, para mostrar que el precio fue modificado.
//
// Lo usan Consignación → Cargas (edición de un ítem) y Carga masiva
// (vista previa). Lógica pura, sin Firebase.

// Precio del maestro de un ítem: el guardado, o el actual si nunca se editó
// (hasta entonces `costo` es el del maestro).
export const costoMaestroDe = (item) => {
  const guardado = item?.costoMaestro;
  if (guardado !== undefined && guardado !== null && guardado !== '') return Number(guardado) || 0;
  return Number(item?.costo) || 0;
};

export const esPrecioEspecial = (item) => item?.precioEspecial === true;

// Precio escrito por el usuario -> número (acepta "12.500" o "12500").
export const precioANumero = (valor) => {
  if (typeof valor === 'number') return valor;
  const limpio = String(valor ?? '').trim().replace(/\./g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
};

// Mensaje de error del precio, o null si es válido (número mayor que cero).
export const errorPrecio = (valor) => {
  const n = precioANumero(valor);
  if (!Number.isFinite(n)) return 'Ingresa un precio';
  if (n <= 0) return 'El precio debe ser mayor que cero';
  return null;
};

// Campos de precio a guardar: el precio, el del maestro y la marca.
export const camposPrecio = (costo, costoMaestro) => {
  const precio = Number(costo) || 0;
  const maestro = Number(costoMaestro) || 0;
  const especial = precio !== maestro;
  return { costo: precio, costoMaestro: maestro, precioEspecial: especial };
};

// Regla de recargo activa cuyo rango [desde, hasta] contiene el precio, o
// null. `recargos`: maestro de recargos (catalogosStore, lectura única).
export const buscarReglaRecargo = (recargos, costo) => {
  if (!Number.isFinite(costo) || costo <= 0) return null;
  return (recargos || []).find((r) =>
    (r.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO' &&
    costo >= Number(r.desde) &&
    costo <= Number(r.hasta)
  ) || null;
};

// Payload de una fila de Carga masiva con el precio especial aplicado (si
// se editó y difiere del maestro). Sin precio editado, el payload no cambia.
export const aplicarPrecioEditado = (payload, precioEditado) => {
  if (!payload || precioEditado === undefined || precioEditado === null || String(precioEditado).trim() === '') return payload;
  const precio = precioANumero(precioEditado);
  if (!Number.isFinite(precio) || precio <= 0) return payload;
  const campos = camposPrecio(precio, payload.costo);
  return campos.precioEspecial ? { ...payload, ...campos } : payload;
};

// Venta del ítem con la regla de recargo (misma fórmula que Implantes →
// Gestiones → Cargas: precio × veces costo × cantidad). `buscarRegla(costo)`
// devuelve la regla del rango del precio o null.
export const calcularVentaItem = (costo, cantidad, buscarRegla) => {
  const precio = Number(costo) || 0;
  const cant = Number(cantidad) || 0;
  const regla = buscarRegla(precio);
  if (!regla) return { vecesCosto: null, venta: null, total: precio * cant, margen: null };
  const vecesCosto = Number(regla.vecesCosto);
  const venta = Math.round(precio * vecesCosto * cant);
  const total = precio * cant;
  return { vecesCosto, venta, total, margen: venta - Math.round(total) };
};

// Solo los campos cuyo valor cambió respecto del ítem guardado (para
// escribir con updateDoc únicamente lo modificado), y sus valores
// anteriores para el historial (`<campo>Anterior`).
export const diferencias = (anterior, nuevos) => {
  const cambios = {};
  const anteriores = {};
  Object.entries(nuevos).forEach(([campo, valor]) => {
    const previo = anterior?.[campo];
    const igual = typeof valor === 'number'
      ? Number(previo) === valor && previo !== undefined && previo !== null && previo !== ''
      : (previo ?? '') === (valor ?? '');
    if (!igual) {
      cambios[campo] = valor;
      anteriores[`${campo}Anterior`] = previo ?? null;
    }
  });
  return { cambios, anteriores };
};
