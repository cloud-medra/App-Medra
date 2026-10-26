import { useEffect, useRef } from 'react';
import { entradaDeVista, leerModuloDeURL, urlConModulo } from '../config/vistaModulo';

/**
 * Historial del navegador para la vista de acceso rápido de un módulo
 * (?modulo=…, ver config/vistaModulo.js). Cada entrada del historial guarda
 * en `state.medra` lo que mostraba el Dashboard: al entrar o salir de la
 * vista de acceso rápido se agrega una entrada; en los demás cambios se
 * actualiza la actual. Así "atrás" vuelve a la pantalla anterior, "adelante"
 * a la de acceso rápido y al recargar se conserva.
 *
 * `restaurar({ vista, modulo, ajustes })` vuelve a mostrar una entrada;
 * `abrirModulo(entrada)` abre la vista de acceso rápido (entrada sin estado
 * propio pero con ?modulo=). Las entradas de Reporte Info las maneja su
 * propia pantalla.
 */
export const useHistorialVistaModulo = ({ vista, modulo, ajustes, restaurar, abrirModulo }) => {
  const entrada = entradaDeVista(vista);

  useEffect(() => {
    const medra = { vista, modulo, ajustes };
    if ((entrada || null) !== leerModuloDeURL()) {
      window.history.pushState({ medra }, '', urlConModulo(entrada));
    } else {
      window.history.replaceState({ ...(window.history.state || {}), medra }, '');
    }
  }, [vista, modulo, ajustes, entrada]);

  // Última versión de los callbacks, para registrar el listener una sola vez.
  const callbacks = useRef({ restaurar, abrirModulo });
  callbacks.current = { restaurar, abrirModulo };

  useEffect(() => {
    const alNavegar = (e) => {
      const s = e.state?.medra;
      if (s) {
        callbacks.current.restaurar(s);
        return;
      }
      const desdeURL = leerModuloDeURL();
      if (desdeURL) callbacks.current.abrirModulo(desdeURL);
    };
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, []);

  return entrada;
};
