import React from 'react';
import { AlertTriangle, History, X } from 'lucide-react';
import { MODULOS } from './constants';

const formatearNombreUsuario = (usuario) => {
  if (!usuario) return 'Usuario Sistema';
  if (typeof usuario === 'object') {
    return usuario.nombreCompleto || usuario.nombre || usuario.email || 'Usuario Sistema';
  }
  return usuario;
};

export const ModalReapertura = ({
  modalReapertura,
  setModalReapertura,
  anioSeleccionado,
  motivoReapertura,
  setMotivoReapertura,
  ejecutarReapertura,
  procesandoAccion
}) => {
  if (!modalReapertura) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setModalReapertura(null); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-md p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 border-b border-slate-200 dark:border-gray-700 pb-2">
          <AlertTriangle size={18} />
          <h3 className="text-subtitulo">Reapertura de período cerrado</h3>
        </div>

        <p className="text-secundario text-tinta-secundaria">
          Estás por reabrir la imputación para el mes de <strong className="uppercase">{modalReapertura.mesId} {anioSeleccionado}</strong> 
          {` en el módulo de ${MODULOS.find(m => m.id === modalReapertura.modId)?.nombre}.`}
        </p>

        <textarea
          value={motivoReapertura}
          onChange={(e) => setMotivoReapertura(e.target.value)}
          placeholder="Ej: Ajuste de facturación extemporánea autorizada por jefatura..."
          className="w-full h-20 p-2 border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-tinta-principal text-secundario outline-none focus:border-amber-500 resize-none"
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-gray-700">
          <button
            onClick={() => { setModalReapertura(null); setMotivoReapertura(''); }}
            disabled={procesandoAccion}
            className="px-3 py-1 bg-slate-200 dark:bg-gray-700 text-tinta-principal rounded text-pequeno hover:bg-slate-300 transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={ejecutarReapertura}
            disabled={procesandoAccion}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-pequeno transition cursor-pointer disabled:opacity-50"
          >
            {procesandoAccion ? 'Procesando...' : 'Confirmar Reapertura'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ModalHistorial = ({ modalHistorial, setModalHistorial }) => {
  if (!modalHistorial) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setModalHistorial(null); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-lg p-4 space-y-3">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-gray-700 pb-2">
          <div className="flex items-center gap-2 text-[#2383C2]">
            <History size={18} />
            <h3 className="text-subtitulo">
              Historial: {modalHistorial.mes} {modalHistorial.anio} ({modalHistorial.moduloNombre})
            </h3>
          </div>
          <button onClick={() => setModalHistorial(null)} className="text-tinta-atenuada hover:text-tinta-secundaria cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {modalHistorial.historialReaperturas?.map((h, i) => (
            <div key={i} className="p-2 border border-slate-200 dark:border-gray-700 rounded bg-slate-50 dark:bg-gray-900/50 text-pequeno">
              <div className="flex justify-between text-etiqueta text-tinta-principal mb-1">
                <span>Usuario: {formatearNombreUsuario(h.usuario)}</span>
                <span className="text-numero-tabla text-tinta-atenuada">
                  {h.fecha ? new Date(h.fecha).toLocaleString('es-CL') : 'N/A'}
                </span>
              </div>
              <p className="text-tinta-secundaria italic">"{h.motivo}"</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-gray-700">
          <button
            onClick={() => setModalHistorial(null)}
            className="px-3 py-1 bg-slate-200 dark:bg-gray-700 text-tinta-principal rounded text-pequeno cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};