// Nombre de una fibra en pantalla: la referencia como texto principal y el
// código interno (FIB-0001) más chico y en gris, porque distingue fibras de
// la misma referencia. En textos sin estilos, textoFibra (fibrasNucleo.js).
const NombreFibra = ({ fibra, className = '', claseReferencia = 'font-bold text-gray-800 dark:text-gray-100' }) => {
  const codigo = fibra?.codigoInterno || fibra?.id || '';
  return (
    <span className={`inline-flex items-baseline gap-1 min-w-0 ${className}`}>
      <span className={claseReferencia}>{fibra?.referencia || codigo}</span>
      {fibra?.referencia && codigo && (
        <span className="tabular-nums text-[0.85em] font-normal text-gray-400 dark:text-gray-500">{codigo}</span>
      )}
    </span>
  );
};

export default NombreFibra;
