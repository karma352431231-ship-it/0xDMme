import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';

/** Keep this viewer's existing projection when a mutation returns only public fields. */
export function editedPost(
  previous: CommunityPost,
  accepted: CommunityPost,
): CommunityPost {
  if (previous.id !== accepted.id || previous.revision > accepted.revision)
    return previous;
  return {
    ...accepted,
    ...(accepted.viewer || !previous.viewer ? {} : { viewer: previous.viewer }),
  };
}

/** Replace only the confirmed edited card; expanded children are sibling nodes. */
export function replaceEditedPost(input: {
  host: HTMLElement;
  state: PostState;
  cleanup: (node: HTMLElement) => void;
  render: (container: HTMLElement, state: PostState) => HTMLElement | null;
}): boolean {
  const current = [
    ...input.host.querySelectorAll<HTMLElement>('.community-post'),
  ].find((node) => node.dataset['postId'] === input.state.post.id);
  const parent = current?.parentElement;
  if (!current || !parent) return false;
  const replacement = input.render(parent, input.state);
  if (!replacement) return false;
  input.cleanup(current);
  current.replaceWith(replacement);
  return true;
}
