// ─────────────────────────────────────────────────────────────
//  /api/reading — 서버리스 함수 (v3)
//  개인: profile | 이번달운세 | 총운 | 연애운 | 결혼운 | 금전운 | 직업운 | 건강운 | 에겐테토
//  1:1 궁합: 궁합 (+partner)
//  단체(2~10명): 단체궁합 | 단체에겐테토 (+members: [{name,year,month,day,hour,minute,hourUnknown}])
// ─────────────────────────────────────────────────────────────
import { buildSaju, pairAnalysis, pairTags, personaMetrics } from './_saju.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
let CACHED_MODEL = null;

// ── 사용량 카운터 (Vercel KV / Upstash REST, 미연결 시 자동 skip) ──
function kvCreds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
async function redisPipe(cmds) {
  const { url, tok } = kvCreds();
  if (!url || !tok) return null;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    return await r.json();
  } catch { return null; }
}
async function countHit(section) {
  if (section === 'profile') return redisPipe([['HINCRBY', 'saju:counts', 'starts', 1]]);
  return redisPipe([
    ['HINCRBY', 'saju:counts', section, 1],
    ['HINCRBY', 'saju:counts', 'readings', 1],
  ]);
}

async function pickModel(key) {
  if (CACHED_MODEL) return CACHED_MODEL;
  try {
    const res = await fetch(`${GEMINI_BASE}/models?key=${key}&pageSize=200`);
    const data = await res.json();
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name);
    const score = (n) => {
      const s = n.toLowerCase();
      if (!s.includes('flash')) return -1;
      if (s.includes('image') || s.includes('tts') || s.includes('audio') || s.includes('live')) return -1;
      let pts = 10;
      const mv = s.match(/gemini-(\d+(?:\.\d+)?)/);
      if (mv) pts += parseFloat(mv[1]) * 5;
      if (s.includes('lite')) pts += 3;
      if (s.includes('latest')) pts += 2;
      if (s.includes('preview') || s.includes('exp')) pts -= 1;
      return pts;
    };
    CACHED_MODEL = names.filter((n) => score(n) > 0).sort((a, b) => score(b) - score(a))[0] || 'models/gemini-2.5-flash';
  } catch {
    CACHED_MODEL = 'models/gemini-2.5-flash';
  }
  return CACHED_MODEL;
}

// ── 한 사람의 사주 → 텍스트 ──
function sajuContext(s, who = '') {
  const p = s.pillars;
  const line = (k, v) => (v ? `${k} ${v.hangul}(${v.hanja})` : `${k}(시간모름)`);
  const dist = Object.entries(s.오행분포).map(([k, v]) => `${k}${v}`).join(' ');
  const sg = s.십신_천간.map((g) => `${g.위치}간 ${g.글자}=${g.십신}`).join(', ');
  const bg = s.십신_지지.map((g) => `${g.위치}지 ${g.글자}=${g.십신}`).join(', ');
  return [
    who ? `■ ${who}` : '',
    `사주: ${line('년', p.년주)} / ${line('월', p.월주)} / ${line('일', p.일주)} / ${line('시', p.시주)}`,
    `일간(나): ${s.일간.hangul}${s.일간.hanja}(${s.일간.오행}·${s.일간.음양}) / 일지: ${s.일지.hangul}${s.일지.hanja}`,
    `오행 분포(클수록 강함): ${dist}`,
    `십신 천간: ${sg || '-'} / 십신 지지: ${bg || '-'}`,
    s.시간모름 ? `※ 태어난 시간 모름 → 시 기반 해석 생략` : '',
  ].filter(Boolean).join('\n');
}
// 단체용 압축 컨텍스트
function memberLine(name, s) {
  const d = s.오행분포;
  return `${name}: 일간 ${s.일간.hangul}(${s.일간.hanja}·${s.일간.오행}·${s.일간.음양}), 일지 ${s.일지.hangul} / 오행 목${d.목} 화${d.화} 토${d.토} 금${d.금} 수${d.수}`;
}
function pairLine(nA, nB, t) {
  const parts = [...t.combos];
  if (t.fillBtoA.length) parts.push(`${nB}가 ${nA}의 ${t.fillBtoA.join('·')} 기운을 채움`);
  if (t.fillAtoB.length) parts.push(`${nA}가 ${nB}의 ${t.fillAtoB.join('·')} 기운을 채움`);
  if (t.same) parts.push('같은 오행 기운(동질감)');
  if (!parts.length) parts.push('무난');
  return `${nA}↔${nB} [케미 ${t.score}점]: ${parts.join(', ')}`;
}
function personaLine(name, gender, m) {
  const lean = m.teto >= 50 ? '테토' : '에겐';
  const suffix = gender === '남' ? `${lean}남` : gender === '여' ? `${lean}녀` : `${lean}형`;
  return `${name}: 에겐 ${m.egen}% / 테토 ${m.teto}% → ${suffix} 판정 / 예상 MBTI: ${m.mbti}`;
}

