import * as THREE from 'three';

export class Player {
  constructor(camera, world){
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, world.getHeight(0,0)+2, 0);
    this.velocity = new THREE.Vector3();
    this.eyeHeight = 1.7;
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 6;
    this.jumpPower = 8;
    this.attackCooldown = 0;
    this.hurtCooldown = 0;
    this.dead = false;
    this.stats = { health:100, hunger:100, thirst:100, energy:100 };
  }

  update(dt, input){
    if (this.dead) return;

    const DAY = 120;
    this.stats.hunger = Math.max(0, this.stats.hunger - (100/DAY)*2.2*dt);
    this.stats.thirst = Math.max(0, this.stats.thirst - (100/DAY)*1.6*dt);
    this.stats.energy = Math.max(0, this.stats.energy - (100/DAY)*1.2*dt);

    if (this.stats.hunger <= 0) this.stats.health -= 4*dt;
    if (this.stats.thirst <= 0) this.stats.health -= 6*dt;
    if (this.stats.energy <= 0) this.stats.health -= 1.5*dt;
    this.stats.health = Math.max(0, this.stats.health);
    if (this.stats.health <= 0){ this.dead = true; return; }

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (input.forward) move.add(fwd);
    if (input.back) move.sub(fwd);
    if (input.right) move.add(right);
    if (input.left) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();

    const speed = this.speed * (this.stats.energy > 0 ? 1 : 0.5);
    this.velocity.x = move.x * speed;
    this.velocity.z = move.z * speed;
    this.velocity.y -= 25 * dt;

    if (input.jump && this.onGround){
      this.velocity.y = this.jumpPower;
      this.onGround = false;
      this.stats.energy = Math.max(0, this.stats.energy - 3);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    const ground = this.world.getHeight(this.position.x, this.position.z);
    if (this.position.y <= ground){
      this.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else this.onGround = false;

    const lim = 190;
    this.position.x = Math.max(-lim, Math.min(lim, this.position.x));
    this.position.z = Math.max(-lim, Math.min(lim, this.position.z));

    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
  }

  look(dx, dy){
    this.yaw -= dx * 0.0025;
    this.pitch -= dy * 0.0025;
    this.pitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, this.pitch));
  }
  hurt(amount){
    if (this.hurtCooldown > 0) return;
    this.stats.health -= amount;
    this.hurtCooldown = 0.5;
    if (this.stats.health <= 0) this.dead = true;
  }
  serialize(){
    return { position: this.position.toArray(), yaw: this.yaw, pitch: this.pitch, stats: {...this.stats} };
  }
  load(d){
    this.position.fromArray(d.position);
    this.yaw = d.yaw; this.pitch = d.pitch;
    this.stats = {...d.stats};
    this.dead = false;
  }
}