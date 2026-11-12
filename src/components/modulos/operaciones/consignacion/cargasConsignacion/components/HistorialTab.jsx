import { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { HistorialLogsContenido } from '../../../implantes/gestionImplantes/GestionesImplanteDrawers';

const formatearFecha = (fecha) => {
  if (!fecha) return 'N/A';
  const date = fecha.toDate ? fecha.toDate() : new Date(fecha);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Mismo patrón que la pestaña "Logs" de GestionesImplantesDetalleView.jsx —
// reutiliza el mismo componente de UI (HistorialLogsContenido), carga
// puntual (no onSnapshot) de la subcolección "logs" del propio registro.
const HistorialTab = ({ registro }) => {
  const [logsList, setLogsList] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!registro?.ref) return;
    let cancelado = false;
    setLoadingLogs(true);
    (async () => {
      try {
        const q = query(collection(registro.ref, 'logs'), orderBy('timestamp', 'desc'));
        const snap = await getDocs(q);
        if (!cancelado) setLogsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error al cargar logs del registro:', err);
      } finally {
        if (!cancelado) setLoadingLogs(false);
      }
    })();
    return () => { cancelado = true; };
  }, [registro?.ref]);

  return (
    <div className="flex-grow overflow-y-auto p-3">
      {registro?.ref ? (
        <HistorialLogsContenido logsList={logsList} loadingLogs={loadingLogs} formatearFecha={formatearFecha} />
      ) : (
        <div className="text-center py-12 text-tinta-atenuada text-pequeno">
          Este registro aún no se ha guardado — guarda primero para ver su historial.
        </div>
      )}
    </div>
  );
};

export default HistorialTab;
