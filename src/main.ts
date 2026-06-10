import { World } from './World';
import { Crow } from './Crow';
import { setupUI } from './ui';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const world = new World(canvas);
world.add(Crow);
world.add(Crow);
setupUI(world);
world.start();
