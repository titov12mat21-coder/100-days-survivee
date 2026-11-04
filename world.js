import * as THREE from 'three';

export function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(seed=1) {
    this.rng = mulberry32(seed);
    const p = [];
    for (let i=0;i<256;i++) p[i]=i;
    for (let i=255;i>0;i--) {
      const j = Math.floor(this.rng()*(i+1));
      [p[i],p[j]] = [p[j],p[i]];
    }
    this.perm = new Array(512);
    for (let i=0;i<512;i++) this.perm[i]=p[i & 255];
  }
  fade(t){return t*t*t*(t*(t*6-15)+10);}
  lerp(a,b,t){return a+t*(b-a);}
  grad(h,x,y){switch(h&3){case 0:return x+y;case 1:return -x+y;case 2:return x-y;default:return -x-y;}}
  noise2(x,y){
    const X=Math.floor(x)&255, Y=Math.floor(y)&255;
    x-=Math.floor(x); y-=Math.floor(y);
    const u=this.fade(x), v=this.fade(y);
    const p=this.perm;
    const aa=p[p[X]+Y], ab=p[p[X]+Y+1], ba=p[p[X+1]+Y], bb=p[p[X+1]+Y+1];
    return this.lerp(
      this.lerp(this.grad(aa,x,y), this.grad(ba,x-1,y), u),
      this.lerp(this.grad(ab,x,y-1), this.grad(bb,x-1,y-1), u), v);
  }
  fbm(x,y,oct=4){let v=0,a=0.5,f=1;for(let i=0;i<oct;i++){v+=a*this.noise2(x*f,y*f);f*=2;a*=0.5;}return v;}
}

export const WORLD_SIZE = 400;
export const GRID = 160;
export const CELL = WORLD_SIZE / GRID;
export const DAY_LENGTH_SECONDS = 120; // 2 min real time per in-game day

export const BIOMES = { OCEAN:0, BEACH:1, FOREST:2, DESERT:3, MOUNTAIN:4, SWAMP:5, PLAINS:6 };

