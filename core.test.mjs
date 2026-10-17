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
// 관계 붙이기·떼기
const { link, detach, isAncestor } = await import('./core.js');
const fam = () => ['gf', 'gm', 'hb', 'me', 'kid', 'x'].map(id => ({ id, events: [] }));
let f = fam();
assert.equal(link(f, 'gf', 'gm', 'spouse'), null);
assert.equal(f[0].spouseId, 'gm'); assert.equal(f[1].spouseId, 'gf');
assert.equal(link(f, 'hb', 'gm', 'child'), null);               // 시어머니 아래로 → 부부 단위의 자녀
assert.equal(link(f, 'me', 'hb', 'spouse'), null);
assert.equal(link(f, 'kid', 'me', 'child'), null);
assert.ok(isAncestor(f, 'gf', 'kid'));                          // 배우자 쪽으로도 윗대 계산
assert.ok(link(f, 'gf', 'kid', 'child'));                       // 순환 막기
assert.ok(link(f, 'kid', 'gm', 'spouse'));                      // 손주와 부부 막기
assert.ok(link(f, 'gm', 'gf', 'child'));                        // 부부끼리 부모·자녀 막기
assert.equal(link(f, 'x', 'me', 'spouse'), null);               // 새 배우자 → 기존 배우자와 떨어짐
assert.equal(f.find(p => p.id === 'hb').spouseId, null);
detach(f, 'hb');
assert.equal(f.find(p => p.id === 'hb').parentId, null);
assert.equal(f.find(p => p.id === 'kid').parentId, 'me');       // 자녀는 그대로
assert.equal(link(f, 'gm', 'x', 'parent'), null);               // 부모로 붙이기
assert.equal(f.find(p => p.id === 'x').parentId, 'gm');
// '나' 기준 호칭
const { kinship, relabel, guessGender } = await import('./core.js');
const P = (id, gender, parentId = null, spouseId = null) => ({ id, gender, parentId, spouseId, events: [] });
const k = [
  P('me', 'F', 'mf', 'hb'), P('hb', 'M', 'gf', 'me'), P('gf', 'M', null, 'gm'), P('gm', 'F', null, 'gf'),
  P('sis', 'F', 'gf', 'sb'), P('sb', 'M', null, 'sis'), P('kid', 'F', 'hb'), P('son', 'M', 'me', 'dil'), P('dil', 'F', null, 'son'),
  P('mf', 'M', null, 'mm'), P('mm', 'F', null, 'mf'), P('bro', 'M', 'mm'), P('nephew', 'M', 'bro'), P('gc', 'F', 'son'),
  P('mgf', 'M'), P('aunt', 'F', 'mgf'),
];
k.find(p => p.id === 'mm').parentId = 'mgf';
const K = id => kinship(k, 'me', id);
assert.equal(K('me'), '나');
assert.equal(K('hb'), '남편');
assert.equal(K('gf'), '시아버지');
assert.equal(K('gm'), '시어머니');
assert.equal(K('sis'), '시누이');
assert.equal(K('sb'), '시누이의 남편');
assert.equal(K('kid'), '딸');                 // 남편 쪽에 붙인 자녀도 내 자녀
assert.equal(K('son'), '아들');
assert.equal(K('dil'), '며느리');
assert.equal(K('gc'), '손녀');
assert.equal(K('mf'), '아버지');
assert.equal(K('mm'), '어머니');               // 아버지의 배우자 → 어머니
assert.equal(K('bro'), '형제');
assert.equal(K('nephew'), '조카');
assert.equal(K('mgf'), '외할아버지');
assert.equal(K('aunt'), '이모');
assert.equal(kinship(k, 'hb', 'gf'), '아버지');  // 기준을 바꾸면
assert.equal(kinship(k, 'hb', 'mf'), '장인');
assert.equal(kinship(k, 'hb', 'me'), '아내');
const k2 = [P('a', '', null, 'b'), P('b', 'M', null, 'a'), P('c', '', 'b')];
assert.equal(kinship(k2, 'a', 'b'), '남편');
assert.equal(kinship(k2, 'a', 'c'), '자녀');    // 성별 모르면 중립어
const d2 = { meId: 'a', people: [{ ...P('a', 'F'), rel: '' }, { ...P('z', 'M'), rel: '큰아버지', relAuto: false }, { ...P('y', 'M', 'a'), rel: '옛값' }] };
relabel(d2);
assert.deepEqual(d2.people.map(p => p.rel), ['나', '큰아버지', '아들']); // 직접 쓴 호칭은 유지
detach(d2.people, 'y'); relabel(d2);
assert.equal(d2.people[2].rel, '');                                      // 떨어지면 비움
const d3 = { meId: null, people: [{ ...P('q', 'M'), rel: '시아버지' }] };
relabel(d3);
assert.equal(d3.people[0].rel, '시아버지');                              // '나'가 없으면 안 건드림
assert.equal(guessGender('시어머니'), 'F');
assert.equal(guessGender('시아버지'), 'M');
assert.equal(guessGender('나'), '');
assert.equal(guessGender('시누이 남편'), 'M');
assert.equal(guessGender('형수'), 'F');      // '형'보다 '형수'가 길게 끝남
assert.equal(guessGender('작은아버지'), 'M');
console.log('모든 검사 통과');
