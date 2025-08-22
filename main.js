import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// ----- Basic scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181f);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 1.6, 5); // eye height

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const loader = new THREE.TextureLoader();
const floor_texture = loader.load( '/textures/floor/brown_mud_leaves_01_diff_4k.jpg' );
floor_texture.colorSpace = THREE.SRGBColorSpace;

floor_texture.wrapS = THREE.MirroredRepeatWrapping;
floor_texture.wrapT = THREE.MirroredRepeatWrapping;
floor_texture.magFilter = THREE.NearestFilter;

const wall_texture= loader.load( '/textures/wall/stone_wall_04_diff_4k.jpg' );
wall_texture.colorSpace = THREE.SRGBColorSpace;

// ----- Lights
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x223344, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 30, 10);
sun.castShadow = true;
scene.add(sun);

// ----- Floor
const floorGeo = new THREE.PlaneGeometry(200, 200);
const floorMat = new THREE.MeshBasicMaterial({ map: floor_texture });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);

// ----- World boxes (targets/obstacles)
const obstacles = [];
const boxMat = new THREE.MeshBasicMaterial({ map: wall_texture });

const makeBox = (x, y, z, sx=1, sy=1, sz=1) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boxMat.clone());
  m.position.set(x, y + sy/2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  obstacles.push(m);
  return m;
};

// simple arena
for (let i=0; i<20; i++) {
  makeBox( (Math.random()*2-1)*20, 0, (Math.random()*2-1)*20, 1+Math.random()*2, 1+Math.random()*3, 1+Math.random()*2 );
}
// walls
for (let i=-25; i<=25; i+=2) { makeBox(i, 0, -25, 2, 4, 1); makeBox(i, 0, 25, 2, 4, 1); }
for (let i=-25; i<=25; i+=2) { makeBox(-25, 0, i, 1, 4, 2); makeBox(25, 0, i, 1, 4, 2); }

// ----- Player & controls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.object);

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.style.display = 'none');
controls.addEventListener('unlock', () => overlay.style.display = '');

// movement state
const keys = { w:false, a:false, s:false, d:false, space:false, shift:false };
addEventListener('keydown', e => {
  switch (e.key.toLowerCase()) {
    case 'w': keys.w = true; break;
    case 'a': keys.a = true; break;
    case 's': keys.s = true; break;
    case 'd': keys.d = true; break;
  }
  if (e.code === 'Space') keys.space = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
});
addEventListener('keyup', e => {
  switch (e.key.toLowerCase()) {
    case 'w': keys.w = false; break;
    case 'a': keys.a = false; break;
    case 's': keys.s = false; break;
    case 'd': keys.d = false; break;
  }
  if (e.code === 'Space') keys.space = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
});

// physics
const player = {
  radius: 0.35,
  height: 1.7,
  velocity: new THREE.Vector3(),
  onGround: false,
};
const GRAVITY = 25;
const WALK = 5;
const RUN = 9;
const JUMP = 9;

// precompute AABBs for obstacles
const aabbs = obstacles.map(m => m.geometry.boundingBox
  ? new THREE.Box3().copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)
  : new THREE.Box3().setFromObject(m)
);

// ----- Raycaster for "shooting"
const raycaster = new THREE.Raycaster();
let remaining = obstacles.length;
const scoreEl = document.getElementById('score');
scoreEl.textContent = remaining;

// click to shoot while locked
addEventListener('mousedown', () => {
  if (!controls.isLocked) return;
  raycaster.set(camera.getWorldPosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3()));
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length) {
    const hit = hits[0].object;
    if (hit.material && !hit.userData.hit) {
      hit.userData.hit = true;
      hit.material.color.set(0xff6e6e);
      remaining -= 1;
      scoreEl.textContent = remaining;
      // tiny nudge
      hit.position.addScaledVector(raycaster.ray.direction, .05);
      hit.updateMatrixWorld();
      // update its AABB
      const idx = obstacles.indexOf(hit);
      aabbs[idx].setFromObject(hit);
    }
  }
});

// ----- helpers
function sphereAABBCollision(center, radius, aabb, outPush) {
  const clamped = new THREE.Vector3(
    Math.max(aabb.min.x, Math.min(center.x, aabb.max.x)),
    Math.max(aabb.min.y, Math.min(center.y, aabb.max.y)),
    Math.max(aabb.min.z, Math.min(center.z, aabb.max.z))
  );
  const delta = center.clone().sub(clamped);
  const dist2 = delta.lengthSq();
  if (dist2 > radius*radius) return false;
  const dist = Math.max(Math.sqrt(dist2), 1e-6);
  const depth = radius - dist;
  outPush.copy(delta.multiplyScalar(depth / dist)); // push vector
  return true;
}

// ----- resize
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ----- loop
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const push = new THREE.Vector3();

// VECTORS FOR MOVEMENT CALCULATION (ADDED FOR THE FIX)
const forwardDirection = new THREE.Vector3();
const rightDirection = new THREE.Vector3();

function update(dt) {
  if (!controls.isLocked) return;

  const speed = keys.shift ? RUN : WALK;

  // ===== CORRECTED MOVEMENT LOGIC =====
  
  // Calculate movement direction based on key states
  const moveX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const moveZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);

  // Get the camera's direction vector, projected onto the horizontal plane
  controls.getDirection(forwardDirection);
  forwardDirection.y = 0;
  forwardDirection.normalize();

  // Calculate the right-direction vector
  rightDirection.crossVectors(controls.object.up, forwardDirection).normalize();
  
  // Combine forward and right vectors to get the final movement direction
  const moveVec = new THREE.Vector3();
  moveVec.addScaledVector(forwardDirection, moveZ);
  moveVec.addScaledVector(rightDirection, -moveX); // Negate because cross product points left

  if (moveVec.lengthSq() > 0) {
    moveVec.normalize().multiplyScalar(speed);
    // Smoothly update the player's velocity
    player.velocity.x = THREE.MathUtils.damp(player.velocity.x, moveVec.x, 10, dt);
    player.velocity.z = THREE.MathUtils.damp(player.velocity.z, moveVec.z, 10, dt);
  } else {
    // Smoothly decelerate if no keys are pressed
    player.velocity.x = THREE.MathUtils.damp(player.velocity.x, 0, 10, dt);
    player.velocity.z = THREE.MathUtils.damp(player.velocity.z, 0, 10, dt);
  } 

  // Gravity
  player.velocity.y -= GRAVITY * dt;

  // Jump
  if (keys.space && player.onGround) {
    player.velocity.y = JUMP;
    player.onGround = false;
  }

  const obj = controls.object;
  obj.position.addScaledVector(player.velocity, dt);

  // ground plane (y >= radius)
  if (obj.position.y < player.radius) {
    obj.position.y = player.radius;
    player.velocity.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // collisions with AABBs
  for (let i=0; i<aabbs.length; i++) {
    push.set(0,0,0);
    const center = obj.position.clone().setY(obj.position.y); // eye origin ~ sphere center
    if (sphereAABBCollision(center, player.radius, aabbs[i], push)) {
      obj.position.add(push);
      // cancel velocity along push dir
      const along = player.velocity.dot(push) / (push.lengthSq() || 1);
      player.velocity.addScaledVector(push, -along);
      if (push.y > 0.001) player.onGround = true;
    }
  }

  // keep inside arena
  obj.position.x = THREE.MathUtils.clamp(obj.position.x, -24.5, 24.5);
  obj.position.z = THREE.MathUtils.clamp(obj.position.z, -24.5, 24.5);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();