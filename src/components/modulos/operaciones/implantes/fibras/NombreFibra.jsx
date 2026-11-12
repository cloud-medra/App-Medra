// Nombre de una fibra en pantalla: la referencia como texto principal y el
// código interno (FIB-0001) más chico y en gris, porque distingue fibras de
// la misma referencia. En textos sin estilos, textoFibra (fibrasNucleo.js).
const NombreFibra = ({ fibra, className = '', claseReferencia = 'text-etiqueta text-tinta-principal' }) => {
  const codigo = fibra?.codigoInterno || fibra?.id || '';
  return (
    <span className={`inline-flex items-baseline gap-1 min-w-0 ${className}`}>
      <span className={claseReferencia}>{fibra?.referencia || codigo}</span>
      {fibra?.referencia && codigo && (
        <span className="tabular-nums text-[0.85em] text-tinta-atenuada">{codigo}</span>
      )}
    </span>
  );
};

export default NombreFibra;
