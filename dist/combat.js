import {ICE} from './ice.js';
import * as T from './three.module.js';
import { resetRagdoll, beginRagdoll } from './ragdoll.js';
// Simulation values are shared by the local player and AI.
export const COMBAT = Object.freeze({
  cooldown: .68, windup: .12, duration: .40, reach: 1.65,
  minFacingDot: .25, maxHeight: 1.0, knockback: 3.6,
  drag: 4.5, stagger: .24, radius: .42,
  downSeconds: 1.8, getUpSeconds: .55, grabReach: 1.55, escapePush: 2.2,
  escapeJumpSpeed: 8.2, escapeMoveSeconds: .5,
  grabMoveScale: .35, grabbedMoveScale: .42,
  grabAnimationRate: .5, grabbedAnimationRate: .6,
  grabSettleSeconds: .1, grabResponse: 12, grabCorrectionSpeed: 5.5,
  // Unit character mass: 1/2 * closingSpeed^2. Above a stationary bar-tip hit.
  knockdownEnergy: 26, fallCreditSeconds: 4, fallCreditSafeSeconds: .75,
});

export function resetCombat(p) {
  resetRagdoll(p);
  Object.assign(p, {
    impulseX: 0, impulseZ: 0, stagger: 0, hitFlash: 0,
    jumpActive:false,jumpBuffer:0,jumpAge:0,jumpWasDown:false,jumpRequested:false,jumpGrace:0,jumpSupport:null,jumpSupportContact:null,impactSpin:null,mechanismContacts:[],surfaceContacts:[],
    fallCredit:null,fallCreditTime:0,fallCreditSafe:0,
    punchCooldown: 0, punchTime: -1, punchResolved: false,
    attackYaw: 0, facing: 0, punchSerial: 0, hitSerial: 0,
    lastImpactX: 0, lastImpactZ: 0, landingSpeed: 0, lastAttacker: null, aggroTime: 0,
    pendingKnockdown: false, downTime: 0, getUpTime: 0, recoverySupportTime: 0, hazardCooldown: 0,
    shiftAction: false, diving: false, diveUsed: false, diveRecovery: 0, divePose: 0, diveYaw: 0,
    airTime: 0, aiDivePlan: null, aiRunup: null, diveCheck: 0, aiDiveCount: 0,
    demoTarget: null,
    grabbing: null, grabbedBy: null, grabCooldown: 0, grabImmunity: 0,
    grabNeedsRelease: false, escapeProgress: 0, escapeJumpRequested: false, struggleMoving: false, struggleJump: false,
    grabYaw: 0, grabRetreatYaw: 0, grabFacingLocked: false, grabIntent: false, grabVisualTarget: null,
    grabOffsetX: 0, grabOffsetZ: 0, grabAge: 0,
    grabVelocityX: 0, grabVelocityZ: 0, grabTension: 0,
  });
}

export function isDown(p) { return p.downTime > 0 || p.getUpTime > 0; }
export function isDiving(p) { return !!p.diving || p.diveRecovery > 0; }

export function creditPush(victim,attacker){
 if(!victim.alive||victim.finished||victim===attacker)return;
 victim.fallCredit=attacker.i;victim.fallCreditTime=COMBAT.fallCreditSeconds;victim.fallCreditSafe=0;
}

export function knockDown(p) {
  if (!p.alive || p.finished) return;
  p.pendingKnockdown = false;p.jumpActive=false;p.jumpBuffer=0;p.jumpGrace=0;p.jumpSupport=null;
  p.diving=false;p.diveRecovery=0;p.divePose=0;p.shiftAction=false;
  p.aiDivePlan=null;p.aiRunup=null;
  p.downTime = COMBAT.downSeconds; p.getUpTime = 0;
  p.recoverySupportTime = 0;
  p.punchTime = -1; // Ragdoll entry preserves the current travel velocity.
  p.escapeProgress = 0;p.escapeJumpRequested=false;
  if(p.mesh?.userData.animal)beginRagdoll(p);
}

