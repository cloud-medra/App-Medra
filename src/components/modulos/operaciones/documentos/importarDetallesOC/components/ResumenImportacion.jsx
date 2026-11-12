import { useState } from 'react';
import { PlusCircle, RefreshCw, MinusCircle, AlertTriangle, Hash, Database, ShieldAlert, ArrowRightLeft, CalendarClock, HelpCircle, EyeOff, X, Trash2, Loader2 } from 'lucide-react';

const NOMBRES_CAMPO = {
  paciente: 'Paciente', medico: 'Médico', codigo: 'Código', descripcion: 'Descripción', cantidad: 'Cantidad',
  precio_u: 'Precio unitario', atributo: 'Atributo', oc: 'OC', oc_monto: 'Monto OC', estado: 'Estado',
  fecha_recepcion: 'Fecha recepción', fecha_cargo: 'Fecha cargo', numero_guia: 'N° guía', numero_factura: 'N° factura',
  fecha_emision: 'Fecha emisión', fecha_ingreso: 'Fecha ingreso', lote: 'Lote', fecha_vencimiento: 'Fecha vencimiento'
};
const nombreCampo = (c) => NOMBRES_CAMPO[c] || c;

const fechaCorta = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso || '-';
};

// Lista desplegable de un caso del resumen (cerrada si no hay nada que revisar).
const Seccion = ({ titulo, items, Icono, tono = 'aviso', ayuda, render }) => {
  if (!items?.length) return null;
  const tonos = {
    aviso: 'text-amber-700 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
    info: 'text-[#2383C2] dark:text-blue-400'
  };
  return (
    <details className={`w-full ${tonos[tono]}`}>
      <summary className="cursor-pointer text-etiqueta inline-flex items-center gap-1" title={ayuda}>
        <Icono size={12} /> {titulo} ({items.length})
      </summary>
      {ayuda && <p className="mt-0.5 text-pequeno text-tinta-secundaria">{ayuda}</p>}
      <ul className="mt-1 max-h-40 overflow-auto text-numero-tabla space-y-0.5 text-tinta-principal select-text">
        {items.slice(0, 200).map((it, i) => <li key={i}>{render(it)}</li>)}
        {items.length > 200 && <li>… y {items.length - 200} más</li>}
      </ul>
    </details>
  );
};

const fila = (it) => `${it.filaExcel ? `Fila ${it.filaExcel}` : 'Sin fila'}${it.id ? ` (ID ${it.id})` : ''}`;

const AYUDA_YA_NO_VIENEN = 'Filas guardadas de los meses que cubre este archivo que no vinieron. No se borraron.';
const textoYaNoViene = (it) => `Adm. ${it.admision} · ${fechaCorta(it.fecha)} · ${it.proveedor} · ${it.codigo}`
  + `${it.oc ? ` · OC ${it.oc}` : ''} · $ ${(Number(it.monto) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`
  + `${it.enGrupoPresente ? ' · (repetida de una fila que sí vino: sale del índice de OC)' : ''}`;

