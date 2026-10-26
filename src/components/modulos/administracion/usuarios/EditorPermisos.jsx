import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X, Layers, ShieldCheck } from 'lucide-react';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { COMPONENT_MAPS } from '../../../../config/componentMaps.jsx';
import { subItemsAsignables } from '../../../../config/accesoMenu';
import PanelPermisosVista from './PanelPermisosVista';
import MarcaOrigen from './MarcaOrigen';
import { claveMenu, claveVista, claveSeccion, claveElemento } from './permisosCentroCosto';
import CuadritoIcono from '../../../ui/CuadritoIcono';
import {
  alternarModuloCompleto,
  alternarVistaDelMenu,
  alternarPestana,
  alternarSeccion,
  alternarElemento,
  establecerElementos,
  establecerTodaLaVistaEn,
  contarPermisosModulo,
  contarPermisosVista,
  moduloCoincideBusqueda,
  vistaCoincideBusqueda,
} from './permisosGranularesUtils';

// Editor de permisos en dos columnas, compartido por Crear Usuario y Editar
// usuario (Listado Usuario):
//   izquierda: buscador + módulos con contador "marcados/total permisos"
//   derecha:   el módulo elegido; cada vista del menú es un acordeón con su
//              casilla, sus secciones/acciones/columnas y sus pestañas.
// Solo presenta: los cambios se calculan con las funciones puras de
// permisosGranularesUtils.js y se informan con onCambiar(nuevoEstado, info),
// donde info = { quitadas: [rutas], agregadas: [rutas] } para que cada
// formulario actualice su estado propio (revisado / pendiente de revisión).
//
// Props opcionales por vista: insigniaVista(path) y pieVista(path) (ej. el
// botón "Marcar como revisada" del asistente de creación), y onAbrirVista(path).
// `origen(clave)` (opcional, usuarios con centro de costo): estado de cada
// casilla respecto de la plantilla ('heredado' | 'agregado' | 'quitado'),
// con las claves de functions/permisos/nucleo.mjs.

// Sin los ítems "solo administradores" (no se asignan por permisos).
const MODULOS = Object.entries(MODULES)
  .map(([k, m]) => [k, { ...m, subItems: subItemsAsignables(m) }])
  .filter(([, m]) => m.subItems.length);

const Contador = ({ marcados, total, className = '' }) => {
  const completo = marcados === total;
  const ninguno = marcados === 0;
  return (
    <span
      className={`inline-flex items-center text-[10.5px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
        completo
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          : ninguno
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
      } ${className}`}
    >
      {marcados}/{total}
    </span>
  );
};

