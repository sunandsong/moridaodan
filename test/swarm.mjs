// 第一关（机枪关）的无界面自检：node --experimental-strip-types test/swarm.mjs
// 画布用空壳代替，只跑逻辑：一直按住 → 虫群清完 → Boss 从屏幕外走进来 → 打死过关；不开火 → 防线失守。
import assert from 'node:assert';
const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const { createGame } = await import('../assets/scripts/GameCore.ts');
const mk = () => createGame({ canvas: document.createElement('canvas'), scale: 1, storage: { get: () => null, set() {} } }).debug;

// 首页：启动后停在首页，背景里的第一关不会自己开打
{ const g = createGame({ canvas: document.createElement('canvas'), scale: 1, storage: { get: () => null, set() {} } });
  for (let i = 0; i < 60 * 20; i++) g.step(1 / 60);
  assert.equal(g.debug.UI.mode, 'home'); assert.equal(g.debug.S.t, 0); }

// 自动瞄准最近的目标并一直按住
let T = mk(); T.noSave = true; T.load(0);
let bossAt = -1, n = 0;
for (; n < 60 * 240 && !T.S.over; n++) {
  const D = b => Math.hypot(b.position.x - T.OX, b.position.y - T.OY), bs = T.S.gun.bs;
  const ts = T.targets().filter(b => b.g.hp > 0 && b.position.x < 540 && b.position.y > 0).sort((a, b) => D(a) - D(b));
  // 飞虫靠近了先打飞虫，否则打巨兽肚子下面的弱点囊
  T.S.gun.hold = ts[0] && (!bs || D(ts[0]) < 220) ? { x: ts[0].position.x, y: ts[0].position.y } : bs ? { x: bs.x - 5, y: 880 - 140 } : { x: 400, y: 500 };
  T.tick();
  if (bs && bossAt < 0) { bossAt = n; assert.equal(T.S.gun.left, 0, 'Boss 应该在虫群出完之后才登场'); assert.ok(bs.x > 540 + 200, 'Boss 应该从屏幕外走进来'); }
}
assert.ok(bossAt > 0, 'Boss 没有登场');
assert.ok(T.S.over && T.S.win, '按住连发应该能过关');
console.log(`过关：Boss 第 ${(bossAt / 60).toFixed(1)} 秒登场，全程 ${(n / 60).toFixed(1)} 秒，防线剩 ${T.S.gun.hp}，${T.S.stars} 星，击杀 ${T.S.tot}`);

// 不开火：虫群撞垮防线
T = mk(); T.noSave = true; T.load(0);
for (n = 0; n < 60 * 120 && !T.S.over; n++) T.tick();
assert.ok(T.S.over && !T.S.win && !T.S.gun.bs, '不开火应该失守');
console.log(`不开火：第 ${(n / 60).toFixed(1)} 秒失守`);

// 别的关卡不受影响
T.load(1); assert.ok(!T.S.gun && T.S.ammo.length === 3 && T.targets().length > 0);
console.log('ok');
