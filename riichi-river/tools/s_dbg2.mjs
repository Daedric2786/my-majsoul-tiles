import base from './s_catch.mjs';
export default async (page) => {
  await base(page);
  const info = await page.evaluate(() => {
    const g = window.__rr.game; const h = g.st.hand; const hv = window.__rr.hand(); const THREE = window.__rr.three;
    const cam = window.__rr.world().camera;
    const out = [];
    for (const t of h.tray) {
      const it = hv.tiles.get(t.id);
      const face = it.group.userData.face; face.updateMatrixWorld(true);
      const pos = face.geometry.attributes.position; const pts = [];
      for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(face.matrixWorld).project(cam); pts.push([(v.x*0.5+0.5)*innerWidth, (-v.y*0.5+0.5)*innerHeight]); }
      const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
      out.push({ kind: t.kind, rect: hv.rects.get(t.id), proj: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round), scale: it.group.scale.x.toFixed(3), flight: !!it.flight });
    }
    return { out };
  });
  console.log(JSON.stringify(info));
};
