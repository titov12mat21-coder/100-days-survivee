import * as THREE from 'three';
import { World, DAY_LENGTH_SECONDS } from './world.js';
import { Player } from './player.js';
import { Inventory, ITEMS } from './inventory.js';
import { RECIPES, craft, canCraft } from './crafting.js';
import { MonsterManager } from './monsters.js';
import { EventManager } from './events.js';
import { Audio } from './audio.js';

const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x88aacc, 60, 320);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 800);
const audio = new Audio();

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 800;

const game = {
  state: 'menu',
  world: null, player: null, inventory: null,
  monsterManager: null, eventManager: null,
  day: 1, lastTime: undefined,
  buildings: [], meteors: [],
  selectedBuild: null, ghostMesh: null,
  keys: {}, input: {forward:false, back:false, left:false, right:false, jump:false},
  joystick: {active:false, dx:0, dy:0, cx:0, cy:0},
  isMobile,
};
window.game = game;

/* ------------ UI HELPERS ------------ */
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function updateHotbar(){
  const hb = $('hotbar');
  hb.innerHTML = '';
  for (let i=0;i<8;i++){
    const s = game.inventory.slots[i];
    const d = document.createElement('div');
    d.className = 'slot' + (i===game.inventory.selected?' selected':'');
    if (s) d.innerHTML = `<div class="icon">${ITEMS[s.id].icon}</div><div class="count">${s.count}</div>`;
    d.onclick = ()=>{ game.inventory.selected = i; updateHotbar(); };
    hb.appendChild(d);
  }
}

function updateInventoryUI(){
  const grid = $('invGrid');
  grid.innerHTML = '';
  for (let i=0;i<game.inventory.size;i++){
    const s = game.inventory.slots[i];
    const d = document.createElement('div');
    d.className = 'invSlot';
    if (s){
      d.innerHTML = `<span>${ITEMS[s.id].icon}</span><span class="count">${s.count}</span>`;
      d.title = ITEMS[s.id].name;
      d.onclick = ()=> consumeItem(s.id);
    }
    grid.appendChild(d);
  }
}

function consumeItem(id){
  const def = ITEMS[id];
  if (!def) return;
  if (def.food || def.thirst){
    if (def.food) game.player.stats.hunger = Math.min(100, game.player.stats.hunger + def.food);
    if (def.thirst) game.player.stats.thirst = Math.min(100, game.player.stats.thirst + def.thirst);
    game.inventory.remove(id, 1);
    audio.gather();
    updateInventoryUI(); updateHotbar();
  }
}

function updateCraftUI(){
  const list = $('craftList'); list.innerHTML = '';
  for (const r of RECIPES){
    const can = canCraft(r, game.inventory);
    const el = document.createElement('div');
    el.className = 'craftRow' + (can?'':' disabled');
    const costText = Object.entries(r.cost).map(([id,c])=>`${c}×${ITEMS[id].icon}`).join(' ');
    el.innerHTML = `<div class="icon">${ITEMS[r.id].icon}</div>
      <div class="info"><div class="name">${r.name}</div><div class="cost">${costText}${r.station?' · needs '+r.station:''}</div></div>
      <button ${can?'':'disabled'}>Craft</button>`;
    el.querySelector('button').onclick = ()=>{
      if (craft(r, game.inventory)){
        audio.craft();
        updateCraftUI(); updateInventoryUI(); updateHotbar();
      }
    };
    list.appendChild(el);
  }
}

function updateBuildUI(){
  const list = $('buildList'); list.innerHTML = '';
  const ids = ['wall','floor','door','window','chest','workbench','campfire'];
  for (const id of ids){
    const count = game.inventory.count(id);
    const el = document.createElement('div');
    el.className = 'craftRow' + (count>0?'':' disabled');
    el.innerHTML = `<div class="icon">${ITEMS[id].icon}</div>
      <div class="info"><div class="name">${ITEMS[id].name}</div><div class="cost">${count} ready</div></div>
      <button ${count>0?'':'disabled'}>Place</button>`;
    el.querySelector('button').onclick = ()=>{
      selectBuild(id);
      hide('buildScreen');
    };
    list.appendChild(el);
  }
}

function showBanner(title, desc){
  const b = $('banner');
  b.querySelector('h2').textContent = title;
  b.querySelector('p').textContent = desc;
  b.style.display = 'block';
  audio.event();
  clearTimeout(b._t);
  b._t = setTimeout(()=>{ b.style.display = 'none'; }, 5000);
}
game.showBanner = showBanner;

