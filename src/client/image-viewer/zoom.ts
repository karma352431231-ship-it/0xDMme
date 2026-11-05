import { layoutLength } from '../display-scale/index.ts';

export interface ZoomPoint {
  x: number;
  y: number;
}
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}
const fitted: ZoomState = { scale: 1, x: 0, y: 0 };
const tapScale = 2.5;
const maximumScale = 5;
/** Fingers may go slightly past fit while pinching; release returns to fit. */
const minimumGestureScale = 0.8;
/** Below this travel in pixels a touch is still a tap. */
const tapTravel = 8;

function centroid(points: readonly ZoomPoint[]): ZoomPoint {
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}
function spread(points: readonly ZoomPoint[]): number {
  const [a, b] = points;
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The transform that keeps the image point under the fingers under them. */
export function zoomedFrom(
  start: { state: ZoomState; points: readonly ZoomPoint[] },
  points: readonly ZoomPoint[],
  center: ZoomPoint,
): ZoomState {
  const before = spread(start.points),
    after = spread(points),
    ratio = before > 0 && after > 0 ? after / before : 1,
    scale = clamp(start.state.scale * ratio, minimumGestureScale, maximumScale),
    from = centroid(start.points),
    to = centroid(points),
    localX = (from.x - center.x - start.state.x) / start.state.scale,
    localY = (from.y - center.y - start.state.y) / start.state.scale;
  return {
    scale,
    x: to.x - center.x - scale * localX,
    y: to.y - center.y - scale * localY,
  };
}

/** On release: back to fit when barely zoomed, and never past the image edges. */
export function settledZoom(
  state: ZoomState,
  sizes: { image: { width: number; height: number }; frame: ZoomPoint },
): ZoomState {
  if (state.scale <= 1.02) return fitted;
  const limitX = Math.max(
      0,
      (sizes.image.width * state.scale - sizes.frame.x) / 2,
    ),
    limitY = Math.max(
      0,
      (sizes.image.height * state.scale - sizes.frame.y) / 2,
    );
  return {
    scale: state.scale,
    x: clamp(state.x, -limitX, limitX),
    y: clamp(state.y, -limitY, limitY),
  };
}

export interface ZoomGesture {
  /** The fingers currently down; an empty list ends the gesture. */
  track(points: readonly ZoomPoint[]): void;
}

/** Owns one viewer's zoom transform. The frame centers the image at fit. */
export class ZoomSurface implements ZoomGesture {
  private state = fitted;
  private start: { state: ZoomState; points: readonly ZoomPoint[] } | null =
    null;
  private fingers = 0;
  private moved = false;
  private readonly frame: HTMLElement;
  private readonly image: HTMLElement;
  private readonly zoomed: (on: boolean) => void;
  constructor(input: {
    frame: HTMLElement;
    image: HTMLElement;
    zoomed: (on: boolean) => void;
  }) {
    this.frame = input.frame;
    this.image = input.image;
    this.zoomed = input.zoomed;
  }
  track(points: readonly ZoomPoint[]): void {
    if (!points.length) {
      this.finish();
      return;
    }
    if (points.length !== this.fingers || !this.start) {
      this.fingers = points.length;
      this.start = { state: this.state, points };
      return;
    }
    // At fit a single finger has nothing to pan.
    if (points.length === 1 && this.start.state.scale <= 1) return;
    const next = zoomedFrom(this.start, points, this.center());
    const first = centroid(this.start.points),
      now = centroid(points);
    if (
      points.length > 1 ||
      Math.hypot(now.x - first.x, now.y - first.y) > tapTravel
    )
      this.moved = true;
    if (this.moved) this.paint(next, false);
  }
  /** A tap zooms in at its point, or returns to fit. */
  toggle(at?: ZoomPoint): void {
    if (this.state.scale > 1) {
      this.paint(fitted, true);
      return;
    }
    if (!at) {
      this.paint({ scale: tapScale, x: 0, y: 0 }, true);
      return;
    }
    const zoomed = zoomedFrom(
      { state: fitted, points: [at, { x: at.x + 1, y: at.y }] },
      [at, { x: at.x + tapScale, y: at.y }],
      this.center(),
    );
    this.paint(this.settled(zoomed), true);
  }
  /** True once after a drag or pinch, so its trailing click is not a tap. */
  takeMoved(): boolean {
    const moved = this.moved;
    this.moved = false;
    return moved;
  }
  private finish(): void {
    this.start = null;
    this.fingers = 0;
    if (this.moved) this.paint(this.settled(this.state), true);
  }
  private center(): ZoomPoint {
    const box = this.frame.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  private settled(state: ZoomState): ZoomState {
    const frame = this.frame.getBoundingClientRect(),
      image = this.image.getBoundingClientRect();
    return settledZoom(state, {
      image: {
        width: image.width / this.state.scale,
        height: image.height / this.state.scale,
      },
      frame: { x: frame.width, y: frame.height },
    });
  }
  private paint(state: ZoomState, settling: boolean): void {
    this.state = state;
    const x = layoutLength(state.x, this.image),
      y = layoutLength(state.y, this.image);
    this.image.style.transition = settling ? '' : 'none';
    this.image.style.transform =
      state.scale === 1
        ? ''
        : `translate(${x}px, ${y}px) scale(${state.scale})`;
    this.zoomed(state.scale > 1);
  }
}
