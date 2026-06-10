# Birds — Boid Simulation

Canvas 2D boid simulation built with TypeScript and esbuild. No framework, no runtime dependencies. Designed as a teaching tool for OOP concepts: abstract classes, inheritance, static vs instance properties, and emergent behavior from simple rules.

Live at `birds.lan` on the homelab (ProBook via Caddy + Pi-hole).

---

## Architecture

```
src/
  vec2.ts        — Immutable 2D vector math
  Bird.ts        — Abstract base class + drawBird helper
  Crow.ts        — Concrete subclass (small, fast, agile)
  Eagle.ts       — Concrete subclass (large, fast, slow turn)
  behaviors.ts   — All steering behaviors (stateless, composable)
  World.ts       — Simulation loop, collision, spawn, config
  ui.ts          — Sidebar controls, presets, tooltip system
  main.ts        — Entry point
index.html       — Layout + styles (no external CSS)
Dockerfile       — Multi-stage: node:20-alpine → nginx:alpine
docker-compose.yml
```

### Class Hierarchy

```
Bird (abstract)
├── Crow   — static label, color, defaults, props
└── Eagle  — static label, color, defaults, props
```

`Bird` defines the physics contract. Subclasses copy from their `static defaults` at construction time. This means:
- `Crow.defaults` is the **class blueprint** (mutable, shared)
- Each `crow.maxSpeed` is an **instance copy** (mutable, isolated)
- `world.setClassProp(Crow, 'maxSpeed', 5)` updates the blueprint AND all living instances

---

## Physics Model

### Per-frame update (`Bird.update`)

Each frame, behaviors are evaluated in order, each returning a steering force (`Vec2`). Forces are weighted and summed into `acc`. Then:

```
desired  = vel + acc
diff     = desired.angle() - vel.angle()           // angular error
diff     = wrap to [-π, π]
newAngle = vel.angle() + clamp(diff, -maxTurnRate, +maxTurnRate)
speed    = clamp(desired.mag(), 0.8, maxSpeed)
vel      = Vec2.fromAngle(newAngle, speed)
pos      = pos + vel
acc      = (0, 0)
```

**Key constraint:** `maxTurnRate` limits how fast a bird can rotate per frame. This enforces the physical reality that birds cannot fly backwards — they must curve, not teleport to a new heading. Low values produce wide, sweeping arcs. High values produce jittery, unrealistic turns.

**Minimum speed:** 0.8 px/frame prevents birds from stopping dead.

### Steering force pattern

All behaviors follow the Reynolds steering formula:

```
desired = direction × maxSpeed
steering = desired - vel
steering = limit(steering, maxForce)
```

`desired` is where the bird *wants* to go at full speed. Subtracting `vel` gives the *correction* needed given current momentum. `maxForce` caps how hard the bird can push per frame.

### Collision and death

Two living, non-spawning birds collide when:
```
distance(a, b) < (a.size + b.size) × 0.9
```

Both die. Collision is skipped if either bird is in the boundary margin zone (prevents deaths from boundary-induced crowding).

Death physics: bird gets an upward kick + random horizontal drift, then falls with gravity (0.45 px/frame²) and air resistance (vel.x × 0.98) until it hits the floor.

### Spawn protection

`bird.spawning = true` on creation. Immunity from collision checks. The `spawning` flag clears when the bird is no longer within `separationRadius` of any established (non-spawning) neighbor. Safe spawn position is found via 40 random attempts inside the boundary margin, each checked against `separationRadius × 2` from all living birds.

---

## Behaviors

Evaluated in priority order each frame. Weight = 0 disables a behavior.

### 1. Seek (cursor pursuit)

| Parameter | Default | Range |
|---|---|---|
| `cursorRadius` | 220 px | 50–600 |
| `seekWeight` | 1.3 | 0–3 |

Active only within `cursorRadius`. Steers toward the cursor at `maxSpeed`. Weight scales linearly with cursor activity: `weight = seekWeight × (1 - idle)`. After 1500ms of cursor stillness, weight reaches 0 and Wander takes over.

### 2. Wander

| Parameter | Default | Range |
|---|---|---|
| `wanderWeight` | 1.0 | 0–3 |

Simulates purposeless drift. Projects an imaginary circle `distance=90px` ahead along the current heading. A point on that circle rotates by random noise each frame (`noise=0.09 rad`). The bird steers toward that point. Low noise = wide lazy curves. High noise = tight erratic spirals. Always active at `wanderWeight × idle + 0.2` (the 0.2 baseline keeps birds moving when cursor is active but no bird is within seek radius).

