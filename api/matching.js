// ─────────────────────────────────────────────────────────────
//  /api/matching — '경주 귀인로드' 운영자용 남녀 단체 매칭 계산 (Gemini 미사용, 비용 0원)
//  POST {males:[{name,year,month,day,hour,minute,hourUnknown}...], females:[...]} (각 1~10명, 비대칭 가능)
//  → 모든 남×여 쌍의 귀인점수(연인 궁합)·여행메이트점수(친구 궁합)(40~99)와 이유 7줄
//  · 전부 사주(합충·오행·음양)만으로 계산 — MBTI·에겐테토 미사용, 참가자에게 그대로 보내도 되는 멘트
//  · 지터A/지터B는 서로 다른 시드(정방향/역방향 해시) — 같은 쌍은 항상 같은 점수
//  · 두 점수 차이가 7 미만이면 로맨스/메이트 신호합을 비교해 ±4 분리 보정
//  · 이유 문장의 변형은 쌍 해시로 결정적 택1 (재실행해도 같은 문장)
// ─────────────────────────────────────────────────────────────
import { buildSaju, pairTags } from './_saju.js';

const clamp = (v) => Math.max(40, Math.min(99, Math.round(v)));
const GEN = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' }; // 상생(生)

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 받침 유무에 따른 조사 (과/와, 이/가, 은/는)
function josa(w, withBat, noBat) {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return withBat;
  return (c - 0xac00) % 28 === 0 ? noBat : withBat;
}

// 최다 오행 (동률이면 목화토금수 순서상 앞의 것)
function mainElOf(dist) {
  const order = ['목', '화', '토', '금', '수'];
  let best = order[0];
  for (const k of order) if (dist[k] > dist[best]) best = k;
  return best;
}
// 여행 스타일 — 오행 분포에서 도출 (화·목=즉흥 에너지, 토·금=계획 에너지)
function styleOf(dist) {
  const spont = dist.화 * 2 + dist.목, plan = dist.토 * 2 + dist.금;
  if (Math.abs(spont - plan) <= 1) return '밸런스형';
  return spont > plan ? '즉흥형' : '계획형';
}

