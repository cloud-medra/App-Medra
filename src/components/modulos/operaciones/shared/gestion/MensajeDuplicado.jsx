// Cuerpo de la alerta "Posible gestión duplicada" (ver duplicadosGestion.js).
// Va dentro del <p> de ModalConfirm: solo elementos en línea (span block).
const fechaTexto = (fecha) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (fecha || '-');
};

const idTexto = (valor) => {
  const t = String(valor ?? '').trim();
  return t && t !== 'P' ? t : null;
};

const MensajeDuplicado = ({ duplicado }) => {
  const { motivo, existente } = duplicado;
  const id = idTexto(existente.gestionId || existente.agendaId);
  const filas = [
    ['Nombre', existente.nombre || '-'],
    ['Fecha', fechaTexto(existente.fecha)],
    ['Empresa', existente.empresa || '-'],
    ...(id ? [['ID', id]] : []),
    ['Estado', existente.estado || 'AGENDANDO'],
  ];
  return (
    <>
      <span className="block">
        {motivo === 'id'
          ? 'Ya existe una gestión con el mismo ID:'
          : 'Ya existe una gestión con el mismo nombre, fecha y empresa:'}
      </span>
      <span className="block my-2 px-3 py-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-gray-700 dark:text-gray-200">
        {filas.map(([etiqueta, valor]) => (
          <span key={etiqueta} className="block">
            <span className="font-semibold">{etiqueta}:</span> {valor}
          </span>
        ))}
      </span>
      <span className="block">¿Quieres registrarla de todas formas?</span>
    </>
  );
};

export default MensajeDuplicado;
