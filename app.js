import { nextDate, daysBetween, describe, buildIcs, encodeShare, decodeShare, link, detach, relabel, guessGender, linkSibling, prunePlaceholders, siblingTerm, genderOf, isSibling, fillPlaceholder, fixMarriedSiblings } from './core.js';

const KEY = 'family-days';
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

let data;
try { data = JSON.parse(localStorage.getItem(KEY)) || { people: [] }; } catch { data = { people: [] }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(data));
// 예전 데이터: '나'와 성별을 관계 메모에서 찾아 채운다
function migrate(d) {
  d.meId ??= d.people.find(p => p.rel === '나')?.id ?? null;
  for (const p of d.people) {
    p.gender ??= guessGender(p.rel);
    delete p.relAuto; // 호칭 직접 입력란이 없어져서 모두 자동
    for (const e of p.events || []) if (e.type === '생신') e.type = '생일';
  }
  // 형제로 붙었다가 부부가 된 예전 데이터(형제이면서 부부) 바로잡기: 시집온 쪽(아내)의 부모 연결을 뗀다
  // shortcut: 사위가 처가 형제로 잘못 붙은 경우는 아내 쪽이 떨어지므로 직접 다시 끌어야 함
  fixMarriedSiblings(d.people);
  relabel(d);
  return d;
}
migrate(data);
save();
const byId = id => data.people.find(p => p.id === id);

// 카카오톡 안의 브라우저: 여기서 저장하면 카톡 안에만 남아 홈 화면 앱에서는 안 보인다
const IN_KAKAO = /KAKAOTALK/i.test(navigator.userAgent);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; // 홈 화면 앱으로 열림
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const openOutside = () => { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); };

// 공유 링크로 열었을 때 (#s= 새 형식, #d= 예전 형식)
if (/^#[sd]=/.test(location.hash)) {
  let here = true;
  if (IN_KAKAO) {
    const c = await choose('브라우저에서 열어 주세요', [
      { value: 'out', label: '브라우저로 열기', sub: '홈 화면 앱과 같은 곳에 저장돼요' },
      { value: 'here', label: '카카오톡 안에서 계속', sub: '카카오톡 안에만 저장돼요' },
    ], '카카오톡 안에서 가져오면 홈 화면 앱에서는 보이지 않아요.');
    if (c === 'out') { openOutside(); here = false; }
  }
  if (here) {
    try {
      const incoming = await decodeShare(location.hash);
      const msg = data.people.length
        ? `가족 ${incoming.people.length}명의 기념일을 받았습니다.\n지금 이 폰에 있는 ${data.people.length}명은 받은 내용으로 바뀝니다. 가져올까요?`
        : `가족 ${incoming.people.length}명의 기념일을 가져올까요?`;
      if (confirm(msg)) { data = migrate(incoming); save(); }
    } catch { alert('공유 링크가 잘렸거나 손상되어 열 수 없어요.\n보낸 분께 링크를 다시 보내 달라고 해 주세요.'); }
    history.replaceState(null, '', location.pathname);
  }
}

const TITLES = {
  upcoming: ['다가오는 날', '양가 생일·기일을 음력까지 챙겨 드려요'],
  tree: ['관계도', '카드를 1초 꾹 눌러 옮기세요. 위는 부모, 가운데는 배우자, 아래는 아들·딸, 왼쪽 끝은 형·누나, 오른쪽 끝은 동생으로 연결돼요'],
  share: ['알림·공유', ''],
};
let tab = 'upcoming';
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tabbar button').forEach(x => x.setAttribute('aria-selected', x === b));
  scrollTo(0, 0);
  centered = false; // 관계도를 다시 열면 가운데로
  render();
});

