export function readPreparationProfile(
  environment: Readonly<Record<string, string | undefined>>,
): 'development' {
  const profile = environment['HASH_TALK_PROFILE'] ?? 'development';
  if (profile !== 'development') {
    throw new Error('Esta base aceita somente o perfil development.');
  }
  return profile;
}
