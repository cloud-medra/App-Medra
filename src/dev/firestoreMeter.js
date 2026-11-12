// =====================================================================
// MEDIDOR DE LECTURAS DE FIRESTORE — SOLO DESARROLLO
// =====================================================================
// Este módulo NUNCA llega a producción: el plugin `firestoreMeter` de
// vite.config.js (apply: 'serve') redirige los `import ... from
// 'firebase/firestore'` de src/ hacia acá únicamente en `npm run dev`.
// `vite build` no usa el plugin, así que el bundle final importa el SDK real.
//
// Re-exporta TODO el SDK y envuelve las funciones que facturan lecturas
// (getDocs, getDoc, onSnapshot, count/aggregate, transacciones) para
// registrar, por pantalla y por punto de llamada (archivo:línea), cuántos
// documentos se leyeron y si vinieron de caché (metadata.fromCache).
//
// Uso:
//   - Panel flotante (abajo a la derecha por defecto). Se minimiza con la
//     flecha a una pestaña "FS <lecturas>" (Ctrl/Cmd + clic la expande; un
//     clic o arrastre normal solo la mueve) y se arrastra
//     desde la barra superior o desde la pestaña. Posición y estado quedan
//     en localStorage (__fs_meter_ui__).
//   - Consola: __FS_METER__.report()  |  __FS_METER__.reset()  |  await __FS_METER__.tamanos()
//     await __FS_METER__.compararTotales(2026)  (count/sum del servidor vs. cliente)
//     await __FS_METER__.listarTotalesTexto(2026)  (simulación de la migración de `total`)
//     await __FS_METER__.migrarTotales(2026) / revertirMigracion()  (ver src/dev/migracionNumeros.js)
//   - Desactivar: VITE_FIRESTORE_METER=off en .env.local y reiniciar `npm run dev`.
//
// Estimación de facturación (aproximada, igual que la documentación de Firestore):
//   - getDocs / 1er snapshot de un listener: 1 lectura por documento (mín. 1 si viene vacío).
//   - Snapshots siguientes de un listener: 1 lectura por documento agregado/modificado.
//   - getDoc / snapshot de documento: 1 lectura.
//   - count/aggregate: 1 lectura por cada 1000 documentos contados (mín. 1).
//   - Resultados con metadata.fromCache = true: 0 lecturas (se muestran aparte).
// OJO: en dev, <StrictMode> monta los efectos dos veces, así que los getDocs
// que corren al montar aparecen duplicados respecto de producción.
// =====================================================================

import * as fs from 'firebase/firestore';

export * from 'firebase/firestore';

const STORAGE_KEY = '__fs_meter_ui__';
const STORAGE_KEY_ANTIGUA = '__fs_meter_min__'; // solo guardaba minimizado
const COLECCIONES_CLAVE = [
  'maestros_codigos', 'maestros_empresas', 'maestros_prestadores', 'maestros_centros',
  'maestros_previsiones', 'maestros_convenios', 'maestros_recargos', 'maestros_pad',
  'laboratorio_codigos', 'vacunatorio_codigos', 'usuarios', 'administracion_notas', 'cierres_periodos'
];
const GRUPOS_CLAVE = [
  ['detalles', 'implantes_gestiones'], ['detalles', 'hemodinamia_gestiones'], ['detalles', 'consignacion_registros'],
  ['documentos', 'implantes_imputadas'], ['documentos', 'hemodinamia_imputadas'], ['documentos', 'consignacion_imputadas'],
  ['documentos', 'laboratorio_imputadas'], ['documentos', 'vacunatorio_imputadas']
];
const inicio = Date.now();
const porConsulta = new Map(); // clave -> stats
let pantallaActual = 'inicio';
let listenersActivos = 0;
let totalLecturas = 0;
let totalCache = 0;
let lecturasEnSegundoPlano = 0;

// ---------- Utilidades de descripción ----------

