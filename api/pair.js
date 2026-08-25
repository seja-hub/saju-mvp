// ─────────────────────────────────────────────────────────────
//  /api/pair — 두 사람 궁합 계산 전용 (Gemini 호출 없음, 비용 0원)
//  POST {a:{year,month,day,hour,minute,hourUnknown}, b:{동일}}
//  → {aIlgan, bIlgan, score, combos, fillAtoB, fillBtoA, same}
// ─────────────────────────────────────────────────────────────
import { buildSaju, pairTags } from './_saju.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { a, b } = body;
    for (const [k, p] of [['a', a], ['b', b]]) {
      if (!p || !p.year || !p.month || !p.day) {
        res.status(400).json({ error: `${k}의 생년월일(year, month, day)이 필요합니다.` }); return;
      }
    }
    const build = (p) => buildSaju({
      year: p.year, month: p.month, day: p.day,
      hour: p.hour ?? 12, minute: p.minute ?? 0, hourUnknown: !!p.hourUnknown,
    });
    let A, B;
    try { A = build(a); B = build(b); }
    catch { res.status(400).json({ error: '생년월일을 확인해 주세요.' }); return; }
    const t = pairTags(A, B);
    const il = (s) => ({ hangul: s.일간.hangul, hanja: s.일간.hanja, 오행: s.일간.오행 });
    res.status(200).json({
      aIlgan: il(A), bIlgan: il(B),
      score: t.score, combos: t.combos, fillAtoB: t.fillAtoB, fillBtoA: t.fillBtoA, same: t.same,
    });
  } catch (e) {
    res.status(500).json({ error: '서버 오류', detail: String(e?.message || e) });
  }
}