export function hazardImpact(p, dx, dz, strength = 8, lift = 6) {
  if (!p.alive || p.finished || isDown(p) || p.hazardCooldown > 0) return false;
  p.impactSpin=3;
  const length = Math.hypot(dx,dz);
  const nx = length > .01 ? dx / length : Math.cos(p.facing);
  const nz = length > .01 ? dz / length : Math.sin(p.facing);
  // Add this hit to existing movement/knockback, including a rising or falling jump.
  p.impulseX += nx * strength; p.impulseZ += nz * strength;
  p.vy += lift; p.ground = null;
  p.hazardCooldown = 1.15; p.stagger = .32;
  p.hitFlash = .2; p.hitSerial++; p.lastImpactX = nx; p.lastImpactZ = nz;
  knockDown(p);
  return true;
}

export function waveImpact(p) {
  if (!p.alive || p.finished || isDown(p) || p.hazardCooldown > 0) return false;
  // The wave adds no launch or spin, but keeps all existing travel momentum.
  // Shared ragdoll entry transfers movement, knockback/fan and grab velocity once.
  const stationary=!!p.ground&&Math.hypot(p.vx+p.impulseX+(p.grabVelocityX||0),p.vy,p.vz+p.impulseZ+(p.grabVelocityZ||0))<.01;
  p.impactSpin=0;p.lastImpactX=0;p.lastImpactZ=0;
  p.hazardCooldown=1.15;p.stagger=.32;p.hitFlash=.2;p.hitSerial++;
  knockDown(p);
  if(p.ragdoll)p.ragdoll.settleInPlace=stationary;
  return true;
}

// Kinematic mechanisms transfer a vector impulse at the actual contact, with
// no fixed launch direction or artificial upward kick.
export function mechanicalImpact(p,impulse,velocity){
 if(!p.alive||p.finished||isDown(p)||p.hazardCooldown>0||impulse.length()<.25)return false;
 // The contact captures total pre-collision velocity, including pending forces.
 // Restore that total once, then add the new impulse; do not count its channels twice.
 p.vx=velocity.x;p.vy=velocity.y;p.vz=velocity.z;
 p.grabVelocityX=0;p.grabVelocityZ=0;
 p.impulseX=impulse.x;p.impulseZ=impulse.z;p.vy+=impulse.y;p.ground=null;
 // A capped visual shove must never leave residual velocity into the solid.
 if(impulse.contactNormal){
  const normal=impulse.contactNormal,relative=new T.Vector3(p.vx+p.impulseX,p.vy,p.vz+p.impulseZ).sub(impulse.objectVelocity);
  const inward=relative.dot(normal);
  if(inward<0){p.impulseX-=normal.x*inward;p.vy-=normal.y*inward;p.impulseZ-=normal.z*inward;}
 }
 p.impactSpin=Math.min(1,impulse.length()*.12);p.hazardCooldown=.65;p.stagger=.25;
 p.hitFlash=.2;p.hitSerial++;const flat=Math.hypot(impulse.x,impulse.z)||1;
 p.lastImpactX=impulse.x/flat;p.lastImpactZ=impulse.z/flat;
 const energy=impulse.impactEnergy??.5*(impulse.length()/1.12)**2;
 if(energy>COMBAT.knockdownEnergy)knockDown(p);
 return true;
}

export function releaseGrab(holder, players, reason = 'release') {
  if (!holder || holder.grabbing===null) return;
  const target = players.find(p=>p.i===holder.grabbing);
  if (target?.grabbedBy === holder.i) {
    target.grabbedBy = null; target.escapeProgress = 0;target.escapeJumpRequested=false;
    target.grabVelocityX=0;target.grabVelocityZ=0;target.grabTension=0;
    target.grabImmunity = reason === 'escape' ? 1.0 : .35;
    if(target.ragdoll)target.ragdoll.grip=null;
  }
  holder.grabbing = null;
  holder.grabVelocityX=0;holder.grabVelocityZ=0;holder.grabTension=0;holder.grabAge=0;
  holder.grabFacingLocked=false;
  holder.grabVisualTarget=null;
  holder.grabCooldown = .35;
  if (reason === 'escape' || reason === 'break') {holder.grabNeedsRelease=true;holder.grabIntent=false;}
}

export function clearGrabs(players) {
  for (const p of players) {
    p.grabbing = null; p.grabbedBy = null; p.escapeProgress = 0;
    p.escapeJumpRequested=false;
    p.grabFacingLocked=false;
    p.grabVelocityX=0;p.grabVelocityZ=0;p.grabTension=0;p.grabAge=0;
    p.grabNeedsRelease = false;
    p.grabIntent=false;p.grabVisualTarget=null;
    if(p.ragdoll)p.ragdoll.grip=null;
  }
}

