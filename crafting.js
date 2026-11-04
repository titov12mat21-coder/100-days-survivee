export const RECIPES = [
  {id:'woodAxe',   name:'Stone Axe',    cost:{wood:3, stone:2, fiber:2}, station:null},
  {id:'stonePick', name:'Stone Pick',   cost:{wood:3, stone:3, fiber:2}, station:null},
  {id:'spear',     name:'Spear',        cost:{wood:4, stone:2, fiber:1}, station:null},
  {id:'sword',     name:'Metal Sword',  cost:{wood:2, stone:8},          station:'workbench'},
  {id:'campfire',  name:'Campfire',     cost:{wood:5, stone:5},          station:null},
  {id:'wall',      name:'Wall (x4)',    cost:{wood:4},                   station:null},
  {id:'floor',     name:'Floor (x4)',   cost:{wood:2},                   station:null},
  {id:'door',      name:'Door',         cost:{wood:3},                   station:null},
  {id:'window',    name:'Window',       cost:{wood:2},                   station:null},
  {id:'chest',     name:'Chest',        cost:{wood:6},                   station:null},
  {id:'workbench', name:'Workbench',    cost:{wood:10, stone:4},         station:null},
  {id:'cookedMeat',name:'Cooked Meat',  cost:{meat:1},                   station:'campfire'},
];

export function canCraft(recipe, inv){
  for (const [id,c] of Object.entries(recipe.cost)) if (!inv.has(id,c)) return false;
  return true;
}
export function craft(recipe, inv){
  if (!canCraft(recipe, inv)) return false;
  for (const [id,c] of Object.entries(recipe.cost)) inv.remove(id,c);
  inv.add(recipe.id, 1);
  return true;
}