const GENDER = { M: '남자', F: '여자' };
const avatar = p => `<span class="av ${p.gender || ''}" role="img" aria-label="${GENDER[p.gender] || '성별 미입력'}"><svg><use href="#i-${p.gender || ''}"/></svg></span>`;
const WEEK = '일월화수목금토';
const dayLabel = date => { const [y, m, d] = date.split('-').map(Number); return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`; };

function upcoming() {
  const t = today();
  const rows = data.people.flatMap(p => (p.events || []).map(e => ({ p, e, date: nextDate(e, t) })))
    .filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return `<p class="empty">아직 등록된 기념일이 없어요.<br><b>관계도</b>에서 가족을 추가해 보세요.</p>`;
  const dd = n => n === 0 ? '오늘' : `D-${n}`;
  const [first] = rows, n0 = daysBetween(t, first.date), mem0 = first.e.type === '기일';
  const hero = `<div class="hero" data-id="${first.p.id}" role="button" tabindex="0">
    <div class="k">${h(first.p.name)}님 ${h(first.e.type)}${n0 === 0 ? '이에요' : '까지'}</div>
    <div class="big ${mem0 ? 'memorial' : ''}">${n0 === 0 ? '오늘' : `${n0}일 남았어요`}</div>
    <div class="d">${dayLabel(first.date)} · ${describe(first.e)}</div></div>`;
  return hero + `<h2 class="section">다가오는 기념일</h2>` + rows.map(({ p, e, date }) => {
    const n = daysBetween(t, date), mem = e.type === '기일';
    return `<button class="li" data-id="${p.id}">${avatar(p)}
      <span class="main"><span class="t">${h(p.name)} <span>${h(e.type)}</span></span>
      <span class="s" style="display:block">${dayLabel(date)} · ${describe(e)}${p.rel ? ' · ' + h(p.rel) : ''}</span></span>
      <span class="pill ${mem ? 'memorial' : n === 0 ? 'today' : ''}">${dd(n)}</span></button>`;
  }).join('');
}

function tree() {
  if (!data.people.length) return `<p class="empty">가족을 추가하면 여기에 관계도가 그려져요.<br>오른쪽 위 <b>가족 추가</b>를 눌러 보세요.</p>`;
  const done = new Set();
  const card = p => {
    const ev = (p.events || []).map(e => `${e.type} ${describe(e)}`).join('<br>');
    const cls = [p.events?.some(e => e.type === '기일') && 'gone', p.id === data.meId && 'me', p.placeholder && 'ph'].filter(Boolean).join(' ');
    return `<button class="person ${cls}" data-id="${p.id}">
      ${avatar(p)}<b>${h(p.name)}</b><span class="rel">${p.placeholder ? '눌러서 정보 입력' : h(p.rel)}</span>${ev ? `<span class="ev">${ev}</span>` : ''}</button>`;
  };
  const node = p => {
    done.add(p.id);
    const s = byId(p.spouseId);
    if (s) done.add(s.id);
    const ids = [p.id, s?.id];
    const kids = data.people.filter(c => c.parentId && ids.includes(c.parentId) && !done.has(c.id));
    const [left, right] = s && genderOf(data.people, s) === 'M' && genderOf(data.people, p) !== 'M' ? [s, p] : [p, s]; // 부부는 남편이 왼쪽
    return `<li><span class="couple">${card(left)}${right ? `<span class="heart" aria-hidden="true"></span>${card(right)}` : ''}</span>
      ${kids.length ? `<ul>${kids.map(k => done.has(k.id) ? '' : node(k)).join('')}</ul>` : ''}</li>`;
  };
  // 아무와도 안 이어진 사람(막 추가한 사람)은 위쪽 대기칸에 모아 끌어 붙이기 쉽게
  const loose = data.people.filter(p => !byId(p.parentId) && !byId(p.spouseId) && !data.people.some(c => c.parentId === p.id));
  loose.forEach(p => done.add(p.id));
  const tray = loose.length ? `<div class="tray"><div class="cap">아직 연결 안 된 가족 · 끌어서 가족 카드에 놓아 주세요</div>${loose.map(card).join('')}</div>` : '';
  // 부모가 등록 안 된 사람부터. 배우자 쪽에 부모가 있으면 그쪽 가지에서 함께 그린다.
  const roots = data.people.filter(p => !done.has(p.id) && !byId(p.parentId) && !byId(byId(p.spouseId)?.parentId));
  // '나'의 부모 라인을 가장 먼저 그려서 나(와 배우자)가 내 부모 아래에 이어지게 한다.
  // 배우자 쪽 부모는 그다음 가지에 "○○의 부모님"으로 붙는다. '나'를 바꾸면 기준도 바뀐다.
  const myTop = (() => {
    let x = byId(data.meId);
    for (const seen = new Set(); x && !seen.has(x.id);) {
      seen.add(x.id);
      const up = byId(x.parentId) || byId(byId(x.spouseId)?.parentId);
      if (!up) break;
      x = up;
    }
    return x;
  })();
  if (myTop) roots.sort((a, b) => [b.id, b.spouseId].includes(myTop.id) - [a.id, a.spouseId].includes(myTop.id));
  // 양가처럼 자녀가 이미 다른 가지에 그려진 경우엔 "○○의 부모님"으로 이어 준다.
  let html = roots.map(p => {
    if (done.has(p.id)) return '';
    const linked = data.people.filter(c => c.parentId && [p.id, p.spouseId].includes(c.parentId) && done.has(c.id));
    const cap = linked.length ? `<div class="cap">${linked.map(c => h(c.name) + (c.rel ? `(${h(c.rel)})` : '')).join(', ')}의 부모님</div>` : '';
    return `<div class="branch">${cap}<ul>${node(p)}</ul></div>`;
  }).join('');
  const rest = data.people.filter(p => !done.has(p.id)); // 순환 등으로 빠진 사람도 보이게
  if (rest.length) html += `<div class="branch"><ul>${rest.map(p => `<li>${card(p)}</li>`).join('')}</ul></div>`;
  return `<div class="canvas-wrap"><div class="canvas"><div class="fam">${tray}<div class="tree">${html}</div></div></div>
    <div class="zoom"><button type="button" data-zoom="-" aria-label="축소">−</button><span data-zoom="1" role="button" tabindex="0" aria-label="100%로">${Math.round(zoom * 100)}%</span><button type="button" data-zoom="+" aria-label="확대">+</button></div></div>`;
}

function share() {
  const row = (id, icon, title, desc) => `<button class="menu" id="${id}"><span class="ic"><svg class="i"><use href="#i-${icon}"/></svg></span>
    <span class="main"><b>${title}</b><small>${desc}</small></span><svg class="chev"><use href="#i-chev"/></svg></button>`;
  return (STANDALONE ? '' : row('install', 'home', '홈 화면에 앱 설치', IOS ? '아이폰 설치 방법을 단계별로 알려 드려요' : '앱처럼 아이콘으로 바로 열어요'))
    + row('ics', 'bell', '폰 달력에 알림 넣기', '20년치 생일·기일을 달력 파일로 받아요')
    + row('link', 'share', '가족에게 공유하기', '카톡으로 링크를 보내면 같은 관계도를 받아요')
    + `<div class="note"><h3>알아 두세요</h3><ul>
      <li>음력 날짜도 해마다 맞는 양력 날짜로 달력에 들어가요.</li>
      <li>아이폰은 7일 전, 전날 오전 9시에 알림이 와요. 구글 캘린더는 가져올 때 알림이 빠지니 캘린더 기본 알림을 켜 두세요.</li>
      <li>공유 링크는 보낸 시점의 내용이에요. 나중에 고친 내용은 다시 보내 주세요.</li></ul></div>`;
}

// ── 관계도 보기: 바탕을 끌어 이동, 마우스 휠·두 손가락 핀치·버튼으로 확대 축소 ──
let zoom = 1, panX = 0, panY = 0, centered = false;
const ZMIN = 0.4, ZMAX = 2;
function applyView() {
  const fam = $('.fam');
  if (!fam) return;
  fam.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  const label = $('.zoom span'); if (label) label.textContent = Math.round(zoom * 100) + '%';
}
// 처음 열 때·100%를 누를 때: 다 들어오면 가로 가운데, 넘치면 '나' 카드가 가운데 오게
function centerView(focusMe = true) {
  const c = $('.canvas'), fam = $('.fam');
  if (!c || !fam) return;
  panX = Math.max(16, (c.clientWidth - fam.offsetWidth * zoom) / 2);
  panY = 16;
  const me = focusMe && $(`.fam .person[data-id="${data.meId}"]`);
  if (me) {
    const f = fam.getBoundingClientRect(), m = me.getBoundingClientRect();
    const mx = (m.left - f.left) / zoom + me.offsetWidth / 2, my = (m.top - f.top) / zoom + me.offsetHeight / 2;
    if (fam.offsetWidth * zoom > c.clientWidth - 32) panX = c.clientWidth / 2 - mx * zoom;
    if (my * zoom + 16 > c.clientHeight * 0.6) panY = c.clientHeight * 0.5 - my * zoom;
  }
  applyView();
}
const resetView = () => { zoom = 1; centerView(); };
function setZoom(z, px, py) {
  const c = $('.canvas');
  if (!c) return;
  z = Math.min(ZMAX, Math.max(ZMIN, z));
  px ??= c.clientWidth / 2; py ??= c.clientHeight / 2; // 기준점(캔버스 안 좌표) 아래 내용이 그대로 있게
  panX = px - (px - panX) * z / zoom; panY = py - (py - panY) * z / zoom;
  zoom = z;
  applyView();
}

let pan = null;
$('#view').addEventListener('pointerdown', e => {
  const c = e.target.closest('.canvas');
  if (!c || e.target.closest('.person') || e.button !== 0 || pinch) return;
  pan = { id: e.pointerId, x: e.clientX - panX, y: e.clientY - panY };
  try { c.setPointerCapture(e.pointerId); } catch {} // 캡처가 안 돼도 이동은 window 이벤트로 이어진다
  c.classList.add('panning');
});
addEventListener('pointermove', e => {
  if (pan?.id !== e.pointerId) return;
  panX = e.clientX - pan.x; panY = e.clientY - pan.y; pan.moved = true;
  applyView();
});
// 바탕을 끌었다 놓은 건 '누름'이 아니다: 손을 뗀 곳이 카드여도 수정 창을 열지 않는다
const endPan = () => { if (pan?.moved) { suppressClick = true; setTimeout(() => suppressClick = false); } pan = null; $('.canvas')?.classList.remove('panning'); };
addEventListener('pointerup', endPan);
addEventListener('pointercancel', endPan);

$('#view').addEventListener('wheel', e => {
  const c = e.target.closest('.canvas');
  if (!c) return;
  e.preventDefault();
  const r = c.getBoundingClientRect();
  setZoom(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

let pinch = null;
const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
$('#view').addEventListener('touchstart', e => {
  if (e.touches.length !== 2 || !e.target.closest('.canvas')) return;
  endDrag(true); endPan(); // 한 손가락으로 끌던 중이면 취소
  pinch = { d: dist(e.touches), z: zoom };
}, { passive: true });
$('#view').addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const r = $('.canvas').getBoundingClientRect();
  const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
  setZoom(pinch.z * dist(e.touches) / pinch.d, mx, my);
}, { passive: false });
$('#view').addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });

function render() {
  const [title, sub] = TITLES[tab];
  document.body.dataset.tab = tab;
  $('#title').textContent = title;
  $('#subtitle').textContent = sub;
  $('#add').hidden = tab !== 'tree'; // 가족 추가는 관계도에서만
  // 관계도는 카드가 새 자리로 미끄러져 붙고 떨어지게(FLIP 애니메이션), 보던 위치·배율은 유지
  const old = new Map([...document.querySelectorAll('.fam .person')].map(el => [el.dataset.id, el.getBoundingClientRect()]));
  $('#view').innerHTML = tab === 'upcoming' ? upcoming() : tab === 'tree' ? tree() : share();
  if (tab === 'tree' && $('.fam')) {
    fitCanvas();
    if (centered) applyView(); else { centerView(); centered = true; }
    if (old.size && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.fam .person').forEach(el => {
        const a = old.get(el.dataset.id), b = el.getBoundingClientRect();
        if (a) el.animate([{ transform: `translate(${(a.left - b.left) / zoom}px, ${(a.top - b.top) / zoom}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
  }
  if (tab === 'share') {
    $('#install')?.addEventListener('click', installNow);
    $('#ics').onclick = () => {
      if (!data.people.length) return alert('먼저 관계도에서 가족을 추가해 주세요.');
      const url = URL.createObjectURL(new Blob([buildIcs(data.people, today())], { type: 'text/calendar' }));
      Object.assign(document.createElement('a'), { href: url, download: '우리집기념일.ics' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#link').onclick = async () => {
      if (!data.people.length) return alert('먼저 관계도에서 가족을 추가해 주세요.');
      const url = `${location.origin}${location.pathname}#${await encodeShare(data)}`;
      if (navigator.share) { try { await navigator.share({ title: '우리집 기념일', text: '우리 가족 생일·기일 달력이에요', url }); } catch {} }
      else { await navigator.clipboard.writeText(url); alert('링크를 복사했어요. 카톡에 붙여넣어 보내 주세요.'); }
    };
  }
}

// 관계도는 탭바 위까지 화면을 꽉 채운다 (제목 줄 높이가 기기마다 달라서 실제로 잰다)
function fitCanvas() {
  const c = $('.canvas');
  if (c) c.style.height = Math.max(240, innerHeight - c.getBoundingClientRect().top - $('.tabbar').offsetHeight) + 'px';
}
addEventListener('resize', fitCanvas);

$('#view').addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (z) return z.dataset.zoom === '1' ? resetView() : setZoom(z.dataset.zoom === '+' ? zoom * 1.25 : zoom / 1.25);
  const el = e.target.closest('[data-id]');
  if (el && !suppressClick) openForm(el.dataset.id);
});

