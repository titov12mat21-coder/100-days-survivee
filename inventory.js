export const ITEMS = {
  wood:        {name:'Wood',        icon:'🪵', stack:99},
  stone:       {name:'Stone',       icon:'🪨', stack:99},
  fiber:       {name:'Fiber',       icon:'🌿', stack:99},
  berry:       {name:'Berry',       icon:'🫐', stack:99, food:15},
  water:       {name:'Water',       icon:'💧', stack:5,  thirst:25},
  meat:        {name:'Raw Meat',    icon:'🥩', stack:20, food:15},
  cookedMeat:  {name:'Cooked Meat', icon:'🍖', stack:20, food:40},
  woodAxe:     {name:'Stone Axe',   icon:'🪓', stack:1, tool:'axe'},
  stonePick:   {name:'Stone Pick',  icon:'⛏️', stack:1, tool:'pick'},
  spear:       {name:'Spear',       icon:'🗡️', stack:1, weapon:20},
  sword:       {name:'Metal Sword', icon:'⚔️', stack:1, weapon:45},
  wall:        {name:'Wall',        icon:'🧱', stack:50, build:'wall'},
  floor:       {name:'Floor',       icon:'⬛', stack:50, build:'floor'},
  door:        {name:'Door',        icon:'🚪', stack:10, build:'door'},
  window:      {name:'Window',      icon:'🪟', stack:10, build:'window'},
  chest:       {name:'Chest',       icon:'📦', stack:5,  build:'chest'},
  workbench:   {name:'Workbench',   icon:'🛠️', stack:3,  build:'workbench'},
  campfire:    {name:'Campfire',    icon:'🔥', stack:5,  build:'campfire'},
};

export class Inventory {
  constructor(size=24){
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.selected = 0;
  }
  add(id, count=1){
    const def = ITEMS[id]; if (!def) return false;
    for (let i=0;i<this.size;i++){
      const s = this.slots[i];
      if (s && s.id===id && s.count < def.stack){
        const add = Math.min(def.stack - s.count, count);
        s.count += add; count -= add;
        if (count<=0) return true;
      }
    }
    for (let i=0;i<this.size;i++){
      if (!this.slots[i]){
        const add = Math.min(def.stack, count);
        this.slots[i] = {id, count:add}; count -= add;
        if (count<=0) return true;
      }
    }
    return count<=0;
  }
  remove(id, count=1){
    for (let i=0;i<this.size;i++){
      const s = this.slots[i];
      if (s && s.id===id){
        const rem = Math.min(s.count, count);
        s.count -= rem; count -= rem;
        if (s.count<=0) this.slots[i]=null;
        if (count<=0) return true;
      }
    }
    return false;
  }
  count(id){ let n=0; for (const s of this.slots) if (s&&s.id===id) n+=s.count; return n; }
  has(id,count=1){ return this.count(id) >= count; }
  selectedItem(){ return this.slots[this.selected]; }
  serialize(){ return {slots:this.slots, selected:this.selected}; }
  load(d){ this.slots = d.slots.slice(); this.selected = d.selected||0; }
}