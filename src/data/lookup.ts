import { entities } from './entities.generated';
import type { Entity } from './schema';

/**
 * Entities by id.
 *
 * One map, built once. Five feature modules each kept their own copy of
 * `new Map(entities.map(...))`, which was 1,250 entries of the same thing and
 * five places for the lookup to drift.
 */
export const entitiesById: ReadonlyMap<string, Entity> = new Map(
  entities.map((entity) => [entity.id, entity]),
);

/** The entity with this id, or undefined. */
export function entityById(id: string): Entity | undefined {
  return entitiesById.get(id);
}