function setGrabAnchor(holder,target,yaw){
  const dx=target.x-holder.x,dz=target.z-holder.z,distance=Math.hypot(dx,dz);
  const restingDistance=Math.max(.9,Math.min(1.08,distance));
  holder.grabOffsetX=(distance>.01?dx/distance:Math.cos(yaw))*restingDistance;
  holder.grabOffsetZ=(distance>.01?dz/distance:Math.sin(yaw))*restingDistance;
  holder.grabAge=0;
}

export function startGrab(holder, players, yaw = holder.facing, blocked = () => false) {
  if (!holder.alive || holder.finished || isDown(holder) || isDiving(holder) || holder.pendingKnockdown ||
      holder.grabbing !== null || holder.grabbedBy !== null || holder.grabCooldown > 0 ||
      holder.grabNeedsRelease || holder.punchTime >= 0) return false;
  let target = null, bestScore = Infinity;
  for (const p of players) {
    if (p===holder || !p.alive || p.finished || p.grabbedBy!==null ||
        p.grabbing!==null || p.grabImmunity>0) continue;
    const dx=p.x-holder.x,dz=p.z-holder.z,d=Math.hypot(dx,dz);
    const alignment=d>.01?(dx*Math.cos(yaw)+dz*Math.sin(yaw))/d:1;
    if (d>COMBAT.grabReach || Math.abs(p.y-holder.y)>1.05 ||
        alignment<.35 || blocked(holder,p)) continue;
    // Prefer the opponent in front of the hands instead of a slightly nearer bystander.
    const score=d+(1-alignment)*.85;
    if(score<bestScore){target=p;bestScore=score;}
  }
  if (!target) return false;
  holder.grabbing=target.i; holder.grabYaw=yaw; holder.facing=yaw; holder.punchTime=-1;
  holder.grabFacingLocked=!isDown(target);holder.grabRetreatYaw=yaw+Math.PI;
  setGrabAnchor(holder,target,yaw);
  target.grabbedBy=holder.i; target.escapeProgress=0;target.escapeJumpRequested=false;
  return true;
}

export function strugglePulse(p) {
  // A jump request is separate from sustained movement: only jumping launches.
  if (p.grabbedBy !== null && !isDown(p)) p.escapeJumpRequested=true;
}

