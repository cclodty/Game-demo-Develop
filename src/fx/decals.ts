import * as THREE from 'three';

/** 牆上的彈孔與地上的血跡；數量有上限，超過時覆蓋最舊的。 */
export class Decals {
  private readonly holes: THREE.InstancedMesh;
  private readonly pools: THREE.InstancedMesh;
  private holeCursor = 0;
  private poolCursor = 0;
  private readonly tmp = new THREE.Object3D();
  holeCount = 0;
  poolCount = 0;

  constructor(scene: THREE.Scene) {
    const holeGeo = new THREE.PlaneGeometry(0.1, 0.1);
    this.holes = new THREE.InstancedMesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0d0c0b }), 160);
    const poolGeo = new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(
      poolGeo,
      new THREE.MeshBasicMaterial({ color: 0x3a0b0a, transparent: true, opacity: 0.85, depthWrite: false }),
      48,
    );
    for (const m of [this.holes, this.pools]) {
      m.layers.set(1);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  addHole(x: number, y: number, z: number, nx: number, nz: number): void {
    this.tmp.position.set(x + nx * 0.012, y, z + nz * 0.012);
    this.tmp.rotation.set(0, Math.atan2(nx, nz), 0);
    this.tmp.scale.setScalar(0.7 + Math.random() * 0.6);
    this.tmp.updateMatrix();
    this.holes.setMatrixAt(this.holeCursor, this.tmp.matrix);
    this.holeCursor = (this.holeCursor + 1) % 160;
    this.holeCount = Math.min(160, this.holeCount + 1);
    this.holes.count = this.holeCount;
    this.holes.instanceMatrix.needsUpdate = true;
  }

  addPool(x: number, z: number, size: number): void {
    this.tmp.position.set(x, 0.03 + Math.random() * 0.004, z);
    this.tmp.rotation.set(0, Math.random() * 6, 0);
    this.tmp.scale.set(size * (0.8 + Math.random() * 0.5), 1, size * (0.8 + Math.random() * 0.5));
    this.tmp.updateMatrix();
    this.pools.setMatrixAt(this.poolCursor, this.tmp.matrix);
    this.poolCursor = (this.poolCursor + 1) % 48;
    this.poolCount = Math.min(48, this.poolCount + 1);
    this.pools.count = this.poolCount;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.holeCursor = 0;
    this.poolCursor = 0;
    this.holeCount = 0;
    this.poolCount = 0;
    this.holes.count = 0;
    this.pools.count = 0;
  }
}
