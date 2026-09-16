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

// ── 이유 7항목 × 각 2문장 조립 (변형은 쌍 해시 + 항목 번호로 택1) ──
function reasonLines7({ key, m, f, t, pmM, pmF, gwiin, sool }) {
  const H = (salt) => hashStr(key + '#' + salt);
  const pickBy = (h, arr) => arr[h % arr.length];
  const has = (p) => t.combos.some((c) => c.startsWith(p));
  const fillMtoF = t.fillAtoB, fillFtoM = t.fillBtoA; // pairTags(a=남, b=여)
  const fillCount = fillMtoF.length + fillFtoM.length;

  // ① 사주 구조
  let l1;
  if (has('천간합')) l1 = pickBy(H(1), [
    '일간이 천간합으로 묶인 조합 — 사주 세계관에서는 이미 예약된 만남입니다. 처음 보는데 어디서 본 것 같은 기시감이 든다면 그게 바로 이 합의 효과예요',
    '사주가 두 사람을 한 세트로 포장해둔 천간합 케미. 오늘 처음 만났다는 게 안 믿길 만큼 대화가 빨리 붙을 겁니다',
  ]);
  else if (has('육합')) l1 = pickBy(H(1), [
    "일지 육합 — 옆자리에 앉는 순간 어색함이 3분 만에 증발하는 조합이에요. 자리 이동 시간인데 안 일어나고 있다면 기분 탓이 아닙니다",
    "육합이라 텐션 조율이 필요 없는 자동 편안 모드. '얘랑은 왜 이렇게 말이 편하지?' 싶을 텐데 사주는 이미 알고 있었어요",
  ]);
  else if (has('충')) l1 = pickBy(H(1), [
    '일지 충 — 첫마디부터 티격태격인데 이상하게 자꾸 말 걸게 되는 사이입니다. 싸우는 건지 썸인지 본인들도 헷갈리기 시작하면 이미 늦었어요',
    '부딪히는 만큼 불꽃도 튀는 충 조합. 오늘 이 테이블에서 제일 시끄러운 두 사람이 될 텐데, 원래 그런 커플이 오래갑니다',
  ]);
  else if (t.same) {
    const el = m.saju.일간.오행;
    l1 = `일간이 같은 ${el} — 취향 검증 절차가 통째로 생략되는 동족 케미예요. '어 나도 그런데'가 세 번 나오면 그날은 각입니다`;
  }
  else if (fillCount) l1 = '화려한 합충은 없지만 서로의 빈 기운을 채워주는 실속형 구조예요. 조용히 시작해서 은근히 오래가는 타입의 인연입니다';
  else l1 = pickBy(H(1), [
    '뚜렷한 합충 없이 백지에서 시작하는 조합 — 오늘 나누는 대화가 그대로 두 사람의 사주가 됩니다. 부담 없이 던져보세요',
    '사주상 예고편이 없는 만남이라 스포 없는 영화 같은 사이예요. 첫인상보다 두 번째 대화에서 반전이 나옵니다',
  ]);

  // ② 오행 보완
  let l2;
  if (fillMtoF.length && fillFtoM.length) {
    l2 = `${m.name}${josa(m.name, '과', '와')} ${f.name}${josa(f.name, '이', '가')} 서로에게 없는 기운을 정확히 채워주는 상부상조 구성. 사주가 대놓고 '둘이 잘해봐'라고 밑줄 그어둔 조합입니다`;
  } else if (fillMtoF.length || fillFtoM.length) {
    const giver = fillMtoF.length ? m.name : f.name;
    const taker = fillMtoF.length ? f.name : m.name;
    const els = (fillMtoF.length ? fillMtoF : fillFtoM).join('·');
    l2 = `${giver}${josa(giver, '이', '가')} ${taker}에게 없는 ${els} 기운을 채워주는 구조예요. ${taker}${josa(taker, '이', '가')} 이유 없이 옆이 든든하다고 느낀다면 바로 그겁니다`;
  } else {
    l2 = "기운 구성이 달라 서로가 서로에게 신문물인 조합이에요. 오늘 밤 제일 많이 나올 말은 '진짜요?'일 겁니다";
  }

  // ③ 에겐·테토
  let l3;
  const mTeto = pmM.teto >= 50, fTeto = pmF.teto >= 50;
  if (mTeto && fTeto) l3 = `테토 ${pmM.teto}%+${pmF.teto}% — 주도권 배틀이 그대로 밀당이 되는 스파크 조합. 오늘 누가 먼저 말 끊나 내기해도 재밌겠네요`;
  else if (!mTeto && !fTeto) l3 = `에겐 ${pmM.egen}%+${pmF.egen}% — 서로 배려하다 '먼저 드세요' 무한루프 도는 훈훈 케미예요. 누군가 먼저 용기 내는 순간 급물살 탑니다`;
  else {
    const tetoSide = mTeto ? pmM : pmF, egenSide = mTeto ? pmF : pmM;
    l3 = pickBy(H(3), [
      `테토 ${tetoSide.teto}% × 에겐 ${egenSide.egen}% — 한쪽이 던지면 한쪽이 받아주는 공식 티키타카예요. 밀당 밸런스가 공장 초기설정부터 맞춰져 나왔습니다`,
      '리드형과 리액션형의 만남이라 대화가 핑퐁처럼 굴러가요. 이 조합에서 정적이 흐르면 사주 탓이 아니라 안주가 늦게 나온 탓입니다',
    ]);
  }

  // ④ MBTI (E/I 우선, N/S까지 같으면 덧붙임)
  let l4;
  if (pmM.mbti[0] !== pmF.mbti[0]) l4 = 'E와 I의 조합이라 대화 지분이 자연스럽게 정리됩니다. 한 명은 떠들고 한 명은 웃어주는 술자리 황금 배분이에요';
  else if (pmM.mbti[0] === 'E') l4 = '둘 다 E라 이 테이블 데시벨 1위 확정입니다. 옆 테이블이 자꾸 쳐다보면 성공한 겁니다';
  else l4 = '둘 다 I — 말수는 적지만 눈빛과 잔 채워주는 타이밍으로 대화하는 조합이에요. 조용히 통하는 사이가 제일 무섭습니다';
  if (pmM.mbti[1] === pmF.mbti[1]) l4 += '. 생각의 결까지 같아서 얘기가 옆길로 새도 같이 샙니다';

  // ⑤ 귀인 코멘트
  const l5 = gwiin >= 90 ? pickBy(H(5), [
      '오늘의 최우선 관찰 대상 — 연락처 교환 확률이 가장 높게 뜬 상대입니다. 이 점수는 사주가 낼 수 있는 거의 만점이에요',
      '사주가 뽑은 오늘의 메인 귀인. 여기서 안 잡으면 집 가는 길에 계속 생각날 점수입니다',
    ])
    : gwiin >= 80 ? '이성 인연 상위권 — 두 번째 잔부터 공기가 달라질 수 있는 상대예요. 호감 축적형이라 대화가 길어질수록 점수가 실제로 오릅니다'
    : gwiin >= 65 ? '설렘 반 편안함 반의 중간 지대예요. 오늘 대화 한 번으로 방향이 정해지는 구간이니 직접 확인해보세요'
    : '이성 레이더보다 사람 레이더에 먼저 잡히는 인연이에요. 근데 원래 친구로 시작한 커플이 제일 오래갑니다?';

  // ⑥ 술친구 코멘트
  const l6 = sool >= 90 ? '술친구 만렙 — 오늘 막차 같이 놓칠 확률 1위 조합입니다. 2차 장소는 미리 검색해두세요'
    : sool >= 80 ? '잔 부딪히는 합이 좋은 페어라 2차 멤버로 최적이에요. 안주 취향부터 맞아 들어갈 겁니다'
    : sool >= 65 ? '편하게 한두 잔 나누기 좋은 술벗이에요. 과음 각은 아니고 딱 기분 좋은 선에서 끊기는 건강한 조합입니다'
    : '왁자지껄보다 차분한 반주가 어울리는 페어예요. 조용한 자리에서 만나면 의외로 급이 달라질 수도 있습니다';

  // ⑦ MC 총평 (점수 조합별)
  let l7;
  if (gwiin >= 90 && sool >= 90) l7 = '이 두 분은 자리 안 바꾸셔도 됩니다. 오늘 행사 하이라이트는 여기서 나올 예정이에요';
  else if (gwiin >= 85 && sool >= 85) l7 = '사주 왈, 둘이 같이 나가는 그림까지 나왔습니다. 저희는 응원만 하겠습니다';
  else if (gwiin >= 85 && sool < 75) l7 = '술은 적당히, 대화는 길게 가져가세요 — 전형적인 썸 전용 조합입니다. 취하면 아까운 상대예요';
  else if (sool >= 85 && gwiin < 75) l7 = '연애는 모르겠고 오늘 밤은 확실히 책임지는 조합입니다. 일단 마시면서 생각하시죠';
  else if (gwiin < 65 && sool < 65) l7 = '사주는 담백하다는데요, 원래 현장 변수가 제일 무섭습니다. 반전 주인공이 되어보세요';
  else l7 = '오늘 첫 잔이 이 관계의 장르를 정합니다 — 로맨스일지 우정일지 지켜보겠습니다';

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
