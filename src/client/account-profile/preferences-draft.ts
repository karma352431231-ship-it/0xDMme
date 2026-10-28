export interface ProfilePreferences {
  discoverable: boolean;
  online: boolean;
  lastSeen: boolean;
  readReceipts: boolean;
  backupReminder: boolean;
}
export type PreferenceName = keyof ProfilePreferences;
/**
 * Active privacy behavior reads the committed preferences while the forms
 * edit drafted choices. Each form confirms only its own choices, so a choice
 * drafted in another form stays a draft until that form is confirmed.
 */
export class PrivatePreferencesDraft {
  private changes: Partial<ProfilePreferences> = {};
  value(saved: ProfilePreferences): ProfilePreferences {
    return { ...saved, ...this.changes };
  }
  set(saved: ProfilePreferences, name: PreferenceName, value: boolean): void {
    if (saved[name] === value) delete this.changes[name];
    else this.changes[name] = value;
  }
  /** The saved preferences with only the drafted choices among `names` applied. */
  only(
    saved: ProfilePreferences,
    names: readonly PreferenceName[],
  ): ProfilePreferences {
    const next = { ...saved };
    for (const name of names) {
      const drafted = this.changes[name];
      if (drafted !== undefined) next[name] = drafted;
    }
    return next;
  }
  /** Whether a choice differs from the saved one, among `names` when given. */
  changed(names?: readonly PreferenceName[]): boolean {
    const drafted = Object.keys(this.changes) as PreferenceName[];
    return names
      ? drafted.some((name) => names.includes(name))
      : drafted.length > 0;
  }
  /** The drafted `names` were saved; drafted choices of other forms remain. */
  commit(
    profile: { preferences: ProfilePreferences },
    names: readonly PreferenceName[],
  ): void {
    profile.preferences = this.only(profile.preferences, names);
    for (const name of names) delete this.changes[name];
  }
  clear(): void {
    this.changes = {};
  }
}
