interface MediaEntry {
  bytes: number;
  visible: boolean;
  dispose: () => void;
}
export interface RetainedPublicMedia {
  visibility: (visible: boolean) => void;
  release: () => void;
}

/** Mounted public media only. Keep at most 128 MiB / 48 off-screen files;
 * visible players are not interrupted. No persistent or external GIF cache. */
export class PublicMediaRetention {
  private readonly entries = new Set<MediaEntry>();
  private readonly maximumBytes = 128 * 1024 * 1024;
  private readonly maximumItems = 48;

  keep(input: MediaEntry): RetainedPublicMedia {
    const entry = { ...input };
    this.entries.add(entry);
    this.trim();
    return {
      visibility: (visible) => {
        if (!this.entries.delete(entry)) return;
        entry.visible = visible;
        this.entries.add(entry);
        this.trim();
      },
      release: () => {
        this.entries.delete(entry);
      },
    };
  }
  private trim(): void {
    const inactive = [...this.entries].filter((entry) => !entry.visible);
    let bytes = inactive.reduce((sum, entry) => sum + entry.bytes, 0);
    let count = inactive.length;
    for (const entry of inactive) {
      if (bytes <= this.maximumBytes && count <= this.maximumItems) break;
      this.entries.delete(entry);
      bytes -= entry.bytes;
      count--;
      entry.dispose();
    }
  }
}

export const retainedPublicMedia = new PublicMediaRetention();