const SYSTEM = `너는 한국 명리학(사주팔자)에 빠삭한 사주 상담가야. 사람들에게 재미로 봐주는 콘텐츠를 쓴다.

[말투]
- 친근한 해요체. 옆에서 말 걸듯 자연스럽고 살짝 위트 있게. 가벼운 감탄이나 농담 섞어도 좋아.
- 오글거리거나 전형적인 'AI 말투'는 절대 금지. ("~하는 당신은 특별한 사람이에요", "결론적으로", "~인 셈이죠", "무엇보다", 과한 미사여구·상투구 금지.)
- 명리 용어(정관·편재·식신 등)는 그대로 써서 전문성은 살리되, 처음 나올 때만 괄호로 짧게 풀어줘.
- 운명론·불안 조장 금지. 단점도 솔직하게, 대신 밉지 않게 농담처럼.

[형식 — 중요]
- 반드시 4~5개의 문단으로 나눠 쓰고, 문단 사이는 빈 줄(엔터 두 번)로 띄워. 문단당 3~4문장.
- 십신·오행·합충의 '구체적 근거'를 들어 디테일하고 깊이 있게 써. "어 이거 진짜 나네" 소리가 나오게. 두루뭉술 금지.
- 꼭 강조할 핵심 문구는 **볼드** 가능 (한 문단에 최대 1번).
- 마크다운 제목(#)이나 불릿(-, ·) 기호는 쓰지 말고, 자연스러운 문단과 줄바꿈으로.`;

