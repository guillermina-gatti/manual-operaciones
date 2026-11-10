// The areas the API lists (GET /api/areas), ordered by name: one of them is inactive.
import type { Area } from '@/lib/directory';
import { ARCHIVO, OPERACIONES, VENTAS } from './procedures';

export const AREAS: Area[] = [
  { id: ARCHIVO, name: 'Archivo', isActive: false },
  { id: OPERACIONES, name: 'Operaciones', isActive: true },
  { id: VENTAS, name: 'Ventas', isActive: true },
];
