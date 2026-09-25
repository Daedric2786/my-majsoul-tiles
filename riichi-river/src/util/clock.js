// Timers that follow the game clock. Normally thin wrappers over setTimeout/rAF; in
// capture mode (?manual=1) everything — game loop, UI timers and CSS animations — advances
// only when the recorder steps the clock, so captured video and audio stay in sync.
export const clock = { manual: false, now: 0, timers: [], seq: 1, anims: new WeakMap() };

export function later(fn, ms) {
  if (!clock.manual) return setTimeout(fn, ms);
  const id = clock.seq++;
  clock.timers.push({ id, at: clock.now + ms / 1000, fn });
  return id;
}

export function cancel(id) {
  if (!clock.manual) return clearTimeout(id);
  clock.timers = clock.timers.filter((t) => t.id !== id);
}

export const nowMs = () => (clock.manual ? clock.now * 1000 : performance.now());

export function nextFrame(fn) {
  if (!clock.manual) return requestAnimationFrame(fn);
  return later(fn, 1);
}

// Advance the manual clock: fire due timers and scrub CSS animations.
export function tickClock(dt) {
  clock.now += dt;
  for (let guard = 0; guard < 50; guard++) {
    const due = clock.timers.filter((t) => t.at <= clock.now + 1e-9);
    if (!due.length) break;
    clock.timers = clock.timers.filter((t) => t.at > clock.now + 1e-9);
    for (const t of due) t.fn();
  }
  for (const a of document.getAnimations()) {
    const el = clock.anims.get(a) || 0;
    const next = el + dt * 1000;
    clock.anims.set(a, next);
    a.pause();
    a.currentTime = next;
  }
}
