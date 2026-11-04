export const SPECIAL_DAYS = {
  5:  {name:'Night of Beasts',   desc:'A horde emerges from the dark.', type:'horde'},
  10: {name:'Ancient Awakening', desc:'Something ancient stirs.',        type:'boss'},
  20: {name:'Meteor Shower',     desc:'Fire rains from the sky.',        type:'meteor'},
  30: {name:'The Swarm',         desc:'Small horrors descend.',          type:'swarm'},
  50: {name:'The Warlord',       desc:'A warlord comes for you.',        type:'boss'},
  75: {name:'Eclipse',           desc:'Eternal night falls.',            type:'eclipse'},
  100:{name:'FINAL TRIAL',       desc:'Survive the onslaught.',          type:'final'},
};

export class EventManager {
  constructor(game){ this.game = game; this.triggered = {}; }
  checkDay(day){
    const ev = SPECIAL_DAYS[day];
    if (ev && !this.triggered[day]){
      this.triggered[day] = true;
      this.trigger(ev, day);
      return ev;
    }
    return null;
  }
  trigger(ev, day){
    const g = this.game;
    g.showBanner(ev.name, ev.desc);
    const p = g.player, mm = g.monsterManager;
    switch(ev.type){
      case 'horde':
        for (let i=0;i<6;i++) mm.spawnBoss(p, day);
        break;
      case 'boss':
        mm.spawnBoss(p, day*2);
        break;
      case 'meteor':
        g.startMeteorShower();
        break;
      case 'swarm':
        for (let i=0;i<12;i++) mm.spawnBoss(p, day);
        break;
      case 'eclipse':
        g.world.timeOfDay = 22;
        break;
      case 'final':
        for (let i=0;i<3;i++) mm.spawnBoss(p, 200);
        for (let i=0;i<8;i++)  mm.spawnBoss(p, 100);
        break;
    }
  }
}