export class World {
  constructor(scene, seed=1337) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new Noise(seed);
    this.moist = new Noise(seed+7);
    this.heightData = new Float32Array((GRID+1)*(GRID+1));
    this.biomeData = new Uint8Array((GRID+1)*(GRID+1));
    this.resources = [];
    this.timeOfDay = 6;
    this._generate();
    this._buildTerrain();
    this._buildSky();
    this._buildLights();
    this._spawnScenery();
    this._buildCrashSite();
  }

  _generate(){
    for (let y=0;y<=GRID;y++){
      for(let x=0;x<=GRID;x++){
        const wx = (x/GRID-0.5)*WORLD_SIZE;
        const wy = (y/GRID-0.5)*WORLD_SIZE;
        const dist = Math.sqrt(wx*wx+wy*wy)/(WORLD_SIZE*0.5);
        const falloff = Math.max(0, 1 - dist*dist);
        const h = this.noise.fbm(wx*0.008, wy*0.008, 5)*0.5+0.5;
        let height = Math.max(0, h*falloff - 0.15);
        const m = this.moist.fbm(wx*0.005+100, wy*0.005+50, 3)*0.5+0.5;
        let biome;
        if (height < 0.05) biome = BIOMES.OCEAN;
        else if (height < 0.08) biome = BIOMES.BEACH;
        else if (height > 0.45) biome = BIOMES.MOUNTAIN;
        else if (m > 0.6 && height < 0.2) biome = BIOMES.SWAMP;
        else if (m < 0.3) biome = BIOMES.DESERT;
        else if (height > 0.28) biome = BIOMES.MOUNTAIN;
        else biome = BIOMES.FOREST;
        const idx = y*(GRID+1)+x;
        this.heightData[idx] = height;
        this.biomeData[idx] = biome;
      }
    }
  }

  getHeight(x,z){
    const gx = (x/WORLD_SIZE+0.5)*GRID;
    const gz = (z/WORLD_SIZE+0.5)*GRID;
    const x0 = Math.max(0,Math.min(GRID-1,Math.floor(gx)));
    const z0 = Math.max(0,Math.min(GRID-1,Math.floor(gz)));
    const fx = gx-x0, fz = gz-z0;
    const h00 = this.heightData[z0*(GRID+1)+x0];
    const h10 = this.heightData[z0*(GRID+1)+x0+1];
    const h01 = this.heightData[(z0+1)*(GRID+1)+x0];
    const h11 = this.heightData[(z0+1)*(GRID+1)+x0+1];
    const h = (h00*(1-fx)+h10*fx)*(1-fz) + (h01*(1-fx)+h11*fx)*fz;
    return h * 30;
  }

  getBiome(x,z){
    const gx = Math.max(0,Math.min(GRID, Math.floor((x/WORLD_SIZE+0.5)*GRID)));
    const gz = Math.max(0,Math.min(GRID, Math.floor((z/WORLD_SIZE+0.5)*GRID)));
    return this.biomeData[gz*(GRID+1)+gx];
  }

  _buildTerrain(){
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID, GRID);
    geo.rotateX(-Math.PI/2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count*3);
    const c = new THREE.Color();
    const palette = {
      [BIOMES.OCEAN]:0x1a4a6b, [BIOMES.BEACH]:0xc4b48a, [BIOMES.FOREST]:0x3a6e35,
      [BIOMES.DESERT]:0xc99a5b, [BIOMES.MOUNTAIN]:0x7a7570, [BIOMES.SWAMP]:0x4a5a3a, [BIOMES.PLAINS]:0x5a7a3a
    };
    for (let i=0;i<pos.count;i++){
      const x = pos.getX(i), z = pos.getZ(i);
      const gx = Math.round((x/WORLD_SIZE+0.5)*GRID);
      const gz = Math.round((z/WORLD_SIZE+0.5)*GRID);
      const idx = gz*(GRID+1)+gx;
      const h = this.heightData[idx];
      pos.setY(i, h*30);
      const b = this.biomeData[idx];
      c.setHex(palette[b] || 0x3a6e35);
      const v = 0.85 + ((h*30)%3)*0.05;
      colors[i*3]=c.r*v; colors[i*3+1]=c.g*v; colors[i*3+2]=c.b*v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({vertexColors:true});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  _buildSky(){
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor:{value:new THREE.Color(0x2a4a8a)},
        bottomColor:{value:new THREE.Color(0xffb88a)}
      },
      vertexShader:`varying vec3 vP; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vP;
        void main(){ float h=normalize(vP+100.0).y; float f=pow(max(h,0.0),0.6); gl_FragColor=vec4(mix(bottomColor,topColor,f),1.0); }`,
      side: THREE.BackSide, depthWrite:false
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);
    this.skyMat = skyMat;
  }

  _buildLights(){
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024,1024);
    const s = 80;
    Object.assign(this.sun.shadow.camera, {left:-s,right:s,top:s,bottom:-s,far:400});
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(this.ambient);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.2);
    this.scene.add(this.moon);
  }

  _spawnScenery(){
    const rng = mulberry32(this.seed+99);
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.18,0.28,2,6);
    trunkGeo.translate(0,1,0);
    const leafGeo = new THREE.ConeGeometry(1.3,3,7);
    leafGeo.translate(0,2.2,0);
    const trunkMat = new THREE.MeshLambertMaterial({color:0x5a3820});
    const leafMat = new THREE.MeshLambertMaterial({color:0x2a5a2a});

    const trees = [];
    for (let i=0;i<700;i++){
      const x = (rng()-0.5)*WORLD_SIZE*0.88;
      const z = (rng()-0.5)*WORLD_SIZE*0.88;
      const b = this.getBiome(x,z);
      if (b===BIOMES.FOREST || b===BIOMES.PLAINS || b===BIOMES.SWAMP){
        const y = this.getHeight(x,z);
        if (y < 1.5 || y > 22) continue;
        trees.push({x,y,z,s:0.8+rng()*0.7});
      }
    }
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, trees.length);
    trunkMesh.castShadow = leafMesh.castShadow = true;
    trees.forEach((t,i)=>{
      dummy.position.set(t.x,t.y,t.z);
      dummy.scale.set(1,t.s,1); dummy.rotation.set(0,0,0);
      dummy.updateMatrix(); trunkMesh.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(t.s,t.s,t.s);
      dummy.updateMatrix(); leafMesh.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trunkMesh, leafMesh);

    const rockGeo = new THREE.DodecahedronGeometry(0.9);
    const rockMat = new THREE.MeshLambertMaterial({color:0x6a6a70, flatShading:true});
    const rocks = [];
    for (let i=0;i<350;i++){
      const x = (rng()-0.5)*WORLD_SIZE*0.88;
      const z = (rng()-0.5)*WORLD_SIZE*0.88;
      const b = this.getBiome(x,z);
      if (b===BIOMES.MOUNTAIN || b===BIOMES.FOREST || b===BIOMES.DESERT){
        const y = this.getHeight(x,z);
        if (y < 1) continue;
        rocks.push({x,y,z,s:0.5+rng()*1.2});
      }
    }
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    rockMesh.castShadow = true;
    rocks.forEach((r,i)=>{
      dummy.position.set(r.x,r.y+r.s*0.3,r.z);
      dummy.scale.set(r.s,r.s*0.7,r.s);
      dummy.rotation.set(rng(),rng(),rng());
      dummy.updateMatrix(); rockMesh.setMatrixAt(i,dummy.matrix);
    });
    this.scene.add(rockMesh);

    // Interactive resources (visible subset)
    trees.forEach((t,i)=>{ if (i%2===0) this.resources.push({type:'tree', pos:new THREE.Vector3(t.x,t.y+1,t.z), hp:5, alive:true}); });
    rocks.forEach((r,i)=>{ if (i%2===0) this.resources.push({type:'rock', pos:new THREE.Vector3(r.x,r.y+0.5,r.z), hp:6, alive:true}); });

    // Bushes (invisible but gatherable)
    for (let i=0;i<200;i++){
      const x = (rng()-0.5)*WORLD_SIZE*0.85;
      const z = (rng()-0.5)*WORLD_SIZE*0.85;
      const b = this.getBiome(x,z);
      if (b===BIOMES.FOREST || b===BIOMES.PLAINS || b===BIOMES.SWAMP){
        const y = this.getHeight(x,z);
        if (y < 1) continue;
        this.resources.push({type:'bush', pos:new THREE.Vector3(x,y,z), hp:2, alive:true});
      }
    }
  }

  _buildCrashSite(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color:0x8a8a92, metalness:0.8, roughness:0.4});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3,4,10,12), mat);
    body.rotation.z = Math.PI/2*0.3; body.position.y = 3; body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3,4,12), mat);
    nose.rotation.z = -Math.PI/2; nose.position.set(6,5,0); nose.castShadow = true;
    g.add(nose);
    const px = 15, pz = 15;
    g.position.set(px, this.getHeight(px,pz), pz);
    this.scene.add(g);
  }

  update(dt){
    this.timeOfDay += dt * (24 / DAY_LENGTH_SECONDS);
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;

    const ang = (this.timeOfDay/24)*Math.PI*2 - Math.PI/2;
    this.sun.position.set(Math.cos(ang)*150, Math.sin(ang)*150, 40);
    this.sun.target.position.set(0,0,0);
    this.sun.target.updateMatrixWorld();

    const day = this.timeOfDay > 6 && this.timeOfDay < 20;
    this.sun.intensity = day ? 1.2*Math.max(0.2, Math.sin((this.timeOfDay-6)/14*Math.PI)) : 0;
    this.moon.intensity = day ? 0 : 0.32;
    this.ambient.intensity = day ? 0.5 : 0.14;
    this.moon.position.copy(this.sun.position).multiplyScalar(-1);

    const dayTop = new THREE.Color(0x2a4a8a);
    const nightTop = new THREE.Color(0x050510);
    const dayBot = new THREE.Color(0xffb88a);
    const nightBot = new THREE.Color(0x111122);
    this.skyMat.uniforms.topColor.value.copy(nightTop).lerp(dayTop, day?1:0);
    this.skyMat.uniforms.bottomColor.value.copy(nightBot).lerp(dayBot, day?1:0);
  }

  isNight(){ return this.timeOfDay < 6 || this.timeOfDay > 20; }
}