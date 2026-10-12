export interface ProfilePreferences {
  discoverable: boolean;
  online: boolean;
  lastSeen: boolean;
  readReceipts: boolean;
  backupReminder: boolean;
}
/** Active privacy behavior reads the committed preferences while the form edits a copy. */
export class PrivatePreferencesDraft {
  private candidate: ProfilePreferences | null = null;
  value(saved: ProfilePreferences): ProfilePreferences {
    return this.candidate ?? saved;
  }
  set(
    saved: ProfilePreferences,
    name: keyof ProfilePreferences,
    value: boolean,
  ): void {
    this.candidate = { ...this.value(saved), [name]: value };
  }
  commit(profile: { preferences: ProfilePreferences }): void {
    if (this.candidate) profile.preferences = this.candidate;
    this.clear();
  }
  clear(): void {
    this.candidate = null;
  }
}
