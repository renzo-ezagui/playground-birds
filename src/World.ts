import { Vec2 } from './vec2';
import { Bird, BirdClass, drawBird } from './Bird';
import { SeekBehavior, WanderBehavior, BoundaryBehavior, SeparationBehavior, AlignmentBehavior, CohesionBehavior, AttractionBehavior, ForwardVisionBehavior, HeadOnBehavior, WeightedBehavior } from './behaviors';

const IDLE_TRANSITION_MS = 1500;

function randomHsl(): string {
  return `hsl(${Math.floor(Math.random() * 360)}, 70%, 45%)`;
}
const CURSOR_BIRD_SIZE = 12;
const CURSOR_BIRD_COLOR = '#f6c90e';

export interface WorldConfig {
  boundaryMargin: number;
  boundaryWeight: number;
  separationRadius: number;
  separationWeight: number;
  alignmentRadius: number;
  alignmentWeight: number;
  cohesionRadius: number;
  cohesionWeight: number;
  cursorRadius: number;
  seekWeight: number;
  wanderWeight: number;
  poiRadius: number;
  poiWeight: number;
  visionLookAhead: number;
  visionSpread: number;
  visionRays: number;
  visionWeight: number;
  headOnRadius: number;
  headOnWeight: number;
  altitudeMax: number;
}

export class World {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  birds: Bird[] = [];
  cursor: Vec2;
  width: number;
  height: number;

  config: WorldConfig = {
    boundaryMargin:    140,
    boundaryWeight:    1.8,
    separationRadius:  80,
    separationWeight:  2.0,
    alignmentRadius:   120,
    alignmentWeight:   0.8,
    cohesionRadius:    110,
    cohesionWeight:    0.5,
    cursorRadius:      220,
    seekWeight:        0.7,
    wanderWeight:      1.0,
    poiRadius:         220,
    poiWeight:         1.5,
    visionLookAhead:   80,
    visionSpread:      1.2,
    visionRays:        5,
    visionWeight:      1.3,
    headOnRadius:      140,
    headOnWeight:      2.2,
    altitudeMax:       200,
  };

  poi: Vec2 | null = null;

  private lastCursorMove = 0;
  private cursorDir = 0;
  private cursorWingPhase = Math.random() * Math.PI * 2;

