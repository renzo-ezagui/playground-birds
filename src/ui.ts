import type { World, WorldConfig } from './World';
import type { BirdClass, PropSchema } from './Bird';
import { Crow } from './Crow';
import { Eagle } from './Eagle';

const REGISTERED: BirdClass[] = [Crow, Eagle];

// ── tooltip ───────────────────────────────────────────────────────────────────

const tooltipEl = document.getElementById('tooltip')!;

function positionTooltip(e: MouseEvent): void {
  const x = e.clientX + 14;
  const y = e.clientY - 10;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top  = `${y}px`;
}

function makeInfoIcon(text: string): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'info-icon';
  icon.textContent = 'ⓘ';
  icon.addEventListener('mouseenter', (e) => {
    tooltipEl.textContent = text;
    tooltipEl.style.display = 'block';
    positionTooltip(e);
  });
  icon.addEventListener('mousemove', positionTooltip);
  icon.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
  return icon;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function worldSlider(
  label: string,
  key: keyof WorldConfig,
  min: number,
  max: number,
  step: number,
  world: World,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'control';

  const top = document.createElement('div');
  top.className = 'control-top';
  const lbl = document.createElement('span');
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'control-val';
  val.textContent = String(world.config[key]);
  top.appendChild(lbl);
  top.appendChild(val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(world.config[key]);
  input.dataset.worldKey = key;
  input.addEventListener('input', () => {
    const n = parseFloat(input.value);
    (world.config as Record<string, number>)[key] = n;
    val.textContent = String(n);
  });

  wrap.appendChild(top);
  wrap.appendChild(input);
  return wrap;
}

function classSlider(schema: PropSchema, Ctor: BirdClass, world: World): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'control';

  const top = document.createElement('div');
  top.className = 'control-top';
  const lblWrap = document.createElement('span');
  lblWrap.style.display = 'flex';
  lblWrap.style.alignItems = 'center';
  lblWrap.style.gap = '3px';
  const lbl = document.createElement('span');
  lbl.textContent = schema.label;
  lblWrap.appendChild(lbl);
  if (schema.description) lblWrap.appendChild(makeInfoIcon(schema.description));
  const val = document.createElement('span');
  val.className = 'control-val';
  val.textContent = String(Ctor.defaults[schema.key]);
  top.appendChild(lblWrap);
  top.appendChild(val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(schema.min); input.max = String(schema.max); input.step = String(schema.step);
  input.value = String(Ctor.defaults[schema.key]);
  input.dataset.classKey   = schema.key;
  input.dataset.classLabel = Ctor.label;
  input.addEventListener('input', () => {
    const n = parseFloat(input.value);
    val.textContent = String(n);
    world.setClassProp(Ctor, schema.key, n); // updates blueprint + all live instances
  });

  wrap.appendChild(top);
  wrap.appendChild(input);
  return wrap;
}

function groupLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'group-label';
  el.textContent = text;
  return el;
}

