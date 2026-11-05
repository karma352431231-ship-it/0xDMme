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

## Phone navigation, image zoom, ranking and dialogs

The phone Communities tab returns to where it was left: a profile, community or post stay open across other tabs, and leaving them returns to the exact feed position. Only the tab link's destination is held, in memory; a reload starts from the feed. Community pages and posts opened from the feed keep the page the way profiles already did. Each feed view remembers one position per visit, so Feed, Ranking and Mine can be switched without losing it. A feed view reached this way is read again from its saved cursor and anchored to the same post.

Two fingers on a public image open the viewer and keep zooming there; inside the viewer they zoom up to five times, one finger moves a zoomed image within its edges, and a tap still toggles zoom. The viewer owns its transform and gestures. The encrypted chat image viewer is unchanged.

Ranking on phones places what is ranked and the options on one row, then order, period and topics as equal pills. Search is removed from the ranking on every screen, and the user ranking uses the same order and period menus as the community ranking.

Contact dialogs on phones leave room for both system bars, which previously pushed the top of a tall dialog off the screen. The three ways to add a contact share one row.

## Community page layout and contact notices

A community page now reads like a public profile on every screen: one column without cards, a top bar with the way back, the name and options, then banner, photo, name, description, data line and Follow, then Posts and About and community rules as tabs when there is anything besides posts. Order, period and tag are the same compact menus as the feed; My posts and hidden posts are choices of the order menu. The write-a-post row is removed: inside a community the floating plus opens the composer on that community, and an empty community shows an invitation to write the first post.

Contact dialogs show only problems and next steps; confirmations appear as a toast. The invitation dialog keeps only its expiry note, with its actions on one row. The ranking panel hides the user order row while Communities is shown and aligns it with the panel while Users is shown. The score sits right beside the upvote arrow on every screen.

## Reply screen, follower notices and vote spacing

Replying to a post opens one screen on phones and a centered window on wider screens: a bar with Cancel, the title and Reply; the replied post as one line that opens to show it again; then the text with its emoji, GIF and file tools, without inner boxes. The post page uses the same screen instead of its own inline form.

A new follower now appears in Activity as "@name started following you". The notice exists only while the follow does: unfollowing withdraws it and following again is a new arrival. Blocked pairs receive none. It is in-app only, with no push. Migration 104 adds the table with the same storage accounting as the other public notices; there is no backfill of earlier follows.

The vote pill now has the same side margins and icon gap as the Reply and Share pills on every layout.
