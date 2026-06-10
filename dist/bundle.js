"use strict";
(() => {
  // src/vec2.ts
  var Vec2 = class _Vec2 {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    add(v) {
      return new _Vec2(this.x + v.x, this.y + v.y);
    }
    sub(v) {
      return new _Vec2(this.x - v.x, this.y - v.y);
    }
    scale(s) {
      return new _Vec2(this.x * s, this.y * s);
    }
    clone() {
      return new _Vec2(this.x, this.y);
    }
    mag() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    norm() {
      const m = this.mag();
      return m === 0 ? new _Vec2(0, 0) : this.scale(1 / m);
    }
    setMag(m) {
      return this.norm().scale(m);
    }
    limit(max) {
      return this.mag() > max ? this.norm().scale(max) : this.clone();
    }
    angle() {
      return Math.atan2(this.y, this.x);
    }
    static fromAngle(a, mag = 1) {
      return new _Vec2(Math.cos(a) * mag, Math.sin(a) * mag);
    }
    static random() {
      return _Vec2.fromAngle(Math.random() * Math.PI * 2);
    }
  };

  // src/Bird.ts
  function drawBird(ctx, x, y, angle, size, wingY, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
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
  var Bird = class {
    constructor(x, y) {
      this.acc = new Vec2(0, 0);
      this.dead = false;
      this.landed = false;
      this.spawning = true;
      this.followed = false;
      this.trailColor = "";
      this.trail = [];
      this.maxForce = 0.12;
      this.wingPhase = Math.random() * Math.PI * 2;
      this.deathAngle = 0;
      this.deathSpin = (Math.random() - 0.5) * 0.12;
      this.pos = new Vec2(x, y);
      this.vel = new Vec2(0, 0);
    }
    initVel() {
      this.vel = Vec2.random().scale(this.maxSpeed * 0.5);
    }
    die() {
      this.dead = true;
      this.deathAngle = this.vel.angle();
      this.vel = new Vec2((Math.random() - 0.5) * 3, -(Math.random() + 0.5));
    }
    applyForce(f) {
      this.acc = this.acc.add(f);
    }
    update(behaviors, world2) {
      if (this.dead) {
        if (this.landed) return;
        const floor = world2.height - this.size * 0.5;
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
      for (const { behavior, weight } of behaviors) {
        this.applyForce(behavior.steer(this, world2).scale(weight));
      }
      const desired = this.vel.add(this.acc);
      const currentAngle = this.vel.angle();
      let diff = desired.angle() - currentAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const newAngle = currentAngle + Math.max(-this.maxTurnRate, Math.min(this.maxTurnRate, diff));
      const speed = Math.min(this.maxSpeed, Math.max(0.8, desired.mag()));
      this.vel = Vec2.fromAngle(newAngle, speed);
      this.pos = this.pos.add(this.vel);
      this.acc = new Vec2(0, 0);
      if (this.followed) this.trail.push(this.pos.clone());
    }
    drawTrail(ctx) {
      if (!this.followed || this.trail.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.strokeStyle = this.trailColor;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    draw(ctx) {
      if (this.dead) {
        drawBird(ctx, this.pos.x, this.pos.y, this.deathAngle, this.size, this.size * 0.4, "#e53e3e");
        return;
      }
      const flapRate = 6e-3 + this.vel.mag() * 2e-3;
      const wingY = Math.sin(Date.now() * flapRate + this.wingPhase) * this.size * 0.6;
      drawBird(ctx, this.pos.x, this.pos.y, this.vel.angle(), this.size, wingY, this.color);
      if (this.spawning) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size * 2, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(Date.now() * 6e-3);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // src/behaviors.ts
  var SeekBehavior = class {
    constructor() {
      this.influenceRadius = 220;
    }
    steer(bird, world2) {
      const towardCursor = world2.cursor.sub(bird.pos);
      if (towardCursor.mag() > this.influenceRadius) return new Vec2(0, 0);
      const desired = towardCursor.setMag(bird.maxSpeed);
      return desired.sub(bird.vel).limit(bird.maxForce);
    }
  };
  var WanderBehavior = class {
    constructor() {
      this.wanderAngle = Math.random() * Math.PI * 2;
      this.radius = 60;
      this.distance = 90;
      this.noise = 0.18;
    }
    steer(bird, world2) {
      this.wanderAngle += (Math.random() - 0.5) * this.noise * 2;
      const circleCenter = bird.vel.norm().scale(this.distance);
      const displacement = Vec2.fromAngle(this.wanderAngle, this.radius);
      const target = bird.pos.add(circleCenter).add(displacement);
      const desired = target.sub(bird.pos).setMag(bird.maxSpeed);
      return desired.sub(bird.vel).limit(bird.maxForce);
    }
  };
  var SeparationBehavior = class {
    constructor() {
      this.radius = 65;
    }
    steer(bird, world2) {
      let steer = new Vec2(0, 0);
      let count = 0;
      for (const other of world2.birds) {
        if (other === bird || other.dead) continue;
        const d = bird.pos.sub(other.pos).mag();
        if (d > 0 && d < this.radius) {
          steer = steer.add(bird.pos.sub(other.pos).norm().scale(1 / d));
          count++;
        }
      }
      if (count === 0) return new Vec2(0, 0);
      return steer.scale(1 / count).setMag(bird.maxSpeed).sub(bird.vel).limit(bird.maxForce);
    }
  };
  var AlignmentBehavior = class {
    constructor() {
      this.radius = 120;
    }
    steer(bird, world2) {
      let sum = new Vec2(0, 0);
      let count = 0;
      for (const other of world2.birds) {
        if (other === bird || other.dead) continue;
        if (bird.pos.sub(other.pos).mag() < this.radius) {
          sum = sum.add(other.vel);
          count++;
        }
      }
      if (count === 0) return new Vec2(0, 0);
      return sum.scale(1 / count).setMag(bird.maxSpeed).sub(bird.vel).limit(bird.maxForce);
    }
  };
  var CohesionBehavior = class {
    constructor() {
      this.radius = 150;
    }
    steer(bird, world2) {
      let sum = new Vec2(0, 0);
      let count = 0;
      for (const other of world2.birds) {
        if (other === bird || other.dead) continue;
        if (bird.pos.sub(other.pos).mag() < this.radius) {
          sum = sum.add(other.pos);
          count++;
        }
      }
      if (count === 0) return new Vec2(0, 0);
      const center = sum.scale(1 / count);
      const desired = center.sub(bird.pos).setMag(bird.maxSpeed);
      return desired.sub(bird.vel).limit(bird.maxForce);
    }
  };
  var BoundaryBehavior = class {
    constructor() {
      this.margin = 140;
    }
    steer(bird, world2) {
      const { pos, maxForce } = bird;
      const { width, height } = world2;
      const m = this.margin;
      let fx = 0;
      let fy = 0;
      if (pos.x < m) fx = (m - pos.x) / m;
      else if (pos.x > width - m) fx = -((pos.x - (width - m)) / m);
      if (pos.y < m) fy = (m - pos.y) / m;
      else if (pos.y > height - m) fy = -((pos.y - (height - m)) / m);
      if (fx === 0 && fy === 0) return new Vec2(0, 0);
      const strength = fx * fx + fy * fy;
      return new Vec2(fx, fy).norm().scale(strength * maxForce * 3);
    }
  };

  // src/World.ts
  var IDLE_TRANSITION_MS = 1500;
  function randomHsl() {
    return `hsl(${Math.floor(Math.random() * 360)}, 70%, 45%)`;
  }
  var CURSOR_BIRD_SIZE = 12;
  var CURSOR_BIRD_COLOR = "#f6c90e";
  var World = class {
    constructor(canvas2) {
      this.birds = [];
      this.config = {
        boundaryMargin: 140,
        boundaryWeight: 1.8,
        separationRadius: 65,
        separationWeight: 1.6,
        alignmentRadius: 120,
        alignmentWeight: 1,
        cohesionRadius: 150,
        cohesionWeight: 0.8,
        cursorRadius: 220,
        seekWeight: 1.3,
        wanderWeight: 1
      };
      this.lastCursorMove = 0;
      this.cursorDir = 0;
      this.cursorWingPhase = Math.random() * Math.PI * 2;
      this.seek = new SeekBehavior();
      this.wander = new WanderBehavior();
      this.boundary = new BoundaryBehavior();
      this.separation = new SeparationBehavior();
      this.alignment = new AlignmentBehavior();
      this.cohesion = new CohesionBehavior();
      this.followNext = false;
      this.canvas = canvas2;
      this.ctx = canvas2.getContext("2d");
      this.width = canvas2.width;
      this.height = canvas2.height;
      this.cursor = new Vec2(this.width / 2, this.height / 2);
      this.prevCursor = this.cursor.clone();
      window.addEventListener("mousemove", (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const next = new Vec2(e.clientX - rect.left, e.clientY - rect.top);
        const delta = next.sub(this.cursor);
        if (delta.mag() > 0.5) this.cursorDir = delta.angle();
        this.prevCursor = this.cursor;
        this.cursor = next;
        this.lastCursorMove = Date.now();
      });
      window.addEventListener("resize", () => this.resize());
      requestAnimationFrame(() => this.resize());
    }
    resize() {
      const sidebar = document.getElementById("sidebar");
      const sidebarW = sidebar ? sidebar.offsetWidth : 220;
      const w = window.innerWidth - sidebarW;
      const h = window.innerHeight;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.canvas.width = w;
      this.canvas.height = h;
      this.width = w;
      this.height = h;
      this.cursor = new Vec2(w / 2, h / 2);
    }
    add(Ctor, x, y) {
      const pos = x !== void 0 && y !== void 0 ? new Vec2(x, y) : this.safeSpawnPos();
      const bird = new Ctor(pos.x, pos.y);
      if (this.followNext) {
        bird.followed = true;
        bird.trailColor = randomHsl();
      }
      this.birds.push(bird);
      return bird;
    }
    safeSpawnPos() {
      const minDist = this.config.separationRadius * 2;
      const margin = this.config.boundaryMargin;
      const living = this.birds.filter((b) => !b.dead);
      for (let i = 0; i < 40; i++) {
        const p = new Vec2(
          margin + Math.random() * (this.width - margin * 2),
          margin + Math.random() * (this.height - margin * 2)
        );
        if (living.every((b) => b.pos.sub(p).mag() >= minDist)) return p;
      }
      return new Vec2(this.width / 2, this.height / 2);
    }
    // Update class blueprint + propagate to all living instances of that class
    setClassProp(Ctor, key, value) {
      Ctor.defaults[key] = value;
      for (const bird of this.birds) {
        if (bird instanceof Ctor && !bird.dead) {
          bird[key] = value;
          if (key === "maxSpeed") bird.initVel();
        }
      }
    }
    behaviors() {
      const { config } = this;
      const idle = Math.min(1, (Date.now() - this.lastCursorMove) / IDLE_TRANSITION_MS);
      const seeking = 1 - idle;
      this.seek.influenceRadius = config.cursorRadius;
      this.separation.radius = config.separationRadius;
      this.alignment.radius = config.alignmentRadius;
      this.cohesion.radius = config.cohesionRadius;
      this.boundary.margin = config.boundaryMargin;
      return [
        { behavior: this.seek, weight: seeking * config.seekWeight },
        { behavior: this.wander, weight: idle * config.wanderWeight + 0.2 },
        { behavior: this.separation, weight: config.separationWeight },
        { behavior: this.alignment, weight: config.alignmentWeight },
        { behavior: this.cohesion, weight: config.cohesionWeight },
        { behavior: this.boundary, weight: config.boundaryWeight }
      ];
    }
    drawCursorBird() {
      const t = Date.now() * 9e-3 + this.cursorWingPhase;
      const wingY = Math.sin(t) * CURSOR_BIRD_SIZE * 0.6;
      drawBird(this.ctx, this.cursor.x, this.cursor.y, this.cursorDir, CURSOR_BIRD_SIZE, wingY, CURSOR_BIRD_COLOR);
    }
    updateSpawning() {
      const safeRadius = this.config.separationRadius;
      for (const bird of this.birds) {
        if (!bird.spawning) continue;
        const tooClose = this.birds.some(
          (other) => other !== bird && !other.dead && !other.spawning && bird.pos.sub(other.pos).mag() < safeRadius
        );
        if (!tooClose) bird.spawning = false;
      }
    }
    nearBoundary(bird) {
      const m = this.config.boundaryMargin;
      return bird.pos.x < m || bird.pos.x > this.width - m || bird.pos.y < m || bird.pos.y > this.height - m;
    }
    checkCollisions() {
      const { birds } = this;
      for (let i = 0; i < birds.length; i++) {
        for (let j = i + 1; j < birds.length; j++) {
          const a = birds[i];
          const b = birds[j];
          if (a.dead || b.dead || a.spawning || b.spawning) continue;
          if (this.nearBoundary(a) || this.nearBoundary(b)) continue;
          if (a.pos.sub(b.pos).mag() < (a.size + b.size) * 0.9) {
            a.die();
            b.die();
          }
        }
      }
    }
    drawBorder() {
      const { ctx, width, height, config } = this;
      const m = config.boundaryMargin;
      ctx.fillStyle = "rgba(180, 150, 100, 0.06)";
      ctx.fillRect(0, 0, width, m);
      ctx.fillRect(0, height - m, width, m);
      ctx.fillRect(0, m, m, height - m * 2);
      ctx.fillRect(width - m, m, m, height - m * 2);
      ctx.save();
      ctx.strokeStyle = "#b8956a";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.globalAlpha = 0.35;
      ctx.strokeRect(m, m, width - m * 2, height - m * 2);
      ctx.restore();
      ctx.strokeStyle = "#c4a882";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
    }
    tick() {
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);
      this.drawBorder();
      this.updateSpawning();
      this.checkCollisions();
      const behaviors = this.behaviors();
      for (const bird of this.birds) bird.update(behaviors, this);
      for (const bird of this.birds) bird.drawTrail(ctx);
      for (const bird of this.birds) bird.draw(ctx);
      this.drawCursorBird();
    }
    start() {
      const loop = () => {
        this.tick();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  };

  // src/Crow.ts
  var Crow = class _Crow extends Bird {
    static {
      this.label = "Crow";
    }
    static {
      this.color = "#1a202c";
    }
    static {
      this.defaults = {
        maxSpeed: 4,
        maxTurnRate: 0.07,
        size: 14
      };
    }
    static {
      this.props = [
        { key: "maxSpeed", label: "Speed", min: 0.5, max: 12, step: 0.5 },
        { key: "maxTurnRate", label: "Turn Rate", min: 0.01, max: 0.25, step: 0.01 },
        { key: "size", label: "Size", min: 6, max: 28, step: 1 }
      ];
    }
    constructor(x, y) {
      super(x, y);
      this.maxSpeed = _Crow.defaults.maxSpeed;
      this.maxTurnRate = _Crow.defaults.maxTurnRate;
      this.size = _Crow.defaults.size;
      this.color = _Crow.color;
      this.initVel();
    }
  };

  // src/Eagle.ts
  var Eagle = class _Eagle extends Bird {
    static {
      this.label = "Eagle";
    }
    static {
      this.color = "#92400e";
    }
    static {
      this.defaults = {
        maxSpeed: 6,
        maxTurnRate: 0.04,
        size: 22
      };
    }
    static {
      this.props = [
        { key: "maxSpeed", label: "Speed", min: 0.5, max: 14, step: 0.5 },
        { key: "maxTurnRate", label: "Turn Rate", min: 0.01, max: 0.25, step: 0.01 },
        { key: "size", label: "Size", min: 8, max: 40, step: 1 }
      ];
    }
    constructor(x, y) {
      super(x, y);
      this.maxSpeed = _Eagle.defaults.maxSpeed;
      this.maxTurnRate = _Eagle.defaults.maxTurnRate;
      this.size = _Eagle.defaults.size;
      this.color = _Eagle.color;
      this.initVel();
    }
  };

  // src/ui.ts
  var REGISTERED = [Crow, Eagle];
  function worldSlider(label, key, min, max, step, world2) {
    const wrap = document.createElement("div");
    wrap.className = "control";
    const top = document.createElement("div");
    top.className = "control-top";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "control-val";
    val.textContent = String(world2.config[key]);
    top.appendChild(lbl);
    top.appendChild(val);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(world2.config[key]);
    input.addEventListener("input", () => {
      const n = parseFloat(input.value);
      world2.config[key] = n;
      val.textContent = String(n);
    });
    wrap.appendChild(top);
    wrap.appendChild(input);
    return wrap;
  }
  function classSlider(schema, Ctor, world2) {
    const wrap = document.createElement("div");
    wrap.className = "control";
    const top = document.createElement("div");
    top.className = "control-top";
    const lbl = document.createElement("span");
    lbl.textContent = schema.label;
    const val = document.createElement("span");
    val.className = "control-val";
    val.textContent = String(Ctor.defaults[schema.key]);
    top.appendChild(lbl);
    top.appendChild(val);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(schema.min);
    input.max = String(schema.max);
    input.step = String(schema.step);
    input.value = String(Ctor.defaults[schema.key]);
    input.addEventListener("input", () => {
      const n = parseFloat(input.value);
      val.textContent = String(n);
      world2.setClassProp(Ctor, schema.key, n);
    });
    wrap.appendChild(top);
    wrap.appendChild(input);
    return wrap;
  }
  function groupLabel(text) {
    const el = document.createElement("div");
    el.className = "group-label";
    el.textContent = text;
    return el;
  }
  function section(title, ...children) {
    const wrap = document.createElement("div");
    wrap.className = "section";
    const h = document.createElement("h3");
    h.textContent = title;
    wrap.appendChild(h);
    children.forEach((c) => wrap.appendChild(c));
    return wrap;
  }
  function setupUI(world2) {
    const sidebar = document.getElementById("sidebar");
    const countEl = document.createElement("div");
    countEl.className = "bird-count";
    const updateCount = () => {
      const alive = world2.birds.filter((b) => !b.dead).length;
      const dead = world2.birds.filter((b) => b.dead).length;
      countEl.textContent = `${alive} alive \xB7 ${dead} dead`;
    };
    setInterval(updateCount, 200);
    updateCount();
    sidebar.appendChild(section("Birds", countEl));
    const selectorSection = document.createElement("div");
    selectorSection.className = "section";
    const selectorLabel = document.createElement("h3");
    selectorLabel.textContent = "Class";
    selectorSection.appendChild(selectorLabel);
    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";
    const addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    const configPanel = document.createElement("div");
    configPanel.className = "config-panel";
    let selected = REGISTERED[0];
    function selectClass(Ctor, btns) {
      selected = Ctor;
      btns.forEach((b) => b.classList.remove("active"));
      btns[REGISTERED.indexOf(Ctor)].classList.add("active");
      addBtn.textContent = `+ Add ${Ctor.label}`;
      addBtn.style.borderColor = Ctor.color;
      configPanel.innerHTML = "";
      for (const prop of Ctor.props) {
        configPanel.appendChild(classSlider(prop, Ctor, world2));
      }
    }
    const classBtns = REGISTERED.map((Ctor) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.textContent = Ctor.label;
      b.style.borderColor = Ctor.color;
      b.addEventListener("click", () => selectClass(Ctor, classBtns));
      btnRow.appendChild(b);
      return b;
    });
    const followRow = document.createElement("label");
    followRow.className = "follow-row";
    const followCheck = document.createElement("input");
    followCheck.type = "checkbox";
    followCheck.addEventListener("change", () => {
      world2.followNext = followCheck.checked;
    });
    followRow.appendChild(followCheck);
    followRow.appendChild(document.createTextNode(" Follow"));
    addBtn.addEventListener("click", () => world2.add(selected));
    selectorSection.appendChild(btnRow);
    selectorSection.appendChild(configPanel);
    selectorSection.appendChild(followRow);
    selectorSection.appendChild(addBtn);
    sidebar.appendChild(selectorSection);
    selectClass(selected, classBtns);
    sidebar.appendChild(groupLabel("\u2014 Flock Rules \u2014"));
    sidebar.appendChild(section(
      "Separation",
      worldSlider("Radius", "separationRadius", 20, 200, 5, world2),
      worldSlider("Weight", "separationWeight", 0, 3, 0.1, world2)
    ));
    sidebar.appendChild(section(
      "Alignment",
      worldSlider("Radius", "alignmentRadius", 20, 300, 5, world2),
      worldSlider("Weight", "alignmentWeight", 0, 3, 0.1, world2)
    ));
    sidebar.appendChild(section(
      "Cohesion",
      worldSlider("Radius", "cohesionRadius", 20, 300, 5, world2),
      worldSlider("Weight", "cohesionWeight", 0, 3, 0.1, world2)
    ));
    sidebar.appendChild(groupLabel("\u2014 Cursor \u2014"));
    sidebar.appendChild(section(
      "Seek",
      worldSlider("Influence Radius", "cursorRadius", 50, 600, 10, world2),
      worldSlider("Weight", "seekWeight", 0, 3, 0.1, world2)
    ));
    sidebar.appendChild(section(
      "Wander",
      worldSlider("Weight", "wanderWeight", 0, 3, 0.1, world2)
    ));
    sidebar.appendChild(groupLabel("\u2014 World \u2014"));
    sidebar.appendChild(section(
      "Boundary",
      worldSlider("Safe Margin", "boundaryMargin", 40, 300, 5, world2),
      worldSlider("Weight", "boundaryWeight", 0, 4, 0.1, world2)
    ));
  }

  // src/main.ts
  var canvas = document.getElementById("canvas");
  var world = new World(canvas);
  world.add(Crow);
  world.add(Crow);
  setupUI(world);
  world.start();
})();