/* ------------ INIT ------------ */
function initGame(){
  audio.init();
  scene.clear();
  scene.fog = new THREE.Fog(0x88aacc, 60, 320);

  game.world = new World(scene, 1337);
  game.player = new Player(camera, game.world);
  game.inventory = new Inventory(24);
  game.monsterManager = new MonsterManager(scene, game.world);
  game.eventManager = new EventManager(game);
  game.buildings = [];
  game.meteors = [];
  game.day = 1;
  game.lastTime = undefined;
  game.state = 'playing';
  game.selectedBuild = null;

  // starter kit
  game.inventory.add('wood', 12);
  game.inventory.add('stone', 6);
  game.inventory.add('fiber', 4);
  game.inventory.add('berry', 3);
  game.inventory.add('water', 1);

  updateHotbar(); updateInventoryUI(); updateCraftUI(); updateBuildUI();

  hide('startScreen'); hide('deathScreen'); hide('winScreen');
  $('hud').style.display = 'block';
  if (isMobile) show('mobileControls');
  if (!isMobile) requestPointerLock();

  game.world.sky.position.copy(camera.position);
}

function requestPointerLock(){
  if (isMobile) return;
  try { canvas.requestPointerLock(); } catch(e){}
}

/* ------------ SAVE / LOAD ------------ */
function saveGame(){
  if (!game.player || game.player.dead) return;
  const data = {
    version: 1,
    day: game.day,
    time: game.world.timeOfDay,
    player: game.player.serialize(),
    inv: game.inventory.serialize(),
    buildings: game.buildings.map(b=>({id:b.id, pos:b.pos})),
    triggered: game.eventManager.triggered,
    worldSeed: game.world.seed,
  };
  try { localStorage.setItem('100days_save', JSON.stringify(data)); } catch(e){}
}

function loadGame(){
  const raw = localStorage.getItem('100days_save');
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (d.version !== 1) return false;
    initGame();
    game.day = d.day;
    game.world.timeOfDay = d.time;
    game.player.load(d.player);
    game.inventory.load(d.inv);
    game.eventManager.triggered = d.triggered || {};
    for (const b of d.buildings){
      const mesh = makeBuildingMesh(b.id);
      mesh.position.fromArray(b.pos);
      scene.add(mesh);
      game.buildings.push({id:b.id, pos:b.pos, mesh});
    }
    updateHotbar(); updateInventoryUI();
    return true;
  } catch(e){ console.error(e); return false; }
}

/* ------------ BUILDINGS ------------ */
function makeBuildingMesh(id){
  let geo;
  const mat = new THREE.MeshStandardMaterial({
    color: id==='campfire' ? 0x552200 : id==='workbench' ? 0x8b6f47 : id==='chest' ? 0x8a6a3a : 0xa07050
  });
  switch(id){
    case 'wall': geo = new THREE.BoxGeometry(2, 2.5, 0.2); break;
    case 'floor': geo = new THREE.BoxGeometry(2, 0.15, 2); break;
    case 'door': geo = new THREE.BoxGeometry(1.2, 2.2, 0.15); break;
    case 'window': geo = new THREE.BoxGeometry(1.5, 1, 0.15); break;
    case 'chest': geo = new THREE.BoxGeometry(0.8, 0.8, 0.8); break;
    case 'workbench': geo = new THREE.BoxGeometry(1.2, 1, 0.8); break;
    case 'campfire': geo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8); break;
    default: geo = new THREE.BoxGeometry(1,1,1);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.buildId = id;
  return mesh;
}

function selectBuild(id){
  removeGhost();
  game.selectedBuild = id;
  const ghost = makeBuildingMesh(id);
  ghost.material = new THREE.MeshBasicMaterial({color:0x44ff44, transparent:true, opacity:0.5});
  scene.add(ghost);
  game.ghostMesh = ghost;
}

function removeGhost(){
  if (game.ghostMesh){
    scene.remove(game.ghostMesh);
    game.ghostMesh.geometry.dispose();
    game.ghostMesh.material.dispose();
    game.ghostMesh = null;
  }
  game.selectedBuild = null;
}

