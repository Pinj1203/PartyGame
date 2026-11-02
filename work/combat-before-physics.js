// Simulation values are shared by the local player and AI.
export const COMBAT = Object.freeze({
  cooldown: .68, windup: .12, duration: .40, reach: 1.65,
  minFacingDot: .25, maxHeight: 1.0, knockback: 3.6,
  drag: 4.5, stagger: .24, radius: .42,
  downSeconds: 1.8, getUpSeconds: .55, grabReach: 1.55, grabBreakDistance: 2.6,
});

export function resetCombat(p) {
  Object.assign(p, {
    impulseX: 0, impulseZ: 0, stagger: 0, hitFlash: 0,
    punchCooldown: 0, punchTime: -1, punchResolved: false,
    attackYaw: 0, facing: 0, punchSerial: 0, hitSerial: 0,
    lastImpactX: 0, lastImpactZ: 0, landingSpeed: 0, lastAttacker: null, aggroTime: 0,
    pendingKnockdown: false, downTime: 0, getUpTime: 0, hazardCooldown: 0,
    grabbing: null, grabbedBy: null, grabCooldown: 0, grabImmunity: 0,
    grabNeedsRelease: false, escapeProgress: 0, struggleMoving: false, struggleJump: false,
    aiGrabUntil: 0,
  });
}

export function isDown(p) { return p.downTime > 0 || p.getUpTime > 0; }

export function knockDown(p) {
  if (!p.alive || p.finished) return;
  p.pendingKnockdown = false;
  p.downTime = COMBAT.downSeconds; p.getUpTime = 0;
  p.punchTime = -1; p.vx *= .2; p.vz *= .2;
  p.escapeProgress = 0;
}

export function hazardImpact(p, dx, dz, strength = 8, lift = 6) {
  if (!p.alive || p.finished || isDown(p) || p.hazardCooldown > 0) return false;
  const length = Math.hypot(dx,dz);
  const nx = length > .01 ? dx / length : Math.cos(p.facing);
  const nz = length > .01 ? dz / length : Math.sin(p.facing);
  p.impulseX = nx * strength; p.impulseZ = nz * strength;
  p.vy = Math.max(p.vy,lift); p.ground = null;
  p.pendingKnockdown = true; p.hazardCooldown = 1.15; p.stagger = .32;
  p.hitFlash = .2; p.hitSerial++; p.lastImpactX = nx; p.lastImpactZ = nz;
  p.punchTime = -1;
  return true;
}

export function releaseGrab(holder, players, reason = 'release') {
  if (!holder) return;
  const target = players.find(p=>p.i===holder.grabbing);
  if (target?.grabbedBy === holder.i) {
    target.grabbedBy = null; target.escapeProgress = 0;
    target.grabImmunity = reason === 'escape' ? 1.0 : .35;
  }
  holder.grabbing = null;
  holder.grabCooldown = .35;
  if (reason === 'escape' || reason === 'break') holder.grabNeedsRelease = true;
}

export function clearGrabs(players) {
  for (const p of players) {
    p.grabbing = null; p.grabbedBy = null; p.escapeProgress = 0;
    p.grabNeedsRelease = false;
  }
}

export function startGrab(holder, players, yaw = holder.facing, blocked = () => false) {
  if (!holder.alive || holder.finished || isDown(holder) || holder.pendingKnockdown ||
      holder.grabbing !== null || holder.grabbedBy !== null || holder.grabCooldown > 0 ||
      holder.grabNeedsRelease || holder.punchTime >= 0) return false;
  let target = null, nearest = COMBAT.grabReach;
  for (const p of players) {
    if (p===holder || !p.alive || p.finished || p.grabbedBy!==null ||
        p.grabbing!==null || p.grabImmunity>0) continue;
    const dx=p.x-holder.x,dz=p.z-holder.z,d=Math.hypot(dx,dz);
    if (d>nearest || Math.abs(p.y-holder.y)>1.05 ||
        (d>.01&&(dx*Math.cos(yaw)+dz*Math.sin(yaw))/d<.25) || blocked(holder,p)) continue;
    target=p;nearest=d;
  }
  if (!target) return false;
  holder.grabbing=target.i; holder.facing=yaw; holder.punchTime=-1;
  target.grabbedBy=holder.i; target.escapeProgress=0;
  return true;
}

export function strugglePulse(p) {
  if (p.grabbedBy !== null && !isDown(p)) p.escapeProgress=Math.min(1,p.escapeProgress+.22);
}

