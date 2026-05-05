import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { AppTheme } from '../../lib/theme';
import {
  createAgentMotionState,
  resetDraggingAgentMotion,
  settleDraggedAgentMotion,
  stepAgentMotion,
  type AgentMotionState,
} from './agentMotion';

export interface DesktopAgentSceneEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteWidth: number;
  spriteHeight: number;
  status: 'idle' | 'working' | 'reading' | 'waiting' | 'blocked';
  color: string;
  imageSrc?: string | null;
  bubbleText?: string | null;
}

interface DesktopAgentSceneProps {
  sceneId?: string | null;
  agents: ReadonlyArray<DesktopAgentSceneEntity>;
  theme: AppTheme;
  className?: string;
  onAgentClick?: (agentId: string) => void;
  onAgentDragEnd?: (agentId: string, x: number, y: number) => void;
}

interface BubbleThemeTokens {
  readonly fill: number;
  readonly border: number;
  readonly shadow: number;
  readonly text: string;
}

interface SceneNode {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Graphics;
  halo: Phaser.GameObjects.Graphics;
  fallback: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
  hitbox: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  labelBackdrop: Phaser.GameObjects.Graphics;
  bubble: Phaser.GameObjects.Container;
  bubbleBackdrop: Phaser.GameObjects.Graphics;
  bubbleTail: Phaser.GameObjects.Graphics;
  bubbleText: Phaser.GameObjects.Text;
}

interface AgentSceneMotionState extends AgentMotionState {
  collisionOffsetX: number;
  collisionVelocityX: number;
  presence: 'entering' | 'active' | 'exiting';
  dragSampleAt?: number;
}

interface SceneBridge {
  onAgentClick?: (agentId: string) => void;
  onAgentDragEnd?: (agentId: string, x: number, y: number) => void;
}

const STATUS_TINT: Record<DesktopAgentSceneEntity['status'], number> = {
  idle: 0x8f8466,
  working: 0xf59e0b,
  reading: 0x60a5fa,
  waiting: 0xc084fc,
  blocked: 0xfb7185,
};

const RELEASE_VELOCITY_LIMIT = 640;
const AGENT_COLLISION_RADIUS = 46;
const AGENT_COLLISION_PUSH = 560;
const AGENT_COLLISION_DAMPING = 0.82;
const AGENT_COLLISION_SPRING = 14;
const AGENT_COLLISION_MAX_OFFSET = 36;
const AGENT_DRAG_THRESHOLD = 12;
const PORTAL_MARGIN_LEFT = 40;
const PORTAL_WIDTH = 92;
const PORTAL_HEIGHT = 144;
const PORTAL_AGENT_OFFSET_X = 10;
const PORTAL_EXIT_THRESHOLD = 18;
const BUBBLE_THEME: Record<AppTheme, BubbleThemeTokens> = {
  pipboy: {
    fill: 0x1b1f2a,
    border: 0xd9b37c,
    shadow: 0x07090f,
    text: '#f4efe1',
  },
  papernote: {
    fill: 0xf7f0e3,
    border: 0x8f6b53,
    shadow: 0xcdbba5,
    text: '#2f241d',
  },
  'papernote-dark': {
    fill: 0x232734,
    border: 0xd7bf97,
    shadow: 0x0b0e14,
    text: '#f6efe2',
  },
};

function getBubbleTheme(theme: AppTheme): BubbleThemeTokens {
  return BUBBLE_THEME[theme] ?? BUBBLE_THEME.pipboy;
}

interface AgentHitboxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function colorToNumber(value: string) {
  return Number.parseInt(value.replace('#', ''), 16);
}

function textureKeyFor(imageSrc: string) {
  return `agent-texture:${imageSrc}`;
}

