// Módulos e ítems activos/inactivos del sistema (Administración → Gestión de
// módulos). Configuración GLOBAL en configuracion_sistema/modulosActivos:
//   { modulosInactivos: [moduloKey], itemsInactivos: [ruta], actualizadoEn, actualizadoPor }
// Se guarda solo lo INACTIVO: sin documento (o un módulo/ítem nuevo que no
// figure) todo queda activo, así nada desaparece al desplegar.
//
// Lo inactivo no se muestra en el sidebar a nadie (tampoco al Desarrollador)
// y su vista no se abre aunque se llegue por otro camino (atajos, enlaces).
// Solo bloquea en la aplicación: las reglas de datos y Cloud Functions de
// cada módulo no cambian.
//
// Funciones puras: `config` es el resultado de normalizarModulosActivos
// (o null/undefined mientras carga = todo activo).

export const RUTA_GESTION_MODULOS = '/administracion/gestionModulos';

// No se pueden inactivar (para no quedar fuera del sistema).
export const MODULOS_PROTEGIDOS = Object.freeze(['administracion']);
export const ITEMS_PROTEGIDOS = Object.freeze([RUTA_GESTION_MODULOS]);

export const moduloProtegido = (moduloKey) => MODULOS_PROTEGIDOS.includes(moduloKey);
export const itemProtegido = (ruta) => ITEMS_PROTEGIDOS.includes(ruta);

export const CONFIG_TODO_ACTIVO = Object.freeze({ modulosInactivos: [], itemsInactivos: [] });

const listaDeTextos = (valor) => (Array.isArray(valor)
  ? [...new Set(valor.filter((v) => typeof v === 'string' && v))]
  : []);

// Documento de Firestore -> { modulosInactivos, itemsInactivos } válido, sin
// lo protegido (aunque alguien lo haya guardado a mano).
export const normalizarModulosActivos = (data) => ({
  modulosInactivos: listaDeTextos(data?.modulosInactivos).filter((k) => !moduloProtegido(k)),
  itemsInactivos: listaDeTextos(data?.itemsInactivos).filter((r) => !itemProtegido(r))
});

export const moduloActivo = (config, moduloKey) =>
  moduloProtegido(moduloKey) || !(config?.modulosInactivos || []).includes(moduloKey);

// Un ítem está activo si su módulo lo está y él no está inactivado.
export const itemActivo = (config, moduloKey, ruta) =>
  itemProtegido(ruta)
  || (moduloActivo(config, moduloKey) && !(config?.itemsInactivos || []).includes(ruta));

// ¿Se puede abrir esta vista? Busca el ítem del sidebar al que pertenece la
// ruta (la propia ruta o una subruta, ej. pestañas "/ruta/pestaña"). Las
// vistas que no son ítems de un módulo (Dashboard, Ajustes, perfil) siempre.
export const itemDeRuta = (modules, ruta) => {
  if (typeof ruta !== 'string') return null;
  for (const [moduloKey, modulo] of Object.entries(modules)) {
    const item = (modulo.subItems || []).find((s) => ruta === s.path || ruta.startsWith(`${s.path}/`));
    if (item) return { moduloKey, item };
  }
  return null;
};

export const vistaActiva = (config, modules, ruta) => {
  const encontrado = itemDeRuta(modules, ruta);
  return !encontrado || itemActivo(config, encontrado.moduloKey, encontrado.item.path);
};

// Activa/inactiva un módulo. Al reactivarlo, sus ítems vuelven con el estado
// individual que tenían.
export const alternarModulo = (config, moduloKey) => {
  if (moduloProtegido(moduloKey)) return config;
  const inactivos = config.modulosInactivos;
  return {
    ...config,
    modulosInactivos: inactivos.includes(moduloKey)
      ? inactivos.filter((k) => k !== moduloKey)
      : [...inactivos, moduloKey]
  };
};

export const alternarItem = (config, ruta) => {
  if (itemProtegido(ruta)) return config;
  const inactivos = config.itemsInactivos;
  return {
    ...config,
    itemsInactivos: inactivos.includes(ruta)
      ? inactivos.filter((r) => r !== ruta)
      : [...inactivos, ruta]
  };
};

export const mismaConfig = (a, b) => {
  const igual = (x, y) => x.length === y.length && x.every((v) => y.includes(v));
  return igual(a.modulosInactivos, b.modulosInactivos) && igual(a.itemsInactivos, b.itemsInactivos);
};