### 3. Attraction (Point of Interest)

| Parameter | Default | Range |
|---|---|---|
| `poiRadius` | 220 px | 50–500 |
| `poiWeight` | 1.5 | 0–3 |

Disabled when no POI is placed. Arrival-style seek: full `maxSpeed` when outside `arrivalZone = radius × 0.35`, tapering to near-zero at the POI center. This produces natural orbiting — birds approach, slow down, and get nudged back into flight by Wander and Separation. Click anywhere on the canvas to reposition the POI.

### 4. Head-On Avoidance

| Parameter | Default | Range |
|---|---|---|
| `headOnRadius` | 90 px | 20–200 |
| `headOnWeight` | 1.8 | 0–4 |

Based on observations from the University of Queensland: birds instinctively veer right when approaching head-on. Triggers when:
- Another bird is within `headOnRadius`
- `dot(myDir, otherDir) < -0.7` (angle between headings > ~135°)
- Birds are converging: `dot(toOther, relVel) > 0`

Applies a lateral force in the **right** direction relative to current heading. In canvas coordinates (Y-down), right = `(-vel.y, vel.x)` normalized. Force scales linearly with proximity (stronger as distance shrinks to zero).

### 5. Forward Vision

| Parameter | Default | Range |
|---|---|---|
| `visionLookAhead` | 80 px | 20–200 |
| `visionSpread` | 1.2 rad (~69°) | 0.2–2.8 |
| `visionRays` | 5 | 2–9 |
| `visionWeight` | 1.0 | 0–3 |

Casts `visionRays` evenly across the `visionSpread` arc ahead. Each ray samples a point at `visionLookAhead` distance and counts birds within `sampleRadius=28px`. The bird steers toward the ray with fewest neighbors. Returns zero if no neighbors detected in any ray (no unnecessary steering in open space). Force capped at `maxForce × 0.6` — gentle correction, not aggressive avoidance.

### 6. Separation

| Parameter | Default | Range |
|---|---|---|
| `separationRadius` | 65 px | 20–200 |
| `separationWeight` | 1.6 | 0–3 |

Pushes away from all neighbors within radius. Force per neighbor = `normalize(toSelf) × (1/distance)` — inverse-distance weighting means very close birds exert much stronger repulsion than far ones. Averaged across all nearby birds. High weight relative to Cohesion = loose, spread-out flock. Low weight = birds pack tightly.

### 7. Alignment

| Parameter | Default | Range |
|---|---|---|
| `alignmentRadius` | 120 px | 20–300 |
| `alignmentWeight` | 1.0 | 0–3 |

Averages the velocity vectors of all neighbors within radius, then steers toward that average direction at `maxSpeed`. Creates coordinated directional flow. Combined with `maxTurnRate`, alignment corrections are gradual — birds merge into shared headings over multiple frames rather than snapping.

### 8. Cohesion

| Parameter | Default | Range |
|---|---|---|
| `cohesionRadius` | 150 px | 20–300 |
| `cohesionWeight` | 0.8 | 0–3 |

Steers toward the centroid of all neighbors within radius. Counterbalances Separation: Separation pushes birds apart at close range, Cohesion pulls them back together at medium range. The balance between their weights defines flock density.

### 9. Boundary

| Parameter | Default | Range |
|---|---|---|
| `boundaryMargin` | 140 px | 40–300 |
| `boundaryWeight` | 1.8 | 0–4 |

Quadratic repulsion from world edges. Penetration factor:
- `fx = (margin - pos.x) / margin` when left of margin (0 at edge, 1 at wall)
- Same for right, top, bottom

Force = `normalize(fx, fy) × (fx²+fy²) × maxForce × 3`. Quadratic falloff: gentle at the margin boundary, firm near the wall. No velocity subtraction — avoids the oscillation that a seek-style boundary produces. Birds in the boundary zone are excluded from collision checks.

---

## Bird Classes

### Instance Properties (unique per bird)

| Property | Type | Description |
|---|---|---|
| `pos` | Vec2 | World position (px) |
| `vel` | Vec2 | Velocity (px/frame) |
| `acc` | Vec2 | Accumulated force this frame, reset each update |
| `maxSpeed` | number | Copied from class defaults at construction |
| `maxTurnRate` | number | Max radians rotated per frame |
| `size` | number | Visual size and collision radius |
| `color` | string | Copied from static class color |
| `maxForce` | number | Hard cap on steering force magnitude (0.12) |
| `dead` | boolean | Triggers fall physics, skips steering |
| `landed` | boolean | Bird has hit the floor, stops updating |
| `spawning` | boolean | Immune to collisions, cleared when safe gap found |
| `followed` | boolean | Trail recording active |
| `trail` | Vec2[] | Position history, max 2000 points, cleared on death |
| `trailColor` | string | Random HSL assigned at spawn if followed |
| `wingPhase` | number | Random offset for flap animation |