const SECTION_PROMPT = {
  profile: `이 사람의 '기본 성향'을 깊이 있게 풀어줘. ①일간이 상징하는 캐릭터와 타고난 기질 ②오행 균형이 만드는 강점 2가지와 은근한 약점 1~2가지 ③사람을 대할 때·일할 때 스타일(십신 근거) ④사람들이 느끼는 첫인상과, 알고 보면 반전인 숨은 매력 ⑤마지막 문단: [에겐·테토/MBTI 고정값]의 예상 MBTI와 에겐·테토 %를 본문에 그대로 표기하고(숫자·MBTI 절대 변경 금지), 왜 그 유형으로 읽히는지 사주 근거로 짧고 재밌게 — "사주로 유추하면 INFJ 느낌, 에겐 70%" 같은 톤.`,
  총운: `이 사람의 '총운(전체 흐름)'을 깊이 있게. ①지금 두드러지는 기운과 그 이유 ②흐름이 잘 풀리는 영역 2가지 ③조심할 영역 1~2가지(구체적으로) ④흐름을 살리는 실전 행동 팁 2가지.`,
  연애운: `이 사람의 '연애운'을 깊이 있게. ①연애 스타일과 그 사주적 이유 ②확 빠지는 포인트와 식는 포인트 ③잘 맞는 상대 유형(십신 근거로 구체적으로) ④요즘 인연의 흐름과 시기 ⑤연애 실전 팁 1가지.`,
  결혼운: `이 사람의 '결혼운'을 현실적으로 깊이 있게. ①결혼에 어울리는 태도와 시기 경향 ②배우자 상(십신 근거) ③결혼 생활이 안정되는 포인트와 흔들리기 쉬운 포인트 ④현실 조언 1가지.`,
  금전운: `이 사람의 '금전운'을 깊이 있게. ①돈 버는 방식(월급형/사업형/전문직형 등 무엇에 가까운지와 근거) ②재물이 들어오는 흐름과 새는 구멍 ③조심할 소비·투자 패턴 ④돈이 잘 붙는 일의 형태와 실전 팁.`,
  직업운: `이 사람의 '직업운'을 깊이 있게. ①타고난 직업 적성과 근거 ②잘 맞는 일하는 방식(혼자/팀, 안정/도전 등) ③강해지는 분야와 커리어가 풀리는 흐름 ④일에서 조심할 패턴 1가지와 팁.`,
  건강운: `이 사람의 '건강운'을 깊이 있게. ①체질적으로 신경 쓰면 좋은 부위·컨디션 경향(오행 근거) ②스트레스가 몸으로 드러나는 방식 ③무너지기 쉬운 상황과 전조 ④생활습관 팁 2가지. ※의학적 진단·병명 단정은 절대 금지, '경향'으로만.`,
};

