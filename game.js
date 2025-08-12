/* Aurora Demo - simple tile-based GBA-style game
   Controls: Arrow keys or on-screen buttons to move
   Z = confirm, X = cancel
   Features: 2 towns + route, starter selection, simple battles, save/load via localStorage
*/

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const TILE = 16;
const MAP_W = 30, MAP_H = 20;
let keys = {};

// UI elements
const uiMessage = document.getElementById('message');
const uiMenu = document.getElementById('menu');

function showMessage(text){ uiMessage.innerText = text; uiMessage.classList.remove('hidden'); }
function hideMessage(){ uiMessage.classList.add('hidden'); }
function showMenu(html){ uiMenu.innerHTML = html; uiMenu.classList.remove('hidden'); }
function hideMenu(){ uiMenu.classList.add('hidden'); }

// Game state
let state = {
  map: 'sunleaf',
  px: 8, py: 14,
  facing: 'down',
  party: [],
  rivalDefeated: false,
  visitedLab: false
};

// Starter Pokémon placeholders
const STARTERS = [
  { id:'sprig', name:'Sprigatito', color:'#4dbb3d', hp:30, atk:8, sp:6 },
  { id:'fuec', name:'Fuecoco', color:'#e85b3b', hp:32, atk:9, sp:5 },
  { id:'quax', name:'Quaxly', color:'#3da3e8', hp:28, atk:7, sp:7 }
];

// Map data and generation
const MAPS = {
  sunleaf: { tiles: [], colliders: {}, eventTiles: {}, npc: [] },
  route1: { tiles: [], colliders: {}, wild: [], trainers: [] },
  brooklight: { tiles: [], colliders: {}, npc: [] }
};

function tileKey(x,y){ return `${x},${y}`; }
function inBounds(x,y){ return x>=0 && x<MAP_W && y>=0 && y<MAP_H; }

function generateMaps(){
  // Sunleaf Town
  let m = MAPS.sunleaf;
  m.tiles = Array(MAP_H).fill(0).map(() => Array(MAP_W).fill('grass'));
  m.colliders = {};
  for(let y=12; y<16; y++) for(let x=2; x<8; x++) { m.tiles[y][x] = 'house'; m.colliders[tileKey(x,y)] = true; }
  for(let y=12; y<16; y++) for(let x=22; x<28; x++) { m.tiles[y][x] = 'house'; m.colliders[tileKey(x,y)] = true; }
  for(let y=2; y<6; y++) for(let x=12; x<18; x++) { m.tiles[y][x] = 'lab'; m.colliders[tileKey(x,y)] = true; }
  for(let y=16; y<20; y++) for(let x=12; x<18; x++) { m.tiles[y][x] = 'path'; }
  delete m.colliders[tileKey(15,19)];
  m.eventTiles = { '15,6': 'labdoor' };
  m.npc = [ {x:24,y:11,text:"Rival: You're not ready!",trigger:'rival'} ];

  // Route 1
  m = MAPS.route1;
  m.tiles = Array(MAP_H).fill(0).map(() => Array(MAP_W).fill('grass'));
  m.colliders = {};
  for(let y=6; y<12; y++) for(let x=22; x<28; x++) { m.tiles[y][x] = 'water'; m.colliders[tileKey(x,y)] = true; }
  for(let y=2; y<14; y++) { m.tiles[y][2] = 'fence'; m.colliders[tileKey(2,y)] = true; }
  for(let x=12; x<18; x++) for(let y=10; y<12; y++) { m.tiles[y][x] = 'path'; }
  m.trainers = [ {x:8,y:9,seen:false,name:'Youngster Joey',team:{name:'Rookidee',hp:12,atk:5}} ];

  // Brooklight Town
  m = MAPS.brooklight;
  m.tiles = Array(MAP_H).fill(0).map(() => Array(MAP_W).fill('grass'));
  m.colliders = {};
  for(let y=8; y<12; y++) for(let x=10; x<20; x++) { m.tiles[y][x] = 'garden'; }
  for(let y=12; y<16; y++) for(let x=2; x<8; x++) { m.tiles[y][x] = 'pc'; m.colliders[tileKey(x,y)] = true; }
  for(let y=12; y<16; y++) for(let x=22; x<28; x++) { m.tiles[y][x] = 'mart'; m.colliders[tileKey(x,y)] = true; }
  m.npc = [ {x:10,y:10,text:"Visit the lab in Sunleaf to get your starter.",trigger:null} ];
}

const palette = {
  grass:'#5fbf4e', path:'#bfa76b', house:'#9b5b2b', lab:'#7db7d6',
  water:'#2b7fb5', fence:'#7b5230', garden:'#7ec06b', pc:'#d67bda', mart:'#d8b07b'
};

