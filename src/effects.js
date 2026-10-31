import * as THREE from 'three';

let dotTexture = null;

// A soft round dot, so particles aren't drawn as squares.
function dot() {
  if (dotTexture) return dotTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}

// Points material for particles: round, and capped at maxPixels on screen so a
// particle drifting right past the camera doesn't fill the view.
export function particleMaterial({ color, size, opacity = 1, maxPixels = 14 }) {
  const material = new THREE.PointsMaterial({
    color, size, opacity, map: dot(), transparent: true, depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      `gl_PointSize = min(gl_PointSize, ${maxPixels.toFixed(1)});
#include <logdepthbuf_vertex>`,
    );
  };
  return material;
}

// Short-lived particle bursts: splashes, sparks, debris.
export class Bursts {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  spawn(position, { color, count = 40, speed = 6, size = 0.25, life = 0.9 }) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      dir.randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      positions.set([position.x, position.y, position.z], i * 3);
      velocities.set([dir.x, dir.y, dir.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = particleMaterial({ color, size, maxPixels: 24 });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // the particles fly outward after the bounds are computed
    this.scene.add(points);
    this.active.push({ points, velocities, life, age: 0 });
  }

  update(dt) {
    this.active = this.active.filter((burst) => {
      burst.age += dt;
      const { points, velocities } = burst;
      if (burst.age >= burst.life) {
        this.scene.remove(points);
        points.geometry.dispose();
        points.material.dispose();
        return false;
      }
      const positions = points.geometry.attributes.position.array;
      const drag = Math.pow(0.08, dt);
      for (let i = 0; i < positions.length; i++) {
        positions[i] += velocities[i] * dt;
        velocities[i] *= drag;
      }
      points.geometry.attributes.position.needsUpdate = true;
      points.material.opacity = 1 - burst.age / burst.life;
      return true;
    });
  }

  clear() {
    for (const { points } of this.active) {
      this.scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    }
    this.active = [];
  }
}
