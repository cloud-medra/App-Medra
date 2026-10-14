import { formatearPesos } from '../../../../utils/formatearMoneda';

// Valor en pesos para mostrar ("$1.234", "-$500").
export const formatoPesos = (valor) => {
  const texto = formatearPesos(valor);
  return texto.startsWith('-') ? `-$${texto.slice(1)}` : `$${texto}`;
};