// ── 관계도 드래그앤드롭 ──
// 다른 카드의 위(부모)·가운데(배우자)·아래(자녀)·왼쪽 끝(손위 형제)·오른쪽 끝(손아래 형제)에 놓으면 연결, 빈 곳에 놓으면 끊김
// 끄는 사람의 성별로 부른다: 아들로·딸로, 아버지로·어머니로, 남편으로·아내로, 형으로·누나로·남동생으로…
const ROLE = {
  parent: { M: '아버지', F: '어머니', '': '부모' },
  spouse: { M: '남편', F: '아내', '': '배우자' },
  child: { M: '아들', F: '딸', '': '자녀' },
};
// 받침 있으면 '으로'(ㄹ 받침은 '로')
const ro = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00, j = c >= 0 && c < 11172 ? c % 28 : 0; return w + (j && j !== 8 ? '으로' : '로'); };
const roleTerm = (kind, d, t) => kind === 'before' || kind === 'after'
  ? siblingTerm(d.gender, genderOf(data.people, t), kind === 'before')
  : ROLE[kind][d.gender || ''];
let drag = null, suppressClick = false;

// 카드는 1초 꾹 눌러야 들려서 끌 수 있다. 그 전에 움직이면 카드가 아니라 관계도 바탕을 옮긴다.
// (짧게 끌다가 카드가 따라와 빈 곳에 놓여 연결이 끊기던 문제)
const HOLD = 1000;
$('#view').addEventListener('pointerdown', e => {
  const card = e.target.closest('.fam .person');
  if (!card || e.button !== 0 || pinch) return;
  drag = { id: card.dataset.id, card, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, pid: e.pointerId };
  card.classList.add('pressing');
  drag.timer = setTimeout(liftCard, HOLD);
});
$('#view').addEventListener('contextmenu', e => { if (e.target.closest('.fam .person')) e.preventDefault(); }); // 길게 누를 때 뜨는 메뉴 막기
// 관계도에서는 브라우저 기본 끌기·글자 선택을 끈다 (가끔 관계도 전체가 반투명하게 따라오던 문제)
$('#view').addEventListener('dragstart', e => { if (e.target.closest?.('.canvas')) e.preventDefault(); });
$('#view').addEventListener('selectstart', e => { if (e.target.closest?.('.canvas')) e.preventDefault(); });
$('#view').addEventListener('pointerdown', e => { if (e.target.closest('.canvas')) getSelection()?.removeAllRanges(); }, true); // 이미 선택된 글자가 있으면 풀어 둔다

