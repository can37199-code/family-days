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

const people = [{ id: 'a', name: '아버지', events: [{ type: '생일', ...chuseok }] }];
const ics = buildIcs(people, '2026-10-17', 20);
assert.equal(ics.match(/BEGIN:VEVENT/g).length, 19); // 2026 추석은 이미 지남 → 2027~2045
assert.ok(ics.includes(`DTSTART;VALUE=DATE:${lunarToSolar(2027, 8, 15, false).replace(/-/g, '')}`));
assert.ok(ics.includes('SUMMARY:아버지 생일'));

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
// 형제 순서
const { isSibling, moveSibling } = await import('./core.js');
const sib = [P0('dad', null, 'mom'), P0('mom', null, 'dad'), P0('a', 'dad'), P0('b', 'mom'), P0('c', 'dad'), P0('x')];
function P0(id, parentId = null, spouseId = null) { return { id, parentId, spouseId, events: [] }; }
assert.ok(isSibling(sib, 'a', 'b'));            // 아빠·엄마 쪽으로 따로 이어져도 형제
assert.ok(!isSibling(sib, 'a', 'x'));
assert.ok(!isSibling(sib, 'a', 'a'));
moveSibling(sib, 'c', 'a', false);
assert.deepEqual(sib.map(p => p.id), ['dad', 'mom', 'c', 'a', 'b', 'x']);
moveSibling(sib, 'c', 'b', true);
assert.deepEqual(sib.map(p => p.id), ['dad', 'mom', 'a', 'b', 'c', 'x']);

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
assert.equal(K('bro'), '남동생');              // 배열에서 나보다 뒤 = 손아래
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
// 부모 없이 형제로 연결 → '부모님' 빈 카드, 순서로 형·동생
const { linkSibling, prunePlaceholders } = await import('./core.js');
const sb = [{ id: 'me', gender: 'M', parentId: null, spouseId: null, events: [] }, { id: 'h', gender: 'M', parentId: null, spouseId: null, events: [] }, { id: 's', gender: 'F', parentId: null, spouseId: null, events: [] }];
assert.equal(linkSibling(sb, 'h', 'me', false), null);         // 김수현을 내 왼쪽(손위)에
const ph = sb.find(p => p.placeholder);
assert.ok(ph && sb.find(p => p.id === 'me').parentId === ph.id && sb.find(p => p.id === 'h').parentId === ph.id);
assert.equal(kinship(sb, 'me', 'h'), '형');
assert.equal(kinship(sb, 'h', 'me'), '남동생');
assert.equal(linkSibling(sb, 's', 'me', true), null);          // 내 오른쪽(손아래)에 여자
assert.equal(kinship(sb, 'me', 's'), '여동생');
assert.equal(kinship(sb, 's', 'h'), '오빠');
assert.equal(sb.filter(p => p.placeholder).length, 1);          // 빈 부모 카드는 하나만
assert.ok(linkSibling(sb, 'me', ph.id, false));                 // 부모와는 형제가 될 수 없음
for (const id of ['me', 'h', 's']) detach(sb, id);
prunePlaceholders(sb);
assert.equal(sb.some(p => p.placeholder), false);               // 자녀가 없어지면 빈 카드 정리
// 호칭 전체 점검: 친가·외가·처가·형제와 그 배우자 (배열 순서 = 형제 순서, 앞이 손위)
const F = [];
const add = (id, gender, parentId = null, spouseId = null) => F.push({ id, gender, parentId, spouseId, events: [] });
const wed = (a, b) => { F.find(p => p.id === a).spouseId = b; F.find(p => p.id === b).spouseId = a; };
add('ggf', 'M');                                    // 친할아버지
add('큰아버지', 'M', 'ggf'); add('dad', 'M', 'ggf'); add('작은아버지', 'M', 'ggf'); add('고모', 'F', 'ggf');
add('큰어머니', 'F'); wed('큰아버지', '큰어머니'); add('고모부', 'M'); wed('고모', '고모부');
add('사촌', 'F', '큰아버지');
add('mgf', 'M');                                    // 외할아버지
add('외삼촌', 'M', 'mgf'); add('mom', 'F', 'mgf'); add('이모', 'F', 'mgf');
add('외숙모', 'F'); wed('외삼촌', '외숙모'); add('이모부', 'M'); wed('이모', '이모부');
add('외사촌', 'M', '이모');
wed('dad', 'mom');
add('형', 'M', 'dad'); add('누나', 'F', 'mom'); add('me', 'M', 'dad'); add('남동생', 'M', 'dad'); add('여동생', 'F', 'mom');
add('형수', 'F'); wed('형', '형수'); add('매형', 'M'); wed('누나', '매형');
add('제수', 'F'); wed('남동생', '제수'); add('매제', 'M'); wed('여동생', '매제');
add('조카', 'M', '형');
add('wf', 'M');                                     // 장인
add('처형', 'F', 'wf'); add('wife', 'F', 'wf'); add('처제', 'F', 'wf'); add('처남', 'M', 'wf');
add('동서', 'M'); wed('처형', '동서'); add('처남댁', 'F'); wed('처남', '처남댁');
wed('me', 'wife');
const names = ['큰아버지', '작은아버지', '고모', '큰어머니', '고모부', '사촌', '외삼촌', '이모', '외숙모', '이모부', '외사촌',
  '형', '누나', '남동생', '여동생', '형수', '매형', '제수', '매제', '조카', '처형', '처제', '처남', '동서', '처남댁'];
