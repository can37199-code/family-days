// 날짜 계산·달력 파일·공유 링크. 화면 코드 없이 테스트할 수 있게 분리.
const KLC = () => new globalThis.KoreanLunarCalendar();

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// 음력 날짜 하나를 양력으로. 그해 윤달이 없으면 평달, 30일이 없으면 29일로 지낸다(관례).
export function lunarToSolar(y, m, d, leap) {
  const c = KLC();
  const tries = [[m, d, leap], [m, d, false], [m, d - 1, leap], [m, d - 1, false]];
  for (const [mm, dd, lp] of tries) {
    if (c.setLunarDate(y, mm, dd, lp)) {
      const s = c.getSolarCalendar();
      return ymd(s.year, s.month, s.day);
    }
  }
  return null; // 지원 범위(1000~2050년) 밖
}

// 기념일 e = {cal:'solar'|'lunar', m, d, leap, eve}. 해당 연도에 돌아오는 양력 날짜.
export function occurrence(e, y) {
  let s;
  if (e.cal === 'lunar') s = lunarToSolar(y, e.m, e.d, e.leap);
  else {
    const d = e.m === 2 && e.d === 29 && new Date(y, 1, 29).getMonth() !== 1 ? 28 : e.d; // 윤년 2/29
    s = ymd(y, e.m, d);
  }
  if (s && e.eve) { // 제사를 전날 밤에 지내는 집
    const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1);
    s = t.toISOString().slice(0, 10);
  }
  return s;
}