function updateGhostPosition(){
  if (!game.ghostMesh) return;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  let hit = null;
  for (let t=1; t<=15; t+=0.5){
    const p = origin.clone().addScaledVector(dir, t);
    const gh = game.world.getHeight(p.x, p.z);
    if (p.y <= gh){ hit = new THREE.Vector3(p.x, gh, p.z); break; }
  }
  if (!hit) return;
  const x = Math.round(hit.x/2)*2, z = Math.round(hit.z/2)*2;
  const y = game.world.getHeight(x,z);
  game.ghostMesh.position.set(x, y + (game.selectedBuild==='wall'?1.25:game.selectedBuild==='door'?1.1:game.selectedBuild==='window'?1.5:game.selectedBuild==='floor'?0.05:0.4), z);
  const dist = hit.distanceTo(game.player.position);
  game.ghostMesh.material.color.setHex(dist>10 ? 0xff4444 : 0x44ff44);
}

function tryPlaceBuilding(){
  if (!game.ghostMesh || !game.selectedBuild) return;
  const id = game.selectedBuild;
  if (game.inventory.count(id) <= 0){ removeGhost(); return; }
  const pos = game.ghostMesh.position.clone();
  if (pos.distanceTo(game.player.position) > 10) return;
  const mesh = makeBuildingMesh(id);
  mesh.position.copy(pos);
  scene.add(mesh);
  game.buildings.push({id, pos: pos.toArray(), mesh});
  game.inventory.remove(id, 1);
  audio.craft();
  updateHotbar();
  if (id === 'campfire'){
    const light = new THREE.PointLight(0xff8800, 2.5, 10);
    light.position.copy(pos).add(new THREE.Vector3(0,1,0));
    scene.add(light);
  }
  removeGhost();
}

/* ------------ METEORS ------------ */
function startMeteorShower(){
  for (let i=0;i<20;i++){
    setTimeout(()=>{
      const x = game.player.position.x + (Math.random()-0.5)*70;
      const z = game.player.position.z + (Math.random()-0.5)*70;
      const y = game.world.getHeight(x,z) + 50 + Math.random()*25;
      const geo = new THREE.SphereGeometry(0.8, 8, 8);
      const mat = new THREE.MeshBasicMaterial({color:0xff6600});
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x,y,z);
      m.add(new THREE.PointLight(0xff4400, 3, 25));
      scene.add(m);
      game.meteors.push({mesh:m, life:3});
    }, i*150);
  }
}
game.startMeteorShower = startMeteorShower;

/* ------------ INTERACTION ------------ */
function interact(){
  if (!game.player || game.player.dead) return;
  const px = game.player.position.x, pz = game.player.position.z;
  let nearest = null, minD = 4.5;
  for (const r of game.world.resources){
    if (!r.alive) continue;
    const d = Math.sqrt((r.pos.x-px)**2 + (r.pos.z-pz)**2);
    if (d < minD){ nearest = r; minD = d; }
  }
  if (nearest){
    nearest.hp -= 1;
    audio.gather();
    let yielded = nearest.type === 'tree' ? 'wood' : nearest.type === 'rock' ? 'stone' : 'berry';
    game.inventory.add(yielded, 1);
    if (nearest.type === 'tree' && Math.random() < 0.4) game.inventory.add('fiber', 1);
    if (nearest.hp <= 0){
      nearest.alive = false;
      game.inventory.add(yielded, 2);
    }
    updateHotbar(); updateInventoryUI();
    return;
  }
  // drink from water
  for (let dx=-6; dx<=6; dx+=3){
    for (let dz=-6; dz<=6; dz+=3){
      const b = game.world.getBiome(px+dx, pz+dz);
      if (b === 0 || b === 5){
        game.inventory.add('water', 1);
        audio.gather();
        updateHotbar();
        return;
      }
    }
  }
}

/* ------------ COMBAT ------------ */
function attack(){
  if (!game.player || game.player.attackCooldown > 0) return;
  game.player.attackCooldown = 0.5;
  const s = game.inventory.selectedItem();
  let dmg = 5;
  if (s && ITEMS[s.id].weapon) dmg = ITEMS[s.id].weapon;
  const hit = game.monsterManager.attackFromCamera(camera, 4.5, dmg);
  if (hit) audio.hit(); else audio._tone(180, 0.05, 'sine', 0.05);
}

