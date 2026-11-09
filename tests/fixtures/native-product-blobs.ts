/** Observe the actual app-created Blob without fetching its temporary URL.
 * This scoped observer neither changes CSP nor owns/revokes the product URL. */
export function observeProductBlobs(maximumBytes = 3 * 1024 * 1024): {
  read: (url: string) => Blob | undefined;
  dispose: () => void;
} {
  const descriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  if (!descriptor) throw new Error('The platform Blob URL API is unavailable.');
  const previous = URL.createObjectURL.bind(URL);
  const blobs = new Map<string, Blob>();
  URL.createObjectURL = (value) => {
    const url = previous(value);
    if (value instanceof Blob && value.size <= maximumBytes) {
      if (blobs.size >= 4) {
        const oldest = blobs.keys().next().value;
        if (oldest !== undefined) blobs.delete(oldest);
      }
      blobs.set(url, value);
    }
    return url;
  };
  return {
    read: (url) => blobs.get(url),
    dispose: () => {
      Object.defineProperty(URL, 'createObjectURL', descriptor);
      blobs.clear();
    },
  };
}
