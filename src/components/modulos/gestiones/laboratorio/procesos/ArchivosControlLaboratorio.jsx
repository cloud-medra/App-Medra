import DocumentosRecibidos from './fases/documentosRecibidos/DocRecibidos';
import IniciarProceso from './fases/iniciarProceso/IniciarProceso';
import VinculacionCodigos from './fases/vinculacionCodigos/VinculacionCodigos';
import VinculacionOrden from './fases/vinculacionOrden/VinculacionOrden';
import SolicitudDiferencias from './fases/solicitudDiferencias/SolicitudDiferencias';
import DocumentosListasIngreso from './fases/documentosListasIngreso/DocListasIngreso';
import DocImputados from './fases/documentosImputados/DocumentosImputados';
import DocumentosEditor from './fases/documentosEditor/DocumentosEditor';
import FaseControlProcesos from '../../shared/FaseControlProcesos';
import { FASES_CONTROL_PROCESOS } from '../../../../../config/pestanasControlProcesos';

// "Control Procesos" de Laboratorio: cada fase es un ítem propio del menú
// (antes, una pestaña de esta pantalla; ver config/pestanasControlProcesos.js).
// Sus rutas son las de las pestañas, así los permisos granulares de cada una
// siguen valiendo. Sin LaboratorioDataProvider: las fases usan el store
// global de useLaboratorioData, compartido entre ítems (con su TTL), en vez
// de volver a leer códigos y órdenes al pasar de un ítem a otro.
export const RUTA_CONTROL_LABORATORIO = '/laboratorio/archivosControlLaboratorio';

const COMPONENTES = {
  documentosRecibidos: DocumentosRecibidos,
  iniciarProcesos: IniciarProceso,
  vinculacionCodigos: VinculacionCodigos,
  vinculacionOrdenes: VinculacionOrden,
  solicitudDiferencias: SolicitudDiferencias,
  documentosListos: DocumentosListasIngreso,
  documentosImputados: DocImputados,
  documentosEdicion: DocumentosEditor,
};

// { ruta del ítem: <pantalla> } para el VIEW_MAP del Dashboard.
export const vistasControlLaboratorio = () => Object.fromEntries(
  FASES_CONTROL_PROCESOS.map(({ clave, label }) => {
    const path = `${RUTA_CONTROL_LABORATORIO}/${clave}`;
    const Fase = COMPONENTES[clave];
    return [path, (
      <FaseControlProcesos key={path} etiquetaModulo="Laboratorio" label={label} path={path}>
        <Fase />
      </FaseControlProcesos>
    )];
  })
);
