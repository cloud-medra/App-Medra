import { useMemo, useState } from 'react';
import { Search, X, Link2, Save } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { validarProducto, MAX } from '../../../../../functions/bodega/nucleo.mjs';
import { opcionesCatalogo, buscarEnMaestroClinico, descriptorMaestroClinico } from './catalogosBodega';
import { PRODUCTO_VACIO, productoAFormulario } from './productoFormulario';

const INPUT = 'w-full h-8 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-60';
const LABEL = 'block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-0.5';

// Buscador en el maestro clínico (maestros_codigos) para crear el producto
// a partir de él: completa nombre y referencia y deja el vínculo.
const SelectorMaestroClinico = ({ onElegir }) => {
  const [texto, setTexto] = useState('');
  const { datos: codigos, cargando } = useCatalogo('codigos');
  const resultados = useMemo(() => buscarEnMaestroClinico(codigos, texto), [codigos, texto]);

  return (
    <div className="border border-dashed border-[#2383C2]/50 rounded p-2 bg-blue-50/40 dark:bg-sky-950/20">
      <div className="relative">
        <Search className="absolute left-2 top-2 text-gray-400" size={13} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className={`${INPUT} pl-7`}
          placeholder={cargando ? 'Cargando maestro clínico…' : 'Buscar en el maestro clínico por código, referencia o descripción'}
          autoFocus
        />
      </div>
      {resultados.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
          {resultados.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onElegir(c)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-gray-800 text-[11px]">
                <span className="font-num font-bold text-[#2383C2]">{c.codigo || 'S/C'}</span>
                <span className="text-gray-500"> · {c.referencia || 'sin ref.'}</span>
                <div className="text-gray-700 dark:text-gray-200">{descriptorMaestroClinico(c)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto.trim().length >= 2 && !cargando && resultados.length === 0 && (
        <p className="mt-1 text-[11px] text-gray-500 italic">Sin coincidencias en el maestro clínico.</p>
      )}
    </div>
  );
};

// Formulario de producto (crear o editar). Valida con las mismas reglas que
// la Cloud Function (validarProducto); la función vuelve a validar todo.
//   onGuardar(datosProducto) -> Promise
//   puedeEditar / puedeInactivar: permisos granulares de la pantalla.
const FormProducto = ({ inicial = PRODUCTO_VACIO, esNuevo, onGuardar, onCancelar, guardando = false, puedeEditar = true, puedeInactivar = false, textoGuardar }) => {
  const [form, setForm] = useState(() => productoAFormulario(inicial));
  const [errores, setErrores] = useState([]);
  const [buscandoMaestro, setBuscandoMaestro] = useState(false);
  const { datos: catalogos } = useCatalogo('bodegaCatalogos');
  const unidades = useMemo(() => opcionesCatalogo(catalogos, 'UNIDAD', inicial.unidadId), [catalogos, inicial.unidadId]);
  const categorias = useMemo(() => opcionesCatalogo(catalogos, 'CATEGORIA', inicial.categoriaId), [catalogos, inicial.categoriaId]);
  const bloqueado = !puedeEditar || guardando;
  const lotesBloqueados = Boolean(inicial.conMovimientos);

  const cambiar = (campo) => (e) => {
    const valor = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  const elegirMaestro = (c) => {
    setForm((f) => ({
      ...f,
      maestroCodigoId: c.id,
      maestroCodigo: { codigo: c.codigo || '', referencia: c.referencia || '', descriptor: descriptorMaestroClinico(c), empresa: c.empresa || '' },
      nombre: f.nombre || descriptorMaestroClinico(c),
      referencia: f.referencia || c.referencia || '',
    }));
    setBuscandoMaestro(false);
  };

  const enviar = async (e) => {
    e.preventDefault();
    const { errores: lista } = validarProducto(form);
    setErrores(lista);
    if (lista.length) return;
    await onGuardar(form);
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2.5 text-[12px]">
      {/* Vínculo con el maestro clínico */}
      <div>
        <span className={LABEL}>Maestro clínico (opcional)</span>
        {form.maestroCodigoId ? (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-[#2383C2]/40 bg-blue-50/60 dark:bg-sky-950/30">
            <Link2 size={13} className="text-[#2383C2] shrink-0" />
            <span className="flex-1 text-[11px]">
              <span className="font-num font-bold">{form.maestroCodigo?.codigo || 'S/C'}</span> · {form.maestroCodigo?.descriptor || form.maestroCodigo?.referencia || form.maestroCodigoId}
            </span>
            {!bloqueado && (
              <button type="button" title="Quitar vínculo" onClick={() => setForm((f) => ({ ...f, maestroCodigoId: '', maestroCodigo: null }))} className="p-0.5 text-gray-500 hover:text-red-600">
                <X size={13} />
              </button>
            )}
          </div>
        ) : buscandoMaestro ? (
          <SelectorMaestroClinico onElegir={elegirMaestro} />
        ) : (
          !bloqueado && (
            <button type="button" onClick={() => setBuscandoMaestro(true)} className="h-8 px-2.5 rounded border border-dashed border-[#2383C2]/60 text-[#2383C2] text-[11px] font-semibold hover:bg-blue-50 dark:hover:bg-gray-800">
              Completar desde el maestro clínico…
            </button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="bp-nombre">Nombre *</label>
          <input id="bp-nombre" value={form.nombre} onChange={cambiar('nombre')} maxLength={MAX.nombre} disabled={bloqueado} className={INPUT} />
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-codigo">Código maestro</label>
          <input id="bp-codigo" value={form.codigoMaestro} onChange={(e) => cambiar('codigoMaestro')(e.target.value.toUpperCase())} maxLength={MAX.codigoMaestro} disabled={bloqueado}
            className={`${INPUT} font-num`} placeholder={esNuevo ? 'Automático (BOD-00001)' : ''} />
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-ref">Referencia</label>
          <input id="bp-ref" value={form.referencia} onChange={cambiar('referencia')} maxLength={MAX.referencia} disabled={bloqueado} className={INPUT} />
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-cat">Categoría</label>
          <select id="bp-cat" value={form.categoriaId} onChange={cambiar('categoriaId')} disabled={bloqueado} className={INPUT}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activo === false ? ' (inactiva)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-uni">Unidad de medida *</label>
          <select id="bp-uni" value={form.unidadId} onChange={cambiar('unidadId')} disabled={bloqueado} className={INPUT}>
            <option value="">Seleccionar…</option>
            {unidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activo === false ? ' (inactiva)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-ubi">Ubicación (estante)</label>
          <input id="bp-ubi" value={form.ubicacion} onChange={cambiar('ubicacion')} maxLength={MAX.ubicacion} disabled={bloqueado} className={INPUT} />
        </div>
        <div>
          <label className={LABEL} htmlFor="bp-min">Stock mínimo</label>
          <input id="bp-min" type="number" min="0" step="1" inputMode="numeric" value={form.stockMinimo} onChange={cambiar('stockMinimo')} disabled={bloqueado} className={`${INPUT} font-num`} placeholder="Sin mínimo" />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <label className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200" title={lotesBloqueados ? 'No se puede cambiar: el producto ya tiene movimientos' : ''}>
          <input type="checkbox" checked={form.manejaLote} onChange={cambiar('manejaLote')} disabled={bloqueado || lotesBloqueados} /> Maneja lote
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200" title={lotesBloqueados ? 'No se puede cambiar: el producto ya tiene movimientos' : ''}>
          <input type="checkbox" checked={form.manejaVencimiento} onChange={cambiar('manejaVencimiento')} disabled={bloqueado || lotesBloqueados} /> Maneja vencimiento
        </label>
        {!esNuevo && (
          <label className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200" title={puedeInactivar ? '' : 'Requiere el permiso "Activar / inactivar producto"'}>
            <input type="checkbox" checked={form.activo} onChange={cambiar('activo')} disabled={bloqueado || !puedeInactivar} /> Activo
          </label>
        )}
      </div>

      {errores.length > 0 && (
        <ul className="text-[11px] text-red-600 dark:text-red-400 list-disc pl-4">
          {errores.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {puedeEditar && (
        <div className="flex justify-end gap-2 pt-1">
          {onCancelar && (
            <button type="button" onClick={onCancelar} disabled={guardando} className="h-8 px-3 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold">
              Cancelar
            </button>
          )}
          <button type="submit" disabled={guardando} className="h-8 px-3 rounded bg-[#2383C2] hover:bg-blue-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Save size={13} /> {guardando ? 'Guardando…' : (textoGuardar || (esNuevo ? 'Crear producto' : 'Guardar cambios'))}
          </button>
        </div>
      )}
    </form>
  );
};

export default FormProducto;
