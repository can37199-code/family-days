import { nextDate, daysBetween, describe, buildIcs, encodeShare, decodeShare, link, detach, relabel, guessGender, isSibling, moveSibling } from './core.js';

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
  for (const p of d.people) p.gender ??= guessGender(p.rel);
  return d;
}
migrate(data);
const byId = id => data.people.find(p => p.id === id);

// 공유 링크로 열었을 때
if (location.hash.startsWith('#d=')) {
  try {
    const incoming = decodeShare(location.hash.slice(3));
    const msg = data.people.length
      ? `가족 ${incoming.people.length}명의 기념일을 받았습니다.\n지금 이 폰에 있는 ${data.people.length}명은 받은 내용으로 바뀝니다. 가져올까요?`
      : `가족 ${incoming.people.length}명의 기념일을 가져올까요?`;
    if (confirm(msg)) { data = migrate(incoming); save(); }
  } catch { alert('공유 링크가 손상되어 열 수 없습니다.'); }
  history.replaceState(null, '', location.pathname);
}

const TITLES = {
  upcoming: ['다가오는 날', '양가 생신·기일을 음력까지 챙겨 드려요'],
  tree: ['관계도', '카드를 옆에 놓으면 배우자, 아래는 아들·딸, 위는 부모로 연결돼요. 형제끼리는 양 끝에 놓아 순서를 바꿔요'],
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
    return `<button class="person ${p.events?.some(e => e.type === '기일') ? 'gone' : ''}" data-id="${p.id}">
      ${avatar(p)}<b>${h(p.name)}</b><span class="rel">${h(p.rel)}</span>${ev ? `<span class="ev">${ev}</span>` : ''}</button>`;
  };
  const node = p => {
    done.add(p.id);
    const s = byId(p.spouseId);
    if (s) done.add(s.id);
    const ids = [p.id, s?.id];
    const kids = data.people.filter(c => c.parentId && ids.includes(c.parentId) && !done.has(c.id));
    return `<li><span class="couple">${card(p)}${s ? `<span class="heart" aria-hidden="true"></span>${card(s)}` : ''}</span>
      ${kids.length ? `<ul>${kids.map(k => done.has(k.id) ? '' : node(k)).join('')}</ul>` : ''}</li>`;
  };
  // 아무와도 안 이어진 사람(막 추가한 사람)은 위쪽 대기칸에 모아 끌어 붙이기 쉽게
  const loose = data.people.filter(p => !byId(p.parentId) && !byId(p.spouseId) && !data.people.some(c => c.parentId === p.id));
  loose.forEach(p => done.add(p.id));
  const tray = loose.length ? `<div class="tray"><div class="cap">아직 연결 안 된 가족 · 끌어서 가족 카드에 놓아 주세요</div>${loose.map(card).join('')}</div>` : '';
  // 부모가 등록 안 된 사람부터. 배우자 쪽에 부모가 있으면 그쪽 가지에서 함께 그린다.
  const roots = data.people.filter(p => !done.has(p.id) && !byId(p.parentId) && !byId(byId(p.spouseId)?.parentId));
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
  return row('ics', 'bell', '폰 달력에 알림 넣기', '20년치 생신·기일을 달력 파일로 받아요')
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
// 처음 열 때·100%를 누를 때 관계도를 가로 가운데로
function centerView() {
  const c = $('.canvas'), fam = $('.fam');
  if (!c || !fam) return;
  panX = Math.max(16, (c.clientWidth - fam.offsetWidth * zoom) / 2);
  panY = 16;
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
  panX = e.clientX - pan.x; panY = e.clientY - pan.y;
  applyView();
});
const endPan = () => { pan = null; $('.canvas')?.classList.remove('panning'); };
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
    $('#ics').onclick = () => {
      if (!data.people.length) return alert('먼저 관계도에서 가족을 추가해 주세요.');
      const url = URL.createObjectURL(new Blob([buildIcs(data.people, today())], { type: 'text/calendar' }));
      Object.assign(document.createElement('a'), { href: url, download: '우리집기념일.ics' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#link').onclick = async () => {
      if (!data.people.length) return alert('먼저 관계도에서 가족을 추가해 주세요.');
      const url = `${location.origin}${location.pathname}#d=${encodeShare(data)}`;
      if (navigator.share) { try { await navigator.share({ title: '우리집 기념일', text: '우리 가족 생신·기일 달력이에요', url }); } catch {} }
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

// ── 관계도 드래그앤드롭: 다른 카드의 위(부모)·옆(배우자)·아래(자녀)에 놓으면 붙고, 빈 곳에 놓으면 떨어진다 ──
// 형제 카드의 왼쪽·오른쪽 끝에 놓으면 형제 순서를 바꾼다
// 끄는 사람의 성별로 부른다: 아들로·딸로, 아버지로·어머니로, 남편으로·아내로
const ROLE = {
  parent: { M: '아버지로', F: '어머니로', '': '부모로' },
  spouse: { M: '남편으로', F: '아내로', '': '배우자로' },
  child: { M: '아들로', F: '딸로', '': '자녀로' },
};
const dropLabel = (kind, g) => kind === 'before' ? '이 앞으로 옮기기' : kind === 'after' ? '이 뒤로 옮기기' : ROLE[kind][g || ''] + ' 연결';
let drag = null, suppressClick = false;

$('#view').addEventListener('pointerdown', e => {
  const card = e.target.closest('.fam .person');
  if (card && e.button === 0 && !pinch) drag = { id: card.dataset.id, card, x: e.clientX, y: e.clientY };
});

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.fam .person');
  if (!el || el === drag.card) return null;
  const r = el.getBoundingClientRect(), ry = (y - r.top) / r.height, rx = (x - r.left) / r.width;
  if (isSibling(data.people, drag.id, el.dataset.id) && (rx < 0.3 || rx > 0.7)) return { el, id: el.dataset.id, kind: rx < 0.3 ? 'before' : 'after' };
  return { el, id: el.dataset.id, kind: ry < 0.3 ? 'parent' : ry > 0.7 ? 'child' : 'spouse' };
}

addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; // 살짝 누른 건 탭
    const r = drag.card.getBoundingClientRect();
    drag.dx = (drag.x - r.left) / zoom; drag.dy = (drag.y - r.top) / zoom; // 끌리는 카드는 100% 크기
    drag.ghost = Object.assign(drag.card.cloneNode(true), { className: drag.card.className + ' ghost' });
    document.body.append(drag.ghost);
    drag.card.classList.add('dragging');
    requestAnimationFrame(autoScroll);
  }
  drag.px = e.clientX; drag.py = e.clientY;
  updateDrag();
});