function getAgentHitboxGeometry(entity: DesktopAgentSceneEntity): AgentHitboxGeometry {
  const width = Math.round(Math.min(entity.width * 0.56, entity.spriteWidth * 0.6));
  const height = Math.round(Math.min(entity.height * 0.62, entity.spriteHeight * 0.82));
  const x = -Math.round(width / 2);
  const y = -Math.round(entity.spriteHeight * 0.28);

  return {
    x,
    y,
    width,
    height,
    radius: Math.round(Math.min(width, height) * 0.32),
  };
}

class DesktopWorldScene extends Phaser.Scene {
  private entities = new Map<string, DesktopAgentSceneEntity>();
  private nodes = new Map<string, SceneNode>();
  private motion = new Map<string, AgentSceneMotionState>();
  private dragging = new Set<string>();
  private bridge: SceneBridge = {};
  private imageLoads = new Map<string, Promise<string | null>>();
  private portalGlow?: Phaser.GameObjects.Graphics;
  private portalFrame?: Phaser.GameObjects.Graphics;
  private portalCore?: Phaser.GameObjects.Graphics;
  private theme: AppTheme = 'pipboy';

  constructor() {
    super('desktop-world-scene');
  }

  setBridge(bridge: SceneBridge) {
    this.bridge = bridge;
  }

