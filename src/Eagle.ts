import { Bird } from './Bird';
import type { PropSchema } from './Bird';

export class Eagle extends Bird {
  static readonly label = 'Eagle';
  static readonly color = '#92400e';

  static defaults: Record<string, number> = {
    maxSpeed:    6,
    maxTurnRate: 0.04,
    size:        22,
  };

  static readonly props: PropSchema[] = [
    { key: 'maxSpeed',    label: 'Speed',     min: 0.5, max: 14,   step: 0.5,  description: 'Velocidad máxima de vuelo (px/frame). Afecta qué tan rápido reacciona a fuerzas y cuánto espacio recorre.' },
    { key: 'maxTurnRate', label: 'Turn Rate', min: 0.01, max: 0.25, step: 0.01, description: 'Ángulo máximo de giro por frame (rad). Simula inercia alar: valores bajos = trayectorias amplias y curvas suaves. Muy alto = giros bruscos poco realistas.' },
    { key: 'size',        label: 'Size',      min: 8,   max: 40,   step: 1,    description: 'Tamaño visual (px). También define el radio de colisión: dos pájaros colisionan si su distancia < sizeA + sizeB.' },
  ];

  maxSpeed:    number;
  maxTurnRate: number;
  size:        number;
  color:       string;

  constructor(x: number, y: number) {
    super(x, y);
    this.maxSpeed    = Eagle.defaults.maxSpeed;
    this.maxTurnRate = Eagle.defaults.maxTurnRate;
    this.size        = Eagle.defaults.size;
    this.color       = Eagle.color;
    this.initVel();
  }
}
