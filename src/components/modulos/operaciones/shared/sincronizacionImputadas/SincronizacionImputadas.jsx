import React, { createContext, useContext, useState } from 'react';
import {
  GitCompareArrows,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import { useSincronizacionImputadasData } from './useSincronizacionImputadasData';
import { moduloGestion } from '../modulosGestion';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useModal } from '../../../../../context/ModalContext';
import { ordenarPeriodos } from '../../../../../utils/ordenarMeses';

// Configuración del módulo (Implantes o Hemodinamia, ver modulosGestion.js)
// para los textos de las tarjetas.
const ModuloContext = createContext(null);

const formatearValor = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'number') return valor.toLocaleString('es-CL');
  return String(valor);
};

const EstadoBloqueBadge = ({ bloque }) => {
  if (bloque.sinItems) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400">
        Sin ítems
      </span>
    );
  }
  if (bloque.gruposPeriodo.some(g => g.sinPeriodoResoluble)) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center gap-1 w-fit">
        <ShieldAlert size={10} /> Período desconocido
      </span>
    );
  }
  if (bloque.sinDiferencias) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center gap-1 w-fit">
        <CheckCircle2 size={10} /> Sin diferencias / ya sincronizado
      </span>
    );
  }
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 flex items-center gap-1 w-fit">
      <XCircle size={10} /> Con diferencias
    </span>
  );
};