function liftCard() {
  if (!drag || drag.ghost) return;
  drag.card.classList.remove('pressing');
  drag.ghost = Object.assign(drag.card.cloneNode(true), { className: drag.card.className + ' ghost' });
  document.body.append(drag.ghost);
  drag.card.classList.add('dragging');
  navigator.vibrate?.(25);
  requestAnimationFrame(autoScroll);
  updateDrag();
}

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.fam .person');
  if (!el || el === drag.card) return null;
  const r = el.getBoundingClientRect(), ry = (y - r.top) / r.height, rx = (x - r.left) / r.width;
  const kind = byId(el.dataset.id)?.placeholder ? 'fill' // 빈 '부모님' 카드는 어디에 놓든 그 자리 채우기
    : rx < 0.22 ? 'before' : rx > 0.78 ? 'after' : ry < 0.3 ? 'parent' : ry > 0.7 ? 'child' : 'spouse';
  return { el, id: el.dataset.id, kind };
}

addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  drag.px = e.clientX; drag.py = e.clientY;
  if (drag.ghost) return updateDrag();
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; // 손 떨림 정도는 무시
  // 1초 전에 움직임 → 카드 대신 바탕 이동으로 넘긴다
  clearTimeout(drag.timer);
  drag.card.classList.remove('pressing');
  pan = { id: drag.pid, x: drag.x - panX, y: drag.y - panY };
  $('.canvas')?.classList.add('panning');
  drag = null;
  panX = e.clientX - pan.x; panY = e.clientY - pan.y; pan.moved = true; applyView();
});