  setTheme(theme: AppTheme) {
    this.theme = theme;
    for (const [id, node] of this.nodes.entries()) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      this.syncStaticNode(node, entity);
    }
  }

  applySnapshot(entities: ReadonlyArray<DesktopAgentSceneEntity>) {
    const liveIds = new Set<string>();

    for (const entity of entities) {
      liveIds.add(entity.id);
      const existing = this.entities.get(entity.id);
      this.entities.set(entity.id, entity);
      const node = this.ensureNode(entity);
      const motion = existing ? this.ensureMotionState(entity) : this.ensureMotionState(entity, this.getPortalAnchor(entity));

      if (!existing) {
        motion.anchorX = entity.x;
        motion.anchorY = entity.y;
        motion.presence = 'entering';
        motion.x = this.getPortalAnchor(entity).x;
        motion.y = this.getPortalAnchor(entity).y;
      } else if (motion.presence === 'exiting') {
        motion.presence = 'entering';
      }

      if (!this.dragging.has(entity.id)) {
        motion.anchorX = entity.x;
        motion.anchorY = entity.y;
      }

      this.syncStaticNode(node, entity);
    }

    for (const [id, node] of this.nodes.entries()) {
      if (liveIds.has(id)) continue;
      const entity = this.entities.get(id);
      const motion = this.motion.get(id);
      if (!entity || !motion) continue;
      if (motion.presence === 'exiting') continue;

      motion.presence = 'exiting';
      motion.anchorX = this.getPortalAnchor(entity).x;
      motion.anchorY = this.getPortalAnchor(entity).y;
      node.hitbox.disableInteractive();
    }
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.input.dragDistanceThreshold = AGENT_DRAG_THRESHOLD;
    this.portalGlow = this.add.graphics();
    this.portalFrame = this.add.graphics();
    this.portalCore = this.add.graphics();
  }

  update(time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (dt <= 0) return;
    this.syncPortal(time);

    const activeIds: string[] = [];
    const basePositions = new Map<string, { x: number; y: number }>();
    const worldWidth = this.scale.width;
    const worldHeight = this.scale.height;

    for (const entity of this.entities.values()) {
      const motion = this.ensureMotionState(entity);
      if (this.dragging.has(entity.id)) {
        this.syncDynamicNode(this.ensureNode(entity), entity, motion, motion.x, motion.y);
        continue;
      }

      activeIds.push(entity.id);
      const pose = stepAgentMotion(motion, entity.status, time, dt, {
        minX: 0,
        maxX: Math.max(0, worldWidth - entity.width),
        groundY: Math.max(0, worldHeight - entity.height - 10),
      });

      motion.collisionVelocityX += (-motion.collisionOffsetX * AGENT_COLLISION_SPRING) * dt;
      motion.collisionVelocityX *= Math.pow(AGENT_COLLISION_DAMPING, dt * 60);
      motion.collisionOffsetX += motion.collisionVelocityX * dt;
      motion.collisionOffsetX = clamp(motion.collisionOffsetX, -AGENT_COLLISION_MAX_OFFSET, AGENT_COLLISION_MAX_OFFSET);

      motion.scaleX = pose.scaleX;
      motion.scaleY = pose.scaleY;
      motion.rotation = pose.rotation;
      motion.facingLeft = pose.facingLeft;

      if (motion.presence === 'entering' && Math.abs(pose.x - motion.anchorX) < 14) {
        motion.presence = 'active';
      }

      basePositions.set(entity.id, { x: pose.x, y: pose.y });
    }

    for (let index = 0; index < activeIds.length; index += 1) {
      const aId = activeIds[index];
      const aMotion = this.motion.get(aId);
      const aBase = basePositions.get(aId);
      const aEntity = this.entities.get(aId);
      if (!aMotion || !aBase || !aEntity) continue;

      for (let otherIndex = index + 1; otherIndex < activeIds.length; otherIndex += 1) {
        const bId = activeIds[otherIndex];
        const bMotion = this.motion.get(bId);
        const bBase = basePositions.get(bId);
        const bEntity = this.entities.get(bId);
        if (!bMotion || !bBase || !bEntity) continue;

        const aCenterX = aBase.x + (aEntity.width / 2) + aMotion.collisionOffsetX;
        const bCenterX = bBase.x + (bEntity.width / 2) + bMotion.collisionOffsetX;
        const verticalGap = Math.abs((aBase.y + aEntity.height) - (bBase.y + bEntity.height));
        if (verticalGap > aEntity.height * 0.45) continue;

        let dx = bCenterX - aCenterX;
        if (Math.abs(dx) < 0.001) {
          dx = aId < bId ? 0.001 : -0.001;
        }

        const distance = Math.abs(dx);
        if (distance >= AGENT_COLLISION_RADIUS * 2) continue;

        const overlap = 1 - (distance / (AGENT_COLLISION_RADIUS * 2));
        const impulse = overlap * AGENT_COLLISION_PUSH * dt;
        const direction = dx > 0 ? 1 : -1;

        aMotion.collisionVelocityX -= direction * impulse;
        bMotion.collisionVelocityX += direction * impulse;
      }
    }

    for (const entity of this.entities.values()) {
      const motion = this.ensureMotionState(entity);
      const node = this.ensureNode(entity);

      if (this.dragging.has(entity.id)) {
        this.syncDynamicNode(node, entity, motion, motion.x, motion.y);
        continue;
      }

      const base = basePositions.get(entity.id);
      if (!base) continue;

      const x = clamp(base.x + motion.collisionOffsetX, 0, Math.max(0, worldWidth - entity.width));
      const y = base.y;
      this.syncDynamicNode(node, entity, motion, x, y);

      if (motion.presence === 'exiting') {
        const portal = this.getPortalAnchor(entity);
        if (Math.abs(x - portal.x) <= PORTAL_EXIT_THRESHOLD) {
          this.entities.delete(entity.id);
          this.motion.delete(entity.id);
          this.dragging.delete(entity.id);
          node.container.destroy(true);
          this.nodes.delete(entity.id);
        }
      }
    }
  }

  private ensureMotionState(entity: DesktopAgentSceneEntity, initialPosition?: { x: number; y: number }) {
    const existing = this.motion.get(entity.id);
    if (existing) {
      return existing;
    }

    const spawn = initialPosition ?? { x: entity.x, y: entity.y };
    const created: AgentSceneMotionState = {
      ...createAgentMotionState(spawn.x, spawn.y, this.motion.size * 0.75),
      collisionOffsetX: 0,
      collisionVelocityX: 0,
      presence: initialPosition ? 'entering' : 'active',
    };
    this.motion.set(entity.id, created);
    return created;
  }

  private getPortalAnchor(entity: DesktopAgentSceneEntity) {
    const groundY = Math.max(0, this.scale.height - entity.height - 10);
    return {
      x: PORTAL_MARGIN_LEFT + PORTAL_AGENT_OFFSET_X,
      y: groundY,
    };
  }

  private syncPortal(time: number) {
    if (!this.portalGlow || !this.portalFrame || !this.portalCore) return;

    const baseX = PORTAL_MARGIN_LEFT;
    const baseY = Math.max(18, this.scale.height - PORTAL_HEIGHT - 24);
    const pulse = 0.72 + (Math.sin(time / 520) * 0.08);

    this.portalGlow.clear();
    this.portalGlow.fillStyle(0x8b5cf6, 0.16);
    this.portalGlow.fillEllipse(baseX + (PORTAL_WIDTH / 2), baseY + (PORTAL_HEIGHT / 2), PORTAL_WIDTH * 1.5, PORTAL_HEIGHT * 1.14);
    this.portalGlow.fillStyle(0xf59e0b, 0.18 * pulse);
    this.portalGlow.fillEllipse(baseX + (PORTAL_WIDTH / 2), baseY + PORTAL_HEIGHT + 18, PORTAL_WIDTH * 1.05, 24);
    this.portalGlow.setDepth(1);

    this.portalCore.clear();
    this.portalCore.fillStyle(0x070b12, 0.94);
    this.portalCore.fillRoundedRect(baseX + 10, baseY + 10, PORTAL_WIDTH - 20, PORTAL_HEIGHT - 18, 18);
    this.portalCore.fillStyle(0x8b5cf6, 0.22 + (Math.sin(time / 320) * 0.04));
    this.portalCore.fillRoundedRect(baseX + 18, baseY + 18, PORTAL_WIDTH - 36, PORTAL_HEIGHT - 34, 14);
    this.portalCore.setDepth(2);

    this.portalFrame.clear();
    this.portalFrame.lineStyle(4, 0xf5d88c, 0.88);
    this.portalFrame.strokeRoundedRect(baseX, baseY, PORTAL_WIDTH, PORTAL_HEIGHT, 24);
    this.portalFrame.lineStyle(2, 0xf59e0b, 0.76);
    this.portalFrame.strokeRoundedRect(baseX + 6, baseY + 6, PORTAL_WIDTH - 12, PORTAL_HEIGHT - 12, 20);
    this.portalFrame.setDepth(3);
  }

  private ensureNode(entity: DesktopAgentSceneEntity) {
    const existing = this.nodes.get(entity.id);
    if (existing) {
      return existing;
    }

    const container = this.add.container(0, 0);
    const shadow = this.add.graphics();
    const halo = this.add.graphics();
    const fallback = this.add.graphics();
    const sprite = this.add.image(0, 0, '__MISSING').setVisible(false);
    const hitbox = this.add.graphics();
    const labelBackdrop = this.add.graphics();
    const label = this.add.text(0, 0, entity.name, {
      fontFamily: 'var(--font-display, Inter, sans-serif)',
      fontSize: '10px',
      color: '#f5d88c',
      align: 'center',
    }).setOrigin(0.5, 0);

    const bubble = this.add.container(0, 0);
    const bubbleBackdrop = this.add.graphics();
    const bubbleTail = this.add.graphics();
    const bubbleText = this.add.text(0, 0, '', {
      fontFamily: 'Inter, sans-serif',
      fontSize: '11px',
      color: getBubbleTheme(this.theme).text,
      wordWrap: { width: 164, useAdvancedWrap: true },
      maxLines: 3,
      lineSpacing: 2,
      align: 'left',
    }).setOrigin(0.5, 0);

    bubble.add([bubbleBackdrop, bubbleTail, bubbleText]);
    container.add([shadow, halo, fallback, sprite, hitbox, bubble, labelBackdrop, label]);

    const hitboxGeometry = getAgentHitboxGeometry(entity);
    container.setSize(entity.width, entity.height);
    // Keep one authoritative pointer target per agent. Every other child stays visual-only.
    hitbox.setInteractive(
      new Phaser.Geom.Rectangle(hitboxGeometry.x, hitboxGeometry.y, hitboxGeometry.width, hitboxGeometry.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.input.setDraggable(hitbox);

    let pointerDown = { x: 0, y: 0, dragged: false };
    let dragOffset = { x: 0, y: 0 };
    hitbox.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointerDown = { x: pointer.x, y: pointer.y, dragged: false };
      const motion = this.ensureMotionState(entity);
      dragOffset = {
        x: pointer.x - motion.x,
        y: pointer.y - motion.y,
      };
    });

    hitbox.on('dragstart', () => {
      const motion = this.ensureMotionState(entity);
      this.dragging.add(entity.id);
      settleDraggedAgentMotion(motion, motion.anchorX, motion.anchorY);
      resetDraggingAgentMotion(motion);
      motion.scaleX = 0.94;
      motion.scaleY = 1.08;
      motion.rotation = 0;
      motion.collisionOffsetX = 0;
      motion.collisionVelocityX = 0;
      motion.dragSampleAt = performance.now();
      this.syncDynamicNode(this.ensureNode(entity), entity, motion, motion.x, motion.y);
    });

    hitbox.on('drag', (pointer: Phaser.Input.Pointer) => {
      const pointerDx = Math.abs(pointer.x - pointerDown.x);
      const pointerDy = Math.abs(pointer.y - pointerDown.y);
      if (pointerDx > AGENT_DRAG_THRESHOLD || pointerDy > AGENT_DRAG_THRESHOLD) {
        pointerDown.dragged = true;
      }
      const motion = this.ensureMotionState(entity);
      const sampleAt = performance.now();
      const sampleDt = motion.dragSampleAt ? Math.max((sampleAt - motion.dragSampleAt) / 1000, 1 / 120) : 1 / 60;
      const x = clamp(pointer.x - dragOffset.x, 0, Math.max(0, this.scale.width - entity.width));
      const y = clamp(pointer.y - dragOffset.y, 0, Math.max(0, this.scale.height - entity.height));

      motion.vx = clamp((x - motion.x) / sampleDt, -RELEASE_VELOCITY_LIMIT, RELEASE_VELOCITY_LIMIT);
      motion.vy = clamp((y - motion.y) / sampleDt, -RELEASE_VELOCITY_LIMIT, RELEASE_VELOCITY_LIMIT);
      motion.x = x;
      motion.y = y;
      motion.anchorX = x;
      motion.anchorY = y;
      motion.dragSampleAt = sampleAt;
      const compression = clamp(Math.max(0, motion.vy) / 1500, 0, 0.14);
      const stretch = clamp(Math.max(0, -motion.vy) / 1700, 0, 0.12);
      motion.scaleX = clamp(0.96 + compression - stretch + (Math.abs(motion.vx) / 5200), 0.9, 1.16);
      motion.scaleY = clamp(1.04 - (compression * 0.72) + stretch, 0.9, 1.14);
      motion.rotation = clamp(motion.vx / 1100, -0.12, 0.12);
      if (Math.abs(motion.vx) > 8) {
        motion.facingLeft = motion.vx < 0;
      }
      motion.collisionOffsetX = 0;
      motion.collisionVelocityX = 0;

      this.syncDynamicNode(this.ensureNode(entity), entity, motion, x, y);
    });

    hitbox.on('dragend', () => {
      const motion = this.ensureMotionState(entity);
      this.dragging.delete(entity.id);

      if (!pointerDown.dragged) {
        resetDraggingAgentMotion(motion);
        delete motion.dragSampleAt;
        this.syncDynamicNode(this.ensureNode(entity), entity, motion, motion.anchorX, motion.anchorY);
        return;
      }

      const groundY = Math.max(0, this.scale.height - entity.height - 10);
      let x = clamp(motion.x, 0, Math.max(0, this.scale.width - entity.width));
      let y = clamp(motion.y, 0, Math.max(0, this.scale.height - entity.height));
      const releaseOnGround = y >= groundY - 4;
      const releaseVx = clamp(motion.vx, -RELEASE_VELOCITY_LIMIT, RELEASE_VELOCITY_LIMIT);
      let releaseVy = clamp(motion.vy, -RELEASE_VELOCITY_LIMIT, RELEASE_VELOCITY_LIMIT);

      if (releaseOnGround) {
        y = groundY;
        releaseVy = Math.min(releaseVy, 0);
        if (Math.abs(releaseVx) > 80 && Math.abs(releaseVy) < 120) {
          releaseVy = -Math.min(90 + (Math.abs(releaseVx) * 0.12), 170);
        }
      }

      settleDraggedAgentMotion(motion, x, y, {
        vx: releaseVx,
        vy: releaseVy,
        facingLeft: Math.abs(releaseVx) > 8 ? releaseVx < 0 : motion.facingLeft,
      });
      motion.collisionOffsetX = 0;
      motion.collisionVelocityX = 0;
      delete motion.dragSampleAt;
      this.bridge.onAgentDragEnd?.(entity.id, x, y);
    });

    hitbox.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointerDown.dragged) return;
      const dx = Math.abs(pointer.x - pointerDown.x);
      const dy = Math.abs(pointer.y - pointerDown.y);
      if (dx > AGENT_DRAG_THRESHOLD || dy > AGENT_DRAG_THRESHOLD) return;
      this.bridge.onAgentClick?.(entity.id);
    });

    const created: SceneNode = {
      container,
      shadow,
      halo,
      fallback,
      sprite,
      hitbox,
      label,
      labelBackdrop,
      bubble,
      bubbleBackdrop,
      bubbleTail,
      bubbleText,
    };

    this.nodes.set(entity.id, created);
    return created;
  }

  private syncStaticNode(node: SceneNode, entity: DesktopAgentSceneEntity) {
    const statusTint = STATUS_TINT[entity.status];
    const fallbackTint = colorToNumber(entity.color);

    node.halo.clear();

    node.fallback.clear();
    node.fallback.fillStyle(fallbackTint, entity.imageSrc ? 0 : 0.9);
    node.fallback.lineStyle(2, statusTint, entity.imageSrc ? 0 : 0.6);
    node.fallback.fillRoundedRect(-(entity.spriteWidth * 0.18), -(entity.spriteHeight * 0.34), entity.spriteWidth * 0.36, entity.spriteHeight * 0.68, 14);
    node.fallback.strokeRoundedRect(-(entity.spriteWidth * 0.18), -(entity.spriteHeight * 0.34), entity.spriteWidth * 0.36, entity.spriteHeight * 0.68, 14);

    const hitboxGeometry = getAgentHitboxGeometry(entity);
    const hitArea = node.hitbox.input?.hitArea;
    if (hitArea instanceof Phaser.Geom.Rectangle) {
      hitArea.setTo(hitboxGeometry.x, hitboxGeometry.y, hitboxGeometry.width, hitboxGeometry.height);
    } else if (!node.hitbox.input?.enabled) {
      node.hitbox.setInteractive(
        new Phaser.Geom.Rectangle(hitboxGeometry.x, hitboxGeometry.y, hitboxGeometry.width, hitboxGeometry.height),
        Phaser.Geom.Rectangle.Contains,
      );
    }

    node.hitbox.clear();

    node.label.setText(entity.name);
    const labelBounds = node.label.getBounds();
    node.label.setPosition(0, 46);
    node.labelBackdrop.clear();
    node.labelBackdrop.fillStyle(0x13161f, 0.96);
    node.labelBackdrop.fillRect(-(labelBounds.width / 2) - 8, 44, labelBounds.width + 16, labelBounds.height + 4);

    this.syncBubble(node, entity);
    void this.syncSprite(node, entity);
  }

  private syncDynamicNode(node: SceneNode, entity: DesktopAgentSceneEntity, motion: AgentSceneMotionState, x: number, y: number) {
    const portal = this.getPortalAnchor(entity);
    const portalDistance = Math.abs(x - portal.x);
    const portalFade = clamp(portalDistance / 72, 0, 1);
    const alpha = motion.presence === 'exiting'
      ? portalFade
      : motion.presence === 'entering'
        ? clamp(0.2 + (portalFade * 0.8), 0.2, 1)
        : 1;

    node.container.setPosition(x + (entity.width / 2), y + (entity.height / 2));
    node.container.setDepth(Math.round(y + entity.height));
    node.container.setRotation(motion.rotation);
    node.container.setScale(Math.max(0.82, motion.scaleX), Math.max(0.82, motion.scaleY));
    node.container.setAlpha(alpha);
    node.sprite.setScale(motion.facingLeft ? -1 : 1, 1);

    const lift = clamp(Math.max(0, motion.anchorY - y), 0, 48);
    const shadowScaleX = clamp(1.02 - (lift / 160), 0.72, 1.02);
    const shadowScaleY = clamp(0.38 - (lift / 260), 0.18, 0.38);
    const shadowAlpha = clamp(0.22 - (lift / 260), 0.08, 0.22);
    node.shadow.clear();
    node.shadow.fillStyle(0x05070d, shadowAlpha);
    node.shadow.fillEllipse(0, 34, entity.spriteWidth * shadowScaleX, entity.spriteHeight * shadowScaleY);

    const rotationDegrees = motion.rotation * (180 / Math.PI);
    const hitboxOffsetY = ((1 - motion.scaleY) * 52) - (Math.max(0, motion.scaleX - 1) * 10);
    const bubbleOffsetX = clamp((rotationDegrees * 1.35) + ((motion.scaleX - 1) * 20), -14, 14);
    const bubbleOffsetY = clamp(hitboxOffsetY - 30 - (Math.max(0, motion.scaleY - 1) * 24), -52, 0);
    const bubbleScale = clamp(1 + (Math.max(0, motion.scaleY - 1) * 0.18), 1, 1.04);

    node.label.setY(46 + (hitboxOffsetY * 0.24));
    node.labelBackdrop.setY(hitboxOffsetY * 0.24);
    node.bubble.setPosition(bubbleOffsetX, -92 + bubbleOffsetY);
    node.bubble.setScale(bubbleScale);
  }

  private syncBubble(node: SceneNode, entity: DesktopAgentSceneEntity) {
    const bubbleTheme = getBubbleTheme(this.theme);
    const bubbleText = entity.bubbleText?.trim() ?? '';
    node.bubble.setVisible(bubbleText.length > 0);
    if (!bubbleText) {
      return;
    }

    node.bubbleText.setColor(bubbleTheme.text);
    node.bubbleText.setText(bubbleText);
    const bounds = node.bubbleText.getBounds();
    const width = Math.min(196, Math.max(104, bounds.width + 28));
    const height = Math.max(42, bounds.height + 24);

    node.bubbleText.setPosition(0, -(height / 2) + 12);

    node.bubbleBackdrop.clear();
    node.bubbleBackdrop.fillStyle(bubbleTheme.shadow, 0.26);
    node.bubbleBackdrop.fillRoundedRect(-(width / 2) + 2, -(height / 2) + 3, width, height, 12);
    node.bubbleBackdrop.fillStyle(bubbleTheme.fill, 0.96);
    node.bubbleBackdrop.lineStyle(1.5, bubbleTheme.border, 0.95);
    node.bubbleBackdrop.fillRoundedRect(-(width / 2), -(height / 2), width, height, 12);
    node.bubbleBackdrop.strokeRoundedRect(-(width / 2), -(height / 2), width, height, 12);

    node.bubbleTail.clear();
    node.bubbleTail.fillStyle(bubbleTheme.shadow, 0.24);
    node.bubbleTail.fillTriangle(-7, (height / 2) + 4, 7, (height / 2) + 4, 0, (height / 2) + 14);
    node.bubbleTail.fillStyle(bubbleTheme.fill, 0.96);
    node.bubbleTail.lineStyle(1.5, bubbleTheme.border, 0.95);
    node.bubbleTail.beginPath();
    node.bubbleTail.moveTo(-8, height / 2);
    node.bubbleTail.lineTo(8, height / 2);
    node.bubbleTail.lineTo(0, (height / 2) + 11);
    node.bubbleTail.closePath();
    node.bubbleTail.fillPath();
    node.bubbleTail.strokePath();
    node.bubbleTail.setVisible(true);
  }

  private async syncSprite(node: SceneNode, entity: DesktopAgentSceneEntity) {
    if (!entity.imageSrc) {
      node.sprite.setVisible(false);
      return;
    }

    const textureKey = await this.ensureTexture(entity.imageSrc);
    if (!textureKey || !this.textures.exists(textureKey)) {
      node.sprite.setVisible(false);
      return;
    }

    const current = this.entities.get(entity.id);
    if (!current || current.imageSrc !== entity.imageSrc) {
      return;
    }

    node.sprite.setTexture(textureKey);
    node.sprite.setDisplaySize(entity.spriteWidth, entity.spriteHeight);
    node.sprite.setVisible(true);
  }

  private ensureTexture(imageSrc: string) {
    const textureKey = textureKeyFor(imageSrc);
    if (this.textures.exists(textureKey)) {
      return Promise.resolve(textureKey);
    }

    const pending = this.imageLoads.get(textureKey);
    if (pending) {
      return pending;
    }

    const loadPromise = new Promise<string | null>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!this.textures.exists(textureKey)) {
          this.textures.addImage(textureKey, image);
        }
        resolve(textureKey);
      };
      image.onerror = () => resolve(null);
      image.src = imageSrc;
    }).finally(() => {
      this.imageLoads.delete(textureKey);
    });

    this.imageLoads.set(textureKey, loadPromise);
    return loadPromise;
  }
}