const origenLlamada = () => {
  const stack = new Error().stack || '';
  const lineas = stack.split('\n');
  for (const l of lineas) {
    if (l.includes('/src/') && !l.includes('/src/dev/firestoreMeter')) {
      const m = l.match(/\/(src\/[^?:)\s]+)(?:\?[^:)\s]*)?:(\d+)/);
      if (m) return `${m[1]}:${m[2]}`;
    }
  }
  return '(desconocido)';
};

const describirConsulta = (ref) => {
  try {
    if (!ref) return '?';
    if (ref.type === 'document') return `doc ${ref.path}`;
    if (ref.type === 'collection') return `col ${ref.path}`;
    const iq = ref._query;
    if (!iq) return String(ref.type || 'query');
    const base = iq.collectionGroup
      ? `cg ${iq.collectionGroup}`
      : `col ${iq.path?.canonicalString?.() ?? '?'}`;
    const filtros = (iq.filters || [])
      .map((f) => (f.field ? `${f.field.canonicalString()} ${f.op}` : 'compuesto'))
      .join(', ');
    const orden = (iq.explicitOrderBy || [])
      .map((o) => `${o.field.canonicalString()} ${o.dir}`)
      .join(', ');
    const partes = [base];
    if (filtros) partes.push(`where[${filtros}]`);
    if (orden) partes.push(`orderBy[${orden}]`);
    if (iq.limit != null) partes.push(`limit ${iq.limit}`);
    return partes.join(' ');
  } catch {
    return 'query';
  }
};

const obtenerStats = (tipo, ref, origen) => {
  const desc = describirConsulta(ref);
  const clave = `${pantallaActual}|${tipo}|${origen}|${desc}`;
  let s = porConsulta.get(clave);
  if (!s) {
    s = { pantalla: pantallaActual, tipo, origen, consulta: desc, llamadas: 0, snapshots: 0, lecturas: 0, deCache: 0, docsMax: 0 };
    porConsulta.set(clave, s);
  }
  return s;
};

const sumar = (s, lecturas, deCache) => {
  s.lecturas += lecturas;
  s.deCache += deCache;
  totalLecturas += lecturas;
  totalCache += deCache;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    lecturasEnSegundoPlano += lecturas;
  }
  programarRender();
};

const registrarQuerySnapshot = (s, snap, esPrimero) => {
  s.snapshots += 1;
  s.docsMax = Math.max(s.docsMax, snap.size);
  if (snap.metadata?.fromCache) {
    sumar(s, 0, snap.size);
    return;
  }
  let lecturas;
  if (esPrimero) {
    lecturas = Math.max(1, snap.size);
  } else {
    lecturas = snap.docChanges().filter((c) => c.type !== 'removed').length;
  }
  sumar(s, lecturas, 0);
};

const registrarDocSnapshot = (s, snap) => {
  s.snapshots += 1;
  s.docsMax = Math.max(s.docsMax, 1);
  if (snap.metadata?.fromCache) sumar(s, 0, 1);
  else sumar(s, 1, 0);
};

// ---------- Envoltorios ----------

export const getDocs = async (q) => {
  const s = obtenerStats('getDocs', q, origenLlamada());
  s.llamadas += 1;
  const snap = await fs.getDocs(q);
  registrarQuerySnapshot(s, snap, true);
  return snap;
};

export const getDocsFromServer = async (q) => {
  const s = obtenerStats('getDocsFromServer', q, origenLlamada());
  s.llamadas += 1;
  const snap = await fs.getDocsFromServer(q);
  registrarQuerySnapshot(s, snap, true);
  return snap;
};

export const getDoc = async (ref) => {
  const s = obtenerStats('getDoc', ref, origenLlamada());
  s.llamadas += 1;
  const snap = await fs.getDoc(ref);
  registrarDocSnapshot(s, snap);
  return snap;
};

export const getDocFromServer = async (ref) => {
  const s = obtenerStats('getDocFromServer', ref, origenLlamada());
  s.llamadas += 1;
  const snap = await fs.getDocFromServer(ref);
  registrarDocSnapshot(s, snap);
  return snap;
};

