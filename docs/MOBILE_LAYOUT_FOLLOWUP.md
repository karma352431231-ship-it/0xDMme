# Mobile layout follow-up — 2026-11-05

The owner requested phone insets for signed-out account entry, one horizontally scrollable discovery filter row including its period, and community options beside a shorter search field. Phone order/period controls use the same compact menu as desktop; choices, validation and feed loading remain unchanged.

Wallet selection omits the redundant detection paragraph, retains the mobile guidance, and gives the back action compact spacing. Installed builds refer to returning to the app; browser builds retain browser wording. Signing, account and recovery protocols do not change.

On phones, public profile editing uses the full screen width without surrounding card frames. Only the description retains its field boundary; banner/avatar controls remain available. This supersedes the earlier phone editor presentation with one outer card.

The existing account entry, discovery-control and public-profile modules own these presentation changes. There is no new persistence, domain state, global listener or dependency.

## Public profile layout and filter menus

Every screen, including the panel beside the chat, now shows a public profile in one column: a top bar with the way back, the handle and the options menu; the banner, photo, name, description and a follower and join-date line; Message, Follow and the notification bell; then tabs for Posts, Replies, Shared and Communities. The numbers that used to sit in a separate table live on those tabs. Overview is removed, so posts and shares no longer mix: shares appear only under Shared. Entries in the activity list omit the author the page already names and lead with their community; shared entries keep their original author.

System selectors cannot be resized on Android or iPhone, so the phone filter row uses the compact menu. Its panel is fixed to the screen because the row scrolls sideways and would clip it; scrolling or resizing closes it.

The public handle list no longer offers a separate local-copies page. Local copies remain available offline and in the full handle message list.

Create invitation in the add-contact dialog is now bound when the dialog is mounted. It previously worked only after the Contacts page had been opened once.

The header module owns the profile identity presentation; the page module keeps tab selection and activity loading; the discovery menu moved out of the post controls into its own module, which owns the panel placement and its listeners.