export function updateGrabs(players, dt, blocked = () => false, onEscape = () => {}) {
  for (const holder of players) {
    if (holder.grabbing === null) continue;
    const p=players.find(p=>p.i===holder.grabbing);
    if (!p || p.grabbedBy!==holder.i || !p.alive || p.finished ||
        !holder.alive || holder.finished || isDown(holder) || holder.pendingKnockdown ||
        p.pendingKnockdown || Math.abs(holder.y-p.y)>2.1 ||
        Math.hypot(p.x-holder.x,p.z-holder.z)>COMBAT.grabBreakDistance || blocked(holder,p)) {
      releaseGrab(holder,players,'break');continue;
    }
    // A held, downed player keeps recovering normally but cannot bank escape input.
    if (isDown(p)) p.escapeProgress=0;
    else {
      const effort=(p.struggleMoving?.9:0)+(p.struggleJump?.55:0);
      p.escapeProgress=Math.max(0,p.escapeProgress+(effort||-.15)*dt);
      if (p.escapeProgress>=1) { releaseGrab(holder,players,'escape');onEscape(p,holder);continue; }
    }
    const tx=holder.x+Math.cos(holder.facing)*.9,tz=holder.z+Math.sin(holder.facing)*.9;
    const dx=tx-p.x,dz=tz-p.z;
    // A damped tether pulls horizontally; it never teleports or suspends a player in air.
    const fx=Math.max(-24,Math.min(24,dx*24-(p.vx-holder.vx)*3));
    const fz=Math.max(-24,Math.min(24,dz*24-(p.vz-holder.vz)*3));
    p.impulseX+=fx*dt;p.impulseZ+=fz*dt;
    holder.impulseX-=fx*dt*.16;holder.impulseZ-=fz*dt*.16;
  }
}

export function startPunch(p, yaw = p.facing) {
  if (!p.alive || p.finished || isDown(p) || p.grabbing !== null ||
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
    p.hazardCooldown = Math.max(0,p.hazardCooldown-dt);
    p.grabCooldown = Math.max(0,p.grabCooldown-dt);
    p.grabImmunity = Math.max(0,p.grabImmunity-dt);
    if (p.downTime>0 && p.ground) {
      p.downTime=Math.max(0,p.downTime-dt);
      if (p.downTime===0) p.getUpTime=COMBAT.getUpSeconds;
    } else if (p.getUpTime>0 && p.ground) p.getUpTime=Math.max(0,p.getUpTime-dt);
    if (!p.alive || p.finished) { p.punchTime = -1; continue; }
    if (isDown(p)) p.punchTime=-1;
    if (p.punchTime < 0) continue;
    p.punchTime += dt;
    if (!p.punchResolved && p.punchTime >= COMBAT.windup) {
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
        victim.vy = Math.max(victim.vy, victim.ground ? 1.35 : 0);
        victim.ground = null;
        victim.stagger = COMBAT.stagger;
        victim.hitFlash = .16;
        victim.lastImpactX = nx; victim.lastImpactZ = nz;
        victim.hitSerial++;
        victim.lastAttacker = p.i; victim.aggroTime = 2.5;
        onHit(p, victim);
      }
    }
    if (p.punchTime > COMBAT.duration) p.punchTime = -1;
  }
}

export function integrateImpulse(p, dt) {
  // Exact exponential displacement keeps a light hit ~0.8 m at all frame rates.
  const decay = Math.exp(-COMBAT.drag * dt), travel = (1 - decay) / COMBAT.drag;
  p.x += p.impulseX * travel; p.z += p.impulseZ * travel;
  p.impulseX *= decay; p.impulseZ *= decay;
}

export function resolvePlayerContacts(players, dt) {
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    if (!a.alive || !b.alive || a.finished || b.finished || Math.abs(a.y - b.y) > 1.25) continue;
    let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= COMBAT.radius * 2) continue;
    if (d < .001) { dx = 0; dz = 1; d = 1; }
    const overlap = COMBAT.radius * 2 - Math.hypot(b.x - a.x, b.z - a.z);
    const correction = overlap * .5 * (1 - Math.exp(-dt * 20));
    const nx = dx / d, nz = dz / d;
    a.x -= nx * correction; a.z -= nz * correction;
    b.x += nx * correction; b.z += nz * correction;
    const push = Math.min(.8, overlap * 4) * dt;
    a.impulseX -= nx * push; a.impulseZ -= nz * push;
    b.impulseX += nx * push; b.impulseZ += nz * push;
  }
}