// 끄는 카드는 작게 손가락 오른쪽 아래에, 안내는 손가락 위에 띄워 놓을 자리를 가리지 않게
function updateDrag() {
  drag.ghost.style.transform = `translate(${drag.px + 14}px, ${drag.py + 18}px) scale(.62)`;
  const next = dropTarget(drag.px, drag.py), hint = $('#dragHint');
  const self = document.elementFromPoint(drag.px, drag.py)?.closest('.fam .person') === drag.card;
  document.body.classList.add('drag-on');
  // 놓을 곳이 바뀔 때만 표시를 다시 그린다 (매번 그리면 깜빡임 애니메이션이 처음부터 다시 시작됨)
  if (!('t' in drag) || next?.el !== drag.t?.el || next?.kind !== drag.t?.kind || self !== drag.self) {
    drag.self = self;
    drag.t?.el.removeAttribute('data-zone');
    if (next) { next.el.dataset.zone = next.kind; navigator.vibrate?.(12); } // 안드로이드는 살짝 진동
    drag.t = next;
    const ARROW = { parent: '↑', child: '↓', before: '←', after: '→', spouse: '♥', fill: '↻' };
    const me = byId(drag.id), t = next && byId(next.id);
    const text = self ? '다른 카드로 옮겨 주세요' : !next ? (me.parentId || me.spouseId ? '여기 놓으면 연결 끊기' : '가족 카드 위에 놓아 주세요')
      : next.kind === 'fill' ? '부모님 자리에 넣기'
      : askSide(next.kind, me, t) ? `${roleTerm(next.kind, me, t)} 또는 ${ro(ROLE.spouse[me.gender || ''])} 연결`
      : `${t.name}님의 ${ro(roleTerm(next.kind, me, t))} 연결`;
    hint.innerHTML = `${next ? `<i>${ARROW[next.kind]}</i>` : ''}<span>${h(text)}</span>`;
    hint.className = next ? 'on' : !self && (me.parentId || me.spouseId) ? 'cut' : '';
  }
  hint.style.transform = `translate(${drag.px}px, ${drag.py - 52}px) translateX(-50%)`;
  hint.hidden = false;
}