export function updateGrabs(players, dt, blocked = () => false, onEscape = () => {}) {
  for (const holder of players) {
    if (holder.grabbing === null) continue;
    const p=players.find(p=>p.i===holder.grabbing);
    if (!p || p.grabbedBy!==holder.i || !p.alive || p.finished ||
        !holder.alive || holder.finished || isDown(holder) || isDiving(holder) || holder.pendingKnockdown) {
      releaseGrab(holder,players,'break');continue;
    }
    // A held, downed player keeps recovering normally but cannot bank escape input.
    if (isDown(p)) {p.escapeProgress=0;p.escapeJumpRequested=false;}
    else {
      // Count current directional input, not tether/knockback velocity.
      // Stopping resets the continuous interval instead of banking progress.
      p.escapeProgress=p.struggleMoving?Math.min(1,p.escapeProgress+dt/COMBAT.escapeMoveSeconds):0;
      const jumpEscape=p.escapeJumpRequested;
      if(jumpEscape||p.escapeProgress>=1-1e-8){
      releaseGrab(holder,players,'escape');
      // Push along the victim's visible facing, independently of the camera.
      p.impulseX+=Math.cos(p.facing)*COMBAT.escapePush;
      p.impulseZ+=Math.sin(p.facing)*COMBAT.escapePush;
      if(jumpEscape&&p.ground){
        p.launchSurface=p.ground;p.ground=null;p.vy=COMBAT.escapeJumpSpeed;
        p.jumpCD=Math.max(p.jumpCD||0,.32);
      }
      onEscape(p,holder);continue;
      }
    }
    if(!holder.grabFacingLocked&&!isDown(p))setGrabAnchor(holder,p,holder.facing);
    holder.grabFacingLocked=!isDown(p);
    if(holder.grabFacingLocked)holder.facing=holder.grabYaw;
    else holder.grabYaw=holder.facing;
    holder.grabAge+=dt;
    if(Math.hypot(holder.vx+holder.impulseX,holder.vz+holder.impulseZ)>.2||!p.ground)creditPush(p,holder);
    holder.grabVelocityX=holder.grabVelocityZ=p.grabVelocityX=p.grabVelocityZ=0;
    const tx=holder.x+Math.cos(holder.facing)*.9,tz=holder.z+Math.sin(holder.facing)*.9;
    if(p.ragdoll?.active){
      holder.grabTension=p.grabTension=0;
      const r=p.ragdoll,hand=new T.Vector3(tx,holder.y+.63,tz);
      if(!r.grip){
        const left=r.nodes.get('FistL'),right=r.nodes.get('FistR');
        r.grip={node:left.p.distanceTo(hand)<right.p.distanceTo(hand)?'FistL':'FistR',target:hand};
      }else r.grip.target.copy(hand);
      holder.grabVisualTarget=r.nodes.get(r.grip.node).p.clone();
      const drag=holder.grabVisualTarget.clone().sub(hand).clampLength(0,1);
      holder.impulseX+=drag.x*dt*3;holder.impulseZ+=drag.z*dt*3;
      continue;
    }
    const towardHolder=new T.Vector3(holder.x-p.x,0,holder.z-p.z).normalize();
    holder.grabVisualTarget=new T.Vector3(p.x,p.y+.65,p.z).addScaledVector(towardHolder,.27);
    const dx=holder.x+holder.grabOffsetX-p.x,dz=holder.z+holder.grabOffsetZ-p.z;
    // Solve a soft two-body velocity constraint, separate from knockback.
    // It cannot bank spring energy or keep pulling after either side releases.
    const relativeX=p.vx+p.impulseX-holder.vx-holder.impulseX;
    const relativeZ=p.vz+p.impulseZ-holder.vz-holder.impulseZ;
    const correction=new T.Vector2(dx*COMBAT.grabResponse-relativeX,dz*COMBAT.grabResponse-relativeZ);
    correction.clampLength(0,COMBAT.grabCorrectionSpeed);
    correction.multiplyScalar(Math.min(1,holder.grabAge/COMBAT.grabSettleSeconds));
    p.grabVelocityX=correction.x*.7;p.grabVelocityZ=correction.y*.7;
    holder.grabVelocityX=-correction.x*.3;holder.grabVelocityZ=-correction.y*.3;
    holder.grabTension=p.grabTension=Math.min(1,correction.length()/COMBAT.grabCorrectionSpeed);
  }
}

export function startPunch(p, yaw = p.facing) {
  if (!p.alive || p.finished || isDown(p) || isDiving(p) || p.grabbing !== null ||
      p.grabbedBy !== null || p.punchCooldown > 0 || p.stagger > .1) return false;
  p.punchCooldown = COMBAT.cooldown;
  p.punchTime = 0;
  p.punchResolved = false;
  p.attackYaw = yaw;
  p.facing = yaw;
  p.punchSerial++;
  return true;
}

export function strikeTarget(attacker, players, blocked = () => false) {
  let best = null, nearest = Infinity;
  const fx = Math.cos(attacker.attackYaw), fz = Math.sin(attacker.attackYaw);
  for (const p of players) {
    if (p === attacker || !p.alive || p.finished) continue;
    const dx = p.x - attacker.x, dz = p.z - attacker.z, d = Math.hypot(dx, dz);
    if (d > COMBAT.reach || Math.abs(p.y - attacker.y) > COMBAT.maxHeight) continue;
    if (d > .01 && (dx * fx + dz * fz) / d < COMBAT.minFacingDot) continue;
    if (d < nearest && !blocked(attacker, p)) { best = p; nearest = d; }
  }
  return best;
}

