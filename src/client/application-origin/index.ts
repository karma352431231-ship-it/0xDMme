/** Set only by the installed-app build, never by a URL or a bridge message. */
declare const INSTALLED_APP: boolean;

export function installedApplication(): boolean {
  return typeof INSTALLED_APP !== 'undefined' && INSTALLED_APP;
}

/** Identity statements and public links use the service origin. Web storage,
 * workers and asset URLs continue to use the document's own origin. This keeps
 * existing recovery signatures compatible with a separately packaged client. */
export function applicationOrigin(): string {
  return installedApplication() ? 'https://0xdmme.app' : location.origin;
}