// 끌면서 관계도 가장자리에 가면 그쪽으로 이동
function autoScroll() {
  if (!drag?.ghost) return;
  const c = $('.canvas');
  if (c) {
    const E = 48, r = c.getBoundingClientRect(), step = (pos, lo, hi) => pos < lo + E ? -12 : pos > hi - E ? 12 : 0;
    const vx = step(drag.px, r.left, r.right), vy = step(drag.py, r.top, r.bottom);
    if (vx || vy) { panX -= vx; panY -= vy; applyView(); updateDrag(); }
  }
  requestAnimationFrame(autoScroll);
}

function endDrag(cancelled) {
  if (!drag) return;
  const d = drag; drag = null;
  clearTimeout(d.timer); d.card.classList.remove('pressing');
  if (!d.ghost) return; // 들리기 전에 뗐으면 그냥 누른 것(수정 창 열기)
  d.ghost.remove(); d.card.classList.remove('dragging'); d.t?.el.removeAttribute('data-zone');
  $('#dragHint').hidden = true; document.body.classList.remove('drag-on');
  suppressClick = true; setTimeout(() => suppressClick = false);
  if (cancelled || d.self) return; // 들었던 카드 위에 다시 놓으면 아무것도 안 바뀜
  const before = JSON.stringify(data), me = byId(d.id), t = d.t && byId(d.t.id);
  if (d.t) finishLink(d.t.kind, me, t, before);
  else if (me.parentId || me.spouseId) {
    detach(data.people, d.id);
    commit(`${me.name}님의 연결을 끊었어요`, before);
  }
}

// 카드 옆(양끝)에 놓으면 형제인지 배우자인지 헷갈리므로 물어본다. 이미 형제면 순서만 바꾼다.
const askSide = (kind, d, t) => (kind === 'before' || kind === 'after') && !isSibling(data.people, d.id, t.id);

