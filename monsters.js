import * as THREE from 'three';

const TYPES = {
  small:  { hp:15,  dmg:4,  speed:2.6, size:0.9, color:0x664422 },
  night:  { hp:30,  dmg:8,  speed:4,   size:1.2, color:0x442266 },
  strong: { hp:80,  dmg:15, speed:3.5, size:1.6, color:0xaa2222 },
  boss:   { hp:300, dmg:25, speed:3,   size:3,   color:0xaa22aa },
};

export class Monster {
  constructor(scene, world, type, pos){
    this.scene = scene; this.world = world; this.type = type;
    const t = TYPES[type];
    this.hp = t.hp; this.maxHp = t.hp;
    this.damage = t.dmg; this.speed = t.speed; this.size = t.size;
    this.pos = pos.clone();
    this.dead = false;
    this.attackCd = 0;
    const geo = new THREE.IcosahedronGeometry(t.size, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: t.color, emissive: t.color, emissiveIntensity: 0.3, roughness: 0.7
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.position.copy(pos);
    scene.add(this.mesh);
  }
  update(dt, player){
    if (this.dead) return;
    const dx = player.position.x - this.pos.x;
    const dz = player.position.z - this.pos.z;
    const dy = player.position.y - this.pos.y;
    const dist = Math.sqrt(dx*dx+dz*dz+dy*dy);
    if (dist < 40){
      const len = Math.sqrt(dx*dx+dz*dz)||1;
      this.pos.x += (dx/len)*this.speed*dt;
      this.pos.z += (dz/len)*this.speed*dt;
      this.pos.y = this.world.getHeight(this.pos.x, this.pos.z) + this.size*0.5;
      this.mesh.rotation.y = Math.atan2(dx, dz);
      if (this.attackCd > 0) this.attackCd -= dt;
      if (dist < this.size + 1.8 && this.attackCd <= 0){
        player.hurt(this.damage);
        this.attackCd = 1.2;
      }
    } else {
      this.mesh.rotation.y += dt;
    }
    this.mesh.position.copy(this.pos);
  }
  hurt(amount){
    this.hp -= amount;
    if (this.mesh.material) this.mesh.material.emissiveIntensity = 1.2;
    setTimeout(()=>{ if (this.mesh.material) this.mesh.material.emissiveIntensity = 0.3; }, 100);
    if (this.hp <= 0) this.dead = true;
  }
  dispose(){
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class MonsterManager {
  constructor(scene, world){
    this.scene = scene; this.world = world;
    this.monsters = [];
    this.spawnTimer = 0;
  }
  update(dt, player, isNight, day){
    this.spawnTimer -= dt;
    if (isNight && this.spawnTimer <= 0 && this.monsters.length < 18){
      this.spawnTimer = Math.max(2.5, 8 - day*0.1);
      this._spawn(player, day);
    }
    for (const m of this.monsters) m.update(dt, player);
    this.monsters = this.monsters.filter(m=>{
      if (m.dead){ m.dispose(); return false; }
      if (m.pos.distanceTo(player.position) > 200){ m.dispose(); return false; }
      return true;
    });
  }
  _spawn(player, day){
    const a = Math.random()*Math.PI*2;
    const d = 40 + Math.random()*20;
    const x = player.position.x + Math.cos(a)*d;
    const z = player.position.z + Math.sin(a)*d;
    if (Math.abs(x) > 185 || Math.abs(z) > 185) return;
    const y = this.world.getHeight(x,z);
    const roll = Math.random();
    let type = 'small';
    if (roll < 0.25 && day > 5) type = 'night';
    if (roll < 0.08 && day > 15) type = 'strong';
    this.monsters.push(new Monster(this.scene, this.world, type, new THREE.Vector3(x,y,z)));
  }
  spawnBoss(player, day){
    const a = Math.random()*Math.PI*2;
    const x = player.position.x + Math.cos(a)*30;
    const z = player.position.z + Math.sin(a)*30;
    const y = this.world.getHeight(x,z);
    const boss = new Monster(this.scene, this.world, 'boss', new THREE.Vector3(x,y,z));
    boss.hp = 100 + day*6;
    boss.maxHp = boss.hp;
    this.monsters.push(boss);
  }
  attackFromCamera(camera, range, damage){
    const camDir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    let closest = null, closestDist = range;
    for (const m of this.monsters){
      const d = m.pos.distanceTo(camera.position);
      if (d < closestDist){
        const dir = m.pos.clone().sub(camera.position).normalize();
        if (dir.dot(camDir) > 0.65){ closest = m; closestDist = d; }
      }
    }
    if (closest){ closest.hurt(damage); return closest; }
    return null;
  }
  clearAll(){ for (const m of this.monsters) m.dispose(); this.monsters = []; }
}