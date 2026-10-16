// Campos numéricos sin las flechas de subir/bajar y sin cambios
// accidentales. Se sigue escribiendo el número normal (mismo type="number",
// así que se aceptan los mismos valores que antes, decimales incluidos).
//   <input type="number" className={`${CLASE_SIN_FLECHAS} …`} {...SIN_CAMBIO_ACCIDENTAL} />

// Oculta las flechas: Chrome/Edge (::-webkit-*-spin-button) y Firefox (appearance: textfield).
export const CLASE_SIN_FLECHAS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0';

// Flechas ↑/↓ del teclado: no cambian el valor.
export const evitarFlechasTeclado = (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
};

// Rueda del mouse: el navegador solo cambia el número si el campo tiene el
// foco; se le quita (React registra la rueda como pasiva y no deja
// cancelarla con preventDefault).
export const evitarRuedaMouse = (e) => {
  if (document.activeElement === e.currentTarget) e.currentTarget.blur();
};

export const SIN_CAMBIO_ACCIDENTAL = Object.freeze({ onKeyDown: evitarFlechasTeclado, onWheel: evitarRuedaMouse });
