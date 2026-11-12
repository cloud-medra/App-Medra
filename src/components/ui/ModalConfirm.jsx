import React from 'react';
import { AlertTriangle, HelpCircle, CheckCircle, Info } from 'lucide-react';

const ModalConfirm = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirmar", 
  cancelText = "Cancelar",
  type = "danger" // 'danger' | 'primary' | 'warning' | 'info'
}) => {
  if (!isOpen) return null;

  // Estilos e iconos dinámicos según el tipo de acción
  const typeStyles = {
    danger: {
      bgIcon: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
      btnConfirm: "bg-red-600 hover:bg-red-700 text-white",
      Icon: AlertTriangle
    },
    primary: {
      bgIcon: "bg-blue-100 dark:bg-blue-900/30 text-[#2383C2]",
      btnConfirm: "bg-[#2383C2] hover:bg-blue-600 text-white",
      Icon: CheckCircle
    },
    warning: {
      bgIcon: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
      btnConfirm: "bg-amber-600 hover:bg-amber-700 text-white",
      Icon: HelpCircle
    },
    info: {
      bgIcon: "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400",
      btnConfirm: "bg-sky-600 hover:bg-sky-700 text-white",
      Icon: Info
    }
  };

  const currentStyle = typeStyles[type] || typeStyles.primary;
  const IconComponent = currentStyle.Icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${currentStyle.bgIcon}`}>
            <IconComponent size={24} />
          </div>
          <h3 className="text-titulo-seccion text-tinta-principal">{title}</h3>
          <p className="text-normal text-tinta-secundaria mt-2 mb-6">{message}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-subtitulo text-tinta-secundaria hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 py-2.5 rounded-lg text-subtitulo transition ${currentStyle.btnConfirm}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirm;