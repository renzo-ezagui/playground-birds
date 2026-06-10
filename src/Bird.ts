import { Vec2 } from './vec2';
import type { WeightedBehavior } from './behaviors';
import type { World } from './World';

export interface PropSchema {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  description?: string;
}

// Interface for the static side of a Bird subclass
export interface BirdClass<T extends Bird = Bird> {
  new(x: number, y: number): T;
  label: string;
  color: string;
  defaults: Record<string, number>;
  props: PropSchema[];
}

export function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  wingY: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(size * 0.6, 0);
  ctx.lineTo(-size * 0.4, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.3, -wingY, -size, -wingY * 0.4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.3, wingY, -size, wingY * 0.4);
  ctx.stroke();

  ctx.restore();
}

export abstract class Bird {
  // ── Instance identity (unique per object) ──────────────────────────────
  pos: Vec2;
  vel: Vec2;
  acc = new Vec2(0, 0);
  dead = false;
  landed = false;
  spawning = true;
  followed = false;
  trailColor = '';
  trail: Vec2[] = [];

  // ── Class-level properties (set from static defaults at construction) ──
  maxSpeed!:    number;
  maxTurnRate!: number;
  size!:        number;
  color!:       string;
  maxForce = 0.12;

  protected wingPhase  = Math.random() * Math.PI * 2;
  private deathAngle   = 0;
  private deathSpin    = (Math.random() - 0.5) * 0.12;

  constructor(x: number, y: number) {
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(0, 0);
  }

  initVel(): void {
    this.vel = Vec2.random().scale(this.maxSpeed * 0.5);
  }

  die(): void {
    this.dead = true;
    this.trail = [];
    this.deathAngle = this.vel.angle();
    this.vel = new Vec2((Math.random() - 0.5) * 3, -(Math.random() + 0.5));
  }

  applyForce(f: Vec2): void {
    this.acc = this.acc.add(f);
  }

  update(behaviors: WeightedBehavior[], world: World): void {
    if (this.dead) {
      if (this.landed) return;
      const floor = world.height - this.size * 0.5;
      this.vel = this.vel.add(new Vec2(0, 0.45));
      this.vel = new Vec2(this.vel.x * 0.98, this.vel.y);
      this.pos = this.pos.add(this.vel);
      this.deathAngle += this.deathSpin;
      if (this.pos.y >= floor) {
        this.pos = new Vec2(this.pos.x, floor);
        this.vel = new Vec2(0, 0);
        this.landed = true;
        this.trail = [];
      }
      return;
    }

    // Reynolds '87: prioritized allocation — safety behaviors (separation, boundary,
    // head-on) claim the force budget first. Social behaviors (cohesion, alignment,
    // seek, wander) only receive what's left. Prevents cancellation of avoidance forces.
    let safetyAcc = new Vec2(0, 0);
    let socialAcc  = new Vec2(0, 0);
    for (const { behavior, weight, priority } of behaviors) {
      const f = behavior.steer(this, world).scale(weight);
      if (priority) safetyAcc = safetyAcc.add(f);
      else          socialAcc  = socialAcc.add(f);
    }
    // Safety behaviors keep their full weighted force — no cap.
    // Social behaviors only receive budget that safety didn't consume.
    const socialBudget = Math.max(0, this.maxForce - Math.min(safetyAcc.mag(), this.maxForce));
    socialAcc = socialAcc.limit(socialBudget);
    this.acc = safetyAcc.add(socialAcc);

    const desired = this.vel.add(this.acc);
    const currentAngle = this.vel.angle();
    let diff = desired.angle() - currentAngle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const newAngle = currentAngle + Math.max(-this.maxTurnRate, Math.min(this.maxTurnRate, diff));
    const speed = Math.min(this.maxSpeed, Math.max(0.8, desired.mag()));
    this.vel = Vec2.fromAngle(newAngle, speed);

    this.pos = this.pos.add(this.vel);
    this.acc = new Vec2(0, 0);

    if (this.followed) {
      this.trail.push(this.pos.clone());
      if (this.trail.length > 2000) this.trail.shift();
    }
  }

  drawTrail(ctx: CanvasRenderingContext2D): void {
    if (!this.followed || this.trail.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(this.trail[0].x, this.trail[0].y);
    for (let i = 1; i < this.trail.length; i++) {
      ctx.lineTo(this.trail[i].x, this.trail[i].y);
    }
    ctx.strokeStyle = this.trailColor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.dead) {
      drawBird(ctx, this.pos.x, this.pos.y, this.deathAngle, this.size, this.size * 0.4, '#e53e3e');
      return;
    }
    const flapRate = 0.006 + this.vel.mag() * 0.002;
    const wingY = Math.sin(Date.now() * flapRate + this.wingPhase) * this.size * 0.6;
    drawBird(ctx, this.pos.x, this.pos.y, this.vel.angle(), this.size, wingY, this.color);

    if (this.spawning) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.size * 2, 0, Math.PI * 2);
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(Date.now() * 0.006);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }
  }
}