const EditorPermisos = ({ estado, onCambiar, insigniaVista, pieVista, onAbrirVista, accesoTotalPorRol = false, origen }) => {
  const [busqueda, setBusqueda] = useState('');
  const [moduloSel, setModuloSel] = useState(() => {
    const conPermisos = MODULOS.find(([k]) => (estado.permisos?.[k] || []).length > 0);
    return (conPermisos || MODULOS[0])[0];
  });
  const [abiertas, setAbiertas] = useState(() => new Set());

  const modulosFiltrados = useMemo(
    () => MODULOS.filter(([, m]) => !busqueda.trim() || moduloCoincideBusqueda(m, COMPONENT_MAPS, busqueda)),
    [busqueda]
  );
  const moduloActivo = modulosFiltrados.find(([k]) => k === moduloSel) || modulosFiltrados[0];

  const alternarAbierta = (path) => {
    const abrir = !abiertas.has(path);
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (abrir) next.add(path);
      else next.delete(path);
      return next;
    });
    if (abrir) onAbrirVista?.(path);
  };

  const cambiarGranulares = (fn) => onCambiar({ ...estado, permisosGranulares: fn(estado.permisosGranulares) }, {});

  const handleModulo = (moduloKey, subItems) => {
    const r = alternarModuloCompleto(estado, moduloKey, subItems, COMPONENT_MAPS);
    onCambiar(r.estado, r.quitado ? { quitadas: r.rutas } : { agregadas: r.rutasAgregadas });
  };
  const handleVista = (moduloKey, path) => {
    const r = alternarVistaDelMenu(estado, moduloKey, path, COMPONENT_MAPS);
    onCambiar(r.estado, r.quitada ? { quitadas: r.rutas } : { agregadas: COMPONENT_MAPS[path] ? r.rutas : [] });
    if (!r.quitada) setAbiertas((prev) => new Set(prev).add(path));
  };
  const handlePestana = (path, config) => {
    const quitada = Boolean(estado.permisosGranulares[path]);
    onCambiar({ ...estado, permisosGranulares: alternarPestana(estado.permisosGranulares, path, config) },
      quitada ? { quitadas: [path] } : {});
  };

  const panel = (path, config) => (
    <PanelPermisosVista
      config={config}
      vistaPermisos={estado.permisosGranulares[path]}
      onAlternarSeccion={(sk) => cambiarGranulares((g) => alternarSeccion(g, path, sk))}
      onAlternarElemento={(sk, el) => cambiarGranulares((g) => alternarElemento(g, path, sk, el))}
      onEstablecerElementos={(sk, els, v) => cambiarGranulares((g) => establecerElementos(g, path, sk, els, v))}
      onMarcarTodo={(v) => cambiarGranulares((g) => establecerTodaLaVistaEn(g, path, config, v))}
      origen={origen && ((sk, el) => origen(el === undefined ? claveSeccion(path, sk) : claveElemento(path, sk, el)))}
    />
  );

  return (
    <div className="h-full min-h-0 grid grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
      {/* --- Columna izquierda: módulos --- */}
      <aside className="min-h-0 flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar módulo, vista o permiso…"
              aria-label="Buscar permisos"
              className="w-full h-8 pl-8 pr-7 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-[12px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2] focus:bg-white dark:focus:bg-gray-900"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5" aria-label="Módulos">
          {modulosFiltrados.length === 0 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 px-2 py-6 text-center">Sin resultados para “{busqueda}”.</p>
          )}
          {modulosFiltrados.map(([key, modulo]) => {
            const c = contarPermisosModulo(key, modulo, estado, COMPONENT_MAPS);
            const activo = moduloActivo?.[0] === key;
            const vistas = (estado.permisos?.[key] || []).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setModuloSel(key)}
                aria-current={activo ? 'true' : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                  activo
                    ? 'bg-[#2383C2]/10 dark:bg-blue-950/40 ring-1 ring-inset ring-[#2383C2]/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <CuadritoIcono icon={modulo.icon} color={modulo.color} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[12px] truncate ${activo ? 'font-semibold text-[#2383C2] dark:text-blue-400' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                    {modulo.label}
                  </span>
                  <span className="block text-[10.5px] text-gray-400 dark:text-gray-500">
                    {vistas}/{modulo.subItems.length} vistas
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <Contador marcados={c.marcados} total={c.total} />
                  <span className="block text-[9.5px] text-gray-400 dark:text-gray-500 mt-0.5">permisos</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* --- Columna derecha: contenido del módulo --- */}
      <section className="min-h-0 overflow-y-auto pr-1">
        {accesoTotalPorRol && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11.5px] text-blue-800 dark:text-blue-300">
            <ShieldCheck size={15} className="shrink-0" />
            Este rol tiene acceso total al sistema: los permisos de abajo solo se aplican si se le asigna otro rol.
          </div>
        )}
        {moduloActivo && (() => {
          const [moduloKey, modulo] = moduloActivo;
          const seleccionadas = estado.permisos?.[moduloKey] || [];
          const completo = seleccionadas.length === modulo.subItems.length;
          const c = contarPermisosModulo(moduloKey, modulo, estado, COMPONENT_MAPS);
          const vistas = modulo.subItems.filter((sub) => vistaCoincideBusqueda(sub, COMPONENT_MAPS, busqueda));
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                <CuadritoIcono icon={modulo.icon} color={modulo.color} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">{modulo.label}</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {seleccionadas.length} de {modulo.subItems.length} vistas habilitadas · {c.marcados} de {c.total} permisos
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[11.5px] font-medium text-gray-700 dark:text-gray-200 cursor-pointer select-none">
                  <input type="checkbox" checked={completo} onChange={() => handleModulo(moduloKey, modulo.subItems)} className="accent-[#2383C2]" />
                  Habilitar todo el módulo
                </label>
              </div>

              {vistas.length === 0 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-6">Ninguna vista de este módulo coincide con la búsqueda.</p>
              )}

              {vistas.map((sub) => {
                const path = sub.path;
                const config = COMPONENT_MAPS[path];
                const incluida = seleccionadas.includes(path);
                const abierta = incluida && abiertas.has(path);
                const cv = contarPermisosVista(path, incluida, estado.permisosGranulares, COMPONENT_MAPS);
                const procesos = Object.entries(config?.procesos || {});
                const configurable = Boolean(config) && (Object.keys(config.sections || {}).length > 0 || procesos.length > 0);
                return (
                  <div key={path} className={`rounded-lg border bg-white dark:bg-gray-800 overflow-hidden ${incluida ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={incluida}
                        onChange={() => handleVista(moduloKey, path)}
                        aria-label={`Habilitar ${sub.label}`}
                        className="accent-[#2383C2] shrink-0"
                      />
                      <button
                        type="button"
                        disabled={!incluida || !configurable}
                        onClick={() => alternarAbierta(path)}
                        aria-expanded={abierta}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default group"
                      >
                        <CuadritoIcono icon={sub.icon} color={sub.color} tamano="sm" className={incluida ? '' : 'grayscale opacity-50'} />
                        <span className={`text-[12.5px] truncate ${incluida ? 'font-semibold text-gray-800 dark:text-gray-100 group-enabled:group-hover:text-[#2383C2]' : 'text-gray-400 dark:text-gray-500'}`}>
                          {sub.label}
                        </span>
                        {procesos.length > 0 && incluida && (
                          <span className="text-[10.5px] text-gray-400 dark:text-gray-500 shrink-0">
                            {procesos.filter(([p]) => estado.permisosGranulares[p]).length}/{procesos.length} pestañas
                          </span>
                        )}
                      </button>
                      <MarcaOrigen origen={origen?.(claveMenu(moduloKey, path))} />
                      {incluida && insigniaVista?.(path)}
                      {configurable && <Contador marcados={cv.marcados} total={cv.total} />}
                      {!configurable && <span className="text-[10.5px] text-gray-400 dark:text-gray-500">Sin opciones adicionales</span>}
                      {incluida && configurable && (
                        <button type="button" onClick={() => alternarAbierta(path)} aria-label={abierta ? 'Contraer' : 'Expandir'} className="text-gray-400 hover:text-[#2383C2]">
                          {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      )}
                    </div>

                    {abierta && (
                      <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 px-4 py-3 flex flex-col gap-3">
                        {Object.keys(config.sections || {}).length > 0 && panel(path, config)}

                        {procesos.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                              <Layers size={12} /> Pestañas
                            </span>
                            {procesos.map(([pPath, pConfig]) => {
                              const pIncluida = Boolean(estado.permisosGranulares[pPath]);
                              const pAbierta = pIncluida && abiertas.has(pPath);
                              const pTieneSecciones = Object.keys(pConfig.sections || {}).length > 0;
                              return (
                                <div key={pPath} className={`rounded-lg border bg-white dark:bg-gray-800 ${pIncluida ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-200 dark:border-gray-700'}`}>
                                  <div className="flex items-center gap-3 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={pIncluida}
                                      onChange={() => handlePestana(pPath, pConfig)}
                                      aria-label={`Habilitar ${pConfig.label}`}
                                      className="accent-[#2383C2] shrink-0"
                                    />
                                    <button
                                      type="button"
                                      disabled={!pIncluida || !pTieneSecciones}
                                      onClick={() => alternarAbierta(pPath)}
                                      aria-expanded={pAbierta}
                                      className={`flex-1 min-w-0 text-left text-[12px] truncate disabled:cursor-default ${pIncluida ? 'font-medium text-gray-700 dark:text-gray-200 hover:text-[#2383C2]' : 'text-gray-400 dark:text-gray-500'}`}
                                    >
                                      {pConfig.label.replace(/^Pestaña:\s*/, '')}
                                    </button>
                                    <MarcaOrigen origen={origen?.(claveVista(pPath))} />
                                    {pIncluida && insigniaVista?.(pPath)}
                                    {pTieneSecciones && pIncluida && (
                                      <button type="button" onClick={() => alternarAbierta(pPath)} aria-label={pAbierta ? 'Contraer' : 'Expandir'} className="text-gray-400 hover:text-[#2383C2]">
                                        {pAbierta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                      </button>
                                    )}
                                  </div>
                                  {pAbierta && (
                                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-3 flex flex-col gap-2">
                                      {panel(pPath, pConfig)}
                                      {pieVista?.(pPath)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {pieVista?.(path)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>
    </div>
  );
};

export default EditorPermisos;