for (const n of names) assert.equal(kinship(F, 'me', n), n, `나→${n}`);
assert.equal(kinship(F, 'me', 'ggf'), '할아버지');
assert.equal(kinship(F, 'me', 'mgf'), '외할아버지');
assert.equal(kinship(F, 'me', 'wf'), '장인');
// 아내가 볼 때
const W = id => kinship(F, 'wife', id);
assert.equal(W('me'), '남편');
assert.equal(W('dad'), '시아버지');
assert.equal(W('형'), '시아주버니');
assert.equal(W('남동생'), '시동생');
assert.equal(W('누나'), '시누이');
assert.equal(W('형수'), '동서');
assert.equal(W('ggf'), '시할아버지');
assert.equal(W('처형'), '언니');
// 누나·여동생이 볼 때
assert.equal(kinship(F, '누나', '형'), '오빠');
assert.equal(kinship(F, '누나', '형수'), '올케');
assert.equal(kinship(F, '누나', '매제'), '제부');
assert.equal(kinship(F, '여동생', '매형'), '형부');
assert.equal(kinship(F, '여동생', 'me'), '오빠');
// 형제로 이은 뒤(빈 '부모님') 한 명에게 부모를 붙이면 형제 모두 그 부모 아래로
{
  const { fillPlaceholder } = await import('./core.js');
  const mk = (id, gender) => ({ id, gender, parentId: null, spouseId: null, events: [] });
  let Q = [mk('명완', 'M'), mk('수현', 'M'), mk('정진', 'M'), mk('성자', 'F')];
  link(Q, '정진', '성자', 'spouse');
  linkSibling(Q, '수현', '명완', false);
  assert.equal(link(Q, '정진', '수현', 'parent'), null);        // 형 위에 아버지로
  assert.equal(Q.some(p => p.placeholder), false);              // 빈 카드는 사라지고
  assert.equal(kinship(Q, '명완', '정진'), '아버지');            // 나도 같은 부모 아래
  assert.equal(kinship(Q, '명완', '성자'), '어머니');
  assert.equal(kinship(Q, '명완', '수현'), '형');
  // 이미 꼬인 데이터: 빈 '부모님' 카드 위에 사람을 놓아 채우기
  Q = [mk('명완', 'M'), mk('수현', 'M'), mk('정진', 'M'), mk('성자', 'F')];
  link(Q, '정진', '성자', 'spouse');
  linkSibling(Q, '수현', '명완', false);
  const ph = Q.find(p => p.placeholder).id;
  Q.find(p => p.id === '수현').parentId = '정진';               // 형만 옮겨 간 상태(예전 버그)
  assert.ok(fillPlaceholder(Q, '명완', ph));                    // 자기 부모 자리엔 못 넣음
  assert.equal(fillPlaceholder(Q, '정진', ph), null);
  assert.equal(Q.some(p => p.placeholder), false);
  assert.equal(kinship(Q, '명완', '정진'), '아버지');
  assert.equal(kinship(Q, '명완', '수현'), '형');
}
// 형제(누나)로 잘못 붙였다가 아내로 바꾸면 형제 쪽 부모 연결이 떨어져야 형수가 된다
{
  const mk = (id, gender) => ({ id, gender, parentId: null, spouseId: null, events: [] });
  const Q = [mk('명완', 'M'), mk('수현', 'M'), mk('성숙', 'F')];
  linkSibling(Q, '수현', '명완', false);
  linkSibling(Q, '성숙', '수현', false);              // 실수로 누나로
  assert.equal(kinship(Q, '명완', '성숙'), '누나');
  assert.equal(link(Q, '성숙', '수현', 'spouse'), null); // 아내로 바로잡기
  assert.equal(Q.find(p => p.id === '성숙').parentId, null);
  assert.equal(kinship(Q, '명완', '성숙'), '형수');
}
console.log('모든 검사 통과');
