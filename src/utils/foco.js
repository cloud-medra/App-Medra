// Foco del teclado para ingresar muchas filas seguidas (Cargas de Implantes
// y de Hemodinamia).

// Enfoca el campo después del re-render: el campo puede cambiar o aparecer
// (ej. al agregar un PAD se oculta su contenido). Mismo patrón que
// EgresoPorEscaneo y ConteoCaja.
export const enfocar = (ref) => setTimeout(() => ref.current?.focus(), 0);

// onKeyDown del último campo de un formulario: Enter ejecuta `accion`
// (agregar el ítem / registrar la línea), con preventDefault para no enviar
// ningún <form> que lo envuelva. Ignora Enter mientras se compone texto
// (IME) y cualquier otra tecla.
export const alPresionarEnter = (accion) => (e) => {
  if (e.key !== 'Enter' || e.nativeEvent?.isComposing) return;
  e.preventDefault();
  accion();
};
