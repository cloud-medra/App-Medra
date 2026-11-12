import React from 'react';
import Spinner from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext'; 

const TestPage = () => {
  const { showToast } = useToast(); 

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-10 bg-gray-50">
      <h1 className="text-titulo-pagina text-tinta-principal">Zona de Pruebas: UI Components</h1>

      <div className="flex gap-10 items-center p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => showToast("Operación exitosa", "success")}
          className="px-4 py-2 bg-green-600 text-white rounded text-etiqueta"
        >
          Probar Toast Success
        </button>
        <button
          onClick={() => showToast("Error al procesar", "error")}
          className="px-4 py-2 bg-red-600 text-white rounded text-etiqueta"
        >
          Probar Toast Error
        </button>
        <button
          onClick={() => showToast("Información del sistema", "info")}
          className="px-4 py-2 bg-blue-600 text-white rounded text-etiqueta"
        >
          Probar Toast Info
        </button>
      </div>
    </div>
  );
};

export default TestPage;