function updateDrag() {
  drag.ghost.style.transform = `translate(${drag.px - drag.dx}px, ${drag.py - drag.dy}px)`;
  drag.t?.el.removeAttribute('data-drop');
  drag.t = dropTarget(drag.px, drag.py);
  if (drag.t) { drag.t.el.dataset.drop = dropLabel(drag.t.kind, byId(drag.id).gender); drag.t.el.dataset.zone = drag.t.kind; }
}

// 끌면서 관계도 가장자리에 가면 그쪽으로 스크롤
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
  if (!d.ghost) return;
  d.ghost.remove(); d.card.classList.remove('dragging'); d.t?.el.removeAttribute('data-drop');
  suppressClick = true; setTimeout(() => suppressClick = false);
  if (cancelled) return;
  const before = JSON.stringify(data), me = byId(d.id);
  if (d.t?.kind === 'before' || d.t?.kind === 'after') {
    moveSibling(data.people, d.id, d.t.id, d.t.kind === 'after');
    commit(`${me.name}님의 순서를 ${byId(d.t.id).name}님 ${d.t.kind === 'after' ? '뒤로' : '앞으로'} 옮겼어요`, before);
  } else if (d.t) {
    const err = link(data.people, d.id, d.t.id, d.t.kind);
    if (err) return alert(err);
    commit(`${me.name}님을 ${byId(d.t.id).name}님의 ${ROLE[d.t.kind][me.gender || '']} 연결했어요`, before);
  } else if (me.parentId || me.spouseId) {
    detach(data.people, d.id);
    commit(`${me.name}님의 연결을 끊었어요`, before);
  }
}
addEventListener('pointerup', () => endDrag(false));
addEventListener('pointercancel', () => endDrag(true));

// 바뀐 관계 저장 + 되돌리기 안내
let toastTimer;
function commit(msg, before) {
  relabel(data); save(); render();
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
  form.rel.value = p.rel || '';
  form.rel.dataset.orig = form.rel.value;
  form.me.checked = id ? data.meId === id : !data.meId; // 첫 사람은 기본으로 '나'
  form.querySelectorAll('fieldset').forEach(fs => {
    const e = p.events.find(x => x.type === fs.dataset.ev) || {};
    fs.querySelector('[name=cal]').value = e.cal || '';
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
    const cal = fs.querySelector('[name=cal]').value;
    if (!cal) continue;
    const m = +fs.querySelector('[name=m]').value, d = +fs.querySelector('[name=d]').value;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= (cal === 'lunar' ? 30 : 31))) {
      e.preventDefault();
      return alert(`${fs.dataset.ev} 날짜를 확인해 주세요. (음력은 30일까지)`);
    }
    events.push({ type: fs.dataset.ev, cal, m, d, leap: cal === 'lunar' && fs.querySelector('[name=leap]').checked, eve: !!fs.querySelector('[name=eve]')?.checked });
  }
  // 관계(부모·배우자)는 관계도에서 드래그로만 정한다
  const before = JSON.stringify(data);
  const p = byId(editing) || { id: crypto.randomUUID(), parentId: null, spouseId: null };
  const rel = form.rel.value.trim();
  // 호칭을 직접 고쳐 쓰면 고정, 비우면 다시 자동
  if (rel !== form.rel.dataset.orig) p.relAuto = !rel;
  Object.assign(p, { name: form.name.value.trim(), rel, gender: form.gender.value, events });
  if (form.me.checked) data.meId = p.id;
  else if (data.meId === p.id) data.meId = null;
  if (editing) return relabel(data), save(), render();
  data.people.push(p);
  commit(`${p.name}님을 추가했어요. 카드를 끌어 가족에게 연결해 주세요`, before);
  centerView(); // 새 카드는 맨 위 대기칸에 있다
};

$('#del').onclick = () => {
  const p = byId(editing);
  if (!confirm(`${p.name}님을 삭제할까요? 연결된 관계도 함께 끊어져요.`)) return;
  data.people = data.people.filter(x => x.id !== p.id);
  data.people.forEach(x => { if (x.parentId === p.id) x.parentId = null; if (x.spouseId === p.id) x.spouseId = null; });
  if (data.meId === p.id) data.meId = null;
  relabel(data); save(); dlg.close(); render();
};

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