function section(title: string, descOrChild?: string | HTMLElement | null, ...rest: HTMLElement[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'section';
  const h = document.createElement('h3');
  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  h.appendChild(titleSpan);

  let children: HTMLElement[];
  if (typeof descOrChild === 'string') {
    h.appendChild(makeInfoIcon(descOrChild));
    children = rest;
  } else if (descOrChild instanceof HTMLElement) {
    children = [descOrChild, ...rest];
  } else {
    children = rest;
  }

  wrap.appendChild(h);
  children.forEach(c => wrap.appendChild(c));
  return wrap;
}

// ── main ─────────────────────────────────────────────────────────────────────

export function setupUI(world: World): void {
  const sidebar = document.getElementById('sidebar')!;

  const toggleBtn = document.getElementById('sidebar-toggle')!;
  toggleBtn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    toggleBtn.textContent = collapsed ? '▶' : '◀';
    setTimeout(() => world.resize(), 230);
  });

  // ── presets ───────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'birds-presets';

  function readPresets(): Record<string, object> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  function syncSliders(): void {
    document.querySelectorAll<HTMLInputElement>('[data-world-key]').forEach(inp => {
      const v = (world.config as Record<string, number>)[inp.dataset.worldKey!];
      if (v === undefined) return;
      inp.value = String(v);
      const valEl = inp.closest('.control')?.querySelector('.control-val');
      if (valEl) valEl.textContent = String(v);
    });
    document.querySelectorAll<HTMLInputElement>('[data-class-key]').forEach(inp => {
      const Ctor = REGISTERED.find(C => C.label === inp.dataset.classLabel);
      if (!Ctor) return;
      const v = Ctor.defaults[inp.dataset.classKey!];
      if (v === undefined) return;
      inp.value = String(v);
      const valEl = inp.closest('.control')?.querySelector('.control-val');
      if (valEl) valEl.textContent = String(v);
    });
  }

  // preset list container — rebuilt on every save/delete
  const presetList = document.createElement('div');
  presetList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:6px;';

  function renderPresetList(): void {
    presetList.innerHTML = '';
    const presets = readPresets();
    for (const name of Object.keys(presets)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;';

      const nameEl = document.createElement('span');
      nameEl.textContent = name;
      nameEl.style.cssText = 'flex:1;font-size:9px;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.style.cssText = 'flex-shrink:0;width:36px;padding:3px 0;font-size:9px;';
      loadBtn.addEventListener('click', () => {
        const snap = readPresets()[name] as { config: Record<string, number>; classes: Record<string, Record<string, number>> };
        if (!snap) return;
        Object.assign(world.config, snap.config);
        for (const Ctor of REGISTERED) {
          const saved = snap.classes?.[Ctor.label];
          if (!saved) continue;
          for (const [k, v] of Object.entries(saved)) world.setClassProp(Ctor, k, v);
        }
        syncSliders();
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.style.cssText = 'flex-shrink:0;width:22px;padding:3px 0;font-size:9px;background:#742a2a;';
      delBtn.addEventListener('click', () => {
        const all = readPresets();
        delete all[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        renderPresetList();
      });

      row.appendChild(nameEl);
      row.appendChild(loadBtn);
      row.appendChild(delBtn);
      presetList.appendChild(row);
    }
  }

  renderPresetList();

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = `Config ${Object.keys(readPresets()).length + 1}`;
  nameInput.style.cssText = 'width:100%;background:#0d1117;border:1px solid #2d3748;border-radius:4px;color:#e2e8f0;font-size:10px;padding:4px 6px;font-family:inherit;box-sizing:border-box;margin-bottom:4px;';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Config';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || nameInput.placeholder;
    const all = readPresets();
    all[name] = {
      config: { ...world.config },
      classes: Object.fromEntries(REGISTERED.map(C => [C.label, { ...C.defaults }])),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    nameInput.value = '';
    nameInput.placeholder = `Config ${Object.keys(all).length + 1}`;
    renderPresetList();
  });

  sidebar.appendChild(section('Presets', presetList, nameInput, saveBtn));

  // bird count
  const countEl = document.createElement('div');
  countEl.className = 'bird-count';
  const updateCount = () => {
    const alive = world.birds.filter(b => !b.dead).length;
    const dead  = world.birds.filter(b =>  b.dead).length;
    countEl.textContent = `${alive} alive · ${dead} dead`;
  };
  setInterval(updateCount, 200);
  updateCount();

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear Dead';
  clearBtn.style.marginBottom = '4px';
  clearBtn.addEventListener('click', () => { world.clearDead(); updateCount(); });

  sidebar.appendChild(section('Birds', countEl, clearBtn));

  // ── class selector ────────────────────────────────────────────────────
  const selectorSection = document.createElement('div');
  selectorSection.className = 'section';
  const selectorLabel = document.createElement('h3');
  selectorLabel.textContent = 'Class';
  selectorSection.appendChild(selectorLabel);

  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';

  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';

  // config panel — rebuilt when selection changes
  const configPanel = document.createElement('div');
  configPanel.className = 'config-panel';

  let selected: BirdClass = REGISTERED[0];

  function selectClass(Ctor: BirdClass, btns: HTMLButtonElement[]): void {
    selected = Ctor;
    btns.forEach(b => b.classList.remove('active'));
    btns[REGISTERED.indexOf(Ctor)].classList.add('active');
    addBtn.textContent = `+ Add ${Ctor.label}`;
    addBtn.style.borderColor = Ctor.color;

    // rebuild config panel
    configPanel.innerHTML = '';
    for (const prop of Ctor.props) {
      configPanel.appendChild(classSlider(prop, Ctor, world));
    }
  }

  const classBtns: HTMLButtonElement[] = REGISTERED.map(Ctor => {
    const b = document.createElement('button');
    b.className = 'class-btn';
    b.textContent = Ctor.label;
    b.style.borderColor = Ctor.color;
    b.addEventListener('click', () => selectClass(Ctor, classBtns));
    btnRow.appendChild(b);
    return b;
  });

  const followRow = document.createElement('label');
  followRow.className = 'follow-row';
  const followCheck = document.createElement('input');
  followCheck.type = 'checkbox';
  followCheck.addEventListener('change', () => { world.followNext = followCheck.checked; });
  followRow.appendChild(followCheck);
  followRow.appendChild(document.createTextNode(' Follow'));

  addBtn.addEventListener('click', () => world.add(selected));

  selectorSection.appendChild(btnRow);
  selectorSection.appendChild(configPanel);
  selectorSection.appendChild(followRow);
  selectorSection.appendChild(addBtn);
  sidebar.appendChild(selectorSection);

  selectClass(selected, classBtns); // initial selection

  // ── world behaviors ───────────────────────────────────────────────────
  sidebar.appendChild(groupLabel('— Flock Rules —'));
  sidebar.appendChild(section('Separation',
    'Empuja cada pájaro lejos de vecinos muy cercanos. Evita amontonamiento y colisiones. Radio corto, reacción inmediata. Tensión con Cohesion define la densidad del flock.',
    worldSlider('Radius',  'separationRadius', 20,  200, 5,   world),
    worldSlider('Weight',  'separationWeight', 0,   3,   0.1, world),
  ));
  sidebar.appendChild(section('Alignment',
    'Iguala la dirección de vuelo con los vecinos cercanos. Crea movimiento coordinado. Los pájaros no pueden girar bruscamente (limitado por Turn Rate), así que la corrección es gradual.',
    worldSlider('Radius',  'alignmentRadius',  20,  300, 5,   world),
    worldSlider('Weight',  'alignmentWeight',  0,   3,   0.1, world),
  ));
  sidebar.appendChild(section('Cohesion',
    'Atrae cada pájaro hacia el centro de masa del grupo. Mantiene el flock junto. Peso alto = pelota apretada. Peso bajo = nube dispersa.',
    worldSlider('Radius',  'cohesionRadius',   20,  300, 5,   world),
    worldSlider('Weight',  'cohesionWeight',   0,   3,   0.1, world),
  ));

  sidebar.appendChild(groupLabel('— Cursor —'));

  const cursorRow = document.createElement('label');
  cursorRow.className = 'follow-row';
  const cursorCheck = document.createElement('input');
  cursorCheck.type = 'checkbox';
  cursorCheck.checked = true;
  cursorCheck.addEventListener('change', () => { world.showCursorBird = cursorCheck.checked; });
  cursorRow.appendChild(cursorCheck);
  cursorRow.appendChild(document.createTextNode(' Show cursor bird'));
  sidebar.appendChild(cursorRow);

  sidebar.appendChild(section('Seek',
    'Perseguir el cursor dentro del radio de influencia. El peso disminuye automáticamente cuando el cursor lleva quieto 1.5s (idle transition), dejando que Wander tome el control.',
    worldSlider('Influence Radius', 'cursorRadius', 50, 600, 10, world),
    worldSlider('Weight',           'seekWeight',   0,  3,   0.1, world),
  ));
  sidebar.appendChild(section('Wander',
    'Movimiento errante sin destino fijo. Proyecta un punto sobre un círculo imaginario frente al pájaro y lo rota levemente cada frame. Evita vuelo recto monótono cuando el cursor está quieto.',
    worldSlider('Weight', 'wanderWeight', 0, 3, 0.1, world),
  ));

  sidebar.appendChild(groupLabel('— Collision Avoidance —'));
  sidebar.appendChild(section('Head-On',
    'Cuando dos pájaros vienen de frente (velocidades casi opuestas y convergiendo), ambos viran a la derecha instintivamente. Basado en observaciones reales (Univ. of Queensland). Reduce muertes por colisión frontal.',
    worldSlider('Detect Radius', 'headOnRadius', 20, 200, 5,   world),
    worldSlider('Weight',        'headOnWeight', 0,  4,   0.1, world),
  ));

  sidebar.appendChild(groupLabel('— Forward Vision —'));
  sidebar.appendChild(section('Vision',
    'Proyecta N rayos en abanico hacia adelante y elige la dirección más despejada. Los pájaros anticipan el espacio libre en vez de reaccionar solo al contacto. Produce trayectorias largas y fluidas.',
    worldSlider('Look Ahead',    'visionLookAhead', 20,  200, 5,   world),
    worldSlider('Spread (rad)',  'visionSpread',    0.2, 2.8, 0.1, world),
    worldSlider('Rays',          'visionRays',      2,   9,   1,   world),
    worldSlider('Weight',        'visionWeight',    0,   3,   0.1, world),
  ));

  sidebar.appendChild(groupLabel('— Point of Interest —'));

  const poiToggleRow = document.createElement('label');
  poiToggleRow.className = 'follow-row';
  const poiCheck = document.createElement('input');
  poiCheck.type = 'checkbox';
  poiCheck.addEventListener('change', () => {
    if (poiCheck.checked) world.enablePOI(); else world.disablePOI();
  });
  poiToggleRow.appendChild(poiCheck);
  poiToggleRow.appendChild(document.createTextNode(' Enable'));

  const poiHint = document.createElement('div');
  poiHint.textContent = 'click canvas to place';
  poiHint.style.cssText = 'font-size:9px;color:#4a5568;margin-bottom:4px;';

  sidebar.appendChild(section('Attractor',
    'Punto fijo en el mundo (presa, árbol, corriente térmica). Atrae el flock con llegada suave: velocidad plena desde lejos, desacelera al acercarse para que orbiten naturalmente.',
    poiToggleRow,
    poiHint,
    worldSlider('Radius', 'poiRadius', 50, 500, 10,  world),
    worldSlider('Weight', 'poiWeight', 0,  3,   0.1, world),
  ));

  sidebar.appendChild(groupLabel('— World —'));

  const scaleRow = document.createElement('label');
  scaleRow.className = 'follow-row';
  const scaleCheck = document.createElement('input');
  scaleCheck.type = 'checkbox';
  scaleCheck.checked = true;
  scaleCheck.addEventListener('change', () => { world.showScaleRef = scaleCheck.checked; });
  scaleRow.appendChild(scaleCheck);
  scaleRow.appendChild(document.createTextNode(' Scale reference (100 m²)'));
  sidebar.appendChild(scaleRow);

  sidebar.appendChild(section('Boundary',
    'Repulsión cuadrática desde los bordes del mundo. El margin define la zona segura visible. La fuerza crece de 0 (borde del margin) hasta máxima (pared), sin oscilación.',
    worldSlider('Safe Margin', 'boundaryMargin', 40, 300, 5,   world),
    worldSlider('Weight',      'boundaryWeight', 0,  4,   0.1, world),
  ));
}