const registrarAgregado = (s, res) => {
  s.snapshots += 1;
  let n = 0;
  try {
    const data = res.data();
    n = typeof data.count === 'number' ? data.count : 0;
  } catch { /* sin count */ }
  sumar(s, Math.max(1, Math.ceil(n / 1000)), 0);
};

export const getCountFromServer = async (q) => {
  const s = obtenerStats('count', q, origenLlamada());
  s.llamadas += 1;
  const res = await fs.getCountFromServer(q);
  registrarAgregado(s, res);
  return res;
};

export const getAggregateFromServer = async (q, spec) => {
  const s = obtenerStats('aggregate', q, origenLlamada());
  s.llamadas += 1;
  const res = await fs.getAggregateFromServer(q, spec);
  registrarAgregado(s, res);
  return res;
};

// onSnapshot(ref, [options], onNext | observer, [onError], [onCompletion])
export const onSnapshot = (ref, ...args) => {
  const s = obtenerStats('onSnapshot', ref, origenLlamada());
  s.llamadas += 1;
  const esDoc = ref?.type === 'document';
  let primero = true;
  const observar = (snap) => {
    if (esDoc) registrarDocSnapshot(s, snap);
    else registrarQuerySnapshot(s, snap, primero);
    primero = false;
  };

  const nuevosArgs = [...args];
  const idx = nuevosArgs.findIndex((a) => typeof a === 'function' || (a && typeof a === 'object' && typeof a.next === 'function'));
  if (idx >= 0) {
    const original = nuevosArgs[idx];
    if (typeof original === 'function') {
      nuevosArgs[idx] = (snap) => { observar(snap); return original(snap); };
    } else {
      nuevosArgs[idx] = { ...original, next: (snap) => { observar(snap); return original.next(snap); } };
    }
  }

  listenersActivos += 1;
  programarRender();
  const unsub = fs.onSnapshot(ref, ...nuevosArgs);
  let cerrado = false;
  return () => {
    if (!cerrado) {
      cerrado = true;
      listenersActivos -= 1;
      programarRender();
    }
    return unsub();
  };
};

export const runTransaction = (db, fn, options) => {
  const origen = origenLlamada();
  return fs.runTransaction(db, (tx) => {
    const getOriginal = tx.get.bind(tx);
    tx.get = async (ref) => {
      const s = obtenerStats('tx.get', ref, origen);
      s.llamadas += 1;
      const snap = await getOriginal(ref);
      registrarDocSnapshot(s, snap);
      return snap;
    };
    return fn(tx);
  }, options);
};

// ---------- API de consola ----------

const filasOrdenadas = () => [...porConsulta.values()].sort((a, b) => b.lecturas - a.lecturas);

const porPantalla = () => {
  const m = new Map();
  for (const s of porConsulta.values()) {
    const p = m.get(s.pantalla) || { pantalla: s.pantalla, lecturas: 0, deCache: 0, consultas: 0 };
    p.lecturas += s.lecturas;
    p.deCache += s.deCache;
    p.consultas += 1;
    m.set(s.pantalla, p);
  }
  return [...m.values()].sort((a, b) => b.lecturas - a.lecturas);
};

const horasTranscurridas = () => Math.max((Date.now() - inicio) / 3_600_000, 1 / 3600);

