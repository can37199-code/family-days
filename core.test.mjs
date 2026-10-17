// 실행: node core.test.mjs  — 기대값은 한국천문연구원 음양력 기준 명절 날짜
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.KoreanLunarCalendar = createRequire(import.meta.url)('./lunar.min.js');
const { lunarToSolar, occurrence, nextDate, buildIcs, encodeShare, decodeShare } = await import('./core.js');

assert.equal(lunarToSolar(2026, 1, 1, false), '2026-02-17');   // 2026 설날
assert.equal(lunarToSolar(2025, 8, 15, false), '2025-10-06');  // 2025 추석
assert.equal(lunarToSolar(2026, 8, 15, false), '2026-09-25');  // 2026 추석
assert.equal(lunarToSolar(2025, 6, 1, true), '2025-07-25');    // 2025 윤6월 1일
assert.equal(lunarToSolar(2026, 6, 1, true), lunarToSolar(2026, 6, 1, false)); // 윤달 없는 해는 평달

const chuseok = { cal: 'lunar', m: 8, d: 15 };
assert.equal(nextDate(chuseok, '2026-09-25'), '2026-09-25');   // 당일 포함
assert.equal(nextDate(chuseok, '2026-09-26'), lunarToSolar(2027, 8, 15, false));
assert.equal(nextDate({ cal: 'lunar', m: 12, d: 20 }, '2026-12-01'), lunarToSolar(2026, 12, 20, false)); // 음력 12월 → 이듬해 양력
assert.equal(occurrence({ cal: 'lunar', m: 8, d: 15, eve: true }, 2026), '2026-09-24');
assert.equal(occurrence({ cal: 'solar', m: 2, d: 29 }, 2027), '2027-02-28');

const people = [{ id: 'a', name: '아버지', events: [{ type: '생신', ...chuseok }] }];
const ics = buildIcs(people, '2026-10-17', 20);
assert.equal(ics.match(/BEGIN:VEVENT/g).length, 19); // 2026 추석은 이미 지남 → 2027~2045
assert.ok(ics.includes(`DTSTART;VALUE=DATE:${lunarToSolar(2027, 8, 15, false).replace(/-/g, '')}`));
assert.ok(ics.includes('SUMMARY:아버지 생신'));

const data = { people: [{ id: 'x', name: '할머니 👵', events: [] }] };
assert.deepEqual(decodeShare(encodeShare(data)), data);
assert.throws(() => decodeShare(encodeShare({ foo: 1 })));
console.log('모든 검사 통과');
