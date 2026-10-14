import { paintAvatar } from '../appearance/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import type { GroupSummary } from './controller.ts';
import { GroupPhotoView } from './photo-ui.ts';

/** Only visible directory rows decode locally received private group photos. */
export function showGroupDirectoryPhoto(
  host: HTMLElement,
  group: GroupSummary,
  load: () => Promise<GroupPhoto | null>,
  signal: AbortSignal,
): void {
  const view = new GroupPhotoView();
  const fallback = () => {
    view.reset();
    paintAvatar(host, { label: group.title, seed: group.state.groupId });
  };
  const show = () => view.show(group.state.groupId, [host], load);
  if (signal.aborted) return;
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          if (signal.aborted) return;
          if (entries.some((entry) => entry.isIntersecting)) show();
          else fallback();
        });
  signal.addEventListener(
    'abort',
    () => {
      observer?.disconnect();
      fallback();
    },
    { once: true },
  );
  if (observer) observer.observe(host);
  else show();
}
