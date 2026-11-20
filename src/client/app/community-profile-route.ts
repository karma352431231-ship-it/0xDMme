import { appHref, appRoute } from '../../shared/app-routes/index.ts';

/**
 * A public profile opened from the isolated Communities page stays on that
 * page (owner request, 20/11/2026): the side menu and the ranking remain and
 * the profile takes the centre, as `/communities?profile=…`. Phones keep their
 * own profile screen, and every other page keeps the `/users` address.
 */
export function communityProfileAddress(input: {
  address: string;
  from: string;
  phone: boolean;
}): string | null {
  if (input.phone || input.from !== 'comunidades') return null;
  const route = appRoute(input.address);
  if (route?.page !== 'users') return null;
  const profile = route.params.get('handle') ?? route.params.get('id');
  return profile
    ? appHref('communities', new URLSearchParams({ profile }))
    : null;
}
