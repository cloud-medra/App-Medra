// Receta de los kits de una familia: componentes (nombre, cantidad, orden y
// referencias permitidas) y modelos (referencia del kit para cada género y
// tipo de vaina). Se mantiene desde "Configuración Flexibles" y se guarda en
// kits_configuracion/{familia}; solo la escribe la Function kitsConfiguracion.
// Lógica pura, compartida con la pantalla.
//
// Las referencias permitidas pueden ser comunes a todos los kits o depender
// de la variante (género + vaina), como la Vaina. Cada referencia se guarda
// normalizada junto al producto de Bodega que le corresponde: el kit valida
// por producto, no por texto.
//
// Cambiar la receta no toca los kits armados: cada línea guarda su componente.

import { normalizarClave, referenciaDeProducto } from '../bodega/nucleo.mjs';

export const COL_CONFIGURACION_KITS = 'kits_configuracion';
export const GENEROS = Object.freeze({ HOMBRE: 'Hombre', MUJER: 'Mujer' });
export const VAINAS = Object.freeze({ NORMAL: 'Normal', ASPIRATIVA: 'Aspirativa' });
export const claveVariante = (genero, vaina) => `${genero}_${vaina}`;
export const VARIANTES = Object.freeze(Object.keys(GENEROS).flatMap((g) => Object.keys(VAINAS).map((v) => claveVariante(g, v))));
export const etiquetaVariante = (clave) => {
  const [g, v] = String(clave).split('_');
  return `${GENEROS[g] || g} · vaina ${String(VAINAS[v] || v).toLowerCase()}`;
};

export const MAX_COMPONENTES = 20;
export const MAX_REFERENCIAS_POR_LISTA = 30;
export const MAX_CANTIDAD_COMPONENTE = 50;
export const MAX_MODELOS = 20;
const PATRON_REFERENCIA_KIT = /^[A-Z0-9][A-Z0-9-]{0,19}$/;
const PATRON_ID_COMPONENTE = /^[a-z0-9-]{1,40}$/;

