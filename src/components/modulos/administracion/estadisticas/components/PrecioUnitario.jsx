import { ArrowDownUp } from 'lucide-react';
import { formatoMonto } from './formato';

// Precio unitario promedio de un código (monto / cantidad). Si en el período
// se usó con distintos precios, un ícono avisa la variación y el mínimo y el
// máximo aparecen al pasar el mouse.
const PrecioUnitario = ({ fila }) => {
  if (fila.precio == null) return <span className="text-tinta-atenuada">—</span>;
  const varia = fila.precioMin != null && fila.precioMax != null;
  const texto = varia ? `Precio promedio. Varió entre ${formatoMonto(fila.precioMin)} y ${formatoMonto(fila.precioMax)} en el período.` : 'Precio unitario sin IVA';
  return (
    <span className="inline-flex items-center gap-1" title={texto}>
      {varia && <ArrowDownUp size={11} className="text-amber-600 dark:text-amber-400" aria-label="Precio con variación" />}
      {formatoMonto(fila.precio)}
    </span>
  );
};

export default PrecioUnitario;
