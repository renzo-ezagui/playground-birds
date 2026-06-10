import { Vec2 } from './vec2';
import type { Bird } from './Bird';
import type { World } from './World';

export interface Behavior {
  steer(bird: Bird, world: World): Vec2;
}

export interface WeightedBehavior {
  behavior: Behavior;
  weight: number;
  // true = safety behavior: gets priority allocation before social behaviors
  priority?: boolean;
}

export class SeekBehavior implements Behavior {
  influenceRadius = 220;

  steer(bird: Bird, world: World): Vec2 {
    const towardCursor = world.cursor.sub(bird.pos);
    if (towardCursor.mag() > this.influenceRadius) return new Vec2(0, 0);
    const desired = towardCursor.setMag(bird.maxSpeed);
    return desired.sub(bird.vel).limit(bird.maxForce);
  }
}

export class WanderBehavior implements Behavior {
  private wanderAngle = Math.random() * Math.PI * 2;
  private readonly radius = 60;
  private readonly distance = 90;
  private readonly noise = 0.09;

  steer(bird: Bird, world: World): Vec2 {
    this.wanderAngle += (Math.random() - 0.5) * this.noise * 2;
    const circleCenter = bird.vel.norm().scale(this.distance);
    const displacement = Vec2.fromAngle(this.wanderAngle, this.radius);
    const target = bird.pos.add(circleCenter).add(displacement);
    const desired = target.sub(bird.pos).setMag(bird.maxSpeed);
    return desired.sub(bird.vel).limit(bird.maxForce);
  }
}

export class SeparationBehavior implements Behavior {
  radius = 65;

  steer(bird: Bird, world: World): Vec2 {
    let steer = new Vec2(0, 0);
    let count = 0;
    for (const other of world.birds) {
      if (other === bird || other.dead) continue;
      const d = bird.pos.sub(other.pos).mag();
      if (d > 0 && d < this.radius) {
        // inverse square weighting (Reynolds '87): more natural damping than 1/d
        steer = steer.add(bird.pos.sub(other.pos).norm().scale(1 / (d * d)));
        count++;
      }
    }
    if (count === 0) return new Vec2(0, 0);
    return steer.scale(1 / count).setMag(bird.maxSpeed).sub(bird.vel).limit(bird.maxForce);
  }
}

export class AlignmentBehavior implements Behavior {
  radius = 120;
  // Reynolds '87: forward-weighted perception — ignore birds in rear ~90°
  private readonly fovDot = -0.5; // dot < -0.5 → more than ~120° behind → skip

  steer(bird: Bird, world: World): Vec2 {
    const myDir = bird.vel.norm();
    let sum = new Vec2(0, 0);
    let count = 0;
    for (const other of world.birds) {
      if (other === bird || other.dead) continue;
      const toOther = other.pos.sub(bird.pos);
      const dist = toOther.mag();
      if (dist >= this.radius) continue;
      if (myDir.x * toOther.x + myDir.y * toOther.y < this.fovDot * dist) continue;
      sum = sum.add(other.vel);
      count++;
    }
    if (count === 0) return new Vec2(0, 0);
    return sum.scale(1 / count).setMag(bird.maxSpeed).sub(bird.vel).limit(bird.maxForce);
  }
}

export class CohesionBehavior implements Behavior {
  radius = 150;
  private readonly fovDot = -0.5;

  steer(bird: Bird, world: World): Vec2 {
    const myDir = bird.vel.norm();
    let sum = new Vec2(0, 0);
    let count = 0;
    for (const other of world.birds) {
      if (other === bird || other.dead) continue;
      const toOther = other.pos.sub(bird.pos);
      const dist = toOther.mag();
      if (dist >= this.radius) continue;
      if (myDir.x * toOther.x + myDir.y * toOther.y < this.fovDot * dist) continue;
      sum = sum.add(other.pos);
      count++;
    }
    if (count === 0) return new Vec2(0, 0);
    const center = sum.scale(1 / count);
    const desired = center.sub(bird.pos).setMag(bird.maxSpeed);
    return desired.sub(bird.vel).limit(bird.maxForce);
  }
}