function drawMap(){
  const map = MAPS[state.map];
  for(let y=0; y<MAP_H; y++){
    for(let x=0; x<MAP_W; x++){
      let t = map.tiles[y][x] || 'grass';
      ctx.fillStyle = palette[t] || '#5fbf4e';
      ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
      ctx.strokeStyle = '#0b2';
      ctx.strokeRect(x*TILE,y*TILE,TILE,TILE);
    }
  }
  if(map.npc) map.npc.forEach(n => drawRect(n.x,n.y,'#fff'));
  if(map.trainers) map.trainers.forEach(t => drawRect(t.x,t.y,'#ff0'));
  drawRect(state.px,state.py,'#000');
}
function drawRect(x,y,color){
  ctx.fillStyle = color;
  ctx.fillRect(x*TILE+2,y*TILE+2,TILE-4,TILE-4);
}

let moveCooldown = 0;
function update(delta){
  if(moveCooldown>0){ moveCooldown -= delta; return; }
  let dx=0,dy=0;
  if(keys['ArrowLeft'] || keys['left']) { dx=-1; state.facing='left'; }
  else if(keys['ArrowRight'] || keys['right']) { dx=1; state.facing='right'; }
  else if(keys['ArrowUp'] || keys['up']) { dy=-1; state.facing='up'; }
  else if(keys['ArrowDown'] || keys['down']) { dy=1; state.facing='down'; }
  if(dx!==0 || dy!==0){
    let nx=state.px+dx, ny=state.py+dy;
    if(inBounds(nx,ny)){
      let map = MAPS[state.map];
      let blocker = map.colliders[tileKey(nx,ny)];
      if(!blocker){
        state.px=nx; state.py=ny;
        moveCooldown=140;
        checkTileEvent();
      }
    }
  }
  if(keys['z'] || keys['Z']) { keys['z']=false; interact(); }
  if(keys['x'] || keys['X']) { keys['x']=false; }
}

function checkTileEvent(){
  const map = MAPS[state.map];
  let key = tileKey(state.px,state.py);
  if(map.eventTiles && map.eventTiles[key]){
    let ev = map.eventTiles[key];
    if(ev === 'labdoor'){
      enterLab();
    }
  }
  if(map.trainers){
    for(let t of map.trainers){
      if(!t.seen && Math.abs(t.x - state.px) + Math.abs(t.y - state.py) < 2){
        startTrainerBattle(t);
        t.seen = true;
      }
    }
  }
  if(state.map === 'route1'){
    let r = Math.random();
    if(r < 0.12) startWildEncounter();
  }
}

function interact(){
  const map = MAPS[state.map];
  if(map.npc){
    for(let n of map.npc){
      if(Math.abs(n.x - state.px) + Math.abs(n.y - state.py) === 1){
        if(n.trigger === 'rival' && !state.rivalDefeated){
          showMessage(n.text);
          setTimeout(() => hideMessage(), 1500);
        } else {
          showMessage(n.text);
          setTimeout(() => hideMessage(), 1500);
        }
        return;
      }
    }
  }
  if(map.eventTiles && map.eventTiles[tileKey(state.px,state.py)] === 'lab'){
    enterLab();
  }
  if(state.map === 'sunleaf' && state.py === 19){
    state.map = 'route1';
    state.px = 15; state.py = 1;
    saveGame();
  } else if(state.map === 'route1' && state.py === 0){
    state.map = 'brooklight';
    state.px = 15; state.py = 18;
    saveGame();
  } else if(state.map === 'brooklight' && state.py === 19){
    state.map = 'route1';
    state.px = 15; state.py = 1;
    saveGame();
  }
}

function enterLab(){
  if(state.party.length > 0){
    showMessage("Professor: You already have a Pokémon.");
    setTimeout(() => hideMessage(), 1500);
    return;
  }
  let html = "<b>Professor Maple:</b><br/>Choose your starter:<br/>";
  STARTERS.forEach((s,i) => {
    html += `<div style="padding:4px;"><button onclick="chooseStarter(${i})">${s.name}</button></div>`;
  });
  showMenu(html);
}
function chooseStarter(i){
  hideMenu();
  let s = STARTERS[i];
  state.party.push({id:s.id, name:s.name, color:s.color, hp:s.hp, maxhp:s.hp, atk:s.atk, sp:s.sp});
  showMessage("You received " + s.name + "!");
  setTimeout(() => hideMessage(), 1400);
  saveGame();
}

// Simple battle system
let inBattle = false;
let battle = null;

function startWildEncounter(){
  inBattle = true;
  battle = {type:'wild', enemy:{name:'Pidgey', hp:20, atk:6}, turn:'player'};
  showBattleScreen();
}
function startTrainerBattle(trainer){
  inBattle = true;
  battle = {type:'trainer', trainer:trainer.name, enemy:{name:trainer.team.name, hp:trainer.team.hp, atk:trainer.team.atk}, turn:'player'};
  showBattleScreen();
}