async function finishLink(kind, me, t, before) {
  if (kind === 'fill') { // 빈 '부모님' 카드를 이 사람으로 채운다
    const err = fillPlaceholder(data.people, me.id, t.id);
    if (err) return alert(err);
    return commit(`${me.name}님을 부모님 자리에 넣었어요`, before);
  }
  if (askSide(kind, me, t)) {
    const choice = await choose(`${me.name}님을 어떻게 연결할까요?`, [
      { value: kind, label: `${t.name}님의 ${roleTerm(kind, me, t)}`, sub: '형제·자매로 연결' },
      { value: 'spouse', label: `${t.name}님의 ${ROLE.spouse[me.gender || '']}`, sub: '부부로 연결' },
    ]);
    if (!choice) return;
    kind = choice;
  }
  const sib = kind === 'before' || kind === 'after';
  const err = sib ? linkSibling(data.people, me.id, t.id, kind === 'after') : link(data.people, me.id, t.id, kind);
  if (err) return alert(err);
  commit(`${me.name}님을 ${t.name}님의 ${ro(roleTerm(kind, me, t))} 연결했어요`, before);
}

// 아래에서 올라오는 선택창. 고른 value를 돌려주고, 취소하면 ''
function choose(title, options, desc = '', cancel = '취소') {
  const d = $('#pick');
  $('#pickTitle').textContent = title;
  $('#pickDesc').textContent = desc;
  $('#pickDesc').hidden = !desc;
  $('#pickCancel').textContent = cancel;
  $('#pickOpts').innerHTML = options.map(o => `<button class="opt" value="${o.value}"><b>${h(o.label)}</b><small>${h(o.sub)}</small></button>`).join('');
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue), { once: true }));
}
addEventListener('pointerup', () => endDrag(false));
addEventListener('pointercancel', () => endDrag(true));

// 바뀐 관계 저장 + 되돌리기 안내
let toastTimer;
function commit(msg, before) {
  prunePlaceholders(data.people); relabel(data); save(); render();
  const t = $('#toast');
  t.innerHTML = `<span>${h(msg)}</span><button type="button">되돌리기</button>`;
  t.hidden = false;
  t.querySelector('button').onclick = () => { data = JSON.parse(before); save(); render(); t.hidden = true; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 5000);
}
$('#view').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.dataset.zoom) resetView();
  else if (e.target.dataset.id) openForm(e.target.dataset.id);
});

// 등록·수정 폼
const dlg = $('#dlg'), form = $('#form');
let editing = null;
$('#add').onclick = () => openForm(null);
$('#cancel').onclick = () => dlg.close();

function openForm(id) {
  editing = id;
  const p = byId(id) || { events: [] };
  $('#formTitle').textContent = id ? '가족 정보 수정' : '가족 추가';
  $('#del').hidden = !id;
  form.name.value = p.name || '';
  form.querySelectorAll('[name=gender]').forEach(r => r.checked = r.value === p.gender);
  form.me.checked = id ? data.meId === id : !data.meId; // 첫 사람은 기본으로 '나'
  form.querySelectorAll('fieldset').forEach(fs => {
    const e = p.events.find(x => x.type === fs.dataset.ev) || {};
    fs.querySelectorAll('[data-cal]').forEach(r => r.checked = r.value === (e.cal || 'solar'));
    fs.querySelector('[name=m]').value = e.m || '';
    fs.querySelector('[name=d]').value = e.d || '';
    fs.querySelector('[name=leap]').checked = !!e.leap;
    const eve = fs.querySelector('[name=eve]'); if (eve) eve.checked = !!e.eve;
  });
  dlg.showModal();
  if (!id) form.name.focus();
}

