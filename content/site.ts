/**
 * Your dashboard's personalization. Edit this one file after forking.
 *
 * name      → shown in the greeting ("Good morning, <name>"). Leave '' for a
 *             generic greeting. No backend, no settings screen — just this line.
 * detonated → the /detonate command flips this (never edit by hand unless you
 *             know why): undefined = normal board · 'black' = pure black, only
 *             the gear · 'ambient' = background + greeting only. Deterministic:
 *             the board reads this flag in code, so detonation works the same
 *             every time. /detonate undo clears it.
 */
export const site: { name: string; detonated?: 'black' | 'ambient' } = {
  name: '',
}
