// Celdas Orden / Acta / Salida / Mes imputado de un documento de Procesos
// (Laboratorio y Vacunatorio). Los datos viven en el propio documento de
// `*_documentos/{anio}/meses/{mes}/documentos/{id}`: los escribe
// DetalleListasIngreso al finalizar (numeroOrden, numeroActa, numeroSalida,
// mesImputado). Se comparten entre Documentos Recibidos y XML Documentos para
// que ambas pantallas muestren lo mismo.

const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center text-tinta-principal truncate';

// `ver(key)`: permiso por columna de la tabla que las contiene (keys orden,
// acta, salida, mesImputado; ver useColumnasPermitidas). Sin `ver`, todas.
const todas = () => true;

const CeldasDatosIngreso = ({ documento: d, ver = todas }) => (
  <>
    {ver('orden') && (
      <td className={TD} title={d.numeroOrden}>
        {d.numeroOrden || '-'}
      </td>
    )}
    {ver('acta') && (
      <td className={TD} title={d.numeroActa || d.acta || d.numActa}>
        {d.numeroActa || '-'}
      </td>
    )}
    {ver('salida') && (
      <td className={TD} title={d.numeroSalida || d.salida || d.numSalida}>
        {d.numeroSalida || '-'}
      </td>
    )}
    {ver('mesImputado') && (
      <td className={`${TD} capitalize`} title={d.anioImputado ? `${d.mesImputado || ''} ${d.anioImputado}` : undefined}>
        {d.mesImputado || d.mesImputacion || '-'}
      </td>
    )}
  </>
);

export default CeldasDatosIngreso;
