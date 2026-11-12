/* Los 8 procedimientos de Supermercado La Esquina, en el orden de la spec 016 */
import {
  aperturaDelLocal,
  cambioDeProducto,
  cierreDeCaja,
} from './demo-ventas';
import { controlDeStock, inventarioAnual } from './demo-operaciones-2';
import { limpiezaDelDeposito, recepcionDeMercaderia } from './demo-operaciones';
import { atencionDeReclamos } from './demo-reclamos';
import type { DemoProcedure } from './demo-types';

export const DEMO_PROCEDURES: DemoProcedure[] = [
  cierreDeCaja,
  cambioDeProducto,
  aperturaDelLocal,
  recepcionDeMercaderia,
  limpiezaDelDeposito,
  controlDeStock,
  atencionDeReclamos,
  inventarioAnual,
];
