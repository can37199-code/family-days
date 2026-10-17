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

// 가족도에서 떼어내기: 부모·배우자 연결만 끊고, 이 사람의 자녀는 그대로 따라온다.
export function detach(people, id) {
  setSpouse(people, id, null);
  find(people, id).parentId = null;
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
