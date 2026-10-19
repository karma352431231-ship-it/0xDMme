# Public Profile Invitation and Transient Menus

Owner-requested presentation update on 14/10/2026. English and Simplified Chinese
are required for all new app-facing copy. No database, authentication, account
identity or retention change is part of this request. The owner subsequently
requested integration and VPS activation under the existing release process.

## Participation Invitation

The community sidebar replaces only the known `communities/list` HTTP 403
missing-public-profile response with a prominent invitation. The link opens
`#perfil?secao=profile`, not a generic settings page. Opening it never creates
or publishes a profile automatically. Other authorization, transport and server
failures keep their diagnostics. The API error exposes its existing reason
separately so the presentation does not parse a translated diagnostic string.
On mobile, where the sidebar is hidden, the same invitation appears above the
community page content. Each directory refresh clears it before checking the
current prerequisite, and other routes keep the mobile host hidden.

## Option Menus

Contact creation uses the same dimensions, typography, border, background,
hover and focus treatment for Add contact, Create group and Join by link.
The navigation action remains a real link; group commands remain buttons.
On mobile, the menu opens above the floating plus button, within the viewport,
with bounded vertical scrolling instead of the hidden desktop heading anchor.

One delegated document binding dismisses transient disclosure menus on an
outside click/tap, including whitespace in another app column. Escape closes
the innermost active menu and restores focus to its trigger. Current coverage:
contact creation, chat options, community navigation, post/profile options,
sorting/period choices, community post filters and group-member actions.
New disclosure option menus may opt in with `data-transient-menu`.

Contact option dialogs explicitly opt into backdrop dismissal. Conversation
context menus keep their existing outside-click handling and long-press guard;
message native popovers, search and emoji panels keep their existing dismissal.
Settings/help accordions, inline expansions, wallet enrollment, editors and
confirmation dialogs are not implicitly dismissed. Closing a disclosure hides
its contents without removing DOM draft values or submitting a form.

## Verification and Structure

Regression checks cover inside/outside clicks, dynamic menus, nested Escape,
unchanged settings/drafts, contact-dialog bounds, both invitation languages and
unrelated failures. Browser checks cover mobile/desktop bounds, consistent
contact action styles, direct setup navigation and real blank-space dismissal.

`src/client/app/index.ts` and `src/client/communities/index.ts` remain existing
coordinator hotspots. This task adds only startup/wiring calls, placing menu
lifecycle and sidebar error presentation in separate modules. A separate split
should extract account-panel mounting, then routing from the app coordinator;
extract community directory lifecycle before page mounting. Risks are stale
session/route callbacks and lost sidebar refreshes. Preserve generation guards
and rerun startup/navigation, community lifecycle and guest/connected browser
flows after each reviewed extraction.

**Ponto importante:** implementation and branch delivery do not activate a VPS
release. Activation was explicitly authorized on 14/10/2026; follow the
[release contract](GIT_E_DEPLOY.md#public-profile-invitation-and-menu-release-authorized-on-14102026)
and confirm the publication receipt. Physical touch-device acceptance remains
separate from viewport tests.

## Menu Icons — 19/10/2026

The owner asked for WhatsApp-style glyphs before the labels of the app's action
menus, and for the contact row chevron to stay inside its frame. Covered menus:
contact/group row menu (including the mute durations and Back/Close), the "+"
create menu, the private chat header and connection popovers, private, group
and @ message menus, the @ conversation options, group member actions, the
communities "⋯" list and the hidden posts filter. Labels, order, handlers and
accessibility names are unchanged; glyphs are `aria-hidden`.

Private-side glyphs live in `src/client/menu-icons`, authored 24×24 line paths
with presentation attributes (no icon font, file or third-party set). Communities
keep their existing `communityIcon` set. The row chevron is now a drawn SVG
centered in its button; the former "⌄" text glyph sat low and looked off-frame.

The owner then asked for smaller rows. On desktop these menus use compact rows
of about 36 px (8–10 px padding, 2–4 px between rows, 6 px panel padding); the
chat header popover also drops the 16 px block margin around its section. With
`pointer: coarse` the rows keep a 44 px touch target.

**Ponto importante:** the GPL source bundle counts 1024 files after this change,
exactly its current ceiling in `src/tools/frontend-source.ts`. The next new
client file will fail the build until the owner reviews that limit; that is why
the glyph styles are attributes and per-menu rules instead of a new stylesheet.
