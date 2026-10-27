// Código corto de un módulo o ítem (config/codigosModulos.js) junto a su
// nombre en el sidebar y en la vista de acceso rápido: muy chico y tenue
// para no competir con el nombre; se aviva un poco al pasar el mouse sobre
// el botón que lo contiene (que debe llevar la clase `group`). En el
// buscador del sidebar se muestra más visible, con su propio estilo.
const CodigoDiscreto = ({ codigo, className = '' }) => (
  <span
    className={`shrink-0 text-[8px] font-medium tracking-wider leading-none text-gray-400/60 dark:text-gray-400/45 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors ${className}`}
    aria-label={`código ${codigo}`}
  >
    {codigo}
  </span>
);

export default CodigoDiscreto;
