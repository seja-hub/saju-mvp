// ─────────────────────────────────────────────────────────────
//  /api/matching — '귀인 만날 결심' 운영자용 남녀 매칭 계산 (Gemini 미사용, 비용 0원)
//  POST {males:[{name,year,month,day,hour,minute,hourUnknown}...], females:[...]} (각 1~10명)
//  → 모든 남×여 쌍의 귀인점수·술친구점수(42~99)와 이유 5줄
//  같은 쌍은 항상 같은 점수(지터는 생년월일 해시 기반 -3~+3)
// ─────────────────────────────────────────────────────────────
import { buildSaju, pairTags, personaMetrics } from './_saju.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 받침 유무에 따른 조사 (과/와, 이/가)
function josa(w, withBat, noBat) {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return withBat;
  return (c - 0xac00) % 28 === 0 ? noBat : withBat;
}

function reasonLines({ m, f, t, pmM, pmF, gwiin, sool }) {
  const fillMtoF = t.fillAtoB, fillFtoM = t.fillBtoA; // pairTags(a=남, b=여)
  const fillCount = fillMtoF.length + fillFtoM.length;
  const has = (p) => t.combos.some((c) => c.startsWith(p));

  // 1줄 — 구조 (합충 우선)
  let l1;
  if (has('천간합')) l1 = '두 사람 일간이 천간합으로 묶여 있어요 — 사주가 먼저 서로를 알아본 조합';
  else if (has('육합')) l1 = '일지가 육합이라 곁에 있을 때 가장 편안해지는 짝이에요';
  else if (has('충')) l1 = '일지가 충이라 만나면 티키타카가 터지는 자극 케미예요';
  else if (t.same) l1 = `일간 오행이 같은 ${m.saju.일간.오행}(이)라 설명 없이도 통하는 사이예요`;
  else if (fillCount) l1 = '기운을 주고받는 보완 구조로 시작하는 인연이에요';
  else l1 = '뚜렷한 합충 없이 담백하게 알아가는 조합이에요';

  // 2줄 — 오행 보완
  let l2;
  if (fillMtoF.length && fillFtoM.length) {
    l2 = `${m.name}${josa(m.name, '과', '와')} ${f.name}${josa(f.name, '이', '가')} 서로에게 없는 기운을 채워주는 상부상조 구성`;
  } else if (fillMtoF.length || fillFtoM.length) {
    const giver = fillMtoF.length ? m.name : f.name;
    const taker = fillMtoF.length ? f.name : m.name;
    const els = (fillMtoF.length ? fillMtoF : fillFtoM).join('·');
    l2 = `${giver}${josa(giver, '이', '가')} ${taker}에게 없는 ${els} 기운을 채워줘요 — 곁에 있으면 든든한 이유`;
  } else {
    l2 = '기운 구성이 달라 서로의 세계가 궁금해지는 조합이에요';
  }

  // 3줄 — 에겐·테토
  let l3;
  const mTeto = pmM.teto >= 50, fTeto = pmF.teto >= 50;
  if (mTeto && fTeto) l3 = `테토 ${pmM.teto}%+${pmF.teto}% — 주도권 배틀이 곧 밀당이 되는 조합`;
  else if (!mTeto && !fTeto) l3 = `에겐 ${pmM.egen}%+${pmF.egen}% — 서로 배려하다 잔만 늘어나는 훈훈 케미`;
  else {
    const tetoSide = mTeto ? pmM : pmF, egenSide = mTeto ? pmF : pmM;
    l3 = `테토 ${tetoSide.teto}%와 에겐 ${egenSide.egen}%의 만남 — 리드와 리액션이 자연스럽게 맞물려요`;
  }

  // 4줄 — 귀인 코멘트
  const l4 = gwiin >= 85 ? '이성 인연으로는 오늘 가장 눈여겨봐야 할 상대예요'
    : gwiin >= 70 ? '대화가 이어질수록 호감이 붙는 타입의 인연'
    : '설렘보다는 편안하게 알아가기 좋은 인연';

  // 5줄 — 술친구 코멘트
  const l5 = sool >= 85 ? '술친구로는 최상급 — 오늘 마지막까지 같이 남을 확률이 높아요'
    : sool >= 70 ? '잔 부딪히다 보면 어느새 편해지는 술자리 케미'
    : '차분하게 한 잔 나누기 좋은 페어';

  return [l1, l2, l3, l4, l5];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { males, females } = body;
    for (const [label, arr] of [['males', males], ['females', females]]) {
      if (!Array.isArray(arr) || arr.length < 1 || arr.length > 10) {
        res.status(400).json({ error: `${label}는 1~10명이어야 해요.` }); return;
      }
    }
    const build = (list, label) => list.map((p, i) => {
      if (!p || !p.year || !p.month || !p.day) throw { user: `${label} ${i + 1}번째 멤버의 생년월일이 비어 있어요.` };
      try {
        const saju = buildSaju({ year: p.year, month: p.month, day: p.day, hour: p.hour ?? 12, minute: p.minute ?? 0, hourUnknown: !!p.hourUnknown });
        return { name: (p.name || `${label}${i + 1}`).slice(0, 12), birth: `${p.year}-${p.month}-${p.day}`, saju, pm: personaMetrics(saju) };
      } catch { throw { user: `${label} ${i + 1}번째 멤버의 생년월일을 확인해 주세요.` }; }
    });
    let M, F;
    try { M = build(males, '남'); F = build(females, '여'); }
    catch (e) { if (e.user) { res.status(400).json({ error: e.user }); return; } throw e; }

    const pairs = [];
    for (let mi = 0; mi < M.length; mi++) for (let fi = 0; fi < F.length; fi++) {
      const m = M[mi], f = F[fi];
      const t = pairTags(m.saju, f.saju);
      const has = (p) => t.combos.some((c) => c.startsWith(p));
      const fillCount = t.fillAtoB.length + t.fillBtoA.length;
      const pmM = m.pm, pmF = f.pm;
      const jitter = (hashStr(m.birth + '|' + f.birth) % 7) - 3;
      const tetoDiff = Math.abs(pmM.teto - pmF.teto);

      let gwiin = 55
        + (has('천간합') ? 18 : 0) + (has('육합') ? 15 : 0) + (has('충') ? 8 : 0)
        + fillCount * 6 + (t.same ? 4 : 0)
        + (tetoDiff >= 30 ? 6 : tetoDiff >= 15 ? 3 : 0)
        + (pmM.mbti[0] !== pmF.mbti[0] ? 3 : 0)
        + (pmM.mbti[3] !== pmF.mbti[3] ? 2 : 0)
        + jitter;
      gwiin = clamp(gwiin, 42, 99);

      let sool = 55
        + (t.same ? 14 : 0) + (has('충') ? 12 : 0) + (has('육합') ? 10 : 0) + (has('천간합') ? 8 : 0)
        + fillCount * 5
        + (pmM.teto + pmF.teto >= 120 ? 5 : 0)
        + (pmM.egen >= 60 && pmF.egen >= 60 ? 4 : 0)
        + (pmM.mbti[1] === pmF.mbti[1] ? 3 : 0)
        + jitter;
      sool = clamp(sool, 42, 99);

      pairs.push({ mi, fi, gwiin, sool, reasons: reasonLines({ m, f, t, pmM, pmF, gwiin, sool }) });
    }

    const brief = (p) => ({
      name: p.name,
      ilgan: { hangul: p.saju.일간.hangul, hanja: p.saju.일간.hanja, 오행: p.saju.일간.오행 },
      teto: p.pm.teto, egen: p.pm.egen, mbti: p.pm.mbti,
    });
    res.status(200).json({ males: M.map(brief), females: F.map(brief), pairs });
  } catch (e) {
    console.error('[matching] error', e);
    res.status(500).json({ error: '서버 오류', detail: String(e?.message || e) });
  }
}