function showBattleScreen(){
  updateScreen();
  setTimeout(() => {
    battleTurn();
  }, 200);
}

function battleTurn(){
  if(!inBattle) return;
  if(battle.turn === 'player'){
    let p = state.party[0];
    if(!p){
      showMessage("You have no Pokémon!");
      inBattle = false;
      setTimeout(() => hideMessage(), 1200);
      return;
    }
    const dmg = Math.max(1, p.atk + Math.floor(Math.random() * 3) - 1);
    battle.enemy.hp -= dmg;
    showMessage(p.name + " used Tackle! It dealt " + dmg + " damage.");
    if(battle.enemy.hp <= 0){
      showMessage("Enemy " + battle.enemy.name + " fainted!");
      setTimeout(() => { endBattle(true); }, 1200);
    } else {
      battle.turn = 'enemy';
      setTimeout(() => battleTurn(), 800);
    }
  } else {
    const dmg = Math.max(1, battle.enemy.atk + Math.floor(Math.random() * 2));
    state.party[0].hp -= dmg;
    showMessage(battle.enemy.name + " used Attack! " + dmg + " damage.");
    if(state.party[0].hp <= 0){
      showMessage(state.party[0].name + " fainted!");
      setTimeout(() => { endBattle(false); }, 1200);
    } else {
      battle.turn = 'player';
      setTimeout(() => battleTurn(), 800);
    }
  }
}

function endBattle(playerWon){
  if(playerWon){
    showMessage("You won the battle!");
    state.party[0].hp = Math.min(state.party[0].maxhp, state.party[0].hp + 6);
  } else {
    showMessage("You lost... your Pokémon was returned to the PC.");
    if(state.party[0]) state.party[0].hp = Math.max(1, Math.floor(state.party[0].maxhp/2));
  }
  inBattle = false;
  battle = null;
  saveGame();
  setTimeout(() => hideMessage(), 1200);
}

// Save/load
function saveGame(){
  localStorage.setItem('aurora_demo_save', JSON.stringify(state));
  document.getElementById('savehint').innerText = "Saved to browser (autosave).";
}
function loadGame(){
  let d = localStorage.getItem('aurora_demo_save');
  if(d){
    try {
      let s = JSON.parse(d);
      state = Object.assign(state, s);
      console.log("Loaded save.");
    } catch(e) {
      console.warn("Invalid save.");
    }
  }
}

// Main game loop
generateMaps();
loadGame();
let last = performance.now();
function loop(t){
  let delta = t - last; last = t;
  if(!inBattle) update(delta);
  updateScreen();
  requestAnimationFrame(loop);
}
function updateScreen(){
  ctx.fillStyle = '#88a';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  drawMap();
  ctx.fillStyle = '#000';
  ctx.font = '12px monospace';
  ctx.fillText("Party:", 6, 12);
  for(let i=0; i<state.party.length; i++){
    let p = state.party[i];
    ctx.fillStyle = p.color;
    ctx.fillText(`${p.name} HP:${p.hp}/${p.maxhp}`, 60, 12 + i*14);
  }
}

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  keys[e.key] = false;
  e.preventDefault();
});

// On-screen touch buttons
document.getElementById('btn-up').addEventListener('touchstart', e => { keys['up']=true; e.preventDefault(); });
document.getElementById('btn-up').addEventListener('touchend', e => { keys['up']=false; e.preventDefault(); });
document.getElementById('btn-down').addEventListener('touchstart', e => { keys['down']=true; e.preventDefault(); });
document.getElementById('btn-down').addEventListener('touchend', e => { keys['down']=false; e.preventDefault(); });
document.getElementById('btn-left').addEventListener('touchstart', e => { keys['left']=true; e.preventDefault(); });
document.getElementById('btn-left').addEventListener('touchend', e => { keys['left']=false; e.preventDefault(); });
document.getElementById('btn-right').addEventListener('touchstart', e => { keys['right']=true; e.preventDefault(); });
document.getElementById('btn-right').addEventListener('touchend', e => { keys['right']=false; e.preventDefault(); });

document.getElementById('btn-z').addEventListener('touchstart', e => { keys['z']=true; e.preventDefault(); });
document.getElementById('btn-z').addEventListener('touchend', e => { keys['z']=false; e.preventDefault(); });
document.getElementById('btn-x').addEventListener('touchstart', e => { keys['x']=true; e.preventDefault(); });
document.getElementById('btn-x').addEventListener('touchend', e => { keys['x']=false; e.preventDefault(); });

requestAnimationFrame(loop);
