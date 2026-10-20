export function readPreparationProfile(
  environment: Readonly<Record<string, string | undefined>>,
): 'development' {
  const profile = environment['HASH_TALK_PROFILE'] ?? 'development';
  if (profile !== 'development') {
    throw new Error('This setup only accepts the development profile.');
  }
  return profile;
}
