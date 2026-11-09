import { administracionComponentMaps } from './administracion.js';
import { laboratorioComponentMaps } from './laboratorio.js';
import { vacunatorioComponentMaps } from './vacunatorio.js';
import { maestrosComponentMaps } from './maestros.js';
import { consignacionComponentMaps } from './consignacion.js';
import { inventarioComponentMaps } from './inventario.js';
import { bodegaComponentMaps } from './bodega.js';
import { armadoKitsComponentMaps } from './armadoKits.js';
import { documentosComponentMaps } from './documentos.js';
import { implantesComponentMaps } from './implantes.js';
import { hemodinamiaComponentMaps } from './hemodinamia.js';
import { portalProveedoresComponentMaps } from './portalProveedores.js';

export const COMPONENT_MAPS = {
  ...administracionComponentMaps,
  ...laboratorioComponentMaps,
  ...vacunatorioComponentMaps,
  ...maestrosComponentMaps,
  ...consignacionComponentMaps,
  ...inventarioComponentMaps,
  ...bodegaComponentMaps,
  ...armadoKitsComponentMaps,
  ...documentosComponentMaps,
  ...implantesComponentMaps,
  ...hemodinamiaComponentMaps,
  ...portalProveedoresComponentMaps,
};
