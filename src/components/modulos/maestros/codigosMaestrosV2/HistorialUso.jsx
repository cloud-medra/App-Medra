import React, { useEffect, useState } from 'react';
import Spinner from '../../../ui/Spinner';
import { resumenUso } from '../../../../../functions/usoCodigos/nucleo.mjs';
import { cargarUsoCodigo } from './accionesCodigos';

// La fecha viene como 'AAAA-MM-DD' (la de la gestión, sin hora): se muestra sin
// pasar por Date para que la zona horaria no la corra un día.
const fechaCorta = (fecha) => (fecha ? fecha.split('-').reverse().join('-') : 'Sin fecha');
const textoUsos = (usos) => (usos === 1 ? '1 uso' : `${usos} usos`);

const ListaUso = ({ titulo, filas }) => (
  <section>
    <h4 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-gray-500">
      {titulo} ({filas.length})
    </h4>
    {filas.length === 0 ? (
      <p className="mt-2 text-[13px] text-slate-400">Sin registros.</p>
    ) : (
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-gray-800">
        {filas.map((fila) => (
          <li key={fila.clave} className="py-2">
            <p className="text-[13px] font-medium text-slate-700 dark:text-gray-200 break-words">{fila.nombre}</p>
            <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
              {textoUsos(fila.usos)} · último uso: {fechaCorta(fila.ultimoUso)}
            </p>
          </li>
        ))}
      </ul>
    )}
  </section>
);

// Médicos y descripciones de CX con que se ha usado la referencia en Implantes.
// Se monta solo al abrir su pestaña: 1 lectura (maestros_codigos_uso).
const HistorialUso = ({ referencia }) => {
  const [uso, setUso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    setUso(null);
    cargarUsoCodigo(referencia)
      .then((datos) => { if (vigente) setUso(datos); })
      .catch((err) => { console.error('Error cargando el uso del código:', err); if (vigente) setError('No se pudo cargar el historial de uso.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [referencia]);

  if (cargando) {
    return <div className="flex flex-col items-center gap-2 py-16 text-[12px] text-slate-400"><Spinner size="sm" color="#2383C2" />Cargando historial de uso…</div>;
  }
  if (error) return <p className="py-16 text-center text-[13px] text-red-600">{error}</p>;
  if (!uso) return <p className="py-16 text-center text-[13px] text-slate-400">Este código aún no tiene usos registrados en Implantes.</p>;

  const { medicos, descripciones } = resumenUso(uso);
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-slate-500 dark:text-gray-400">Según las cargas vigentes de Implantes.</p>
      <ListaUso titulo="Médicos" filas={medicos} />
      <ListaUso titulo="Descripciones de CX" filas={descripciones} />
    </div>
  );
};

export default HistorialUso;
