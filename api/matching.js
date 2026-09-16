// ─────────────────────────────────────────────────────────────
//  /api/matching — '귀인 만날 결심' 운영자용 남녀 매칭 계산 (Gemini 미사용, 비용 0원)
//  POST {males:[{name,year,month,day,hour,minute,hourUnknown}...], females:[...]} (각 1~10명)
//  → 모든 남×여 쌍의 귀인점수·술친구점수(40~99)와 MC용 이유 7줄
//  · 지터A/지터B는 서로 다른 시드(정방향/역방향 해시) — 같은 쌍은 항상 같은 점수
//  · 두 점수 차이가 7 미만이면 로맨스/프렌드 신호합을 비교해 ±4 분리 보정
//  · 이유 문장의 변형은 쌍 해시로 결정적 택1 (재실행해도 같은 문장)
// ─────────────────────────────────────────────────────────────
import { buildSaju, pairTags, personaMetrics } from './_saju.js';

const clamp = (v) => Math.max(40, Math.min(99, Math.round(v)));

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 받침 유무에 따른 조사 (과/와, 이/가, 을/를)
function josa(w, withBat, noBat) {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return withBat;
  return (c - 0xac00) % 28 === 0 ? noBat : withBat;
}

// ── 이유 7줄 조립 (변형은 쌍 해시 + 줄 번호로 택1) ──
function reasonLines7({ key, m, f, t, pmM, pmF, gwiin, sool }) {
  const H = (salt) => hashStr(key + '#' + salt);
  const pickBy = (h, arr) => arr[h % arr.length];
  const has = (p) => t.combos.some((c) => c.startsWith(p));
  const fillMtoF = t.fillAtoB, fillFtoM = t.fillBtoA; // pairTags(a=남, b=여)
  const fillCount = fillMtoF.length + fillFtoM.length;

  // 1줄 — 사주 구조
  let l1;
  if (has('천간합')) l1 = pickBy(H(1), [
    '일간이 천간합 — 사주가 이미 둘을 한 세트로 묶어놨어요',
    '천간합 조합이라 처음 봐도 어디서 본 것 같은 기시감이 드는 사이',
    '사주 문서상 이미 예약된 인연입니다 (천간합)',
  ]);
  else if (has('육합')) l1 = pickBy(H(1), [
    '일지 육합 — 옆에 앉는 순간 어색함이 3분 만에 사라지는 조합',
    '육합이라 텐션 조율이 필요 없는, 자동으로 편해지는 짝',
    '자리 이동 없이 눌러앉고 싶어지는 육합 케미',
  ]);
  else if (has('충')) l1 = pickBy(H(1), [
    '일지 충 — 첫마디부터 티격태격인데 이상하게 계속 말 걸게 되는 사이',
    '싸우는 건지 썸인지 헷갈리는 텐션이 나오는 충 조합',
    '부딪히는 만큼 불꽃도 튀는 충 케미 — 지루할 틈이 없어요',
  ]);
  else if (t.same) {
    const el = m.saju.일간.오행;
    l1 = pickBy(H(1), [
      `일간이 같은 ${el} — 취향 확인 절차가 생략되는 동족 케미`,
      `같은 ${el} 기운이라 말 안 해도 통하는 느낌이 빠르게 와요`,
    ]);
  }
  else if (fillCount) l1 = '합충은 없지만 기운을 주고받는 보완 구조 — 은근히 서로가 필요한 사이';
  else l1 = pickBy(H(1), [
    '뚜렷한 합충 없이 백지에서 시작 — 오늘 대화가 곧 사주가 되는 조합',
    '첫인상보다 두 번째 대화에서 급이 올라가는 타입의 인연',
  ]);

  // 2줄 — 오행 보완
  let l2;
  if (fillMtoF.length && fillFtoM.length) {
    l2 = `${m.name}${josa(m.name, '과', '와')} ${f.name}${josa(f.name, '이', '가')} 서로 없는 기운을 채워주는 상부상조 — 사주가 권장하는 짝`;
  } else if (fillMtoF.length || fillFtoM.length) {
    const giver = fillMtoF.length ? m.name : f.name;
    const taker = fillMtoF.length ? f.name : m.name;
    const els = (fillMtoF.length ? fillMtoF : fillFtoM).join('·');
    l2 = pickBy(H(2), [
      `${giver}${josa(giver, '이', '가')} ${taker}에게 없는 ${els}${josa(els, '을', '를')} 채워줘요 — 옆에 있으면 이상하게 든든한 이유`,
      `${taker}의 빈칸을 ${giver}${josa(giver, '이', '가')} 정확히 메우는 구조 — 끌리는 데는 다 이유가 있죠`,
    ]);
  } else {
    l2 = pickBy(H(2), [
      '기운 구성이 달라 서로의 세계가 궁금해지는 조합',
      '겹치는 게 없어 오히려 물어볼 게 많은 사이 — 대화 소재 걱정은 없겠네요',
    ]);
  }

  // 3줄 — 에겐·테토
  let l3;
  const mTeto = pmM.teto >= 50, fTeto = pmF.teto >= 50;
  if (mTeto && fTeto) l3 = pickBy(H(3), [
    `테토 ${pmM.teto}%+${pmF.teto}% — 주도권 배틀이 그대로 밀당이 되는 스파크 조합`,
    '둘 다 리드형이라 오늘 대화 주도권 쟁탈전 예약',
  ]);
  else if (!mTeto && !fTeto) l3 = pickBy(H(3), [
    `에겐 ${pmM.egen}%+${pmF.egen}% — 서로 배려하다 '먼저 말씀하세요' 무한루프 도는 훈훈 케미`,
    '섬세함 더하기 섬세함 — 조용히 깊어지는 스타일',
  ]);
  else {
    const tetoSide = mTeto ? pmM : pmF, egenSide = mTeto ? pmF : pmM;
    l3 = pickBy(H(3), [
      `테토 ${tetoSide.teto}% × 에겐 ${egenSide.egen}% — 한쪽이 던지면 한쪽이 받아주는 공식 티키타카`,
      '리드형과 리액션형의 만남 — 밀당 밸런스가 이미 맞춰져 있어요',
    ]);
  }

  // 4줄 — MBTI (E/I 우선, N/S 같으면 덧붙임)
  let l4;
  if (pmM.mbti[0] !== pmF.mbti[0]) l4 = 'E와 I 조합이라 대화 지분이 자연스럽게 나눠져요';
  else if (pmM.mbti[0] === 'E') l4 = '둘 다 E — 이 테이블 데시벨 1위 예약';
  else l4 = '둘 다 I — 말수는 적어도 눈빛으로 대화가 되는 조합';
  if (pmM.mbti[1] === pmF.mbti[1]) l4 += ' · 생각의 결이 같아 얘기가 옆길로 새도 같이 샙니다';

  // 5줄 — 귀인 코멘트
  const l5 = gwiin >= 90 ? pickBy(H(5), [
      '오늘의 최우선 관찰 대상 — 연락처 교환각이 제일 높게 뜬 상대입니다',
      '사주가 뽑은 오늘의 메인 귀인 — 놓치면 두고두고 생각날 점수',
    ])
    : gwiin >= 80 ? pickBy(H(5), [
      '이성 인연 상위권 — 두 번째 잔부터 분위기가 달라질 수 있는 상대',
      '호감 축적형 — 대화가 길어질수록 점수가 실제로 올라요',
    ])
    : gwiin >= 65 ? '설렘 반 편안함 반 — 오늘 대화해보고 판단해도 늦지 않아요'
    : '이성보다는 사람으로 먼저 친해지기 좋은 인연';

  // 6줄 — 술친구 코멘트
  const l6 = sool >= 90 ? '술친구 만렙 — 오늘 막차 같이 놓칠 확률 1위'
    : sool >= 80 ? pickBy(H(6), [
      '잔 부딪히는 합이 좋은 페어 — 2차 멤버로 최적',
      '술자리 케미 상위권 — 안주 취향부터 맞춰질 겁니다',
    ])
    : sool >= 65 ? '편하게 한두 잔 나누기 좋은 술벗'
    : '차분한 반주 페어 — 시끄러운 자리보다 조용한 바가 어울려요';

  // 7줄 — MC 총평 (점수 조합별)
  let l7;
  if (gwiin >= 85 && sool >= 85) l7 = pickBy(H(7), [
    '오늘 이 두 분, 자리 안 바꿔도 됩니다',
    '사주 왈: 둘이 같이 나가는 그림까지 나왔습니다',
  ]);
  else if (gwiin >= 85 && sool < 75) l7 = '술은 적당히, 대화는 길게 — 전형적인 썸 각 조합입니다';
  else if (sool >= 85 && gwiin < 75) l7 = '연애는 모르겠고 오늘 밤은 책임지는 조합';
  else if (gwiin < 65 && sool < 65) l7 = '사주는 담백하다는데, 현장 변수는 언제나 있는 법이죠';
  else l7 = '오늘 첫 잔이 이 관계의 방향을 정합니다 — 지켜보겠습니다';

  return [l1, l2, l3, l4, l5, l6, '🎤 MC 한마디: ' + l7];
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

      const key = m.birth + '|' + f.birth;
      const jitterA = (hashStr(key) % 9) - 4;                                  // -4~+4
      const jitterB = (hashStr([...key].reverse().join('')) % 9) - 4;          // 다른 시드
      const tetoDiff = Math.abs(pmM.teto - pmF.teto);
      const tetoSum = pmM.teto + pmF.teto;
      const tetoBonus = tetoDiff >= 30 ? 8 : tetoDiff >= 15 ? 4 : 0;
      const eiDiff = pmM.mbti[0] !== pmF.mbti[0];
      const jpDiff = pmM.mbti[3] !== pmF.mbti[3];
      const nsSame = pmM.mbti[1] === pmF.mbti[1];
      const hwaBonus = (m.saju.오행분포.화 + f.saju.오행분포.화) >= 3 ? 4 : 0;
      const bothEgen = pmM.egen >= 60 && pmF.egen >= 60 ? 5 : 0;

      let gwiin = clamp(52
        + (has('천간합') ? 20 : 0) + (has('육합') ? 16 : 0) + (has('충') ? 4 : 0)
        + fillCount * 6 + (t.same ? 2 : 0)
        + tetoBonus + (eiDiff ? 4 : 0) + (jpDiff ? 2 : 0) + jitterA);

      let sool = clamp(52
        + (t.same ? 16 : 0) + (has('충') ? 14 : 0) + (has('육합') ? 8 : 0) + (has('천간합') ? 5 : 0)
        + fillCount * 4
        + (tetoSum >= 120 ? 6 : 0) + bothEgen + (nsSame ? 4 : 0) + hwaBonus + jitterB);

      // 분리 보정: 두 점수가 붙어 있으면 성격이 다른 점수로 갈라준다
      if (Math.abs(gwiin - sool) < 7) {
        const romance = (has('천간합') ? 20 : 0) + (has('육합') ? 16 : 0) + tetoBonus + (eiDiff ? 4 : 0);
        const friend = (has('충') ? 14 : 0) + (t.same ? 16 : 0) + (tetoSum >= 120 ? 6 : 0) + hwaBonus;
        const romanceWins = romance !== friend ? romance > friend : hashStr(key) % 2 === 0;
        if (romanceWins) { gwiin = clamp(gwiin + 4); sool = clamp(sool - 4); }
        else { sool = clamp(sool + 4); gwiin = clamp(gwiin - 4); }
      }

      pairs.push({ mi, fi, gwiin, sool, reasons: reasonLines7({ key, m, f, t, pmM, pmF, gwiin, sool }) });
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
