import React, { createContext, useState, useContext, useCallback } from 'react';
import Toast from '../components/ui/Toast';

const ToastContext = createContext();

const DISPLAY_DURATION = 3000;
const EXIT_DURATION = 300;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startExit = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isLeaving: true } : t))
    );
    setTimeout(() => removeToast(id), EXIT_DURATION);
  }, [removeToast]);

  // `duracion` (ms, opcional): para avisos largos que no deben pasar inadvertidos.
  const showToast = useCallback((message, type = 'success', duracion = DISPLAY_DURATION) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type, isLeaving: false }]);
    setTimeout(() => startExit(id), duracion);
  }, [startExit]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 right-5 z-50 flex flex-col items-end">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            isLeaving={toast.isLeaving}
            onClose={() => startExit(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);