form.onsubmit = e => {
  const events = [];
  for (const fs of form.querySelectorAll('fieldset')) {
    const cal = fs.querySelector('[data-cal]:checked').value;
    const mv = fs.querySelector('[name=m]').value, dv = fs.querySelector('[name=d]').value;
    if (!mv && !dv) continue; // 월·일을 비워 두면 그 기념일은 없음
    const m = +mv, d = +dv;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= (cal === 'lunar' ? 30 : 31))) {
      e.preventDefault();
      return alert(`${fs.dataset.ev} 날짜를 확인해 주세요. (음력은 30일까지)`);
    }
    events.push({ type: fs.dataset.ev, cal, m, d, leap: cal === 'lunar' && fs.querySelector('[name=leap]').checked, eve: !!fs.querySelector('[name=eve]')?.checked });
  }
  // 관계(부모·배우자)는 관계도에서 드래그로만 정하고, 호칭은 relabel이 자동으로 채운다
  const before = JSON.stringify(data);
  const p = byId(editing) || { id: crypto.randomUUID(), parentId: null, spouseId: null, rel: '' };
  Object.assign(p, { name: form.name.value.trim(), gender: form.gender.value, events });
  delete p.placeholder; // 빈 '부모님' 카드도 정보를 넣으면 보통 카드
  const oldMe = data.meId;
  if (form.me.checked) data.meId = p.id;
  else if (data.meId === p.id) data.meId = null;
  if (data.meId !== oldMe) centered = false; // '나'가 바뀌면 관계도를 새 '나' 기준으로 다시 맞춤
  if (editing) return relabel(data), save(), render();
  data.people.push(p);
  commit(`${p.name}님을 추가했어요. 카드를 끌어 가족에게 연결해 주세요`, before);
  centerView(false); // 새 카드는 맨 위 대기칸에 있다
};

$('#del').onclick = () => {
  const p = byId(editing);
  if (!confirm(`${p.name}님을 삭제할까요? 연결된 관계도 함께 끊어져요.`)) return;
  data.people = data.people.filter(x => x.id !== p.id);
  data.people.forEach(x => { if (x.parentId === p.id) x.parentId = null; if (x.spouseId === p.id) x.spouseId = null; });
  if (data.meId === p.id) data.meId = null;
  prunePlaceholders(data.people); relabel(data); save(); dlg.close(); render();
};

render();

// ── 홈 화면 앱 설치 권하기: 앱으로 열지 않았을 때 처음 한 번 묻고, '다음에'를 누르면 7일 동안 다시 묻지 않는다 ──
let installEvt = null; // 안드로이드·PC 크롬이 주는 설치 기회
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; offerInstall(); });
addEventListener('appinstalled', () => { installEvt = null; });

async function offerInstall() {
  let asked = 0;
  try { asked = +localStorage.getItem('install-asked') || 0; } catch {}
  if (STANDALONE || Date.now() - asked < 7 * 864e5 || document.querySelector('dialog[open]')) return;
  const how = IN_KAKAO ? 'kakao' : installEvt ? 'prompt' : IOS ? 'ios' : null;
  if (!how) return; // 설치 기회가 아직 안 왔으면 beforeinstallprompt 때 다시 시도
  try { localStorage.setItem('install-asked', Date.now()); } catch {}
  const T = '앱으로 설치하시겠습니까?';
  if (how === 'kakao') {
    if (await choose(T, [{ value: 'out', label: '브라우저로 열기', sub: '브라우저에서 홈 화면에 설치할 수 있어요' }],
      '카카오톡 안에서는 앱을 설치할 수 없어요.', '다음에') === 'out') openOutside();
  } else if (how === 'prompt') {
    if (await choose(T, [{ value: 'yes', label: '홈 화면에 설치', sub: '다음부터 앱처럼 바로 열려요' }],
      '설치하면 홈 화면 아이콘으로 바로 열고, 인터넷이 없어도 볼 수 있어요.', '다음에') === 'yes') {
      installEvt.prompt();
      installEvt = null;
    }
  } else {
    showIosGuide(); // 아이폰 Safari는 웹에서 설치를 대신 눌러 줄 수 없어서 순서만 안내한다
  }
}
setTimeout(offerInstall, 1500);

function showIosGuide() {
  const d = $('#iosGuide');
  d.showModal();
  return new Promise(res => d.addEventListener('close', res, { once: true }));
}

// 알림·공유 탭의 '홈 화면에 앱 설치' (자동 안내와 달리 언제든 다시 볼 수 있다)
async function installNow() {
  if (IN_KAKAO) { if (await choose('브라우저에서 설치해 주세요', [{ value: 'out', label: '브라우저로 열기', sub: '카카오톡 안에서는 앱을 설치할 수 없어요' }]) === 'out') openOutside(); }
  else if (installEvt) { installEvt.prompt(); installEvt = null; }
  else if (IOS) showIosGuide();
  else alert('브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 눌러 주세요.');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
