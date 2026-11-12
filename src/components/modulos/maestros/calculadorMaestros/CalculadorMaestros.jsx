import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { ordenarPor } from '../../../../stores/catalogosStore';
import Spinner from '../../../ui/Spinner';

const CalculadorMaestros = () => {
  // Reglas desde el catalogosStore (lectura única por sesión, compartida con
  // Recargos Maestros y las Cargas); "Actualizar" trae cambios de otros usuarios.
  const { datos: recargosCatalogo, cargando, error: errorRecargos, refrescar: refrescarRecargos } = useCatalogo('recargos');
  const recargos = useMemo(() => [...recargosCatalogo].sort(ordenarPor('desde')), [recargosCatalogo]);
  const [precioInput, setPrecioInput] = useState('');
  const [reglaEncontrada, setReglaEncontrada] = useState(null);

  const { showToast } = useToast();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();

  const PATH_VISTA = "/maestros/calculadorMaestros";

  useEffect(() => {
    if (errorRecargos) showToast("Error al sincronizar las reglas de recargo", "error");
  }, [errorRecargos, showToast]);

  // Función para formatear números chilenos
  const formatNumber = (num) => {
    if (num === '' || num === null || isNaN(num)) return '0';
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(num);
  };

  // Buscar la regla activa cuando cambia el precio ingresado
  useEffect(() => {
    const precioNum = parseFloat(precioInput);

    if (isNaN(precioNum) || precioInput === '') {
      setReglaEncontrada(null);
      return;
    }

    // Buscar el rango donde desde <= precio <= hasta y que esté ACTIVO
    const regla = recargos.find(r => {
      const desde = parseFloat(r.desde);
      const hasta = parseFloat(r.hasta);
      const esActivo = r.estado !== 'INACTIVO';
      return esActivo && precioNum >= desde && precioNum <= hasta;
    });

    setReglaEncontrada(regla || null);
  }, [precioInput, recargos]);

  // Cálculos corregidos (Multiplicación directa)
  const precioNum = parseFloat(precioInput) || 0;
  const vecesCosto = reglaEncontrada ? parseFloat(reglaEncontrada.vecesCosto) : 0;
  const precioFinal = precioNum * vecesCosto;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-secundario">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] text-subtitulo">Cargando reglas maestras...</h3>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5">
          <Calculator size={14} className="text-[#2383C2]" />
          Calculador de recargos maestros
        </h2>
        <button
          onClick={refrescarRecargos}
          className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          title="Actualizar reglas (traer cambios de otros usuarios)"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Input de Precio */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 flex flex-col sm:flex-row items-center gap-4">
        <div className="w-full sm:w-72">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-1">
            Ingrese Precio Base ($)
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-tinta-atenuada text-etiqueta">$</span>
            <input
              type="number"
              step="any"
              value={precioInput}
              onChange={(e) => setPrecioInput(e.target.value)}
              placeholder="Ej: 10000"
              className="w-full h-8 pl-7 pr-3 border border-gray-300 dark:border-gray-600 rounded text-etiqueta outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal"
              autoFocus
            />
          </div>
        </div>

        {/* Resumen de regla detectada */}
        <div className="flex-grow flex items-center gap-2">
          {precioInput !== '' && (
            reglaEncontrada ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded text-green-800 dark:text-green-300">
                <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                <div>
                  <span className="text-etiqueta">Regla Aplicada:</span> Rango [{formatNumber(reglaEncontrada.desde)} - {formatNumber(reglaEncontrada.hasta)}] | Factor: <span className="text-etiqueta">{reglaEncontrada.vecesCosto}x</span>
                  {reglaEncontrada.comentario && <span className="block text-pequeno italic">({reglaEncontrada.comentario})</span>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-300">
                <AlertCircle size={15} className="text-red-600 flex-shrink-0" />
                <span>No se encontró ninguna regla activa para el precio ingresado.</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Resultados del Cálculo (Ubicados arriba) */}
      <div className="p-4 flex-grow flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
          
          {/* Card Precio Base */}
          <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex flex-col items-center text-center">
            <span className="text-tinta-secundaria uppercase text-pequeno mb-1">Precio Ingresado</span>
            <span className="text-numero-indicador text-tinta-principal">
              ${formatNumber(precioNum)}
            </span>
          </div>

          {/* Card Factor Aplicado */}
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col items-center text-center">
            <span className="text-amber-700 dark:text-amber-400 uppercase text-pequeno mb-1">
              Factor Multiplicador
            </span>
            <span className="text-numero-indicador text-amber-800 dark:text-amber-300">
              {vecesCosto} x
            </span>
          </div>

          {/* Card Precio Final */}
          <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col items-center text-center">
            <span className="text-[#2383C2] uppercase text-pequeno mb-1">Precio Final (Multiplicado)</span>
            <span className="text-numero-indicador text-[#2383C2]">
              ${formatNumber(precioFinal)}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CalculadorMaestros;