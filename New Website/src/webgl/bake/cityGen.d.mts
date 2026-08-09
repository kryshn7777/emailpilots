import type { BufferGeometry } from 'three';

export const CITY_SEED: number;

export interface Building {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export function cityLayout(canyonZ?: number): Building[];
export function cityGeometry(buildings: Building[]): BufferGeometry;