/* ------------ INPUT ------------ */
window.addEventListener('keydown', e=>{
  if (game.state !== 'playing') return;
  game.keys[e.code] = true;
  if (e.code === 'Space'){ e.preventDefault(); game.input.jump = true; }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyI') togglePanel('invScreen');
  if (e.code === 'KeyC') togglePanel('craftScreen');
  if (e.code === 'KeyB') togglePanel('buildScreen');
  if (e.code === 'KeyF'){ const s = game.inventory.selectedItem(); if (s) consumeItem(s.id); }
  if (e.code === 'KeyQ' && game.selectedBuild) removeGhost();
  if (e.code === 'Escape'){
    if (game.selectedBuild) removeGhost();
    else if (document.pointerLockElement) document.exitPointerLock();
  }
  if (e.code.startsWith('Digit')){
    const n = parseInt(e.code.slice(5)) - 1;
    if (n >= 0 && n < 8){ game.inventory.selected = n; updateHotbar(); }
  }
});
window.addEventListener('keyup', e=>{
  game.keys[e.code] = false;
  if (e.code === 'Space') game.input.jump = false;
});

canvas.addEventListener('click', ()=>{
  if (game.state !== 'playing') return;
  if (game.selectedBuild){ tryPlaceBuilding(); return; }
  if (!document.pointerLockElement && !isMobile) requestPointerLock();
  attack();
});
canvas.addEventListener('contextmenu', e=>{
  e.preventDefault();
  if (game.selectedBuild) removeGhost();
});
document.addEventListener('mousemove', e=>{
  if (game.state !== 'playing') return;
  if (document.pointerLockElement === canvas) game.player.look(e.movementX, e.movementY);
});

function togglePanel(id){
  if (document.pointerLockElement) document.exitPointerLock();
  const el = $(id);
  if (el.classList.contains('hidden')){
    show(id);
    if (id==='invScreen') updateInventoryUI();
    if (id==='craftScreen') updateCraftUI();
    if (id==='buildScreen') updateBuildUI();
  } else {
    hide(id); requestPointerLock();
  }
}

$('invClose').onclick = ()=> togglePanel('invScreen');
$('craftClose').onclick = ()=> togglePanel('craftScreen');
$('buildClose').onclick = ()=> togglePanel('buildScreen');
$('btnNew').onclick = ()=> initGame();
$('btnLoad').onclick = ()=>{ if (!loadGame()) alert('No save found'); };
$('btnRespawn').onclick = ()=>{ hide('deathScreen'); try{localStorage.removeItem('100days_save');}catch(e){} initGame(); };
$('btnWinRestart').onclick = ()=>{ hide('winScreen'); try{localStorage.removeItem('100days_save');}catch(e){} initGame(); };