const limpiar = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ');
export const normalizarReferencia = (texto) => limpiar(texto).toUpperCase();
export const idComponente = (nombre) => normalizarClave(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'componente';

export const componentesOrdenados = (config) => [...(config?.componentes || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0));
export const referenciasDelComponente = (c, variante) => (c?.porVariante ? (c.referenciasPorVariante?.[variante] || []) : (c?.referencias || []));

// Componentes sin ninguna referencia para la variante del modelo.
export const faltantesDelModelo = (config, modelo) => {
  const componentes = componentesOrdenados(config);
  if (!componentes.length) return ['componentes de la receta'];
  const variante = claveVariante(modelo.genero, modelo.vaina);
  return componentes.filter((c) => !referenciasDelComponente(c, variante).length).map((c) => c.nombre);
};
export const modeloCompleto = (config, modelo) => faltantesDelModelo(config, modelo).length === 0;
// Lo que se ofrece al crear un kit: activo y con todos sus componentes.
export const modelosDisponibles = (config) => (config?.modelos || []).filter((m) => m.activo !== false && modeloCompleto(config, m));
export const buscarModelo = (config, genero, vaina) => (config?.modelos || []).find((m) => m.genero === genero && m.vaina === vaina) || null;
export const modeloDeReferencia = (config, referencia) => (config?.modelos || []).find((m) => m.referencia === referencia) || null;

// "KFH - Kit Flexible Hombre", con los datos guardados en el kit (no relee la configuración).
export const etiquetaModeloKit = (kit) => (kit?.modeloNombre ? `${kit.referencia} - ${kit.modeloNombre}` : (kit?.referencia || '—'));
export const etiquetaTipoKit = (kit) => (kit?.genero && kit?.vaina ? etiquetaVariante(claveVariante(kit.genero, kit.vaina)) : (kit?.tipo || '—'));

// Receta de un modelo: [{ id, nombre, cantidad, orden, referencias: [{ referencia, productoId, nombre }] }].
export const recetaDelModelo = (config, modelo) => {
  const variante = claveVariante(modelo.genero, modelo.vaina);
  return componentesOrdenados(config).map((c) => ({ id: c.id, nombre: c.nombre, cantidad: c.cantidad, orden: c.orden, referencias: referenciasDelComponente(c, variante) }));
};

// Elige el modelo para crear un kit: debe existir, estar activo y completo, y
// coincidir con la referencia si la pantalla la envía.
export const validarModeloKit = (config, { genero, vaina, referencia } = {}) => {
  if (!GENEROS[genero] || !VAINAS[vaina]) return { errores: ['Selecciona el género y el tipo de vaina del kit.'], modelo: null };
  const modelo = buscarModelo(config, genero, vaina);
  const variante = etiquetaVariante(claveVariante(genero, vaina));
  if (!modelo) return { errores: [`No hay un modelo de kit para ${variante}.`], modelo: null };
  if (modelo.activo === false) return { errores: [`El modelo ${modelo.referencia} está inactivo.`], modelo: null };
  const faltan = faltantesDelModelo(config, modelo);
  if (faltan.length) return { errores: [`El modelo ${modelo.referencia} está incompleto: falta configurar ${faltan.join(', ')}.`], modelo: null };
  if (referencia && normalizarReferencia(referencia) !== modelo.referencia) return { errores: [`La referencia ${normalizarReferencia(referencia)} no corresponde a ${variante} (es ${modelo.referencia}).`], modelo: null };
  return { errores: [], modelo };
};

// Contenido pedido frente a la receta. `lineas`: [{ productoId, loteId,
// cantidad }]. `previas`: líneas guardadas del kit (al editar): una línea que
// se conserva (mismo lote, sin aumentar) mantiene su componente aunque su
// referencia ya no esté permitida. Cada componente debe quedar exacto.
//   -> { errores, componentePorLote: Map(loteId -> componente) }
export const validarContenidoKit = (receta, lineas = [], previas = [], nombreDe = () => '') => {
  const porProducto = new Map();
  receta.forEach((c) => c.referencias.forEach((r) => porProducto.set(r.productoId, c)));
  const porId = new Map(receta.map((c) => [c.id, c]));
  const previasPorLote = new Map(previas.map((l) => [l.loteId, l]));
  const errores = [];
  const componentePorLote = new Map();
  const suma = new Map();
  lineas.forEach((l) => {
    let componente = porProducto.get(l.productoId);
    const previa = previasPorLote.get(l.loteId);
    if (!componente && previa && l.cantidad <= previa.cantidad) componente = porId.get(previa.componenteId);
    if (!componente) { errores.push(`${nombreDe(l.productoId) || 'Un insumo'} no está permitido en la receta de este kit.`); return; }
    componentePorLote.set(l.loteId, componente);
    suma.set(componente.id, (suma.get(componente.id) || 0) + l.cantidad);
  });
  receta.forEach((c) => {
    const n = suma.get(c.id) || 0;
    if (n < c.cantidad) errores.push(`${c.nombre}: faltan ${c.cantidad - n} (lleva ${n} de ${c.cantidad}).`);
    if (n > c.cantidad) errores.push(`${c.nombre}: sobran ${n - c.cantidad} (lleva ${n} de ${c.cantidad}).`);
  });
  return { errores, componentePorLote };
};

// Configuración enviada -> { errores, config } normalizada, con cada
// referencia resuelta al producto de Bodega. `productos`: el maestro.
export const validarConfiguracion = (datos = {}, productos = []) => {
  const errores = [];
  const porReferencia = new Map();
  productos.forEach((p) => {
    const r = normalizarReferencia(referenciaDeProducto(p));
    if (r) porReferencia.set(r, [...(porReferencia.get(r) || []), p]);
  });
  const resolver = (texto, donde) => {
    const referencia = normalizarReferencia(texto);
    if (!referencia) return null;
    const candidatos = (porReferencia.get(referencia) || []).filter((p) => p.activo !== false);
    if (!candidatos.length) { errores.push(`${donde}: la referencia ${referencia} no existe en el maestro de Bodega o está inactiva.`); return null; }
    if (candidatos.length > 1) { errores.push(`${donde}: la referencia ${referencia} está en más de un producto de Bodega.`); return null; }
    return { referencia, productoId: candidatos[0].id, nombre: candidatos[0].nombre || '' };
  };
  const lista = (entrada, donde) => {
    const vistas = new Set();
    const resueltas = (Array.isArray(entrada) ? entrada : [])
      .map((x) => resolver(typeof x === 'string' ? x : x?.referencia, donde))
      .filter((r) => r && !vistas.has(r.referencia) && vistas.add(r.referencia));
    if (resueltas.length > MAX_REFERENCIAS_POR_LISTA) errores.push(`${donde}: máximo ${MAX_REFERENCIAS_POR_LISTA} referencias.`);
    return resueltas;
  };

  const entradaComponentes = Array.isArray(datos.componentes) ? datos.componentes : [];
  if (entradaComponentes.length > MAX_COMPONENTES) errores.push(`Máximo ${MAX_COMPONENTES} componentes.`);
  const componentes = entradaComponentes.map((c, i) => {
    const nombre = limpiar(c?.nombre);
    const donde = nombre || `Componente ${i + 1}`;
    if (!nombre) errores.push(`Componente ${i + 1}: falta el nombre.`);
    const cantidad = Number(c?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_COMPONENTE) errores.push(`${donde}: la cantidad debe ser un número entero entre 1 y ${MAX_CANTIDAD_COMPONENTE}.`);
    const porVariante = c?.porVariante === true;
    return {
      id: PATRON_ID_COMPONENTE.test(String(c?.id || '')) ? String(c.id) : idComponente(nombre),
      nombre, cantidad, orden: i + 1, porVariante,
      referencias: porVariante ? [] : lista(c?.referencias, donde),
      referenciasPorVariante: porVariante ? Object.fromEntries(VARIANTES.map((v) => [v, lista(c?.referenciasPorVariante?.[v], `${donde} (${etiquetaVariante(v)})`)])) : {},
    };
  });
  const repetidos = (valores) => valores.filter((v, i) => v && valores.indexOf(v) !== i);
  repetidos(componentes.map((c) => c.id)).forEach((id) => errores.push(`Hay dos componentes con el identificador ${id}.`));
  repetidos(componentes.map((c) => normalizarClave(c.nombre))).forEach((n) => errores.push(`Hay dos componentes llamados ${n}.`));
  // Un producto pertenece a un solo componente: así cada línea sabe a cuál va.
  const duenoProducto = new Map();
  componentes.forEach((c) => {
    const todas = c.porVariante ? Object.values(c.referenciasPorVariante).flat() : c.referencias;
    new Set(todas.map((r) => r.productoId)).forEach((pid) => {
      const otro = duenoProducto.get(pid);
      if (otro && otro !== c.nombre) errores.push(`La referencia ${todas.find((r) => r.productoId === pid).referencia} está en ${otro} y en ${c.nombre}.`);
      else duenoProducto.set(pid, c.nombre);
    });
  });

  const entradaModelos = Array.isArray(datos.modelos) ? datos.modelos : [];
  if (entradaModelos.length > MAX_MODELOS) errores.push(`Máximo ${MAX_MODELOS} modelos.`);
  const modelos = entradaModelos.map((m, i) => {
    const referencia = normalizarReferencia(m?.referencia);
    const donde = referencia || `Modelo ${i + 1}`;
    if (!PATRON_REFERENCIA_KIT.test(referencia)) errores.push(`${donde}: la referencia del kit solo admite letras, números y guion (hasta 20).`);
    const nombre = limpiar(m?.nombre);
    if (!nombre) errores.push(`${donde}: falta el nombre.`);
    if (!GENEROS[m?.genero]) errores.push(`${donde}: elige el género.`);
    if (!VAINAS[m?.vaina]) errores.push(`${donde}: elige el tipo de vaina.`);
    return { referencia, nombre, genero: m?.genero, vaina: m?.vaina, activo: m?.activo !== false };
  });
  repetidos(modelos.map((m) => m.referencia)).forEach((r) => errores.push(`La referencia de kit ${r} está repetida.`));
  repetidos(modelos.map((m) => claveVariante(m.genero, m.vaina))).forEach((v) => errores.push(`Hay dos modelos para ${etiquetaVariante(v)}.`));

  return { errores: [...new Set(errores)], config: { componentes, modelos } };
};

// Lo que cambió entre dos configuraciones, en texto, para la auditoría.
export const cambiosConfiguracion = (antes, despues) => {
  const cambios = [];
  const refs = (lista) => (lista || []).map((r) => r.referencia);
  const comparar = (donde, a, b) => {
    const quitadas = refs(a).filter((r) => !refs(b).includes(r));
    const agregadas = refs(b).filter((r) => !refs(a).includes(r));
    if (agregadas.length) cambios.push(`${donde}: agregadas ${agregadas.join(', ')}`);
    if (quitadas.length) cambios.push(`${donde}: quitadas ${quitadas.join(', ')}`);
  };
  const ca = new Map((antes?.componentes || []).map((c) => [c.id, c]));
  const cb = new Map((despues?.componentes || []).map((c) => [c.id, c]));
  cb.forEach((c, id) => {
    const a = ca.get(id);
    if (!a) { cambios.push(`Componente agregado: ${c.nombre} (cantidad ${c.cantidad})`); }
    else {
      if (a.nombre !== c.nombre) cambios.push(`Componente ${a.nombre}: nombre ${a.nombre} → ${c.nombre}`);
      if (a.cantidad !== c.cantidad) cambios.push(`${c.nombre}: cantidad ${a.cantidad} → ${c.cantidad}`);
      if (a.orden !== c.orden) cambios.push(`${c.nombre}: orden ${a.orden} → ${c.orden}`);
      if (Boolean(a.porVariante) !== c.porVariante) cambios.push(`${c.nombre}: ${c.porVariante ? 'ahora depende del modelo' : 'ya no depende del modelo'}`);
    }
    if (c.porVariante) VARIANTES.forEach((v) => comparar(`${c.nombre} (${etiquetaVariante(v)})`, a?.porVariante ? a.referenciasPorVariante?.[v] : [], c.referenciasPorVariante[v]));
    else comparar(c.nombre, a && !a.porVariante ? a.referencias : [], c.referencias);
  });
  ca.forEach((a, id) => { if (!cb.has(id)) cambios.push(`Componente quitado: ${a.nombre}`); });
  const ma = new Map((antes?.modelos || []).map((m) => [m.referencia, m]));
  const mb = new Map((despues?.modelos || []).map((m) => [m.referencia, m]));
  mb.forEach((m, r) => {
    const a = ma.get(r);
    if (!a) { cambios.push(`Modelo agregado: ${r} (${m.nombre}, ${etiquetaVariante(claveVariante(m.genero, m.vaina))})`); return; }
    if (a.nombre !== m.nombre) cambios.push(`Modelo ${r}: nombre ${a.nombre} → ${m.nombre}`);
    if (a.genero !== m.genero || a.vaina !== m.vaina) cambios.push(`Modelo ${r}: ${etiquetaVariante(claveVariante(a.genero, a.vaina))} → ${etiquetaVariante(claveVariante(m.genero, m.vaina))}`);
    if ((a.activo !== false) !== m.activo) cambios.push(`Modelo ${r}: ${m.activo ? 'activado' : 'desactivado'}`);
  });
  ma.forEach((a, r) => { if (!mb.has(r)) cambios.push(`Modelo quitado: ${r}`); });
  return cambios;
};