export class HeadOnBehavior implements Behavior {
  radius = 90;
  private readonly dotThreshold = -0.7; // cos(135°) — roughly head-on

  steer(bird: Bird, world: World): Vec2 {
    const myDir = bird.vel.norm();
    let force = new Vec2(0, 0);

    for (const other of world.birds) {
      if (other === bird || other.dead || other.spawning) continue;
      const toOther = other.pos.sub(bird.pos);
      const dist = toOther.mag();
      if (dist > this.radius || dist < 0.1) continue;

      const otherDir = other.vel.norm();
      const dot = myDir.x * otherDir.x + myDir.y * otherDir.y;
      if (dot > this.dotThreshold) continue; // not head-on

      // skip if diverging: toOther · relVel > 0 means converging, < 0 means diverging
      const relVel = bird.vel.sub(other.vel);
      if (toOther.x * relVel.x + toOther.y * relVel.y < 0) continue;

      // right vector in canvas coords (Y-down): (-dy, dx)
      const right = new Vec2(-myDir.y, myDir.x);
      const strength = 1 - dist / this.radius;
      force = force.add(right.scale(strength));
    }

    if (force.mag() < 0.001) return new Vec2(0, 0);
    return force.norm().scale(bird.maxForce * 1.5);
  }
}

export class ForwardVisionBehavior implements Behavior {
  lookAhead = 80;
  raySpread = 1.2; // radians total
  rayCount  = 5;
  private readonly sampleRadius = 28;

  steer(bird: Bird, world: World): Vec2 {
    const heading = bird.vel.angle();
    let bestAngle = heading;
    let bestCount = Infinity;

    for (let i = 0; i < this.rayCount; i++) {
      const t = this.rayCount === 1 ? 0 : i / (this.rayCount - 1); // 0..1
      const angle = heading + (t - 0.5) * this.raySpread;
      const sample = bird.pos.add(Vec2.fromAngle(angle, this.lookAhead));

      let count = 0;
      for (const other of world.birds) {
        if (other === bird || other.dead) continue;
        if (other.pos.sub(sample).mag() < this.sampleRadius) count++;
      }

      if (count < bestCount) { bestCount = count; bestAngle = angle; }
    }

    if (bestCount === 0 || bestAngle === heading) return new Vec2(0, 0);
    const desired = Vec2.fromAngle(bestAngle, bird.maxSpeed);
    return desired.sub(bird.vel).limit(bird.maxForce * 0.6);
  }
}

export class AttractionBehavior implements Behavior {
  radius = 200;

  steer(bird: Bird, world: World): Vec2 {
    if (!world.poi) return new Vec2(0, 0);
    const diff = world.poi.sub(bird.pos);
    const dist = diff.mag();
    if (dist < 5 || dist > this.radius) return new Vec2(0, 0);
    const arrivalZone = this.radius * 0.35;
    const speed = dist < arrivalZone
      ? bird.maxSpeed * (dist / arrivalZone)
      : bird.maxSpeed;
    const desired = diff.setMag(Math.max(speed, 0.5));
    return desired.sub(bird.vel).limit(bird.maxForce);
  }
}

export class BoundaryBehavior implements Behavior {
  margin = 140;

  steer(bird: Bird, world: World): Vec2 {
    const { pos, maxForce } = bird;
    const { width, height } = world;
    const m = this.margin;
    let fx = 0;
    let fy = 0;

    // penetration: 0 at margin edge → 1 at wall
    if (pos.x < m) fx = (m - pos.x) / m;
    else if (pos.x > width - m) fx = -((pos.x - (width - m)) / m);

    if (pos.y < m) fy = (m - pos.y) / m;
    else if (pos.y > height - m) fy = -((pos.y - (height - m)) / m);

    if (fx === 0 && fy === 0) return new Vec2(0, 0);

    // quadratic falloff: gentle at margin entry, firm near wall
    // no vel subtraction → no overshoot oscillation
    const strength = fx * fx + fy * fy; // 0..1 quadratic
    return new Vec2(fx, fy).norm().scale(strength * maxForce * 3);
  }
}
