// Formato de RUT de la app: "12.345.678-9" (puntos de miles, guion y dígito
// verificador en mayúscula). Misma lógica que las copias locales de
// Maestros → Empresas, Laboratorio y Vacunatorio, que guardan el RUT así;
// aplicarlo a un RUT ya formateado lo deja igual.
export const formatearRut = (rut) => {
  const valor = String(rut ?? '').replace(/[^0-9kK]/g, '');
  if (valor.length < 2) return valor;
  const cuerpo = valor.slice(0, -1);
  const dv = valor.slice(-1).toUpperCase();
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};
