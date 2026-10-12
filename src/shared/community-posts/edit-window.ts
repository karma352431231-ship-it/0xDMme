/** The original publication time bounds all edits, including replies. */
export const postEditWindowMs = 60 * 60 * 1000;

export function withinPostEditWindow(
  createdAt: Date | string,
  now = Date.now(),
): boolean {
  const created =
    createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return (
    Number.isFinite(created) &&
    now >= created &&
    now < created + postEditWindowMs
  );
}