const api = {
  setScreen(nombre) {
    if ((nombre || 'inicio') === pantallaActual) return;
    pantallaActual = nombre || 'inicio';
    programarRender();
  },
  report() {
    console.group(`%c[Firestore] ${totalLecturas} lecturas · ${totalCache} desde caché · ${listenersActivos} listeners activos`, 'font-weight:bold');
    console.table(porPantalla());
    console.table(filasOrdenadas().slice(0, 40));
    console.groupEnd();
  },
  reset() {
    porConsulta.clear();
    totalLecturas = 0;
    totalCache = 0;
    lecturasEnSegundoPlano = 0;
    programarRender();
  },
  // Tamaño real de las colecciones que más pesan en el diagnóstico, con
  // count() (≈1 lectura por cada 1000 docs). Uso: await __FS_METER__.tamanos()
  async tamanos(colecciones = COLECCIONES_CLAVE, grupos = GRUPOS_CLAVE) {
    const { db } = await import('../firebaseConfig.js');
    const filas = [];
    const contar = async (etiqueta, q) => {
      try { filas.push({ coleccion: etiqueta, docs: (await fs.getCountFromServer(q)).data().count }); }
      catch (e) { filas.push({ coleccion: etiqueta, docs: `error: ${e.code || e.message}` }); }
    };
    await Promise.all([
      ...colecciones.map((c) => contar(c, fs.collection(db, c))),
      ...grupos.map(([grupo, raiz]) => contar(`${raiz}/**/${grupo}`, fs.query(
        fs.collectionGroup(db, grupo),
        fs.where(fs.documentId(), '>=', `${raiz}/0000`),
        fs.where(fs.documentId(), '<', `${raiz}/9999`)
      )))
    ]);
    console.table(filas);
    return filas;
  },
  // Verificación previa al cambio de ControlMensual a getAggregateFromServer:
  // compara, por módulo y mes, count()/sum('total') del servidor contra el
  // conteo/suma en el cliente con Number(total) (lo que hace hoy la
  // pantalla), y cuenta los documentos cuyo `total` no es numérico (sum()
  // los ignora). Lee todas las imputadas del año (≈ tamaño de la colección).
  // Uso: await __FS_METER__.compararTotales(2026)
  async compararTotales(anio = new Date().getFullYear(), modulos = ['laboratorio', 'implantes', 'consignacion', 'vacunatorio', 'hemodinamia']) {
    const { db } = await import('../firebaseConfig.js');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const filas = [];
    for (const modulo of modulos) {
      for (const mes of meses) {
        const ref = fs.collection(db, `${modulo}_imputadas`, String(anio), 'meses', mes, 'documentos');
        const snap = await fs.getDocs(ref);
        if (snap.empty) continue;
        let sumaCliente = 0;
        let noNumericos = 0;
        let comoString = 0;
        snap.docs.forEach((d) => {
          const t = d.data().total;
          sumaCliente += Number(t || 0);
          if (typeof t !== 'number') noNumericos += 1;
          if (typeof t === 'string') comoString += 1;
        });
        const agg = (await fs.getAggregateFromServer(ref, { cantidad: fs.count(), suma: fs.sum('total') })).data();
        filas.push({
          modulo, mes,
          cantidadCliente: snap.size, cantidadServidor: agg.cantidad,
          sumaCliente, sumaServidor: agg.suma,
          diferencia: sumaCliente - agg.suma,
          totalNoNumerico: noNumericos, totalComoString: comoString,
          coincide: snap.size === agg.cantidad && Math.abs(sumaCliente - agg.suma) < 0.5
        });
      }
    }
    console.table(filas);
    const conString = filas.reduce((a, f) => a + f.totalComoString, 0);
    console.log(`[compararTotales ${anio}] ${filas.filter((f) => !f.coincide).length} mes(es) con diferencias · ${conString} documento(s) con total como string`);
    return filas;
  },
  // Simulación (solo lectura) de functions/scripts/convertirTotalesImputadas.js:
  // lista ruta, valor actual y valor convertido de cada `total` no numérico
  // en *_imputadas, con el mismo criterio de conversión segura.
  // Uso: await __FS_METER__.listarTotalesTexto(2026)
  async listarTotalesTexto(anio = new Date().getFullYear(), modulos = ['laboratorio', 'vacunatorio']) {
    const { db } = await import('../firebaseConfig.js');
    const { convertirNumeroSeguro } = await import('../components/modulos/gestiones/shared/numerosDocumento.js');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const filas = [];
    for (const modulo of modulos) {
      for (const mes of meses) {
        const snap = await fs.getDocs(fs.collection(db, `${modulo}_imputadas`, String(anio), 'meses', mes, 'documentos'));
        snap.docs.forEach((d) => {
          const total = d.data().total;
          if (typeof total === 'number') return;
          const { valor, seguro } = convertirNumeroSeguro(total);
          filas.push({ ruta: d.ref.path, actual: JSON.stringify(total), convertido: seguro ? valor : '-', seguro });
        });
      }
    }
    console.table(filas);
    console.log(`[listarTotalesTexto ${anio}] ${filas.length} documento(s) · ${filas.filter((f) => !f.seguro).length} NO seguro(s)`);
    return filas;
  },
  // Migración de números guardados como texto (ver src/dev/migracionNumeros.js).
  async migrarTotales(anio, opciones) {
    return (await import('./migracionNumeros.js')).migrarTotales(anio, opciones);
  },
  async revertirMigracion(respaldo) {
    return (await import('./migracionNumeros.js')).revertirMigracion(respaldo);
  },
  export() {
    return { totalLecturas, totalCache, listenersActivos, lecturasEnSegundoPlano, porPantalla: porPantalla(), porConsulta: filasOrdenadas() };
  },
  get total() { return totalLecturas; }
};

