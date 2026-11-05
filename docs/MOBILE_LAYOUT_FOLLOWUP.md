# Mobile layout follow-up — 2026-11-05

The owner requested phone insets for signed-out account entry, one horizontally scrollable discovery filter row including its period, and community options beside a shorter search field. Phone order/period controls use the native selector while sharing the existing selected value with desktop menus; choices, validation and feed loading remain unchanged.

Wallet selection omits the redundant detection paragraph, retains the mobile guidance, and gives the back action compact spacing. Installed builds refer to returning to the app; browser builds retain browser wording. Signing, account and recovery protocols do not change.

On phones, public profile editing and public profile viewing use the available content width without surrounding card frames. Only the description retains its field boundary; banner/avatar controls and existing profile actions remain available. Profile post actions stay compact and aligned. This supersedes the earlier phone editor presentation with one outer card; desktop profile framing is retained.

The existing account entry, discovery-control and public-profile modules own these presentation changes. There is no new persistence, domain state, global listener or dependency. Native selectors and desktop menus update the same current value.
