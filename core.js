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
    setSpouse(people, a, b);
  } else {
    const [child, parent] = kind === 'child' ? [a, b] : [b, a];
    if (unit(people, child).includes(parent)) return '부부 사이는 부모·자녀로 붙일 수 없어요.';
    if (isAncestor(people, child, parent)) return '자기 자손을 부모로 둘 수는 없어요.';
    find(people, child).parentId = parent;
  }
  return null;
}

// 같은 부모(부부 중 누구로 이어졌든)를 둔 형제인가
export function isSibling(people, a, b) {
  const pa = find(people, a)?.parentId, pb = find(people, b)?.parentId;
  return a !== b && !!pa && !!pb && unit(people, pa).includes(pb);
}

// 형제 순서 = 배열 순서. a를 b 앞(after면 뒤)으로 옮긴다.
export function moveSibling(people, a, b, after) {
  const item = people.splice(people.findIndex(p => p.id === a), 1)[0];
  people.splice(people.findIndex(p => p.id === b) + (after ? 1 : 0), 0, item);
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
function directTerm(people, path, viewer) {
  const k = path.map(x => x.step).join(''), g = genderOf(people, path.at(-1).p), g1 = genderOf(people, path[0].p);
  const me = genderOf(people, viewer);
  const by = (m, f, n) => g === 'M' ? m : g === 'F' ? f : n;
  switch (k) {
    case 'S': return by('남편', '아내', '배우자');
    case 'P': return by('아버지', '어머니', '부모');
    case 'C': return by('아들', '딸', '자녀');
    case 'PP': return g1 ? (g1 === 'F' ? '외' : '') + by('할아버지', '할머니', '조부모') : by('할아버지', '할머니', '조부모');
    case 'CC': return by('손자', '손녀', '손주');
    case 'CS': return by('사위', '며느리', null);
    case 'PC': return by('형제', '자매', '형제자매');
    case 'PCC': return '조카';
    case 'PPCC': return '사촌';
    case 'PPC': return g1 === 'M' ? by('삼촌', '고모', null) : g1 === 'F' ? by('외삼촌', '이모', null) : null;
    case 'SP': return me === 'F' ? by('시아버지', '시어머니', '시부모') : me === 'M' ? by('장인', '장모', '처부모') : null;
    case 'SPC': return me === 'F' && g === 'F' ? '시누이' : me === 'M' && g === 'M' ? '처남' : null;
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

// 공유 링크: 데이터를 UTF-8 → base64url 로 주소 # 뒤에 담는다.
// shortcut: 링크를 보낸 시점의 사본이라 실시간 동기화가 안 됨. 가족이 함께 고치는 일이 잦아지면 서버(Supabase)로 옮긴다.
export function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  if (!Array.isArray(data?.people)) throw new Error('형식이 맞지 않는 링크');
  return data;
}