### Static Properties (class-level blueprint)

| Property | Description |
|---|---|
| `label` | Display name in UI |
| `color` | Default visual color |
| `defaults` | Mutable record — source of truth for new instances |
| `props` | Schema array for sidebar sliders |

### Crow

| Property | Default | Notes |
|---|---|---|
| `maxSpeed` | 4 px/frame | Moderate speed |
| `maxTurnRate` | 0.07 rad/frame | Agile — tight turns |
| `size` | 14 px | Small collision radius |

### Eagle

| Property | Default | Notes |
|---|---|---|
| `maxSpeed` | 6 px/frame | Faster than Crow |
| `maxTurnRate` | 0.04 rad/frame | Sluggish — wide arcs |
| `size` | 22 px | Larger collision radius |

---

## World

### Cursor Bird

Yellow bird (`#f6c90e`, size 12) that follows the mouse. Visual only — not part of the simulation, does not collide, does not influence behaviors. Heading angle tracks mouse movement direction.

### Canvas Sizing

`canvas.width = window.innerWidth - canvas.offsetLeft`. The `offsetLeft` automatically accounts for sidebar width and the toggle edge strip, so resizing and sidebar collapse both work correctly.

### Tick Order

Each frame:
1. Clear canvas
2. Draw boundary zones and POI
3. Update spawn immunity flags
4. Check collisions
5. Compute weighted behavior list
6. Update all birds (dead birds run fall physics, living birds run steering)
7. Draw all trails
8. Draw all birds
9. Draw cursor bird

---

## UI

### Sidebar Toggle

`◀` / `▶` button on the sidebar edge strip. Collapses sidebar with CSS transition (0.22s). Canvas resizes after transition via `setTimeout(resize, 230)`.

### Follow Trail

Check "Follow" before adding a bird — that bird records its flight path in a random HSL color. Trail persists until death (clears immediately on `die()`). Max 2000 points (~33s at 60fps).

### Presets

Saves `world.config` + all class `defaults` to `localStorage` as JSON. Named by user or auto-incremented. Loading applies values to config and live instances, then syncs all slider DOM elements via `data-world-key` and `data-class-key` attributes.

### Tooltips

Each section header has a `ⓘ` icon. Hover shows a `position: fixed` tooltip (escapes sidebar overflow). Each class prop slider also has a tooltip explaining the physical meaning.

---

## Build & Deploy

```bash
# Install (Mac, first time only)
npm install

# Build bundle
npm run build   # → dist/bundle.js via esbuild

# Homelab deploy (Docker context targets ProBook)
make build-birds    # build image + restart container
make logs-birds     # tail logs
make up-birds       # start
make down-birds     # stop
```

Served at `http://birds.lan` (Pi-hole DNS → Caddy reverse proxy → port 8094 on ProBook).

---

## Recommended Starting Config

Good baseline for observing natural flocking with ~8–12 birds:

| Setting | Value | Reason |
|---|---|---|
| Separation radius | 65 | Tight enough to prevent crowding |
| Separation weight | 1.6 | Dominant short-range force |
| Alignment radius | 120 | Mid-range direction sharing |
| Alignment weight | 1.0 | Moderate — lets birds drift |
| Cohesion radius | 150 | Wider than separation |
| Cohesion weight | 0.8 | Weaker than separation — loose flock |
| Wander weight | 1.0 | Active autonomous movement |
| Seek weight | 1.3 | Responsive to cursor |
| Boundary margin | 140 | Large safe zone, fewer boundary deaths |
| Boundary weight | 1.8 | Firm but not jerky |
| Head-on radius | 90 | Short — only near-misses |
| Head-on weight | 1.8 | Strong enough to actually steer away |
| Vision look ahead | 80 | ~1 second of flight at speed 4 |
| Vision spread | 1.2 rad | ~70° arc — forward-biased |
| Vision rays | 5 | Fine enough resolution |
| Vision weight | 1.0 | Gentle path smoothing |

Mix Eagles and Crows to observe inter-species dynamics — Eagles' larger size and slower turn rate produce different collision patterns.
