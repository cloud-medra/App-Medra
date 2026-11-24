import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Botón de ícono con tooltip inmediato (el `title` nativo tarda ~1 s).
// El texto también es su `aria-label`, y no lleva `title` para no mostrar dos.
//
// El tooltip va en un portal con posición fija: las celdas de las tablas
// (ej. TD_BODEGA) tienen overflow-hidden y un tooltip absoluto dentro del
// botón quedaría recortado. Se muestra al pasar el cursor o al enfocar con el
// teclado, sobre el botón (debajo si no cabe) y sin salirse de la ventana;
// se oculta al salir, al perder el foco, al hacer clic o al desplazar.
const MARGEN = 6;

export const BotonConTooltip = ({ texto, children, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, type = 'button', ...resto }) => {
  const refBoton = useRef(null);
  const refTooltip = useRef(null);
  const [visible, setVisible] = useState(false);
  const [posicion, setPosicion] = useState(null);

  useLayoutEffect(() => {
    // Se mide antes de pintar (layout effect): no se ve en la posición anterior.
    if (!visible) return undefined;
    const boton = refBoton.current?.getBoundingClientRect();
    const tip = refTooltip.current?.getBoundingClientRect();
    if (!boton || !tip) return undefined;
    const arriba = boton.top - tip.height - MARGEN;
    const top = arriba >= MARGEN ? arriba : boton.bottom + MARGEN;
    const centrado = boton.left + boton.width / 2 - tip.width / 2;
    const left = Math.min(Math.max(centrado, MARGEN), window.innerWidth - tip.width - MARGEN);
    setPosicion({ top, left });
    const ocultar = () => setVisible(false);
    window.addEventListener('scroll', ocultar, true);
    window.addEventListener('resize', ocultar);
    return () => {
      window.removeEventListener('scroll', ocultar, true);
      window.removeEventListener('resize', ocultar);
    };
  }, [visible, texto]);

  const encadenar = (propio, delPadre) => (e) => { propio(); delPadre?.(e); };

  return (
    <>
      <button
        ref={refBoton}
        type={type}
        aria-label={texto}
        onClick={encadenar(() => setVisible(false), onClick)}
        onMouseEnter={encadenar(() => setVisible(true), onMouseEnter)}
        onMouseLeave={encadenar(() => setVisible(false), onMouseLeave)}
        onFocus={encadenar(() => setVisible(true), onFocus)}
        onBlur={encadenar(() => setVisible(false), onBlur)}
        {...resto}
      >
        {children}
      </button>
      {visible && createPortal(
        <span
          ref={refTooltip}
          role="tooltip"
          style={{ top: posicion?.top ?? 0, left: posicion?.left ?? 0, visibility: posicion ? 'visible' : 'hidden' }}
          className="fixed z-[70] pointer-events-none px-2 py-1 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-pequeno whitespace-nowrap shadow-md"
        >
          {texto}
        </span>,
        document.body
      )}
    </>
  );
};

export default BotonConTooltip;
