/**
 * Feed and Activity reads hide what `viewer` muted from `author`. Only the
 * muting profile is affected: the author's own reads and admission stay as
 * they are (owner decision, 20/11/2026). Callers pass fixed SQL expressions
 * only; user values stay query parameters.
 */
export function mutedBy(viewer: string, author: string): string {
  return `EXISTS(SELECT 1 FROM hash_talk.public_profile_mutes m WHERE m.actor=${viewer} AND m.target=${author} AND m.muted)`;
}
