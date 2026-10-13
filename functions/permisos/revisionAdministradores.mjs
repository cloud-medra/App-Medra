// Revisión (solo lectura) del cambio "el Administrador ya no tiene acceso
// total": qué Desarrolladores activos hay y qué dejaría de ver o hacer cada
// Administrador con sus permisos actuales. Lo usa
// functions/scripts/revisarAccesoAdministradores.js. Sin dependencias.

import { ACCIONES_DENEGADAS_POR_DEFECTO, accionDeVista, esDesarrollador } from './nucleo.mjs';

const PERMISOS_CENTRO = '/administracion/permisosCentro';
const ITEMS_ADMINISTRAR_USUARIOS = ['/administracion/crearUsuario', '/administracion/listadoUsuario', PERMISOS_CENTRO];

const resumen = (u) => ({
  uid: u.uid, nombreUsuario: u.nombreUsuario ?? '', nombreCompleto: u.nombreCompleto || '', email: u.email || '',
});

// usuarios: [{ uid, ...usuarios/{uid} }]
export const analizarAccesoAdministradores = (usuarios) => {
  const desarrolladores = usuarios.filter(esDesarrollador).map(resumen);
  const administradores = usuarios
    .filter((u) => u.rol === 'admin' && u.activo !== false)
    .map((u) => {
      const permisos = u.permisos || {};
      const granulares = u.permisosGranulares || {};
      const items = Object.values(permisos).flat();
      const modulos = Object.entries(permisos).filter(([, rutas]) => (rutas || []).length).map(([m]) => m);
      const pierde = [];
      if (!items.includes(PERMISOS_CENTRO)) pierde.push('Administración → Permisos por centro (no asignado)');
      pierde.push('Ajustes → Atajos (solo Desarrollador)');
      if (!ITEMS_ADMINISTRAR_USUARIOS.some((r) => items.includes(r))) pierde.push('Administrar usuarios (sin Crear usuario / Lista de usuarios / Permisos por centro)');
      const vistasSinConfigurar = items.filter((r) => !granulares[r]);
      // Acciones sensibles de vistas que sí tiene, sin marcar explícitamente.
      const accionesSinMarcar = ACCIONES_DENEGADAS_POR_DEFECTO
        .map((c) => c.split('|').slice(1))
        .filter(([ruta]) => items.includes(ruta))
        .filter(([ruta, seccion, accion]) => !accionDeVista(granulares[ruta], ruta, seccion, accion))
        .map(([ruta, , accion]) => `${ruta} → ${accion}`);
      return {
        ...resumen(u),
        modulos,
        items: items.length,
        // Anterior a las plantillas: sin excepciones guardadas.
        antiguo: u.excepciones === undefined,
        pierde,
        vistasSinConfigurar,
        accionesSinMarcar,
      };
    });
  return { total: usuarios.length, desarrolladores, administradores };
};
