/* Your rank: the bar on top of every tab, the toasts when a debt clears, and the pay day results screen. */
import { ensureRank, rankNW, tierOf, tierName, tierStarts, bestNW, checkRank, latestStack, addDays, periodDays, fmtDate,
  money, money0, money2, signed, clamp } from '../core/index.js';
import { app, save } from './store.js';
import { $, esc, toast, tg, LOCKI, XI } from './dom.js';

/** Debt ranks get hotter the deeper they go. */
export const sevOf = n => n <= 2 ? 'var(--sev1)' : n <= 4 ? 'var(--sev2)' : n <= 7 ? 'var(--sev3)' : 'var(--sev4)';
export const tierColor = t => t.kind === 'debt' ? sevOf(t.n) : 'var(--c-invest)';
/** The ranks a purchase can be the reward for. */
export const rewardOpts = cur => { const vs = tierStarts(bestNW(app.S), 14); if (cur != null && !vs.includes(cur)) vs.unshift(cur); return vs.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${tierName(v)} · ${money(v)}</option>`).join(''); };
export const periodWord = () => ({ week: 'week', fortnight: 'fortnight', month: 'month' })[app.S.freq] || 'pay';

export function renderRank() {
  const S = app.S;
  ensureRank(S);
  const nw = rankNW(S), t = tierOf(nw), c = tierColor(t), nx = tierOf(t.hi), p = clamp((nw - t.lo) / (t.hi - t.lo)), lt = latestStack(S), nd = S.rank && lt ? addDays(lt.date, periodDays(S)) : null;
  $('#lvl').innerHTML = `<b class="lvl-n" style="color:${c}">${t.name}</b><span class="lvl-bar"><span data-bw="lvl" style="width:${(p * 100).toFixed(1)}%;background:${c}"></span></span><span class="lvl-to">${nd ? `${LOCKI} ${fmtDate(nd)}` : `${money0(t.hi - nw)} to ${nx.name}`}</span>`;
  $('#lvl').setAttribute('aria-label', `${t.name}. ${nd ? `Locked till pay day, ${fmtDate(nd)}.` : `${money(t.hi - nw)} to ${nx.name}.`}`);
}
/** Toasts: a debt cleared, debt-free, a goal reached. Your rank moves on pay day, not here. */
export function checkRankUI() {
  const r = checkRank(app.S);
  if (r.changed) save();
  if (r.msg.length) { const g = tg.gen; setTimeout(() => { if (g === tg.gen) toast(r.msg.join(' · ')); }, 1700); }
}

/* The results screen: the tally, then the rank settling through every rank it crosses, the medals, Continue. */
export function showSettle(R, done) {
  const old = document.querySelector('.st-ov'); if (old) old.remove();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, word = ({ week: 'WEEK', fortnight: 'FORTNIGHT', month: 'MONTH' })[R.freq] || 'PAY';
  const kept = Math.round((R.to - R.from) * 100) / 100, up = kept >= 0, medals = R.medals || [];
  const rows = [['Pay', 'var(--c-pay)', R.pay, '', 1], ['Money in', 'var(--muted)', R.ext, 'Somewhere else'], ['Spent', 'var(--c-spend)', -R.spent, ''], ['Bills', 'var(--c-bills)', -R.bills, ''],
    ['Market', 'var(--c-invest)', R.market, ''], ['Balance fixes', 'var(--muted)', R.fixes || 0, 'Updates you made']].filter(r => r[4] || Math.abs(r[2]) >= 0.005);
  // The path: through each rank boundary it crosses.
  const segs = []; let cur = R.from;
  for (let g = 0; g < 60; g++) {
    const t = tierOf(cur);
    if (up && t.hi != null && R.to >= t.hi) { segs.push({ a: cur, b: t.hi, t, x: tierOf(t.hi) }); cur = t.hi; continue; }
    if (!up && R.to < t.lo) { segs.push({ a: cur, b: t.lo, t, x: tierOf(t.lo - 0.01) }); cur = t.lo - 0.01; continue; }
    segs.push({ a: cur, b: R.to, t, x: null }); break;
  }
  const T = {}; let x = .2;
  T.title = x; x += .5;
  rows.forEach(r => { r.t0 = x; x += .6; });
  T.div = x; x += .15; T.kept = x; x += 1.45; T.out = x; x += .28; T.flip = x; x += .5; T.emb = x; x += .55;
  const n = segs.length, D = n > 5 ? .5 : n > 3 ? .8 : 1.1;
  segs.forEach(sg => { const span = (sg.t.hi ?? sg.t.lo + 1000) - sg.t.lo, fr = Math.min(1, Math.abs(sg.b - sg.a) / span); sg.t0 = x; sg.t1 = x + Math.max(.3, D * Math.min(1, fr * 1.4)); x = sg.t1; if (sg.x) { sg.tc = x; x += n > 5 ? .4 : .7; } });
  T.settle = x; x += .45; T.med = x; x += .3 * medals.length + .25; T.cont = x; T.end = x + .35;
  const fin = tierOf(R.to), crossed = segs.filter(sg => sg.x), last = crossed[crossed.length - 1], fc = up ? tierColor(fin) : 'var(--bad)';
  const chip = crossed.length ? `${up ? '+' : '−'}${crossed.length} RANK${crossed.length === 1 ? '' : 'S'}` : 'HELD';
  const line = [up && last && R.to - last.b < 100 ? `In by ${money2(R.to - last.b)}` : '', fin.hi != null ? `${money2(fin.hi - R.to)} to ${tierOf(fin.hi).name}` : ''].filter(Boolean).join(' · ');
  const ov = document.createElement('div'); ov.className = 'st-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `Pay day. ${up ? 'Kept' : 'Down'} ${money2(Math.abs(kept))}. ${fin.name}.`);
  ov.innerHTML = `<div class="st-col">
    <button class="st-skip" type="button">Skip</button>
    <p class="st-title">${word} OVER</p><p class="st-sub">${fmtDate(R.start)} – ${fmtDate(R.end)}</p>
    <div class="st-kept"><span>KEPT</span><b>${signed(kept)}</b></div>
    <div class="st-stage"><i class="st-glow"></i><div class="st-emb"><svg viewBox="0 0 150 168" width="132" height="148"><defs><linearGradient id="st-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t);stop-opacity:.42"/><stop offset="1" style="stop-color:var(--bg);stop-opacity:.9"/></linearGradient></defs>
      <polygon points="75,4 144.3,44 144.3,124 75,164 5.7,124 5.7,44" fill="url(#st-g)" style="stroke:var(--t)" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="75,18 132.2,51 132.2,117 75,150 17.8,117 17.8,51" fill="none" style="stroke:var(--t)" stroke-opacity=".38" stroke-width="1.5"/>
      <text class="st-ew" x="75" y="60" text-anchor="middle" style="fill:var(--t)"></text><g class="st-eg"><text class="st-en" x="75" y="130" text-anchor="middle"></text></g></svg></div>
      <p class="st-up"></p></div>
    <div class="st-bar"><i></i></div><div class="st-bl"><span></span><span></span></div>
    <p class="st-nw"></p><p class="st-nws">net worth · every account, less what you owe</p>
    <div class="st-set" style="--t:${fc}"><b class="st-chip">${chip}</b>${line ? `<span>${line}</span>` : ''}</div>
    ${medals.length ? `<p class="st-mh">MEDALS</p><div class="st-ms">${medals.map(m => `<div class="st-m${m.k === 'miss' ? ' miss' : ''}" style="--c:${m.c || 'var(--bad)'}"><b>${m.k === 'miss' ? XI : ''}${esc(m.b)}</b><span>${esc(m.s)}</span></div>`).join('')}</div>` : ''}
    <div class="st-fill"></div>
    <button class="btn primary big st-go" type="button">Continue</button>
    <div class="st-tally"><div class="st-flow"><i class="st-fp"></i><i class="st-fs"></i></div>${rows.map(r => `<div class="st-row"><i style="background:${r[1]}"></i><span class="g"><b>${r[0]}</b>${r[3] ? `<small>${r[3]}</small>` : ''}</span><span class="num"${r[0] === 'Spent' ? ' style="color:var(--c-spend)"' : ''}></span></div>`).join('')}<div class="st-div"></div><div class="st-kbig"><span>KEPT</span><b></b></div></div>
  </div><div class="st-parts"></div><i class="st-flash"></i>`;
  document.body.appendChild(ov); document.body.classList.add('st-on');
  const q = sel => ov.querySelector(sel), qa = sel => [...ov.querySelectorAll(sel)];
  q('.st-tally').style.top = q('.st-kept').offsetTop + 'px';
  const kb = q('.st-kbig b'), kf = q('.st-kept b'); kb.textContent = signed(kept);
  const ra = kb.getBoundingClientRect(), rb = kf.getBoundingClientRect(), F = { dx: rb.right - ra.right, dy: rb.top - ra.top, s: rb.height / Math.max(1, ra.height) };
  const bursts = up ? crossed.map(sg => ({ tc: sg.tc, ps: Array.from({ length: 20 }, (_, i) => ({ a: i / 20 * Math.PI * 2 + Math.random() * .3, d: 80 + Math.random() * 110, s: 4 + Math.random() * 5 })) })) : [];
  bursts.forEach(b => b.ps.forEach(p => { p.el = document.createElement('i'); q('.st-parts').appendChild(p.el); }));
  const P = (t, a, b) => clamp((t - a) / (b - a)), o3 = p => 1 - Math.pow(1 - p, 3), xp = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p), io = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const bk = p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const op = (el, o, tr) => { if (!el) return; el.style.opacity = o; el.style.transform = tr || ''; };
  const tot = Math.max(1, rows.reduce((a, r) => a + Math.max(0, r[2]), 0));
  const tierAt = t => { let ti = segs[0].t; for (const sg of segs) { if (t >= sg.t0) ti = sg.t; if (sg.x && t >= sg.tc) ti = sg.x; } return ti; };
  const nwAt = t => { let v = R.from; for (const sg of segs) { if (t >= sg.t0) v = sg.a + (sg.b - sg.a) * (sg.t1 - sg.t0 > .5 ? io(P(t, sg.t0, sg.t1)) : o3(P(t, sg.t0, sg.t1))); } return v; };
  function render(t) {
    const ts = P(t, T.title, T.title + .25), te = xp(ts), ti_ = q('.st-title');
    op(ti_, Math.min(1, ts * 3), `scale(${1.3 - .3 * te})`); ti_.style.filter = ts > 0 && ts < 1 ? `blur(${(1 - te) * 5}px)` : '';
    op(q('.st-sub'), o3(P(t, T.title + .3, T.title + .6)));
    const to = io(P(t, T.out, T.out + .28));
    op(q('.st-flow'), o3(P(t, T.title + .4, T.title + .65)) * (1 - to), `translateY(${-to * 16}px)`);
    let pin = 0, pout = 0;
    qa('.st-row').forEach((el, i) => {
      const r = rows[i], p = o3(P(t, r.t0, r.t0 + .3)), c = xp(P(t, r.t0 + .05, r.t0 + .55));
      op(el, p * (1 - to), `translate(${(1 - p) * 24}px, ${-to * 16}px)`); el.querySelector('.num').textContent = signed(r[2] * c);
      if (r[2] >= 0) pin += r[2] * c; else pout -= r[2] * c;
    });
    q('.st-fp').style.width = (clamp(pin / tot) * 100).toFixed(2) + '%'; q('.st-fs').style.width = (clamp(pout / tot) * 100).toFixed(2) + '%';
    op(q('.st-div'), 1 - to, `scaleX(${o3(P(t, T.div, T.div + .3))})`);
    const kp = P(t, T.kept, T.kept + .22), fl = io(P(t, T.flip, T.flip + .5));
    op(q('.st-kbig'), fl >= 1 ? 0 : Math.min(1, kp * 3));
    kb.textContent = signed(kept * xp(P(t, T.kept + .05, T.kept + 1.0)));
    kb.style.transform = `translate(${F.dx * fl}px, ${F.dy * fl}px) scale(${(1.2 - .2 * xp(kp)) * (1 + (F.s - 1) * fl)})`;
    q('.st-kbig span').style.opacity = 1 - fl * 2;
    op(q('.st-kept'), fl >= 1 ? 1 : 0);
    const ti = tierAt(t), c = tierColor(ti), v = nwAt(t), eIn = P(t, T.emb, T.emb + .45);
    let pu = 0, fk = 1, ut = null;
    crossed.forEach(sg => {
      const pp = P(t, sg.tc, sg.tc + .5); if (pp > 0 && pp < 1) pu = Math.max(pu, Math.sin(pp * Math.PI) * (1 - pp * .3));
      const f = P(t, sg.tc - .1, sg.tc + .16); if (f > 0 && f < 1) fk = Math.min(fk, Math.abs(Math.cos(f * Math.PI)));
      const r = P(t, sg.tc, sg.tc + .9); if (r > 0 && r < 1) ut = { o: Math.min(1, P(t, sg.tc, sg.tc + .16) * 2) * (1 - Math.pow(P(t, sg.tc + .55, sg.tc + .9), 3)), sc: 1.8 - .8 * xp(P(t, sg.tc, sg.tc + .16)) };
    });
    const em = q('.st-emb'); q('.st-stage').style.setProperty('--t', c);
    op(em, clamp(eIn * 2), `translateX(${!up && pu ? Math.sin(t * 90) * 6 * pu : 0}px) scale(${(.35 + .65 * bk(eIn)) * (1 + (up ? pu * .22 : -pu * .08))})`);
    q('.st-ew').textContent = ti.kind === 'debt' ? 'DEBT' : 'RANK'; q('.st-en').textContent = ti.n;
    q('.st-eg').setAttribute('transform', `translate(0 103) scale(1 ${Math.max(.02, fk).toFixed(3)}) translate(0 -103)`);
    op(q('.st-glow'), clamp(eIn) * (.16 + (up ? pu * .5 : 0)), `scale(${.8 + clamp(eIn) * .2 + pu * .25})`);
    const u = q('.st-up');
    if (ut) { op(u, ut.o, `scale(${ut.sc})`); u.textContent = up ? 'RANK UP' : 'RANK DOWN'; u.classList.toggle('down', !up); } else u.style.opacity = 0;
    const bOn = o3(P(t, T.emb + .15, T.emb + .5));
    op(q('.st-bar'), bOn); op(q('.st-bl'), bOn); op(q('.st-nw'), bOn, `scale(${1 + pu * .06})`); op(q('.st-nws'), bOn * .9);
    const span = (ti.hi ?? ti.lo + 1000) - ti.lo, bi = q('.st-bar i');
    bi.style.width = (clamp((v - ti.lo) / span) * 100).toFixed(2) + '%'; bi.style.background = c;
    const bl = q('.st-bl').children; bl[0].textContent = money0(ti.lo); bl[1].textContent = ti.hi != null ? money0(ti.hi) : '';
    q('.st-nw').textContent = money2(v);
    const sp = o3(P(t, T.settle, T.settle + .35)); op(q('.st-set'), sp, `translateY(${(1 - sp) * 8}px)`);
    op(q('.st-mh'), o3(P(t, T.med - .15, T.med + .1)));
    qa('.st-m').forEach((el, i) => { const p = P(t, T.med + i * .3, T.med + i * .3 + .38); op(el, Math.min(1, p * 2.5), `scale(${.6 + .4 * bk(p)})`); });
    const cp = o3(P(t, T.cont, T.cont + .35)), go = q('.st-go'); op(go, cp, `translateY(${(1 - cp) * 12}px)`); go.style.pointerEvents = cp > .5 ? '' : 'none';
    const sk = q('.st-skip'); sk.style.opacity = t < T.cont ? 1 : 0; sk.style.pointerEvents = t < T.cont ? '' : 'none';
    const er = em.getBoundingClientRect(), cx = er.left + er.width / 2, cy = er.top + er.height / 2;
    bursts.forEach(b => b.ps.forEach(p => {
      const k = P(t, b.tc, b.tc + .95); if (k <= 0 || k >= 1) { p.el.style.opacity = 0; return; }
      const d = p.d * xp(k); p.el.style.opacity = 1 - k * k * k; p.el.style.width = p.el.style.height = p.s + 'px'; p.el.style.background = c; p.el.style.boxShadow = `0 0 8px ${c}`;
      p.el.style.transform = `translate(${cx + Math.cos(p.a) * d - p.s / 2}px, ${cy + Math.sin(p.a) * d + k * k * 40 - p.s / 2}px) rotate(${k * 220}deg)`;
    }));
    const fl2 = (tb, a) => { const p = P(t, tb, tb + .32); return p <= 0 || p >= 1 ? 0 : a * (1 - o3(p)); };
    q('.st-flash').style.opacity = Math.max(fl2(T.title, .2), ...crossed.map(sg => fl2(sg.tc, up ? .3 : .12)));
  }
  let t0 = performance.now(), skip = calm ? T.end : 0, raf = 0, ended = false;
  const tick = now => { const t = Math.min(T.end, (now - t0) / 1000 + skip); render(t); if (t < T.end) raf = requestAnimationFrame(tick); else ended = true; };
  render(skip); raf = requestAnimationFrame(tick);
  const toEnd = () => { skip = T.end; if (ended) render(T.end); };
  q('.st-skip').onclick = e => { e.stopPropagation(); toEnd(); };
  ov.addEventListener('click', e => { if (!e.target.closest('.st-go')) toEnd(); });
  q('.st-go').onclick = () => { cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(() => { ov.remove(); document.body.classList.remove('st-on'); }, 260); if (done) done(); };
}