const TablaDiffItem = ({ comparado }) => {
  const config = useContext(ModuloContext);
  const campos = comparado.estado === 'FALTA_EN_IMPUTADAS'
    ? comparado.campos
    : comparado.campos.filter(c => c.difiere);

  return (
    <div className="border border-slate-200 dark:border-gray-700 rounded overflow-hidden">
      <div className={`px-2 py-1 text-[9px] font-semibold flex items-center justify-between ${
        comparado.estado === 'FALTA_EN_IMPUTADAS'
          ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
          : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
      }`}>
        <span className="truncate">
          Ítem: {comparado.itemGestion?.referencia || comparado.itemId || 'S/REF'}
          {comparado.itemGestion?.esPad && <span className="ml-1 px-1 rounded bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400">PAD</span>}
        </span>
        <span>{comparado.estado === 'FALTA_EN_IMPUTADAS' ? `No existe en ${config.coleccionImputadas}` : `${campos.length} campo(s) distinto(s)`}</span>
      </div>
      <table className="w-full text-left text-[10px] border-collapse">
        <thead className="bg-slate-50 dark:bg-gray-800/60">
          <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
            <th className="px-2 py-1 border-b border-slate-200 dark:border-gray-700">Campo</th>
            <th className="px-2 py-1 border-b border-slate-200 dark:border-gray-700">Gestiones (correcto)</th>
            <th className="px-2 py-1 border-b border-slate-200 dark:border-gray-700">Imputadas (actual)</th>
          </tr>
        </thead>
        <tbody>
          {campos.map(c => (
            <tr key={c.campo} className="bg-white dark:bg-gray-900/40">
              <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-800 font-semibold text-slate-600 dark:text-gray-300">{c.label}</td>
              <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-800 text-emerald-700 dark:text-emerald-400 font-medium">{formatearValor(c.valorGestion)}</td>
              <td className="px-2 py-1 border-b border-slate-100 dark:border-gray-800 text-red-600 dark:text-red-400 font-medium">{formatearValor(c.valorImputada)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const BloqueDiff = ({ admision, bloque, onAplicar, aplicando, puedeAplicar }) => {
  const config = useContext(ModuloContext);
  const itemsConDiferencia = bloque.gruposPeriodo?.flatMap(g => g.itemsComparados.filter(c => c.estado !== 'IGUAL')) || [];
  const sobrantes = bloque.gruposPeriodo?.flatMap(g => g.itemsSobrantesEnImputadas.map(it => ({ ...it, anio: g.anio, mes: g.mes }))) || [];
  const bloqueado = bloque.sinItems || bloque.gruposPeriodo?.some(g => g.sinPeriodoResoluble);
  const hayDiferencias = !bloque.sinDiferencias && !bloque.sinItems;
  const periodos = [...new Set(ordenarPeriodos((bloque.gruposPeriodo || []).filter(g => !g.sinPeriodoResoluble)).map(g => `${g.mes} ${g.anio}`))];
  const algunPeriodoCerrado = (bloque.gruposPeriodo || []).some(g => !g.sinPeriodoResoluble && g.periodoAbierto === false);

  return (
    <div className="border border-slate-200 dark:border-gray-700 rounded-lg p-2.5 space-y-2 bg-white dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-bold text-slate-700 dark:text-gray-200">{bloque.empresa}</span>
          <span className="text-slate-300 dark:text-gray-600">/</span>
          <span className="text-slate-500 dark:text-gray-400">{bloque.fecha}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
            (bloque.solicitud || '').toUpperCase() === 'SOLICITADO'
              ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400'
              : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400'
          }`}>
            {bloque.solicitud || 'PENDIENTE'}
          </span>
          {periodos.length > 0 && (
            <span className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1">
              {algunPeriodoCerrado ? <Lock size={10} className="text-red-500" /> : <Unlock size={10} className="text-emerald-500" />}
              {periodos.join(', ')}
            </span>
          )}
        </div>
        <EstadoBloqueBadge bloque={bloque} />
      </div>

      {bloque.sinItems && (
        <p className="text-[10px] text-slate-400 dark:text-gray-500 italic">Este bloque no tiene ítems cargados.</p>
      )}

      {(bloque.gruposPeriodo || []).some(g => g.sinPeriodoResoluble) && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle size={11} /> Hay ítems sin período propio y no hay período abierto para {config.etiqueta} como referencia — no se pueden comparar ni corregir hasta resolver esto.
        </p>
      )}

      {algunPeriodoCerrado && (
        <p className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1">
          <Lock size={11} /> El período de este bloque ya está cerrado — no se puede aplicar ninguna corrección sin reabrirlo.
        </p>
      )}

      {itemsConDiferencia.length > 0 && (
        <div className="space-y-1.5">
          {itemsConDiferencia.map(comparado => (
            <TablaDiffItem key={comparado.itemId || comparado.itemGestion?.referencia} comparado={comparado} />
          ))}
        </div>
      )}

      {sobrantes.length > 0 && (
        <div className="border border-red-200 dark:border-red-900 rounded p-2 bg-red-50/40 dark:bg-red-950/10 text-[10px] text-red-700 dark:text-red-400">
          <span className="font-bold uppercase text-[9px] flex items-center gap-1 mb-1"><AlertTriangle size={10} /> Sobran en {config.coleccionImputadas} (ya no están en gestiones)</span>
          <ul className="list-disc list-inside space-y-0.5">
            {sobrantes.map(s => (
              <li key={s.id}>{s.referencia || s.id} — {s.mes} {s.anio}</li>
            ))}
          </ul>
        </div>
      )}

      {hayDiferencias && (
        <div className="flex justify-end pt-1">
          {puedeAplicar ? (
            <button
              type="button"
              disabled={bloqueado || algunPeriodoCerrado || aplicando}
              onClick={() => onAplicar(admision, bloque)}
              className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aplicando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {aplicando ? 'Aplicando...' : 'Aplicar corrección'}
            </button>
          ) : (
            <span className="text-[9px] text-slate-400 dark:text-gray-500 italic flex items-center gap-1">
              <ShieldAlert size={11} /> Tu perfil no tiene permiso para aplicar correcciones acá.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// `modulo`: Implantes o Hemodinamia (ver modulosGestion.js).
const SincronizacionImputadas = ({ modulo }) => {
  const config = moduloGestion(modulo);
  const VIEW_PATH = config.rutas.sincronizacion;
  const [inputAdmisiones, setInputAdmisiones] = useState('');
  const { resultados, buscando, aplicando, buscarAdmisiones, aplicarCorreccion } = useSincronizacionImputadasData(modulo);
  const { hasPermission } = useGranularPermission();
  const { confirmAction } = useModal();

  const puedeAplicar = hasPermission(VIEW_PATH, 'acciones', 'btn_aplicar_correccion');

  const handleBuscar = (e) => {
    e?.preventDefault?.();
    const lista = inputAdmisiones.split(',').map(s => s.trim()).filter(Boolean);
    buscarAdmisiones(lista);
  };

  const handleAplicar = (admision, bloque) => {
    const itemsConDiferencia = bloque.gruposPeriodo?.flatMap(g => g.itemsComparados.filter(c => c.estado !== 'IGUAL')).length || 0;
    const sobrantes = bloque.gruposPeriodo?.flatMap(g => g.itemsSobrantesEnImputadas).length || 0;

    confirmAction(
      `Confirmar corrección — Admisión ${admision}`,
      `¿Confirmás aplicar esta corrección a la admisión ${admision} (${bloque.empresa} / ${bloque.fecha})? Se van a actualizar ${itemsConDiferencia} ítem(s) en ${config.coleccionImputadas}` +
      (sobrantes > 0 ? ` y eliminar ${sobrantes} ítem(s) sobrante(s)` : '') +
      ` para que queden idénticos a ${config.coleccionGestiones}. Esta acción queda registrada en el log de auditoría.`,
      () => aplicarCorreccion(admision, bloque),
      { confirmText: 'Aplicar corrección', type: 'danger' }
    );
  };

  return (
    <ModuloContext.Provider value={config}>
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <GitCompareArrows size={15} className="text-[#2383C2]" />
          SINCRONIZACIÓN DE IMPUTADAS
        </h2>
      </div>

      <form onSubmit={handleBuscar} className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative w-96 max-w-full">
          <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
          <input
            value={inputAdmisiones}
            onChange={e => setInputAdmisiones(e.target.value)}
            className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
            placeholder="N° de admisión, o varias separadas por coma (ej: 115127, 115085)"
          />
        </div>
        <button
          type="submit"
          disabled={buscando || !inputAdmisiones.trim()}
          className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buscando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {buscando ? 'Buscando...' : 'Buscar y comparar'}
        </button>
        <p className="text-[9px] text-gray-400 dark:text-gray-500 w-full">
          Compara, ítem por ítem, lo que hay en {config.coleccionGestiones} (fuente correcta) contra {config.coleccionImputadas} (lo ya copiado). No modifica nada hasta que apretás "Aplicar corrección" en un bloque puntual.
        </p>
      </form>

      <div className="flex-grow overflow-auto p-3 space-y-3">
        {resultados.length === 0 && !buscando && (
          <div className="text-center text-[10px] text-slate-400 dark:text-gray-500 py-10">
            Ingresá uno o más números de admisión para ver la comparación.
          </div>
        )}

        {resultados.map(resultado => (
          <div key={resultado.admision} className="border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-gray-200">Admisión #{resultado.admision}</span>
              {resultado.error ? (
                <span className="text-[9px] text-red-600 dark:text-red-400 flex items-center gap-1"><XCircle size={11} /> {resultado.error}</span>
              ) : (
                <span className="text-[9px] text-slate-400 dark:text-gray-500">{resultado.bloques.length} bloque(s) encontrado(s)</span>
              )}
            </div>
            {!resultado.error && (
              <div className="p-2 space-y-2">
                {resultado.bloques.map(bloque => (
                  <BloqueDiff
                    key={bloque.refPath}
                    admision={resultado.admision}
                    bloque={bloque}
                    onAplicar={handleAplicar}
                    aplicando={!!aplicando[bloque.refPath]}
                    puedeAplicar={puedeAplicar}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </ModuloContext.Provider>
  );
};

export default SincronizacionImputadas;