/* ------------ MOBILE ------------ */
if (isMobile){
  const jz = $('joystickZone'), knob = $('joystickKnob');
  let jid = null;
  jz.addEventListener('touchstart', e=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    jid = t.identifier;
    const r = jz.getBoundingClientRect();
    game.joystick.active = true;
    game.joystick.cx = r.left + r.width/2;
    game.joystick.cy = r.top + r.height/2;
  }, {passive:false});
  jz.addEventListener('touchmove', e=>{
    e.preventDefault();
    for (const t of e.changedTouches){
      if (t.identifier === jid){
        let dx = t.clientX - game.joystick.cx;
        let dy = t.clientY - game.joystick.cy;
        const max = 45;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        if (len > max){ dx = dx/len*max; dy = dy/len*max; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        game.joystick.dx = dx/max;
        game.joystick.dy = dy/max;
      }
    }
  }, {passive:false});
  jz.addEventListener('touchend', e=>{
    for (const t of e.changedTouches){
      if (t.identifier === jid){
        jid = null;
        game.joystick.active = false;
        game.joystick.dx = 0; game.joystick.dy = 0;
        knob.style.transform = 'translate(0,0)';
      }
    }
  });

  // look with drag on canvas
  let lookId = null, lx=0, ly=0, tapStart=0;
  canvas.addEventListener('touchstart', e=>{
    for (const t of e.changedTouches){
      if (lookId === null && t.clientX > window.innerWidth*0.35){
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        tapStart = Date.now();
      }
    }
  }, {passive:true});
  canvas.addEventListener('touchmove', e=>{
    for (const t of e.changedTouches){
      if (t.identifier === lookId){
        game.player.look((t.clientX-lx)*1.4, (t.clientY-ly)*1.4);
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, {passive:true});
  canvas.addEventListener('touchend', e=>{
    for (const t of e.changedTouches){
      if (t.identifier === lookId){
        if (Date.now()-tapStart < 220){
          if (game.selectedBuild) tryPlaceBuilding();
          else attack();
        }
        lookId = null;
      }
    }
  });

  const bindBtn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', e=>{ e.preventDefault(); if (down) down(); }, {passive:false});
    el.addEventListener('touchend', e=>{ e.preventDefault(); if (up) up(); }, {passive:false});
  };
  bindBtn('mJump', ()=>{ game.input.jump = true; }, ()=>{ game.input.jump = false; });
  bindBtn('mInteract', ()=> interact());
  bindBtn('mInv', ()=> togglePanel('invScreen'));
  bindBtn('mCraft', ()=> togglePanel('craftScreen'));
  bindBtn('mBuild', ()=> togglePanel('buildScreen'));
}

/* ------------ HUD ------------ */
function updateHUD(){
  const s = game.player.stats;
  document.querySelector('.bar.health .fill').style.width = s.health + '%';
  document.querySelector('.bar.hunger .fill').style.width = s.hunger + '%';
  document.querySelector('.bar.thirst .fill').style.width = s.thirst + '%';
  document.querySelector('.bar.energy .fill').style.width = s.energy + '%';
  $('dayInfo').textContent = `Day ${game.day}/100`;
  const h = Math.floor(game.world.timeOfDay);
  const m = Math.floor((game.world.timeOfDay-h)*60);
  $('timeInfo').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  $('weatherInfo').textContent = game.world.isNight() ? '🌙 Night' : '☀️ Day';

  // prompt
  let near = null, minD = 4.5;
  const px = game.player.position.x, pz = game.player.position.z;
  for (const r of game.world.resources){
    if (!r.alive) continue;
    const d = Math.sqrt((r.pos.x-px)**2 + (r.pos.z-pz)**2);
    if (d < minD){ near = r; minD = d; }
  }
  let prompt = '';
  if (near) prompt = `[E] Gather ${near.type}`;
  else if (game.selectedBuild) prompt = `[Click] Place ${ITEMS[game.selectedBuild].name}  ·  [Q] Cancel`;
  $('prompt').textContent = prompt;
}

/* ------------ LOOP ------------ */
let lastT = performance.now();

function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  if (game.state === 'playing' && game.player && !game.player.dead){
    const k = game.keys, j = game.joystick;
    game.input.forward = !!(k['KeyW'] || k['ArrowUp'] || (j.active && j.dy < -0.3));
    game.input.back    = !!(k['KeyS'] || k['ArrowDown'] || (j.active && j.dy > 0.3));
    game.input.left    = !!(k['KeyA'] || k['ArrowLeft'] || (j.active && j.dx < -0.3));
    game.input.right   = !!(k['KeyD'] || k['ArrowRight'] || (j.active && j.dx > 0.3));
    if (j.active){ /* jump handled separately */ }

    game.player.update(dt, game.input);
    game.world.update(dt);
    game.monsterManager.update(dt, game.player, game.world.isNight(), game.day);

    // day tracking (increment at midnight wrap)
    if (game.lastTime !== undefined && game.world.timeOfDay < game.lastTime){
      game.day++;
      saveGame();
      game.eventManager.checkDay(game.day);
      if (game.day > 100){
        game.state = 'won';
        if (document.pointerLockElement) document.exitPointerLock();
        $('hud').style.display = 'none';
        hide('mobileControls');
        show('winScreen');
      }
    }
    game.lastTime = game.world.timeOfDay;

    // meteors
    for (const m of game.meteors){
      m.mesh.position.y -= 25 * dt;
      m.life -= dt;
      const gy = game.world.getHeight(m.mesh.position.x, m.mesh.position.z);
      if (m.mesh.position.y < gy) m.life = 0;
    }
    game.meteors = game.meteors.filter(m=>{
      if (m.life <= 0){
        scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
        return false;
      }
      return true;
    });

    if (game.ghostMesh) updateGhostPosition();
    updateHUD();

    if (game.player.dead){
      game.state = 'dead';
      audio.death();
      if (document.pointerLockElement) document.exitPointerLock();
      $('deathMsg').textContent = `You survived until day ${game.day}.`;
      $('hud').style.display = 'none';
      hide('mobileControls');
      show('deathScreen');
      try { localStorage.removeItem('100days_save'); } catch(e){}
    }
  }

  if (game.world){
    game.world.sky.position.copy(camera.position);
    scene.fog.color.copy(game.world.skyMat.uniforms.bottomColor.value);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', ()=>{
  if (game.state === 'playing') saveGame();
});

loop();