/**
 * Desktop layouts render under a root CSS zoom (display-scale.css). Element
 * rects, innerWidth/innerHeight and pointer coordinates stay in viewport
 * pixels, while style lengths, offsetWidth and scrollTop use the zoomed
 * element's own pixels. Convert viewport values before mixing the two.
 */
export interface LayoutBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function scale(element: Element): number {
  const zoom = element.currentCSSZoom;
  return zoom > 0 ? zoom : 1;
}

/** A viewport length (rect distance, pointer delta) in the element's pixels. */
export function layoutLength(viewport: number, element: Element): number {
  return viewport / scale(element);
}

/** A getBoundingClientRect result in the pixels of `element`'s style lengths. */
export function layoutBox(rect: DOMRectReadOnly, element: Element): LayoutBox {
  const zoom = scale(element);
  return {
    left: rect.left / zoom,
    top: rect.top / zoom,
    right: rect.right / zoom,
    bottom: rect.bottom / zoom,
  };
}

/** The visible viewport in the pixels of `element`'s style lengths. */
export function layoutViewport(element: Element): {
  width: number;
  height: number;
} {
  const zoom = scale(element);
  return { width: window.innerWidth / zoom, height: window.innerHeight / zoom };
}
