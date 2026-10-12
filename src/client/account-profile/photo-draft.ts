import { validatePhoto } from './photo-validation.ts';
type Photo = { type: string; bytes: Uint8Array<ArrayBuffer> } | null;
/** Separate candidate bytes ensure DM/profile sharing always reads the saved photo. */
export class PrivatePhotoDraft {
  private candidate: Photo | undefined;
  value(saved: Photo): Photo {
    return this.candidate === undefined ? saved : this.candidate;
  }
  dirty(): boolean {
    return this.candidate !== undefined;
  }
  async choose(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      validatePhoto(file.type, bytes);
    } catch (error: unknown) {
      bytes.fill(0);
      throw error;
    }
    this.clear();
    this.candidate = { type: file.type, bytes };
  }
  remove(): void {
    this.clear();
    this.candidate = null;
  }
  commit(profile: { photo: Photo }): void {
    if (this.candidate === undefined) return;
    profile.photo?.bytes.fill(0);
    profile.photo = this.candidate;
    this.candidate = undefined;
  }
  clear(): void {
    this.candidate?.bytes.fill(0);
    this.candidate = undefined;
  }
}