export function updateCombat(players, dt, onHit = () => {}, blocked = () => false) {
  for (const p of players) {
    p.punchCooldown = Math.max(0, p.punchCooldown - dt);
    p.stagger = Math.max(0, p.stagger - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.aggroTime = Math.max(0, p.aggroTime - dt);
    p.fallCreditTime=Math.max(0,(p.fallCreditTime||0)-dt);
    const floorBounds=p.ground?.worldBounds,margin=COMBAT.radius+.25;
    const awayFromEdge=!floorBounds||(p.x>floorBounds.min.x+margin&&p.x<floorBounds.max.x-margin&&p.z>floorBounds.min.z+margin&&p.z<floorBounds.max.z-margin);
    p.fallCreditSafe=p.ground&&awayFromEdge&&!isDown(p)&&p.grabbedBy===null?(p.fallCreditSafe||0)+dt:0;
    if(!p.fallCreditTime||p.fallCreditSafe>=COMBAT.fallCreditSafeSeconds)p.fallCredit=null;
    p.hazardCooldown = Math.max(0,p.hazardCooldown-dt);
    p.grabCooldown = Math.max(0,p.grabCooldown-dt);
    p.grabImmunity = Math.max(0,p.grabImmunity-dt);
    // Only stable contact with a supporting floor can advance recovery.
    // Touching a wall, rising past a ledge, or being dragged into the air cannot.
    // A supported ragdoll can rotate its pelvis upward without being airborne.
    const supported=!!p.ground&&(p.ragdoll?.active?!p.ragdoll.launching:(p.vy||0)<=.5);
    p.recoverySupportTime=supported?(p.recoverySupportTime||0)+dt:0;
    if (p.downTime>0 && p.recoverySupportTime>=.12) {
      p.downTime=Math.max(0,p.downTime-dt);
      if (p.downTime===0) p.getUpTime=COMBAT.getUpSeconds;
    } else if (p.getUpTime>0 && supported) p.getUpTime=Math.max(0,p.getUpTime-dt);
    if (!p.alive || p.finished) { p.punchTime = -1; continue; }
    if (isDown(p)||isDiving(p)) p.punchTime=-1;
    if (p.punchTime < 0) continue;
    p.punchTime += dt;
    if (!p.punchResolved && p.punchTime >= COMBAT.windup) {
      p.attackYaw=p.facing; // Resolve along the visible body's current facing.
      p.punchResolved = true; // One target and one hit per swing, including misses.
      const victim = strikeTarget(p, players, blocked);
      if (victim) {
        const dx = victim.x - p.x, dz = victim.z - p.z, d = Math.hypot(dx, dz);
        const nx = d > .01 ? dx / d : Math.cos(p.attackYaw);
        const nz = d > .01 ? dz / d : Math.sin(p.attackYaw);
        victim.impulseX += nx * COMBAT.knockback;
        victim.impulseZ += nz * COMBAT.knockback;
        const speed = Math.hypot(victim.impulseX, victim.impulseZ);
        if (speed > 5) { victim.impulseX *= 5 / speed; victim.impulseZ *= 5 / speed; }
        // Punches only push horizontally; preserve jump/fall velocity and support.
        victim.stagger = COMBAT.stagger;
        victim.hitFlash = .16;
        victim.lastImpactX = nx; victim.lastImpactZ = nz;
        victim.hitSerial++;
        victim.lastAttacker = p.i; victim.aggroTime = 2.5;
        creditPush(victim,p);
        // A light punch pushes the pair without automatically breaking the grip.
        onHit(p, victim);
      }
    }
    if (p.punchTime > COMBAT.duration) p.punchTime = -1;
  }
}

export function integrateImpulse(p, dt) {
  // Exact exponential displacement keeps a light hit ~0.8 m at all frame rates.
  const drag=p.ground?.frozen?ICE.impulseDrag:COMBAT.drag;
  const decay = Math.exp(-drag * dt), travel = (1 - decay) / drag;
  p.x += p.impulseX * travel; p.z += p.impulseZ * travel;
  p.impulseX *= decay; p.impulseZ *= decay;
}

export function resolvePlayerContacts(players, dt) {
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    if (!a.alive || !b.alive || a.finished || b.finished || a.ragdoll?.active || b.ragdoll?.active || Math.abs(a.y - b.y) > 1.25) continue;
    let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= COMBAT.radius * 2) continue;
    if (d < .001) { dx = 0; dz = 1; d = 1; }
    const overlap = COMBAT.radius * 2 - Math.hypot(b.x - a.x, b.z - a.z);
    const correction = overlap * .5 * (1 - Math.exp(-dt * 20));
    const nx = dx / d, nz = dz / d;
    const approach=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
    if(approach>1){
      const av=a.vx*nx+a.vz*nz,bv=-b.vx*nx-b.vz*nz;
      if(av>bv+.5)creditPush(b,a);else if(bv>av+.5)creditPush(a,b);
    }
    a.x -= nx * correction; a.z -= nz * correction;
    b.x += nx * correction; b.z += nz * correction;
    const push = Math.min(.8, overlap * 4) * dt;
    a.impulseX -= nx * push; a.impulseZ -= nz * push;
    b.impulseX += nx * push; b.impulseZ += nz * push;
  }
}