export function DesktopAgentScene({ sceneId, agents, theme, className, onAgentClick, onAgentDragEnd }: DesktopAgentSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<DesktopWorldScene | null>(null);
  const bridgeRef = useRef<SceneBridge>({ onAgentClick, onAgentDragEnd });
  const agentsRef = useRef(agents);

  bridgeRef.current = { onAgentClick, onAgentDragEnd };
  agentsRef.current = agents;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new DesktopWorldScene();
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: host.clientWidth || window.innerWidth,
      height: host.clientHeight || window.innerHeight,
      parent: host,
      transparent: true,
      scene,
      input: {
        mouse: { preventDefaultWheel: false },
      },
      render: {
        antialias: true,
        pixelArt: true,
      },
    });
    gameRef.current = game;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !gameRef.current) return;
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      gameRef.current.scale.resize(width, height);
    });
    resizeObserver.observe(host);

    const attachScene = window.setInterval(() => {
      if (!scene.sys?.isActive()) return;
      scene.setBridge(bridgeRef.current);
      scene.setTheme(theme);
      scene.applySnapshot(agentsRef.current);
      window.clearInterval(attachScene);
    }, 16);

    return () => {
      window.clearInterval(attachScene);
      resizeObserver.disconnect();
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [sceneId, theme]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !scene.sys?.isActive()) return;
    scene.setBridge(bridgeRef.current);
    scene.setTheme(theme);
    scene.applySnapshot(agents);
  }, [agents, theme, onAgentClick, onAgentDragEnd]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