function buildPrompt(section, saju, extra) {
  if (section === '이번달운세') {
    const inst = `이 사람의 '${extra.monthLabel} 운세'를 깊이 있게 풀어줘. 아래 '현재 운'이 타고난 원국과 어떻게 맞물리는지 근거로: ①이번 달 전체 분위기와 이유 ②다가오는 기회 2가지(어느 영역인지 구체적으로) ③조심할 것 2가지(돈·관계·건강·말실수 등 구체적으로) ④이번 달을 잘 보내는 행동 팁 2가지.`;
    return `${SYSTEM}\n\n${sajuContext(saju)}\n\n[현재 운] ${extra.luck}\n\n요청: ${inst}`;
  }
  if (section === '궁합') {
    const rel = extra.relation ? `두 사람 관계: ${extra.relation}` : '두 사람 관계: 미지정';
    const inst = `'본인'과 '상대'의 궁합을 캐주얼하고 재밌게, 친구가 옆에서 호들갑 떨며 봐주듯 풀어줘. 대화 주제로 바로 던질 수 있는 문장이 많게. 아래 '궁합 힌트'와 '[에겐·테토/MBTI 고정값]'을 근거로: ①첫인상 케미를 임팩트 있게 선언 ②두 사람의 에겐·테토/MBTI 조합 케미 한 문단 — 고정값의 %와 MBTI를 반드시 본문에 표기하고 (예: "테토 82% ESFJ와 에겐 70% INFJ의 만남이라...") 그 조합이 만드는 티키타카를 재밌게 ③잘 맞는 점 2가지(합·보완 근거) ④부딪히기 쉬운 점과 해법(밉지 않게) ⑤**궁합 별점** — 먼저 지금 선택한 관계 기준 총점을 ★n/5(0.5 단위 가능)로 매기고 이유 한 줄, 이어서 나머지 관계(연인·친구·동료 중 해당 없는 것들)로 봤을 때의 별점도 각각 한 줄씩 재밌게(한 문단 안에서 줄바꿈으로 — "친구로는 ★5인데 연인 되면 ★2, 서로 못 잡아먹어서" 같은 대화거리가 되게) ⑥마무리 꿀팁 한 줄. ${extra.relation === '친구' || extra.relation === '동료' ? '현재 관계가 친구/동료니 그 관점 중심으로.' : '관계 성격에 맞게.'}`;
    return `${SYSTEM}\n\n${rel}\n${sajuContext(saju, '본인')}\n\n${sajuContext(extra.partner, '상대')}\n\n[궁합 힌트]\n${extra.hint}\n\n[에겐·테토/MBTI 고정값 — 숫자·MBTI는 절대 바꾸지 말 것]\n${extra.personaBlock}\n\n요청: ${inst}`;
  }
  if (section === '에겐테토') {
    return `${SYSTEM}\n\n${extra.who ? extra.who + '\n' : ''}${sajuContext(saju)}\n\n[판독 고정값 — 숫자와 MBTI는 절대 바꾸지 말 것]\n${extra.personaLine}\n\n요청: 요즘 유행하는 '에겐/테토' 판독을 사주로 해줬어. 위 고정값을 그대로 쓰되, '왜 그런 판정이 나왔는지'를 이 사주의 일간 기질·오행·십신과 엮어서 재밌게 풀어줘. 예: "부드러운 을목 기질에 인성까지 발달 — **따뜻한 마음의 에겐녀일 가능성 ${extra.egen}%**!" 같은 톤. ①첫 문단: 판정 결과를 임팩트 있게 선언 — 에겐/테토 %와 예상 MBTI를 반드시 본문에 그대로 표기 ②에겐/테토 판정의 사주적 근거 ③예상 MBTI 네 글자를 각각 사주 근거로 짧게 해설 ④이 성향이 연애·인간관계에서 어떻게 드러나는지 ⑤마지막 한 줄: 이건 재미로 보는 '사주 유사과학'이라는 걸 위트 있게. 전체 톤은 캐주얼하게 — 밈·유행어 살짝 섞어도 좋고, 친구한테 판독 결과 읽어주며 놀리는 느낌으로. 성별을 모르면 '에겐형/테토형'으로 불러.`;
  }
  if (section === '단체궁합') {
    return `${SYSTEM}\n\n[멤버 ${extra.n}명]\n${extra.memberBlock}\n\n[페어 케미 데이터 — 점수 높을수록 합이 좋음, '충'은 투닥거리는 자극 케미]\n${extra.pairBlock}\n\n[멤버별 에겐·테토/MBTI 고정값 — 숫자·MBTI는 절대 바꾸지 말 것]\n${extra.personaBlock}\n\n요청: 이 ${extra.n}명이 지금 한자리에 모였어. 단체 케미를 캐주얼하고 도발적으로(단, 밉지 않게) 분석해줘 — 읽자마자 서로 보여주고 놀리면서 대화 주제가 되게. ①이 모임의 전체 분위기를 한두 문장으로 임팩트 있게 ②**베스트 케미 TOP 3** — 어떤 페어인지와 이유(케미 점수·합·보완·MBTI 근거) ③**환장의 조합** 1~2쌍 — 충이 있거나 점수 낮은 페어를 투닥 케미로 ④**연인 케미 어워드** — 이 중 커플이 되면 제일 잘 어울릴 페어 1쌍(왜인지), 그리고 '친구로는 최고인데 연인 되면 파국'인 페어 1쌍(왜인지). 합충과 에겐·테토/MBTI 조합을 근거로, 놀리기 좋게 ⑤멤버별 오늘의 모임 롤 — 전원 한 명당 한 줄씩, 사주 기질 근거로 재밌는 롤명(분위기메이커·중재 담당·총무각·리액션 장인·갑자기 진지·끝까지 생존 등). 한 문단 안에서 줄바꿈으로 ⑥**이 조합이 같이 하면 잘 풀릴 일** 하나 — 여행·창업·스터디·운동·유튜브 등 중에서 이 멤버들 기질 조합에 제일 잘 맞는 걸 골라 이유와 함께 ⑦총평 — 오늘 이 자리가 어떻게 흘러갈지 짧은 예언 + 꿀팁 하나. 사람 이름은 **볼드**로.`;
  }
  if (section === '단체에겐테토') {
    return `${SYSTEM}\n\n[멤버 ${extra.n}명 사주 요약]\n${extra.memberBlock}\n\n[판독 고정값 — 숫자와 MBTI는 절대 바꾸지 말 것]\n${extra.personaBlock}\n\n요청: 멤버 전원의 에겐·테토 판독 카드를 순서대로 써줘. 한 명당: 첫 줄에 "**이름** — 에겐 xx% · 테토 yy% · 예상 MBTI ZZZZ", 이어서 2~3문장으로 사주 기질과 엮은 판정 이유를 재밌게(예: "화 기운 넘치는 병화 일간 — 확신의 테토형!"). 멤버 카드 사이는 빈 줄로 구분. 마지막 문단은 단체 총평: **테토 대장(${extra.tetoKing})**과 **에겐 대장(${extra.egenKing})**을 호명하고, 멤버 간 MBTI 조합에서 나오는 재밌는 케미 포인트 한두 개(예: 극과 극이라 오히려 잘 맞는 페어, 판박이라 서로 답답해할 페어)를 짚고, 이 모임의 균형을 위트 있게 + '재미로 보는 사주 유사과학' 디스클레이머 한 줄. 전체 톤은 캐주얼하게, 서로 놀리기 좋은 문장 위주로. 성별 모르는 사람은 '에겐형/테토형'으로.`;
  }
  return `${SYSTEM}\n\n${extra.who ? extra.who + '\n' : ''}${sajuContext(saju)}\n\n${extra.personaBlock ? '[에겐·테토/MBTI 고정값 — 숫자·MBTI는 절대 바꾸지 말 것]\n' + extra.personaBlock + '\n\n' : ''}요청: ${SECTION_PROMPT[section]}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { year, month, day, hour, minute, hourUnknown, gender, name, relation, section = 'profile', partner, members } = body;

    const ALLOWED = ['profile','이번달운세','총운','연애운','결혼운','금전운','직업운','건강운','궁합','에겐테토','단체궁합','단체에겐테토'];
    if (!ALLOWED.includes(section)) { res.status(400).json({ error: `알 수 없는 항목: ${section}` }); return; }

    const isGroup = section === '단체궁합' || section === '단체에겐테토';
    const extra = { who: [name ? `이름: ${name}` : '', gender ? `성별: ${gender}` : ''].filter(Boolean).join(' / ') };
    let saju = null, partnerSaju = null, groupOut = null;
    let maxTok = 2400;

    if (isGroup) {
      if (!Array.isArray(members) || members.length < 2) { res.status(400).json({ error: '단체 분석은 본인 포함 2명 이상이 필요해요.' }); return; }
      if (members.length > 10) { res.status(400).json({ error: '최대 10명까지 가능해요.' }); return; }
      const list = [];
      for (let i = 0; i < members.length; i++) {
        const m = members[i] || {};
        if (!m.year || !m.month || !m.day) { res.status(400).json({ error: `${i + 1}번째 멤버의 생년월일이 비어 있어요.` }); return; }
        try {
          list.push({
            name: (m.name || `멤버${i + 1}`).slice(0, 12),
            gender: m.gender || '',
            saju: buildSaju({ year: m.year, month: m.month, day: m.day, hour: m.hour ?? 12, minute: m.minute ?? 0, hourUnknown: !!m.hourUnknown }),
          });
        } catch { res.status(400).json({ error: `${i + 1}번째 멤버의 생년월일을 확인해 주세요.` }); return; }
      }
      extra.n = list.length;
      extra.memberBlock = list.map((m, i) => `${i + 1}. ${memberLine(m.name, m.saju)}`).join('\n');
      if (section === '단체궁합') {
        const lines = [];
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          lines.push(pairLine(list[i].name, list[j].name, pairTags(list[i].saju, list[j].saju)));
        }
        extra.pairBlock = lines.join('\n');
        extra.personaBlock = list.map((m) => personaLine(m.name, m.gender, personaMetrics(m.saju))).join('\n');
      } else {
        const metrics = list.map((m) => ({ ...m, pm: personaMetrics(m.saju) }));
        extra.personaBlock = metrics.map((m) => personaLine(m.name, m.gender, m.pm)).join('\n');
        const byTeto = [...metrics].sort((a, b) => b.pm.teto - a.pm.teto);
        extra.tetoKing = byTeto[0].name;
        extra.egenKing = byTeto[byTeto.length - 1].name;
      }
      groupOut = { members: list.map((m) => ({ name: m.name, 일간: m.saju.일간 })) };
      maxTok = 3300;
    } else {
      if (!year || !month || !day) { res.status(400).json({ error: '생년월일(year, month, day)은 필수입니다.' }); return; }
      saju = buildSaju({ year, month, day, hour, minute, hourUnknown: !!hourUnknown });

      if (section === '궁합') {
        if (!partner || !partner.year || !partner.month || !partner.day) {
          res.status(400).json({ error: '궁합을 보려면 상대방의 생년월일이 필요합니다.' }); return;
        }
        partnerSaju = buildSaju({ year: partner.year, month: partner.month, day: partner.day, hour: partner.hour, minute: partner.minute, hourUnknown: !!partner.hourUnknown });
        extra.partner = partnerSaju;
        extra.relation = relation || '';
        extra.hint = pairAnalysis(saju, partnerSaju);
        extra.personaBlock = personaLine(name || '본인', gender || '', personaMetrics(saju)) + '\n'
          + personaLine('상대', '', personaMetrics(partnerSaju));
      }
      if (section === '이번달운세') {
        const kst = new Date(Date.now() + 9 * 3600 * 1000);
        const Y = kst.getUTCFullYear(), M = kst.getUTCMonth() + 1, D = kst.getUTCDate();
        extra.monthLabel = `${M}월`;
        const cur = buildSaju({ year: Y, month: M, day: D });
        extra.luck = `${Y}년 세운 ${cur.pillars.년주.hangul}(${cur.pillars.년주.hanja}) · 이번 달 월운 ${cur.pillars.월주.hangul}(${cur.pillars.월주.hanja})`;
      }
      if (section === 'profile') {
        extra.personaBlock = personaLine(name || '이 사람', gender || '', personaMetrics(saju));
      }
      if (section === '에겐테토') {
        const pm = personaMetrics(saju);
        extra.personaLine = personaLine(name || '이 사람', gender || '', pm);
        extra.egen = pm.egen;
      }
    }

    const prompt = buildPrompt(section, saju, extra);
    const model = await pickModel(key);
    const gRes = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.92, maxOutputTokens: maxTok, topP: 0.95 },
      }),
    });
    if (!gRes.ok) {
      const errText = await gRes.text(); CACHED_MODEL = null;
      res.status(502).json({ error: `Gemini 오류 (${gRes.status}). 모델: ${model}`, detail: errText.slice(0, 500) }); return;
    }
    const data = await gRes.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    console.log(`[reading] section=${section} model=${model} len=${text.length}`);
    await countHit(section).catch(() => {});

    const out = { section, text: text || '결과를 불러오지 못했어요. 다시 시도해 주세요.' };
    if (saju) out.saju = { pillars: saju.pillars, 일간: saju.일간, 오행분포: saju.오행분포, 시간보정: saju.시간보정, 시간모름: saju.시간모름 };
    if (partnerSaju) out.partner = { 일간: partnerSaju.일간, pillars: partnerSaju.pillars, 시간모름: partnerSaju.시간모름 };
    if (groupOut) out.group = groupOut;
    res.status(200).json(out);
  } catch (e) {
    console.error('[reading] error', e);
    res.status(500).json({ error: '서버 오류', detail: String(e?.message || e) });
  }
}
