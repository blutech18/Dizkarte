import { DomainError } from "../errors.js";

/**
 * Generic state-machine helper. A transition map lists the allowed target
 * states for each source state. Policy-dependent transitions that require
 * Client approval are simply omitted from the map until enabled.
 */
export type TransitionMap<S extends string> = Readonly<Record<S, ReadonlyArray<S>>>;

export function allowedTargets<S extends string>(map: TransitionMap<S>, from: S): ReadonlyArray<S> {
  return map[from] ?? [];
}

export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean {
  return allowedTargets(map, from).includes(to);
}

/**
 * Assert a transition is legal, throwing a stable INVALID_STATE error otherwise.
 */
export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(map, from, to)) {
    throw new DomainError("INVALID_STATE", `${entity} cannot transition from ${from} to ${to}.`);
  }
}

export function isTerminal<S extends string>(map: TransitionMap<S>, state: S): boolean {
  return allowedTargets(map, state).length === 0;
}
