export type AgentMotionStatus = 'idle' | 'working' | 'reading' | 'waiting' | 'blocked';

export interface AgentMotionState {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  facingLeft: boolean;
  scaleX: number;
  scaleY: number;
  scaleVX: number;
  scaleVY: number;
  rotation: number;
  rotationVelocity: number;
}

interface AgentMotionBounds {
  minX: number;
  maxX: number;
  groundY: number;
}

interface DragReleaseOptions {
  vx?: number;
  vy?: number;
  facingLeft?: boolean;
}

const TAU = Math.PI * 2;
const RELEASE_GRAVITY = 2100;
const RELEASE_GROUND_FRICTION = 0.86;
const RELEASE_AIR_FRICTION = 0.97;
const RELEASE_BOUNCE_DAMPING = 0.34;
const RELEASE_WALL_BOUNCE_DAMPING = 0.3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function springStep(value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number) {
  const acceleration = ((target - value) * stiffness) - (velocity * damping);
  const nextVelocity = velocity + (acceleration * dt);
  const nextValue = value + (nextVelocity * dt);
  return { value: nextValue, velocity: nextVelocity };
}

function bobSettings(status: AgentMotionStatus) {
  if (status === 'working') {
    return { amplitude: 6, frequency: 4.8, drift: 10, lean: 0.08 };
  }

  if (status === 'reading') {
    return { amplitude: 4.5, frequency: 3.1, drift: 6, lean: 0.045 };
  }

  if (status === 'waiting') {
    return { amplitude: 2.6, frequency: 1.7, drift: 3, lean: 0.02 };
  }

  if (status === 'blocked') {
    return { amplitude: 3.5, frequency: 2.3, drift: 4, lean: 0.03 };
  }

  return { amplitude: 5, frequency: 3.6, drift: 8, lean: 0.06 };
}

export function createAgentMotionState(x: number, y: number, phaseSeed: number): AgentMotionState {
  return {
    anchorX: x,
    anchorY: y,
    x,
    y,
    vx: 0,
    vy: 0,
    phase: phaseSeed,
    facingLeft: false,
    scaleX: 1,
    scaleY: 1,
    scaleVX: 0,
    scaleVY: 0,
    rotation: 0,
    rotationVelocity: 0,
  };
}

export function settleDraggedAgentMotion(state: AgentMotionState, x: number, y: number, release?: DragReleaseOptions) {
  const previousAnchorX = state.anchorX;
  state.anchorX = x;
  state.anchorY = y;
  state.x = x;
  state.y = y;
  state.vx = release?.vx ?? 0;
  state.vy = release?.vy ?? 0;
  state.scaleVX = 0;
  state.scaleVY = 0;
  state.rotationVelocity = (release?.vx ?? 0) / 560;
  state.facingLeft = release?.facingLeft ?? (x < previousAnchorX);
}

export function resetDraggingAgentMotion(state: AgentMotionState) {
  state.vx = 0;
  state.vy = 0;
  state.scaleVX = 0;
  state.scaleVY = 0;
  state.rotationVelocity = 0;
  state.scaleX = 1;
  state.scaleY = 1;
  state.rotation = 0;
}

export function stepAgentMotion(
  state: AgentMotionState,
  status: AgentMotionStatus,
  now: number,
  dt: number,
  bounds: AgentMotionBounds,
) {
  const seconds = now / 1000;
  const settings = bobSettings(status);
  const inReleaseMotion = Math.abs(state.vx) > 6 || Math.abs(state.vy) > 6 || Math.abs(state.y - bounds.groundY) > 1.5;

  if (inReleaseMotion) {
    state.vy += RELEASE_GRAVITY * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;

    if (state.x < bounds.minX || state.x > bounds.maxX) {
      state.x = clamp(state.x, bounds.minX, bounds.maxX);
      state.vx *= -RELEASE_WALL_BOUNCE_DAMPING;
    }

    if (state.y >= bounds.groundY) {
      state.y = bounds.groundY;
      if (Math.abs(state.vy) > 44) {
        state.vy = -Math.min(Math.abs(state.vy) * RELEASE_BOUNCE_DAMPING, 220);
      } else {
        state.vy = 0;
      }
      state.vx *= RELEASE_GROUND_FRICTION;
    } else {
      state.vx *= RELEASE_AIR_FRICTION;
    }

    if (Math.abs(state.vx) < 8) {
      state.vx = 0;
    }

    if (state.y === bounds.groundY && state.vy === 0 && Math.abs(state.vx) < 10) {
      state.anchorX = clamp(state.x, bounds.minX, bounds.maxX);
      state.anchorY = bounds.groundY;
      state.x = state.anchorX;
    }
  } else {
    const primaryWave = Math.sin((seconds * settings.frequency) + state.phase);
    const secondaryWave = Math.sin((seconds * (settings.frequency * 1.7)) + (state.phase * 1.37));
    const driftWave = Math.sin((seconds * 0.55) + (state.phase * 0.8));
    const driftWaveSecondary = Math.sin((seconds * 0.21) + (state.phase * 1.61));

    state.anchorY = bounds.groundY;

    const targetX = clamp(
      state.anchorX + (driftWave * settings.drift) + (driftWaveSecondary * settings.drift * 0.35),
      bounds.minX,
      bounds.maxX,
    );
    const targetY = state.anchorY + (primaryWave * settings.amplitude) + (secondaryWave * settings.amplitude * 0.22);

    const nextX = springStep(state.x, state.vx, targetX, 32, 8.5, dt);
    state.x = nextX.value;
    state.vx = nextX.velocity;

    const nextY = springStep(state.y, state.vy, targetY, 42, 10.5, dt);
    state.y = nextY.value;
    state.vy = nextY.velocity;

    state.phase = (state.phase + (dt * 0.06)) % TAU;
  }

  if (Math.abs(state.vx) > 4) {
    state.facingLeft = state.vx < 0;
  }

  const primaryWave = Math.sin((seconds * settings.frequency) + state.phase);
  const driftWave = Math.sin((seconds * 0.55) + (state.phase * 0.8));
  const compression = clamp(Math.max(0, state.vy) / 320, 0, 0.16);
  const stretch = clamp(Math.max(0, -state.vy) / 420, 0, 0.1);
  const swayStretch = clamp(primaryWave * 0.04, -0.03, 0.05);
  const targetScaleX = clamp(1 + compression - stretch + Math.max(0, swayStretch), 0.9, 1.18);
  const targetScaleY = clamp(1 - (compression * 0.72) + stretch - (Math.max(0, swayStretch) * 0.65), 0.84, 1.14);
  const targetRotation = clamp((state.vx / 540) + (driftWave * settings.lean), -0.16, 0.16);

  const nextScaleX = springStep(state.scaleX, state.scaleVX, targetScaleX, 55, 10.5, dt);
  state.scaleX = nextScaleX.value;
  state.scaleVX = nextScaleX.velocity;

  const nextScaleY = springStep(state.scaleY, state.scaleVY, targetScaleY, 55, 10.5, dt);
  state.scaleY = nextScaleY.value;
  state.scaleVY = nextScaleY.velocity;

  const nextRotation = springStep(state.rotation, state.rotationVelocity, targetRotation, 40, 9.5, dt);
  state.rotation = nextRotation.value;
  state.rotationVelocity = nextRotation.velocity;

  return {
    x: state.x,
    y: state.y,
    scaleX: state.scaleX,
    scaleY: state.scaleY,
    rotation: state.rotation,
    facingLeft: state.facingLeft,
  };
}