// ── 이유 7항목 × 각 2문장 조립 (오행·여행 테마, 변형은 쌍 해시로 택1) ──
function reasonLines7({ key, m, f, t, gwiin, mate }) {
  const H = (salt) => hashStr(key + '#' + salt);
  const pickBy = (h, arr) => arr[h % arr.length];
  const has = (p) => t.combos.some((c) => c.startsWith(p));
  const fillMtoF = t.fillAtoB, fillFtoM = t.fillBtoA; // pairTags(a=남, b=여)
  const fillCount = fillMtoF.length + fillFtoM.length;
  const aEl = m.saju.일간.오행, bEl = f.saju.일간.오행;

  // ① 사주 구조
  let l1;
  if (has('천간합')) l1 = pickBy(H(1), [
    '일간이 천간합으로 묶인 조합 — 사주 세계관에서는 이미 예약된 만남입니다. 처음 보는데 어디서 본 것 같은 기시감이 든다면 그게 바로 이 합의 효과예요',
    '사주가 두 사람을 한 세트로 포장해둔 천간합 케미. 오늘 처음 만났다는 게 안 믿길 만큼 대화가 빨리 붙을 겁니다',
  ]);
  else if (has('육합')) l1 = pickBy(H(1), [
    '일지 육합 — 나란히 걷기 시작하면 어색함이 3분 만에 증발하는 조합이에요. 자유 시간에 자연스럽게 같은 방향으로 걷고 있다면 기분 탓이 아닙니다',
    "육합이라 텐션 조율이 필요 없는 자동 편안 모드. '이 사람이랑은 왜 이렇게 말이 편하지?' 싶을 텐데 사주는 이미 알고 있었어요",
  ]);
  else if (has('충')) l1 = pickBy(H(1), [
    '일지 충 — 첫마디부터 티격태격인데 이상하게 자꾸 말 걸게 되는 사이입니다. 투닥거리는 건지 썸인지 본인들도 헷갈리기 시작하면 이미 늦었어요',
    '부딪히는 만큼 불꽃도 튀는 충 조합. 오늘 코스에서 제일 시끄러운 두 사람이 될 텐데, 원래 그런 페어가 제일 기억에 남습니다',
  ]);
  else if (t.same) l1 = `일간이 같은 ${aEl} — 취향 검증 절차가 통째로 생략되는 동족 케미예요. '어 나도 그런데'가 세 번 나오면 그날은 각입니다`;
  else if (fillCount) l1 = '화려한 합충은 없지만 서로의 빈 기운을 채워주는 실속형 구조예요. 조용히 시작해서 은근히 오래가는 타입의 인연입니다';
  else l1 = pickBy(H(1), [
    '뚜렷한 합충 없이 백지에서 시작하는 조합 — 오늘 나누는 대화가 그대로 두 사람의 사주가 됩니다. 부담 없이 던져보세요',
    '사주상 예고편이 없는 만남이라 스포 없는 영화 같은 사이예요. 첫인상보다 두 번째 대화에서 반전이 나옵니다',
  ]);

  // ② 오행 보완 (서로 없는 기운 채우기)
  let l2;
  if (fillMtoF.length && fillFtoM.length) {
    l2 = `${m.name}${josa(m.name, '과', '와')} ${f.name}${josa(f.name, '이', '가')} 서로에게 없는 기운을 정확히 채워주는 상부상조 구성. 사주가 대놓고 '둘이 잘해봐'라고 밑줄 그어둔 조합입니다`;
  } else if (fillMtoF.length || fillFtoM.length) {
    const giver = fillMtoF.length ? m.name : f.name;
    const taker = fillMtoF.length ? f.name : m.name;
    const els = (fillMtoF.length ? fillMtoF : fillFtoM).join('·');
    l2 = `${giver}${josa(giver, '이', '가')} ${taker}에게 없는 ${els} 기운을 채워주는 구조예요. ${taker}${josa(taker, '이', '가')} 이유 없이 옆이 든든하다고 느낀다면 바로 그겁니다`;
  } else if (t.same) {
    l2 = '겹치는 기운이 많아 서로를 거울처럼 비춰주는 조합이에요. 상대를 보다 보면 내 여행 스타일이 같이 보일 겁니다';
  } else {
    l2 = "기운 구성이 달라 서로가 서로에게 신문물인 조합이에요. 오늘 제일 많이 나올 말은 '진짜요?'일 겁니다";
  }

  // ③ 오행 케미 (일간 기운의 상생·상극·동일)
  let l3;
  if (aEl === bEl) l3 = `둘 다 ${aEl} 기운이라 여행 텐션의 주파수가 같아요. 걷는 속도부터 사진 찍고 싶은 포인트까지 비슷할 겁니다`;
  else if (GEN[aEl] === bEl) l3 = `${m.name}의 ${aEl} 기운이 ${f.name}의 ${bEl} 기운을 키워주는 상생 흐름이에요. 같이 다닐수록 ${f.name} 쪽 걸음이 가벼워지는 조합입니다`;
  else if (GEN[bEl] === aEl) l3 = `${f.name}의 ${bEl} 기운이 ${m.name}의 ${aEl} 기운을 키워주는 상생 흐름이에요. 같이 다닐수록 ${m.name} 쪽 걸음이 가벼워지는 조합입니다`;
  else l3 = `${aEl}${josa(aEl, '과', '와')} ${bEl}${josa(bEl, '은', '는')} 서로를 긴장시키는 상극 구도예요. 사주에서 이 긴장감은 밀어냄이 아니라 서로를 또렷하게 만드는 자극 — 설렘으로 바뀌기 가장 쉬운 조합입니다`;

  // ④ 여행 스타일 (오행 분포에서 도출한 계획형/즉흥형)
  const sA = styleOf(m.saju.오행분포), sB = styleOf(f.saju.오행분포);
  let l4;
  if (sA === '즉흥형' && sB === '즉흥형') l4 = '둘 다 즉흥형이라 계획표는 장식이 될 예정이에요. 대신 오늘 제일 재밌는 샛길은 이 둘이 발견합니다';
  else if (sA === '계획형' && sB === '계획형') l4 = '둘 다 계획형이라 동선 정리가 3분 만에 끝나는 조합이에요. 남는 시간은 전부 대화에 쓰면 됩니다';
  else if ((sA === '계획형' && sB === '즉흥형') || (sA === '즉흥형' && sB === '계획형')) l4 = '계획형과 즉흥형의 만남 — 한 명은 지도를 보고 한 명은 골목을 발견하는 여행 황금 조합이에요. 서로의 여행 방식이 그대로 대화 소재가 됩니다';
  else l4 = '한쪽이 흐름을 잡으면 자연스럽게 맞춰지는 유연한 조합이에요. 급할 것 없이 서로의 여행 속도를 알아가면 됩니다';

  // ⑤ 귀인(연인 궁합) 코멘트
  const l5 = gwiin >= 90 ? pickBy(H(5), [
      '오늘의 최우선 관찰 대상 — 최종 매칭각이 가장 높게 뜬 상대입니다. 이 점수는 사주가 낼 수 있는 거의 만점이에요',
      '사주가 뽑은 오늘의 메인 귀인. 여기서 안 잡으면 집 가는 길에 계속 생각날 점수입니다',
    ])
    : gwiin >= 80 ? '이성 인연 상위권 — 두 번째 코스부터 공기가 달라질 수 있는 상대예요. 호감 축적형이라 대화가 길어질수록 점수가 실제로 오릅니다'
    : gwiin >= 65 ? '설렘 반 편안함 반의 중간 지대예요. 1:1 산책 한 번으로 방향이 정해지는 구간이니 직접 확인해보세요'
    : '이성 레이더보다 사람 레이더에 먼저 잡히는 인연이에요. 근데 원래 친구로 시작한 커플이 제일 오래갑니다?';

  // ⑥ 여행메이트(친구 궁합) 코멘트
  const l6 = mate >= 90 ? '여행메이트 만렙 — 오늘 전 코스를 같이 돌 확률 1위 조합입니다. 사진 폴더가 이 사람으로 가득 찰 예정이에요'
    : mate >= 80 ? '같이 다니는 합이 좋은 페어라 자유 데이트 멤버로 최적이에요. 간식 취향부터 맞아 들어갈 겁니다'
    : mate >= 65 ? '편하게 나란히 걷기 좋은 여행 벗이에요. 과하게 들뜨진 않고 딱 기분 좋은 텐션이 유지되는 건강한 조합입니다'
    : '왁자지껄보다 차분한 산책이 어울리는 페어예요. 조용한 코스에서 함께 걸으면 의외로 급이 달라질 수도 있습니다';

  // ⑦ 오늘의 힌트 (코스 기반 — 참가자에게 그대로 보내는 마무리 멘트)
  let l7;
  if (gwiin >= 85 && mate >= 85) l7 = '봉황대 피크닉부터 월정교까지, 동선이 겹칠수록 좋은 조합이에요. 교촌마을 자유 데이트 시간을 놓치지 마세요';
  else if (gwiin >= 85 && mate < 75) l7 = '왁자지껄한 미션보다 계림 1:1 산책에서 진가가 나오는 조합이에요. 둘만의 대화 시간을 꼭 챙겨보세요';
  else if (mate >= 85 && gwiin < 75) l7 = '같이 다니면 제일 든든한 여행 짝꿍이에요. 간식 미션부터 인증샷까지 같은 팀으로 움직여보세요';
  else if (gwiin < 65 && mate < 65) l7 = '사주는 담백하다지만 여행지의 변수는 아무도 몰라요. 첨성대 인증샷 미션에서 반전이 시작될지도요';
  else l7 = '오늘 첫 대화가 이 인연의 장르를 정해요. 황리단길에서 가볍게 먼저 말을 걸어보세요';

  return [l1, l2, l3, l4, l5, l6, '💌 오늘의 힌트: ' + l7];
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
        return { name: (p.name || `${label}${i + 1}`).slice(0, 12), birth: `${p.year}-${p.month}-${p.day}`, saju };
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

      const key = m.birth + '|' + f.birth;
      const jitterA = (hashStr(key) % 9) - 4;                                  // -4~+4
      const jitterB = (hashStr([...key].reverse().join('')) % 9) - 4;          // 다른 시드

      const aEl = m.saju.일간.오행, bEl = f.saju.일간.오행;
      const sangsaeng = GEN[aEl] === bEl || GEN[bEl] === aEl ? 6 : 0;          // 일간 상생
      const eumyangDiff = m.saju.일간.음양 !== f.saju.일간.음양;                // 음양 조화
      const mainSame = mainElOf(m.saju.오행분포) === mainElOf(f.saju.오행분포) ? 5 : 0; // 최다 오행 동일
      const hwaBonus = (m.saju.오행분포.화 + f.saju.오행분포.화) >= 3 ? 4 : 0;  // 화 기운 텐션
      const styleSame = styleOf(m.saju.오행분포) === styleOf(f.saju.오행분포) ? 4 : 0; // 여행 스타일 동일

      let gwiin = clamp(52
        + (has('천간합') ? 20 : 0) + (has('육합') ? 16 : 0) + (has('충') ? 4 : 0)
        + fillCount * 6 + (t.same ? 2 : 0)
        + sangsaeng + (eumyangDiff ? 4 : 0) + jitterA);

      let mate = clamp(52
        + (t.same ? 16 : 0) + (has('충') ? 14 : 0) + (has('육합') ? 8 : 0) + (has('천간합') ? 5 : 0)
        + fillCount * 4
        + mainSame + hwaBonus + (eumyangDiff ? 0 : 3) + styleSame + jitterB);

      // 분리 보정: 두 점수가 붙어 있으면 성격이 다른 점수로 갈라준다
      if (Math.abs(gwiin - mate) < 7) {
        const romance = (has('천간합') ? 20 : 0) + (has('육합') ? 16 : 0) + sangsaeng + (eumyangDiff ? 4 : 0);
        const friend = (has('충') ? 14 : 0) + (t.same ? 16 : 0) + mainSame + hwaBonus + styleSame;
        const romanceWins = romance !== friend ? romance > friend : hashStr(key) % 2 === 0;
        if (romanceWins) { gwiin = clamp(gwiin + 4); mate = clamp(mate - 4); }
        else { mate = clamp(mate + 4); gwiin = clamp(gwiin - 4); }
      }

      pairs.push({ mi, fi, gwiin, mate, reasons: reasonLines7({ key, m, f, t, gwiin, mate }) });
    }

    const brief = (p) => ({
      name: p.name,
      ilgan: { hangul: p.saju.일간.hangul, hanja: p.saju.일간.hanja, 오행: p.saju.일간.오행 },
      mainEl: mainElOf(p.saju.오행분포), style: styleOf(p.saju.오행분포),
    });
    res.status(200).json({ males: M.map(brief), females: F.map(brief), pairs });
  } catch (e) {
    console.error('[matching] error', e);
    res.status(500).json({ error: '서버 오류', detail: String(e?.message || e) });
  }
}
