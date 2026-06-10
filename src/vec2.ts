export class Vec2 {
  constructor(public x: number, public y: number) {}

  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  clone(): Vec2 { return new Vec2(this.x, this.y); }

  mag(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }

  norm(): Vec2 {
    const m = this.mag();
    return m === 0 ? new Vec2(0, 0) : this.scale(1 / m);
  }

  setMag(m: number): Vec2 { return this.norm().scale(m); }

  limit(max: number): Vec2 {
    return this.mag() > max ? this.norm().scale(max) : this.clone();
  }

  angle(): number { return Math.atan2(this.y, this.x); }

  static fromAngle(a: number, mag = 1): Vec2 {
    return new Vec2(Math.cos(a) * mag, Math.sin(a) * mag);
  }

  static random(): Vec2 {
    return Vec2.fromAngle(Math.random() * Math.PI * 2);
  }
}