if (typeof window !== 'undefined') window.__FS_METER__ = api;

// ---------- Panel flotante (DOM plano, sin React) ----------
// La posición se guarda respecto de la esquina de la ventana más cercana
// (h: left|right, v: top|bottom, dx/dy: distancia a ese borde). Así la
// pestaña y el panel expandido comparten esquina: minimizado abajo a la
// derecha, se expande hacia arriba y a la izquierda sin salirse.

const UMBRAL_ARRASTRE = 4; // px: por debajo es un clic, no un arrastre

let panel = null;
let renderPendiente = false;
let ui = { minimizado: false, h: 'right', dx: 8, v: 'bottom', dy: 8 };
try {
  const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (guardado && typeof guardado === 'object') {
    ui = {
      minimizado: guardado.minimizado === true,
      h: guardado.h === 'left' ? 'left' : 'right',
      v: guardado.v === 'top' ? 'top' : 'bottom',
      dx: Number.isFinite(guardado.dx) ? Math.max(0, guardado.dx) : 8,
      dy: Number.isFinite(guardado.dy) ? Math.max(0, guardado.dy) : 8,
    };
  } else {
    ui.minimizado = localStorage.getItem(STORAGE_KEY_ANTIGUA) === '1';
  }
} catch { /* sin storage o JSON inválido: valores por defecto */ }

const guardarUi = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ui)); } catch { /* sin storage */ }
};

let arrastre = null; // { id, x0, y0, left0, top0, moviendo }
let suprimirClick = false;
let renderDiferido = false; // llegaron lecturas mientras se presionaba el panel

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const tamanoVentana = () => ({
  vw: document.documentElement.clientWidth || window.innerWidth,
  vh: document.documentElement.clientHeight || window.innerHeight,
});

const limitar = (valor, maximo) => Math.min(Math.max(0, valor), Math.max(0, maximo));

// Ubica el panel según `ui`, siempre dentro de la ventana (no modifica `ui`:
// si la ventana se achica y vuelve a crecer, recupera su lugar).
function aplicarPosicion() {
  if (!panel || arrastre?.moviendo) return;
  const { vw, vh } = tamanoVentana();
  const dx = limitar(ui.dx, vw - panel.offsetWidth);
  const dy = limitar(ui.dy, vh - panel.offsetHeight);
  panel.style.left = ui.h === 'left' ? `${dx}px` : 'auto';
  panel.style.right = ui.h === 'right' ? `${dx}px` : 'auto';
  panel.style.top = ui.v === 'top' ? `${dy}px` : 'auto';
  panel.style.bottom = ui.v === 'bottom' ? `${dy}px` : 'auto';
}

