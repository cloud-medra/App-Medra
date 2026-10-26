import { useState, useEffect, useRef } from 'react';
import { cargarCatalogo, leerCatalogo, suscribirCatalogo } from '../../../../../../../stores/catalogosStore';

// --- Caché en memoria compartida, mantenida en vivo con onSnapshot ---
// Antes se cargaba una sola vez con getDocs() y quedaba "congelada": un
// código nuevo o editado en Códigos Maestros no aparecía en el autocompletado
// de Cargas hasta refrescar la página. Ahora hay un listener en tiempo real
// compartido entre todas las instancias del autocompletado montadas en la
// app; cualquier cambio en "maestros_codigos" (crear, editar, importar, o
// modificar precio desde Vista General) actualiza la caché al instante,
// sin depender de que cada punto de escritura recuerde invalidarla.
// La colección vive en el catalogosStore: un único listener de
// maestros_codigos para toda la app, que no se cierra al desmontar
// (cerrarlo y reabrirlo volvía a cobrar la colección completa).
const obtenerCodigos = () => leerCatalogo('codigos') ?? [];

// Códigos Maestros marca los códigos dados de baja con estado 'INACTIVO'
// (sin campo = activo, ver PanelEdicionCodigo). No se ofrecen como
// sugerencia al cargar ni al cambiar la referencia de un ítem. El filtro va
// acá y no en la consulta: el catálogo es un único listener compartido por
// toda la app (otros módulos sí necesitan los inactivos) y un
// where('estado', '!=', 'INACTIVO') dejaría fuera los documentos sin campo.
// Los ítems ya guardados con una referencia hoy inactiva no se ven
// afectados: guardan su propia copia de referencia/código/precio.
export const esCodigoActivo = (item) =>
  String(item?.estado ?? 'ACTIVO').trim().toUpperCase() !== 'INACTIVO';

// Se mantiene por compatibilidad si la llamas desde algún lado; ya no hace
// falta porque la caché se mantiene sola vía onSnapshot.
export const invalidarCacheCodigosMaestros = () => {};

// `activo` (por defecto true): en false (CotizacionCard en modo lectura) no
// se carga el catálogo de códigos.
export const useAutocompleteReferencia = (referenciaTexto, activo = true) => {
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSug, setMostrarSug] = useState(false);
  const containerRef = useRef(null);
  // Ref opcional para cuando el listado se renderiza vía portal (fuera del
  // árbol de containerRef, ver DropdownReferenciaPortal en CotizacionCard.jsx):
  // sin esto, un click en una sugerencia se interpretaría como "click afuera"
  // y cerraría el listado antes de que el onClick de selección llegue a disparar.
  const portalRef = useRef(null);
  const skipNext = useRef(false);
  const ultimoTextoRef = useRef('');

  useEffect(() => {
    if (activo) cargarCatalogo('codigos').catch(() => {});
  }, [activo]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const dentroContainer = containerRef.current && containerRef.current.contains(e.target);
      const dentroPortal = portalRef.current && portalRef.current.contains(e.target);
      if (!dentroContainer && !dentroPortal) setMostrarSug(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const recalcularSugerencias = (texto) => {
    const t = (texto || '').trim();
    ultimoTextoRef.current = t;
    if (t.length < 2) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    const upper = t.toUpperCase();
    const coincidencias = obtenerCodigos().filter(item => {
      if (!esCodigoActivo(item)) return false;
      const ref = (item.referencia || '').toUpperCase();
      const cod = (item.codigo || '').toUpperCase();
      return ref.includes(upper) || cod.includes(upper);
    });
    coincidencias.sort((a, b) => {
      const refA = (a.referencia || '').toUpperCase();
      const refB = (b.referencia || '').toUpperCase();
      const empiezaA = refA.startsWith(upper) ? 0 : 1;
      const empiezaB = refB.startsWith(upper) ? 0 : 1;
      if (empiezaA !== empiezaB) return empiezaA - empiezaB;
      return refA.localeCompare(refB);
    });
    setSugerencias(coincidencias.slice(0, 8));
    setBuscando(false);
  };

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const t = (referenciaTexto || '').trim();
    if (t.length < 2) {
      setSugerencias([]);
      setMostrarSug(false);
      return;
    }
    setBuscando(leerCatalogo('codigos') === null);
    const timeoutId = setTimeout(() => {
      recalcularSugerencias(referenciaTexto);
      setMostrarSug(true);
    }, 350);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenciaTexto]);

  // Si el dropdown está abierto y llega un cambio de la caché (p.ej. alguien
  // más acaba de crear el código que estás buscando), refresca sola.
  useEffect(() => {
    const cb = () => {
      if (ultimoTextoRef.current.length >= 2) recalcularSugerencias(ultimoTextoRef.current);
    };
    return suscribirCatalogo('codigos', cb);
  }, []);

  return { sugerencias, buscando, mostrarSug, setMostrarSug, containerRef, portalRef, skipNext };
};