import * as netcode from '../dist/netcode.js';
import * as diveControl from '../dist/dive.js';
import * as movingPlatforms from '../dist/moving-platforms.js';
import * as jumpControl from '../dist/jump.js';
import * as ice from '../dist/ice.js';
import * as waveEffects from '../dist/waves.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from '../dist/three.module.js';
import * as characters from '../dist/characters.js';
import * as combat from '../dist/combat.js';
import {CollisionWorld} from '../dist/collision.js';
import * as ragdoll from '../dist/ragdoll.js';
import {DivePlanner} from '../dist/ai-dive.js';
import {generateIslands,COURSE} from '../dist/island-map.js';
import {PlaceableFacilities,createFacilityModel,FACILITY_TYPES,contactImpulse} from '../dist/facilities.js';
globalThis.ProgressEvent=class {constructor(type,args){Object.assign(this,args);}};
await characters.loadCharacters(fs.readFileSync(new URL('../dist/assets/characters/bunny.gltf',import.meta.url),'utf8'));
export function run(verify) {
  function element() {
    return {
      value:'0',hidden:false,style:{setProperty(){}},textContent:'',innerHTML:'',handlers:new Map(),
      addEventListener(type,handler){this.handlers.set(type,handler);},
      emit(type,event){this.handlers.get(type)?.(event);},
      appendChild(){},remove(){},setPointerCapture(){},querySelectorAll(){return [];},
      getContext(){return {fillText(){}};},
    };
  }
  const elements=new Map();
  const document=Object.assign(element(),{
    getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    createElement:element,
  });
  const window=element();
  class FakeRenderer {
    constructor(){this.shadowMap={};this.domElement=element();}
    setSize(){} setPixelRatio(){} render(){}
  }
  const source=fs.readFileSync('dist/game.js','utf8')
    .replace(/^import .*;$/gm,'').replace('boot();', 'toLobby();')
    .replace('new T.WebGLRenderer','new FakeRenderer')
    .replace('function makeMap(seed=(Math.random()*4294967296)>>>0)', 'function makeMap(seed=1)')
    .replaceAll('import.meta.url',JSON.stringify(new URL('../dist/game.js',import.meta.url).href));
  new Function('diveControl','netcode','movingPlatforms','COURSE','jumpControl','ice','waveEffects','generateIslands','PlaceableFacilities','createFacilityModel','FACILITY_TYPES','contactImpulse','DivePlanner','characters','combat','CollisionWorld','ragdoll','assert','T','document','window','FakeRenderer','innerWidth',
    'innerHeight','devicePixelRatio','requestAnimationFrame','const {DIVE,launchDive}=diveControl;const {PLAYER_FIELDS,STEP,SnapshotTimeline,LocalPredictor,interpolateActor}=netcode;const {MOVING,MOVING_TYPES,isMoving,movingPosition,movingBounds,createMovingPlatform,addMovingPreview,MovingPlatforms}=movingPlatforms;const {JUMP,beginJump,updateJump}=jumpControl;const {ICE,iceTargets,freezeSurface,createIcePreview,updateIcePreview}=ice;const {WAVE,createWaveMesh,setWaveRadius}=waveEffects;const {beginRagdoll,stepRagdoll,beginRecovery}=ragdoll; const {loadCharacters, createAnimal, animateAnimal, resetAnimal}=characters; const {COMBAT,resetCombat,startPunch,updateCombat,integrateImpulse,resolvePlayerContacts,isDown,isDiving,knockDown,hazardImpact,waveImpact,mechanicalImpact,startGrab,releaseGrab,clearGrabs,updateGrabs,strugglePulse}=combat;'+source+verify
  )(diveControl,netcode,movingPlatforms,COURSE,jumpControl,ice,waveEffects,generateIslands,PlaceableFacilities,createFacilityModel,FACILITY_TYPES,contactImpulse,DivePlanner,characters,combat,CollisionWorld,ragdoll,assert,T,document,window,FakeRenderer,1280,800,1,()=>{});
}