function alternarMinimizado() {
  ui.minimizado = !ui.minimizado;
  guardarUi();
  render();
}

function iniciarArrastre(e) {
  if (e.button !== 0) return;
  const asa = e.target.closest?.('[data-asa]');
  if (!asa) return;
  // En el panel expandido los botones de la barra no arrastran.
  if (!ui.minimizado && e.target.closest('button')) return;
  const r = panel.getBoundingClientRect();
  arrastre = { id: e.pointerId, x0: e.clientX, y0: e.clientY, left0: r.left, top0: r.top, moviendo: false };
  panel.setPointerCapture?.(e.pointerId);
  e.preventDefault(); // evita seleccionar texto
}

function moverArrastre(e) {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const ddx = e.clientX - arrastre.x0;
  const ddy = e.clientY - arrastre.y0;
  if (!arrastre.moviendo) {
    if (Math.hypot(ddx, ddy) < UMBRAL_ARRASTRE) return;
    arrastre.moviendo = true;
    panel.style.cursor = 'grabbing';
  }
  const { vw, vh } = tamanoVentana();
  panel.style.left = `${limitar(arrastre.left0 + ddx, vw - panel.offsetWidth)}px`;
  panel.style.top = `${limitar(arrastre.top0 + ddy, vh - panel.offsetHeight)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function terminarArrastre(e) {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const { moviendo } = arrastre;
  arrastre = null;
  panel.releasePointerCapture?.(e.pointerId);
  panel.style.cursor = '';
  if (!moviendo) {
    // Clic sin arrastre. La pestaña minimizada se expande solo con Ctrl
    // (Cmd en Mac) para no abrirla por accidente al reubicarla. Se resuelve
    // acá y no en 'click': con setPointerCapture el click llega al panel,
    // no a la pestaña.
    if (ui.minimizado && (e.ctrlKey || e.metaKey)) {
      renderDiferido = false;
      alternarMinimizado();
      return;
    }
    // Los botones del panel expandido los maneja el listener de click; si
    // no, se aplica el render que quedó pendiente.
    if (renderDiferido) setTimeout(programarRender, 0);
    renderDiferido = false;
    return;
  }
  // El click que sigue a un arrastre no debe expandir/minimizar.
  suprimirClick = true;
  setTimeout(() => { suprimirClick = false; }, 0);
  const r = panel.getBoundingClientRect();
  const { vw, vh } = tamanoVentana();
  const izquierda = r.left + r.width / 2 < vw / 2;
  const arriba = r.top + r.height / 2 < vh / 2;
  ui.h = izquierda ? 'left' : 'right';
  ui.dx = Math.round(izquierda ? r.left : vw - r.right);
  ui.v = arriba ? 'top' : 'bottom';
  ui.dy = Math.round(arriba ? r.top : vh - r.bottom);
  guardarUi();
  renderDiferido = false;
  render();
}

function programarRender() {
  if (renderPendiente || typeof window === 'undefined') return;
  renderPendiente = true;
  requestAnimationFrame(() => { renderPendiente = false; render(); });
}

function crearPanel() {
  panel = document.createElement('div');
  panel.id = 'fs-meter';
  panel.addEventListener('click', (e) => {
    if (suprimirClick) { suprimirClick = false; return; }
    const accion = e.target.closest?.('[data-accion]')?.dataset.accion;
    if (accion === 'toggle') alternarMinimizado();
    else if (accion === 'reset') api.reset();
    else if (accion === 'report') api.report();
  });
  // En Mac, Ctrl + clic abre el menú contextual: se evita sobre la pestaña.
  panel.addEventListener('contextmenu', (e) => { if (ui.minimizado) e.preventDefault(); });
  panel.addEventListener('pointerdown', iniciarArrastre);
  panel.addEventListener('pointermove', moverArrastre);
  panel.addEventListener('pointerup', terminarArrastre);
  panel.addEventListener('pointercancel', terminarArrastre);
  window.addEventListener('resize', aplicarPosicion);
  document.body.appendChild(panel);
}

const ESTILO_BASE = 'position:fixed;z-index:2147483647;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(17,24,39,.94);color:#e5e7eb;border:1px solid #374151;box-shadow:0 4px 16px rgba(0,0,0,.35);touch-action:none;';

function render() {
  if (!document.body) return;
  if (!panel) crearPanel();
  // Reemplazar el contenido durante un clic o arrastre rompería el gesto
  // (y cssText borraría la posición en curso): se renderiza al soltar.
  if (arrastre) { renderDiferido = true; return; }

  if (ui.minimizado) {
    panel.style.cssText = `${ESTILO_BASE}border-radius:6px;max-width:none;`;
    panel.innerHTML = `<div data-asa title="Ctrl + clic para expandir" style="padding:3px 7px;cursor:grab;user-select:none;white-space:nowrap"><b style="color:#fbbf24">FS</b> ${totalLecturas}</div>`;
    aplicarPosicion();
    return;
  }

  panel.style.cssText = `${ESTILO_BASE}border-radius:8px;max-width:min(560px,calc(100vw - 16px));`;
  const porHora = Math.round(totalLecturas / horasTranscurridas());
  const cabecera = `<div data-asa title="Arrastrar para mover" style="display:flex;gap:8px;align-items:center;padding:6px 8px;cursor:move;user-select:none">
    <b style="color:#fbbf24">FS</b>
    <span>${totalLecturas} lect.</span>
    <span style="color:#9ca3af">${totalCache} caché</span>
    <span style="color:#9ca3af">${listenersActivos} listeners</span>
    <span style="color:#9ca3af">~${porHora}/h</span>
    <span style="flex:1"></span>
    <button data-accion="report" style="all:unset;cursor:pointer;color:#93c5fd">consola</button><button data-accion="reset" style="all:unset;cursor:pointer;color:#fca5a5">reset</button>
    <button data-accion="toggle" title="Minimizar" style="all:unset;cursor:pointer;color:#d1d5db">▼</button>
  </div>`;

  const pantallas = porPantalla().slice(0, 8).map((p) =>
    `<tr><td style="padding:1px 6px 1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px">${esc(p.pantalla)}</td><td style="text-align:right;padding-right:6px">${p.lecturas}</td><td style="text-align:right;color:#9ca3af">${p.deCache}</td></tr>`
  ).join('');
  const consultas = filasOrdenadas().slice(0, 10).map((s) =>
    `<tr title="${esc(s.consulta)}"><td style="text-align:right;padding-right:6px;color:#fbbf24">${s.lecturas}</td><td style="padding-right:6px;color:#9ca3af">${esc(s.tipo)}</td><td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px">${esc(s.origen.replace(/^src\/components\/modulos\//, ''))}<br><span style="color:#6b7280">${esc(s.consulta)}</span></td></tr>`
  ).join('');

  panel.innerHTML = `${cabecera}
    <div style="padding:0 8px 8px;max-height:50vh;overflow:auto">
      <div style="color:#9ca3af;margin:2px 0">Pantalla actual: <span style="color:#e5e7eb">${esc(pantallaActual)}</span>${lecturasEnSegundoPlano ? ` · <span style="color:#fca5a5">${lecturasEnSegundoPlano} lect. con pestaña oculta</span>` : ''}</div>
      <table style="border-collapse:collapse;width:100%;margin-bottom:6px"><tr style="color:#6b7280"><td>Pantalla</td><td style="text-align:right;padding-right:6px">lect.</td><td style="text-align:right">caché</td></tr>${pantallas}</table>
      <table style="border-collapse:collapse;width:100%"><tr style="color:#6b7280"><td style="text-align:right;padding-right:6px">lect.</td><td>tipo</td><td>origen / consulta</td></tr>${consultas}</table>
    </div>`;
  aplicarPosicion();
}