// today 이후(오늘 포함) 가장 가까운 날. 음력 12월은 다음 해 양력 1~2월로 넘어가므로 전년도도 본다.
export function nextDate(e, today) {
  const y = +today.slice(0, 4);
  return [y - 1, y, y + 1].map(yy => occurrence(e, yy)).filter(s => s && s >= today).sort()[0] ?? null;
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export const describe = e =>
  `${e.cal === 'lunar' ? '음력 ' + (e.leap ? '윤' : '') : '양력 '}${e.m}월 ${e.d}일${e.eve ? ' (전날)' : ''}`;

// 모든 기념일을 years년치 하루 종일 일정으로. 알림: 7일 전·전날 오전 9시.
export function buildIcs(people, today, years = 20) {
  const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = today.replace(/-/g, '') + 'T000000Z';
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//family-days//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:우리집 기념일'];
  const y0 = +today.slice(0, 4);
  for (const p of people) for (const e of p.events || []) {
    const seen = new Set();
    for (let y = y0 - 1; y < y0 + years; y++) {
      const s = occurrence(e, y);
      if (!s || s < today || seen.has(s)) continue;
      seen.add(s);
      const d = s.replace(/-/g, '');
      const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
      out.push('BEGIN:VEVENT', `UID:${p.id}-${e.type}-${d}@family-days`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${t.toISOString().slice(0, 10).replace(/-/g, '')}`,
        `SUMMARY:${esc(`${p.name} ${e.type}`)}`, `DESCRIPTION:${esc(describe(e))}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${p.name} ${e.type} 7일 전`)}`, 'TRIGGER:-P6DT15H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`내일 ${p.name} ${e.type}`)}`, 'TRIGGER:-PT15H', 'END:VALARM',
        'END:VEVENT');
    }
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

// ── 가족 관계 붙이기·떼기 (people 배열을 직접 고친다. 실패하면 이유 문자열) ──
const find = (people, id) => people.find(p => p.id === id);
const unit = (people, id) => [id, find(people, id)?.spouseId].filter(Boolean); // 부부는 한 단위

// anc 가 id 의 윗대(부부 포함)인가
export function isAncestor(people, anc, id) {
  const seen = new Set(), queue = unit(people, id);
  while (queue.length) {
    const x = queue.shift();
    if (seen.has(x)) continue;
    seen.add(x);
    const parent = find(people, x)?.parentId;
    if (!parent) continue;
    if (unit(people, parent).includes(anc)) return true;
    queue.push(...unit(people, parent));
  }
  return false;
}

export function setSpouse(people, a, b) {
  for (const id of [a, b]) { // 기존 배우자와는 떨어진다
    const old = find(people, find(people, id)?.spouseId);
    if (old) old.spouseId = null;
  }
  if (b) { find(people, a).spouseId = b; find(people, b).spouseId = a; }
  else find(people, a).spouseId = null;
}

// kind: 'spouse' 배우자로, 'child' a를 b의 자녀로, 'parent' a를 b의 부모로
export function link(people, a, b, kind) {
  if (a === b) return '같은 사람입니다.';
  if (kind === 'spouse') {
    if (isAncestor(people, a, b) || isAncestor(people, b, a)) return '부모·자녀 사이는 부부로 붙일 수 없어요.';
    // 형제로 잘못 붙어 있던 사람을 배우자로 바꾸면, 끌어 온 쪽(a)은 그 집안에 시집·장가 온 사람이므로 부모 연결을 뗀다
    if (isSibling(people, a, b)) find(people, a).parentId = null;
    setSpouse(people, a, b);
  } else {
    const [child, parent] = kind === 'child' ? [a, b] : [b, a];
    if (unit(people, child).includes(parent)) return '부부 사이는 부모·자녀로 붙일 수 없어요.';
    if (isAncestor(people, child, parent)) return '자기 자손을 부모로 둘 수는 없어요.';
    const old = find(people, find(people, child).parentId);
    if (old?.placeholder) return fillPlaceholder(people, parent, old.id); // 빈 '부모님' 아래 형제는 다 같이 옮긴다
    find(people, child).parentId = parent;
    fixMarriedSiblings(people, child); // 방금 자녀로 붙인 사람의 배우자가 같은 부모의 자녀로 남아 있으면 떼어 낸다
  }
  return null;
}

// 같은 부모(부부 중 누구로 이어졌든)를 둔 형제인가
// '형제이면서 부부'는 있을 수 없다. 그런 부부가 있으면 한쪽(시집·장가 온 쪽)의 부모 연결을 뗀다.
// keep: 이 사람은 부모 연결을 지킨다(방금 직접 붙인 사람). 없으면 아내 쪽을, 같은 성별이면 뒤에 등록된 쪽을 뗀다.
export function fixMarriedSiblings(people, keep = null) {
  for (const p of people) {
    const s = find(people, p.spouseId);
    if (!s || !isSibling(people, p.id, s.id)) continue;
    const inlaw = keep === p.id ? s : keep === s.id ? p
      : p.gender === 'F' && s.gender !== 'F' ? p : s.gender === 'F' && p.gender !== 'F' ? s
      : people.indexOf(p) > people.indexOf(s) ? p : s;
    inlaw.parentId = null;
  }
}

export function isSibling(people, a, b) {
  const pa = find(people, a)?.parentId, pb = find(people, b)?.parentId;
  return a !== b && !!pa && !!pb && unit(people, pa).includes(pb);
}

// 형제 순서 = 배열 순서. a를 b 앞(after면 뒤)으로 옮긴다.
export function moveSibling(people, a, b, after) {
  const item = people.splice(people.findIndex(p => p.id === a), 1)[0];
  people.splice(people.findIndex(p => p.id === b) + (after ? 1 : 0), 0, item);
}

// a를 b의 형제로(after면 b 뒤=손아래, 아니면 앞=손위). b의 부모가 없으면 이어 줄 '부모님' 빈 카드를 만든다.
export function linkSibling(people, a, b, after) {
  if (a === b) return '같은 사람입니다.';
  if (unit(people, b).includes(a)) return '부부 사이는 형제로 연결할 수 없어요.';
  if (isAncestor(people, a, b) || isAncestor(people, b, a)) return '부모·자녀 사이는 형제로 연결할 수 없어요.';
  const tb = find(people, b);
  if (!tb.parentId) {
    const ph = { id: globalThis.crypto.randomUUID(), name: '부모님', gender: '', placeholder: true, parentId: null, spouseId: null, rel: '', events: [] };
    people.push(ph);
    tb.parentId = ph.id;
  }
  find(people, a).parentId = tb.parentId;
  moveSibling(people, a, b, after);
  return null;
}

// a가 빈 '부모님' 카드(ph) 자리를 채운다: ph의 자녀는 a의 자녀가 되고 ph는 지워진다
export function fillPlaceholder(people, a, ph) {
  if (a === ph) return null;
  if (isAncestor(people, ph, a)) return '자기 부모 자리에는 넣을 수 없어요.';
  const p = find(people, ph), me = find(people, a);
  for (const c of people) if (c.parentId === ph) c.parentId = a;
  if (p.parentId && !me.parentId && !isAncestor(people, a, p.parentId)) me.parentId = p.parentId;
  if (p.spouseId && !me.spouseId) setSpouse(people, a, p.spouseId);
  else if (p.spouseId) setSpouse(people, ph, null);
  people.splice(people.indexOf(p), 1);
  return null;
}

// 자녀도 배우자도 없어진 '부모님' 빈 카드는 지운다
export function prunePlaceholders(people) {
  for (let i = people.length - 1; i >= 0; i--) {
    const p = people[i];
    if (p.placeholder && !p.spouseId && !people.some(c => c.parentId === p.id)) people.splice(i, 1);
  }
}

// 가족도에서 떼어내기: 부모·배우자 연결만 끊고, 이 사람의 자녀는 그대로 따라온다.
export function detach(people, id) {
  setSpouse(people, id, null);
  find(people, id).parentId = null;
}

// ── '나'를 기준으로 한 관계 호칭 ──
// 성별: 직접 고른 값 → 없으면 배우자의 반대 성별 (예: 남편이 남자면 나는 여자)
export function genderOf(people, p) {
  if (p?.gender) return p.gender;
  const s = find(people, p?.spouseId)?.gender;
  return s === 'M' ? 'F' : s === 'F' ? 'M' : '';
}

// 예전 데이터처럼 성별이 없고 관계 메모만 있으면 메모로 성별을 짐작
// "시누이 남편"처럼 여러 말이 섞이면 마지막에 나오는 말이 그 사람이다.
const MALE = /아버지|남편|아들|할아버지|삼촌|형|오빠|남동생|장인|사위|처남|손자|도련님|아주버니|매형|매제|형부|제부/g;
const FEMALE = /어머니|아내|딸|할머니|고모|이모|누나|언니|여동생|장모|며느리|시누이|손녀|올케|형수|제수|처형|처제/g;
const lastEnd = (re, s) => Math.max(-1, ...[...s.matchAll(re)].map(m => m.index + m[0].length));
export function guessGender(rel = '') {
  const m = lastEnd(MALE, rel || ''), f = lastEnd(FEMALE, rel || '');
  return m < 0 && f < 0 ? '' : f >= m ? 'F' : 'M';
}

// '나'에서 id까지 가장 짧은 경로. 단계: S 배우자, P 부모(부부 둘 다), C 자녀(부부 공동)
function kinPath(people, meId, id) {
  const prev = new Map([[meId, null]]), queue = [meId];
  while (queue.length) {
    const x = queue.shift();
    if (x === id) break;
    const p = find(people, x);
    const next = [
      ['S', p.spouseId],
      ...unit(people, p.parentId).map(y => ['P', y]),
      ...people.filter(c => c.parentId && unit(people, x).includes(c.parentId)).map(c => ['C', c.id]),
    ];
    for (const [step, y] of next) if (y && find(people, y) && !prev.has(y)) { prev.set(y, [x, step]); queue.push(y); }
  }
  if (!prev.has(id)) return null;
  const path = [];
  for (let y = id; prev.get(y); y = prev.get(y)[0]) path.unshift({ step: prev.get(y)[1], p: find(people, y) });
  return path;
}

// 경로 한 덩어리를 부르는 말. 모르면 null
// 형제 호칭. 형제 순서(배열 순서, 관계도 왼쪽이 손위)로 손위·손아래를 가른다.
// g: 그 형제의 성별, me: 부르는 사람의 성별
export function siblingTerm(g, me, older) {
  if (!older) return g === 'M' ? '남동생' : g === 'F' ? '여동생' : '동생';
  if (g === 'M') return me === 'M' ? '형' : me === 'F' ? '오빠' : '형·오빠';
  if (g === 'F') return me === 'M' ? '누나' : me === 'F' ? '언니' : '누나·언니';
  return '손위 형제';
}

// 경로(S 배우자, P 부모, C 자녀)별 호칭. 손위·손아래는 형제 순서(배열 순서)로 가른다.
function directTerm(people, path, viewer) {
  const k = path.map(x => x.step).join(''), t = path.at(-1).p, G = p => genderOf(people, p);
  const g = G(t), g1 = G(path[0].p), me = G(viewer);
  const older = (a, b) => people.indexOf(a) < people.indexOf(b);
  const by = (m, f, n = null) => g === 'M' ? m : g === 'F' ? f : n;
  switch (k) {
    // 나·배우자·부모·자녀
    case 'S': return by('남편', '아내', '배우자');
    case 'P': return by('아버지', '어머니', '부모');
    case 'C': return by('아들', '딸', '자녀');
    case 'PP': return (g1 === 'F' ? '외' : '') + by('할아버지', '할머니', '조부모');
    case 'PPP': return by('증조할아버지', '증조할머니', '증조부모');
    case 'CC': return by('손자', '손녀', '손주');
    case 'CCC': return by('증손자', '증손녀', '증손주');
    case 'CS': return by('사위', '며느리');
    // 형제와 그 배우자
    case 'PC': return siblingTerm(g, me, older(t, viewer));
    case 'PCS': { // 형수·제수·매형·매제 / 올케·형부·제부
      const sib = path[1].p, up = older(sib, viewer), sg = G(sib);
      if (me === 'M') return sg === 'M' ? (up ? '형수' : '제수') : sg === 'F' ? (up ? '매형' : '매제') : null;
      if (me === 'F') return sg === 'M' ? '올케' : sg === 'F' ? (up ? '형부' : '제부') : null;
      return null;
    }
    case 'PCC': case 'SPCC': return '조카';
    // 배우자 쪽
    case 'SP': return me === 'F' ? by('시아버지', '시어머니', '시부모') : me === 'M' ? by('장인', '장모', '처부모') : null;
    case 'SPP': return me === 'F' ? by('시할아버지', '시할머니') : me === 'M' ? by('처조부', '처조모') : null;
    case 'SPC': { // 시아주버니·시동생·시누이 / 처남·처형·처제
      const up = older(t, path[0].p);
      if (me === 'F') return g === 'M' ? (up ? '시아주버니' : '시동생') : g === 'F' ? '시누이' : null;
      if (me === 'M') return g === 'M' ? '처남' : g === 'F' ? (up ? '처형' : '처제') : null;
      return null;
    }
    case 'SPCS': { // 동서·처남댁
      const sg = G(path[2].p);
      if (me === 'F' && sg === 'M') return '동서';
      if (me === 'M' && sg === 'F') return '동서';
      if (me === 'M' && sg === 'M') return '처남댁';
      return null;
    }
    // 부모의 형제와 그 배우자, 사촌
    case 'PPC': { // 큰아버지·작은아버지·고모 / 외삼촌·이모
      const up = older(t, path[0].p);
      if (g1 === 'M') return by(up ? '큰아버지' : '작은아버지', '고모');
      if (g1 === 'F') return by('외삼촌', '이모');
      return null;
    }
    case 'PPCS': { // 큰어머니·작은어머니·고모부 / 외숙모·이모부
      const uncle = path[2].p, ug = G(uncle), up = older(uncle, path[0].p);
      if (g1 === 'M') return ug === 'M' ? (up ? '큰어머니' : '작은어머니') : ug === 'F' ? '고모부' : null;
      if (g1 === 'F') return ug === 'M' ? '외숙모' : ug === 'F' ? '이모부' : null;
      return null;
    }
    case 'PPCC': return g1 === 'F' ? '외사촌' : '사촌';
  }
  return null;
}

// 아는 말이 안 되면 앞부분을 최대한 길게 잘라 "시누이의 남편"처럼 잇는다
function termOf(people, path, viewer) {
  const t = directTerm(people, path, viewer);
  if (t) return t;
  for (let i = path.length - 1; i >= 1; i--) {
    const head = directTerm(people, path.slice(0, i), viewer);
    if (head) return `${head}의 ${termOf(people, path.slice(i), path[i - 1].p)}`;
  }
}

export function kinship(people, meId, id) {
  if (!find(people, meId)) return null;
  if (id === meId) return '나';
  const path = kinPath(people, meId, id);
  return path ? termOf(people, path, find(people, meId)) : null;
}

// 자동 호칭인 사람(relAuto !== false)의 관계 메모를 다시 계산. 이어지지 않으면 비운다.
// '나'가 없으면 기준이 없으니 기존 메모를 그대로 둔다.
export function relabel(data) {
  if (!find(data.people, data.meId)) return;
  for (const p of data.people) if (p.relAuto !== false) p.rel = kinship(data.people, data.meId, p.id) || '';
}

// 공유 링크: 주소 # 뒤에 데이터를 담는다.
// shortcut: 링크를 보낸 시점의 사본이라 실시간 동기화가 안 됨. 가족이 함께 고치는 일이 잦아지면 서버(Supabase)로 옮긴다.
// 카카오톡이 긴 링크를 자르므로 '#s=' 새 형식은 긴 id를 번호로 바꾸고 호칭(rel)은 빼고(받는 쪽에서 다시 계산) 압축한다.
const b64u = bytes => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const squeeze = async (bytes, Stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer());

// 링크에 붙일 해시 문자열(예: 's=…')을 만든다
export async function encodeShare(data) {
  const idx = new Map(data.people.map((p, i) => [p.id, i]));
  const p = data.people.map(x => {
    const o = { n: x.name };
    if (x.gender) o.g = x.gender;
    if (idx.has(x.parentId)) o.p = idx.get(x.parentId);
    if (idx.has(x.spouseId)) o.s = idx.get(x.spouseId);
    if (x.placeholder) o.h = 1;
    if (x.events?.length) o.e = x.events.map(e => [e.type, e.cal === 'lunar' ? 1 : 0, e.m, e.d, e.leap ? 1 : 0, e.eve ? 1 : 0]);
    return o;
  });
  const json = JSON.stringify({ v: 2, m: idx.get(data.meId) ?? -1, p });
  return 's=' + b64u(await squeeze(new TextEncoder().encode(json), CompressionStream));
}

// 's=…'(새 형식) 또는 'd=…'(예전 형식)을 읽는다. 링크는 밖에서 온 값이라 모양을 꼼꼼히 확인한다.
export async function decodeShare(hash) {
  hash = hash.replace(/^#/, '');
  try { hash = decodeURIComponent(hash); } catch {}
  hash = hash.replace(/\s+/g, ''); // 메신저가 줄바꿈·공백을 끼워 넣은 경우
  const [kind, body = ''] = [hash.slice(0, 2), hash.slice(2)];
  const str = s => typeof s === 'string' ? s.slice(0, 40) : '';
  const num = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (kind === 'd=') { // 예전 형식: 압축 없는 JSON 그대로
    const data = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!Array.isArray(data?.people)) throw new Error('형식이 맞지 않는 링크');
    return data;
  }
  if (kind !== 's=') throw new Error('형식이 맞지 않는 링크');
  const d = JSON.parse(new TextDecoder().decode(await squeeze(unb64u(body), DecompressionStream)));
  if (d?.v !== 2 || !Array.isArray(d.p) || d.p.length > 500) throw new Error('형식이 맞지 않는 링크');
  const n = d.p.length, ids = d.p.map(() => globalThis.crypto.randomUUID());
  const people = d.p.map((o, i) => ({
    id: ids[i], name: str(o.n), gender: o.g === 'M' || o.g === 'F' ? o.g : '', rel: '',
    parentId: num(o.p, 0, n - 1) ? ids[o.p] : null, spouseId: num(o.s, 0, n - 1) ? ids[o.s] : null,
    ...(o.h ? { placeholder: true } : {}),
    events: (Array.isArray(o.e) ? o.e : []).filter(e => Array.isArray(e) && num(e[2], 1, 12) && num(e[3], 1, 31))
      .map(e => ({ type: e[0] === '기일' ? '기일' : '생일', cal: e[1] ? 'lunar' : 'solar', m: e[2], d: e[3], leap: !!e[4], eve: !!e[5] })),
  }));
  return { people, meId: num(d.m, 0, n - 1) ? ids[d.m] : null };
}