// "Registradas que ya no vienen" con selección (admin/dev): por defecto no
// hay nada marcado; solo se elimina lo que se elija y se confirme.
const SeccionYaNoVienen = ({ items, onEliminar, preparando }) => {
  const [seleccion, setSeleccion] = useState(() => new Set());
  if (!items?.length) return null;
  const marcadas = items.filter(it => seleccion.has(it.id));
  const todas = marcadas.length === items.length;
  const alternar = (id) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  return (
    <details className="w-full text-amber-700 dark:text-amber-400">
      <summary className="cursor-pointer text-etiqueta inline-flex items-center gap-1" title={AYUDA_YA_NO_VIENEN}>
        <EyeOff size={12} /> Registradas que ya no vienen en el archivo ({items.length})
      </summary>
      <p className="mt-0.5 text-pequeno text-tinta-secundaria">
        {AYUDA_YA_NO_VIENEN} Puedes seleccionar las que sobran y eliminarlas (con respaldo). Si el archivo trae solo parte del mes, aquí aparece también el resto: revisa antes de eliminar.
      </p>
      <div className="mt-1 flex items-center gap-2 text-pequeno text-tinta-principal">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={todas}
            ref={el => { if (el) el.indeterminate = marcadas.length > 0 && !todas; }}
            onChange={() => setSeleccion(todas ? new Set() : new Set(items.map(it => it.id)))}
          />
          Seleccionar todas
        </label>
        <button
          type="button"
          onClick={() => onEliminar(marcadas)}
          disabled={marcadas.length === 0 || preparando}
          className="ml-auto h-6 px-2 rounded bg-red-600 hover:bg-red-700 text-white text-etiqueta flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {preparando ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Eliminar seleccionadas ({marcadas.length})
        </button>
      </div>
      <ul className="mt-1 max-h-40 overflow-auto text-numero-tabla space-y-0.5 text-tinta-principal select-text">
        {items.map(it => (
          <li key={it.id}>
            <label className="inline-flex items-start gap-1.5 cursor-pointer" title={it.id}>
              <input type="checkbox" className="mt-0.5" checked={seleccion.has(it.id)} onChange={() => alternar(it.id)} />
              <span>{textoYaNoViene(it)}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
};

// `onEliminarYaNoVienen` (solo admin/dev): habilita seleccionar y eliminar
// las filas que ya no vienen; sin él, la sección es solo informativa.
export const ResumenImportacion = ({ resumen, onCerrar, onReintentar, reintentando, onEliminarYaNoVienen, preparandoEliminacion }) => {
  const camposActualizados = Object.entries(resumen.camposActualizados || {})
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${nombreCampo(c)}: ${n}`).join(' · ');
  const gestiones = resumen.gestionesOC;

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-pequeno max-h-[45%] overflow-y-auto shrink-0">
      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-etiqueta">
        <PlusCircle size={12} /> {resumen.nuevas} nueva(s)
      </span>
      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-etiqueta" title={camposActualizados || undefined}>
        <RefreshCw size={12} /> {resumen.actualizadas} actualizada(s)
      </span>
      <span className="flex items-center gap-1 text-tinta-secundaria">
        <MinusCircle size={12} /> {resumen.sinCambios} sin cambios
      </span>
      <span className={`flex items-center gap-1 ${resumen.errores.length ? 'text-red-600 dark:text-red-400 text-etiqueta' : 'text-tinta-secundaria'}`}>
        <AlertTriangle size={12} /> {resumen.errores.length} con error
      </span>
      <span
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-700/60 text-tinta-secundaria"
        title={`Snapshot ${resumen.snapshotDesdeCache ? 'desde la caché local' : 'descargado de Storage'}${resumen.meses?.length ? ` · meses del archivo: ${resumen.meses.join(', ')}` : ''}`}
      >
        <Database size={11} /> Firestore: {resumen.lecturasFirestore} lectura(s) · {resumen.escriturasFirestore} escritura(s)
      </span>
      {resumen.indiceOC?.ok ? (
        <span className="flex items-center gap-1 text-[#2383C2]" title={`Filas con OC: ${resumen.indiceOC.conOC} · sin OC: ${resumen.indiceOC.sinOC} · incompletas: ${resumen.indiceOC.incompletas}`}>
          <Hash size={12} /> Índice OC: {resumen.indiceOC.totalEntradas}{resumen.indiceOC.publicado ? ' · actualizado' : ' · sin cambios'}
        </span>
      ) : resumen.indiceOC && (
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle size={12} /> {resumen.indiceOC.error}</span>
      )}
      {onCerrar && (
        <button type="button" onClick={onCerrar} title="Cerrar resumen" className="ml-auto p-0.5 rounded text-tinta-atenuada hover:text-tinta-secundaria"><X size={12} /></button>
      )}

      {camposActualizados && <p className="w-full text-pequeno text-tinta-secundaria">Campos actualizados — {camposActualizados}</p>}

      <Seccion
        titulo="Proveedores sin empresa en el Maestro"
        items={resumen.proveedoresSinEmpresa}
        Icono={AlertTriangle}
        ayuda="Sus filas no le aparecen a ningún proveedor en Portal Proveedores hasta relacionarlas. El nombre debe coincidir con el Maestro de Empresas."
        render={(it) => `${it.proveedor}: ${it.filas} fila(s)`}
      />
      {resumen.pendientes > 0 && (
        <div className="w-full flex items-center gap-2 px-2 py-1 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <AlertTriangle size={12} /> {resumen.pendientes} fila(s) no se guardaron por un error de conexión o permiso. Lo ya guardado se mantiene.
          {onReintentar && (
            <button type="button" onClick={onReintentar} disabled={reintentando} className="ml-auto px-2 py-0.5 rounded border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50">
              Reintentar pendientes
            </button>
          )}
        </div>
      )}

      <Seccion
        titulo="Valores no sobrescritos" items={resumen.noSobrescritos} Icono={ShieldAlert}
        ayuda="El archivo trae vacío un campo que ya tenía valor: se mantuvo el valor guardado."
        render={it => `${fila(it)} · ${nombreCampo(it.campo)}: se mantiene "${it.valorGuardado}"`}
      />
      <Seccion
        titulo="OC cambiadas" items={resumen.ocCambiadas} Icono={ArrowRightLeft} tono="info"
        ayuda={gestiones?.error
          ? gestiones.error
          : `Se quitó la OC antigua de ${gestiones?.itemsLiberados || 0} ítem(s) en ${gestiones?.gestionesActualizadas || 0} gestión(es) de Implantes y quedaron con OC pendiente: "Sincronizar OC" les asigna la nueva.`}
        render={it => `Adm. ${it.admision} · ${fechaCorta(it.fecha)} · ${it.codigo}: ${it.ocAntes} → ${it.ocDespues}`}
      />
      <Seccion
        titulo="Fecha de cirugía cambiada (fila movida de mes)" items={resumen.fechasCambiadas} Icono={CalendarClock} tono="info"
        render={it => `${fila({ filaExcel: it.filaExcel })} · ${fechaCorta(it.fechaAntes)} → ${fechaCorta(it.fechaDespues)}`}
      />
      <Seccion
        titulo="Posible cambio de fecha, para revisar" items={resumen.fechasAmbiguas} Icono={HelpCircle}
        ayuda="Coincide con más de una fila guardada con otra fecha: se guardó como nueva, sin mover ninguna. Revisa si alguna de las anteriores sobra."
        render={it => `${fila(it)} · ${fechaCorta(it.fecha)} · posibles: ${it.candidatos.map(c => `${fechaCorta(c.fecha)} (${c.id})`).join(', ')}`}
      />
      {onEliminarYaNoVienen ? (
        <SeccionYaNoVienen items={resumen.yaNoVienen} onEliminar={onEliminarYaNoVienen} preparando={preparandoEliminacion} />
      ) : (
        <Seccion
          titulo="Registradas que ya no vienen en el archivo" items={resumen.yaNoVienen} Icono={EyeOff}
          ayuda={AYUDA_YA_NO_VIENEN} render={textoYaNoViene}
        />
      )}
      <Seccion
        titulo="Con error (no se guardaron)" items={resumen.errores} Icono={AlertTriangle} tono="error"
        render={it => `${fila(it)}: ${it.error}`}
      />
    </div>
  );
};

export default ResumenImportacion;