  private seek = new SeekBehavior();
  private wander = new WanderBehavior();
  private boundary = new BoundaryBehavior();
  private separation = new SeparationBehavior();
  private alignment = new AlignmentBehavior();
  private cohesion = new CohesionBehavior();
  private attraction = new AttractionBehavior();
  private vision = new ForwardVisionBehavior();
  private headOn = new HeadOnBehavior();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.cursor = new Vec2(this.width / 2, this.height / 2);

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const next = new Vec2(e.clientX - rect.left, e.clientY - rect.top);
      const delta = next.sub(this.cursor);
      if (delta.mag() > 0.5) this.cursorDir = delta.angle();
      this.cursor = next;
      this.lastCursorMove = Date.now();
    });

    this.canvas.addEventListener('click', (e) => {
      if (!this.poi) return;
      const rect = this.canvas.getBoundingClientRect();
      this.poi = new Vec2(e.clientX - rect.left, e.clientY - rect.top);
    });

    window.addEventListener('resize', () => this.resize());
    // defer resize so flexbox layout is computed first
    requestAnimationFrame(() => this.resize());
  }

  resize(): void {
    const w = window.innerWidth - this.canvas.offsetLeft;
    const h = window.innerHeight;
    this.canvas.style.width  = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width  = w;
    this.canvas.height = h;
    this.width  = w;
    this.height = h;
    this.cursor = new Vec2(w / 2, h / 2);
  }

  followNext = false;

  add<T extends Bird>(Ctor: BirdClass<T>, x?: number, y?: number): T {
    const pos = (x !== undefined && y !== undefined)
      ? new Vec2(x, y)
      : this.safeSpawnPos();
    const bird = new Ctor(pos.x, pos.y);
    if (this.followNext) {
      bird.followed   = true;
      bird.trailColor = randomHsl();
    }
    this.birds.push(bird);
    return bird;
  }

  private safeSpawnPos(): Vec2 {
    const minDist = this.config.separationRadius * 2;
    const margin  = this.config.boundaryMargin;
    const living  = this.birds.filter(b => !b.dead);
    for (let i = 0; i < 40; i++) {
      const p = new Vec2(
        margin + Math.random() * (this.width  - margin * 2),
        margin + Math.random() * (this.height - margin * 2),
      );
      if (living.every(b => b.pos.sub(p).mag() >= minDist)) return p;
    }
    return new Vec2(this.width / 2, this.height / 2);
  }

  // Update class blueprint + propagate to all living instances of that class
  setClassProp(Ctor: BirdClass, key: string, value: number): void {
    Ctor.defaults[key] = value;
    for (const bird of this.birds) {
      if (bird instanceof (Ctor as unknown as typeof Bird) && !bird.dead) {
        (bird as unknown as Record<string, number>)[key] = value;
        if (key === 'maxSpeed') bird.initVel();
      }
    }
  }

  clearDead(): void { this.birds = this.birds.filter(b => !b.dead); }

  enablePOI(): void { this.poi = new Vec2(this.width / 2, this.height / 2); }
  disablePOI(): void { this.poi = null; }

  private behaviors(): WeightedBehavior[] {
    const { config } = this;
    const idle = Math.min(1, (Date.now() - this.lastCursorMove) / IDLE_TRANSITION_MS);
    const seeking = 1 - idle;

    this.seek.influenceRadius      = config.cursorRadius;
    this.separation.radius         = config.separationRadius;
    this.alignment.radius          = config.alignmentRadius;
    this.cohesion.radius           = config.cohesionRadius;
    this.boundary.margin           = config.boundaryMargin;
    this.attraction.radius         = config.poiRadius;
    this.vision.lookAhead          = config.visionLookAhead;
    this.vision.raySpread          = config.visionSpread;
    this.vision.rayCount           = config.visionRays;
    this.headOn.radius             = config.headOnRadius;

    // priority: true  → safety behaviors — get first claim on force budget (Reynolds '87)
    // priority: false → social behaviors — get remaining budget after safety
    return [
      { behavior: this.separation, weight: config.separationWeight, priority: true  },
      { behavior: this.boundary,   weight: config.boundaryWeight,   priority: true  },
      { behavior: this.headOn,     weight: config.headOnWeight,     priority: true  },
      { behavior: this.seek,       weight: this.showCursorBird ? seeking * config.seekWeight : 0 },
      { behavior: this.wander,     weight: idle * config.wanderWeight + 0.2        },
      { behavior: this.attraction, weight: this.poi ? config.poiWeight : 0         },
      { behavior: this.vision,     weight: config.visionWeight                     },
      { behavior: this.alignment,  weight: config.alignmentWeight                  },
      { behavior: this.cohesion,   weight: config.cohesionWeight                   },
    ];
  }

  private drawCursorBird(): void {
    const t = Date.now() * 0.009 + this.cursorWingPhase;
    const wingY = Math.sin(t) * CURSOR_BIRD_SIZE * 0.6;
    drawBird(this.ctx, this.cursor.x, this.cursor.y, this.cursorDir, CURSOR_BIRD_SIZE, wingY, CURSOR_BIRD_COLOR);
  }

  private updateSpawning(): void {
    const safeRadius = this.config.separationRadius;
    for (const bird of this.birds) {
      if (!bird.spawning) continue;
      const tooClose = this.birds.some(
        other => other !== bird && !other.dead && !other.spawning &&
                 bird.pos.sub(other.pos).mag() < safeRadius,
      );
      if (!tooClose) bird.spawning = false;
    }
  }

  private nearBoundary(bird: Bird): boolean {
    const m = this.config.boundaryMargin;
    return (
      bird.pos.x < m || bird.pos.x > this.width  - m ||
      bird.pos.y < m || bird.pos.y > this.height - m
    );
  }

  checkCollisions(): void {
    const { birds } = this;
    for (let i = 0; i < birds.length; i++) {
      for (let j = i + 1; j < birds.length; j++) {
        const a = birds[i];
        const b = birds[j];
        if (a.dead || b.dead || a.spawning || b.spawning) continue;
        if (this.nearBoundary(a) || this.nearBoundary(b)) continue;
        const d2 = a.pos.sub(b.pos).mag();
        const dz = a.z - b.z;
        if (Math.sqrt(d2 * d2 + dz * dz) < (a.size + b.size) * 0.9) {
          a.die();
          b.die();
        }
      }
    }
  }

  showScaleRef = true;
  showCursorBird = true;

  // 1px ≈ 3.6cm at crow scale (size=14px ≈ 50cm body). House 10×10m = 280×280px.
  private drawScaleReference(): void {
    if (!this.showScaleRef) return;
    const { ctx, width, height } = this;
    const cx = width / 2;
    const cy = height / 2;

    // lot boundary: ~15×13m = 420×364px
    const lw = 420, lh = 364;
    // house footprint: 10×10m = 280×280px
    const hw = 280, hh = 280;

    ctx.save();
    ctx.globalAlpha = 0.07;

    // lot fill
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(cx - lw / 2, cy - lh / 2, lw, lh);

    // house fill
    ctx.fillStyle = '#c4a882';
    ctx.fillRect(cx - hw / 2, cy - hh / 2, hw, hh);

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#7a6040';
    ctx.lineWidth = 2;

    // lot outline
    ctx.strokeRect(cx - lw / 2, cy - lh / 2, lw, lh);

    // house outline
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - hw / 2, cy - hh / 2, hw, hh);

    // internal walls — 3 rooms
    ctx.lineWidth = 1.5;
    // vertical divider (left third)
    ctx.beginPath();
    ctx.moveTo(cx - hw / 2 + 95, cy - hh / 2);
    ctx.lineTo(cx - hw / 2 + 95, cy + hh / 2);
    ctx.stroke();
    // horizontal divider (top half of right section)
    ctx.beginPath();
    ctx.moveTo(cx - hw / 2 + 95, cy - 10);
    ctx.lineTo(cx + hw / 2,      cy - 10);
    ctx.stroke();

    // door gaps (break wall lines)
    ctx.fillStyle = '#f5f0e8';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cx - hw / 2 + 95 - 1, cy + 30, 3, 40);  // left door
    ctx.fillRect(cx + 20, cy - 10 - 1, 40, 3);             // right door

    // scale label
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#7a6040';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('~100 m²', cx, cy + hh / 2 + 16);
    ctx.fillText('~1 500 m² lot', cx, cy + lh / 2 + 14);

    ctx.restore();
  }

  private drawBorder(): void {
    const { ctx, width, height, config } = this;
    const m = config.boundaryMargin;

    // safe (boundary) zone — shaded strips
    ctx.fillStyle = 'rgba(180, 150, 100, 0.06)';
    ctx.fillRect(0, 0, width, m);
    ctx.fillRect(0, height - m, width, m);
    ctx.fillRect(0, m, m, height - m * 2);
    ctx.fillRect(width - m, m, m, height - m * 2);

    // collision zone border — dashed inner rectangle
    ctx.save();
    ctx.strokeStyle = '#b8956a';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(m, m, width - m * 2, height - m * 2);
    ctx.restore();

    // world border
    ctx.strokeStyle = '#c4a882';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  private drawPOI(): void {
    if (!this.poi) return;
    const { ctx, config } = this;
    const { x, y } = this.poi;
    const r = config.poiRadius;

    ctx.save();
    ctx.strokeStyle = '#e53e3e';
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    const s = 9;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  tick(): void {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    this.drawScaleReference();
    this.drawBorder();
    this.drawPOI();
    this.updateSpawning();
    this.checkCollisions();
    const behaviors = this.behaviors();
    for (const bird of this.birds) bird.update(behaviors, this);
    // painter's algorithm: high birds drawn first, low birds on top
    const byAltitude = [...this.birds].sort((a, b) => b.z - a.z);
    for (const bird of byAltitude) bird.drawTrail(ctx);
    for (const bird of byAltitude) bird.draw(ctx, this.config.altitudeMax);
    if (this.showCursorBird) this.drawCursorBird();
  }

  start(): void {
    const loop = () => { this.tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
