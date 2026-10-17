import { nextDate, daysBetween, describe, buildIcs, encodeShare, decodeShare } from './core.js';

const KEY = 'family-days';
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

let data;
try { data = JSON.parse(localStorage.getItem(KEY)) || { people: [] }; } catch { data = { people: [] }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(data));
const byId = id => data.people.find(p => p.id === id);

// 공유 링크로 열었을 때
if (location.hash.startsWith('#d=')) {
  try {
    const incoming = decodeShare(location.hash.slice(3));
    const msg = data.people.length
      ? `가족 ${incoming.people.length}명의 기념일을 받았습니다.\n지금 이 폰에 있는 ${data.people.length}명은 받은 내용으로 바뀝니다. 가져올까요?`
      : `가족 ${incoming.people.length}명의 기념일을 가져올까요?`;
    if (confirm(msg)) { data = incoming; save(); }
  } catch { alert('공유 링크가 손상되어 열 수 없습니다.'); }
  history.replaceState(null, '', location.pathname);
}

let tab = 'upcoming';
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('nav button').forEach(x => x.setAttribute('aria-selected', x === b));
  render();
});

function upcoming() {
  const t = today();
  const rows = data.people.flatMap(p => (p.events || []).map(e => ({ p, e, date: nextDate(e, t) })))
    .filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return `<p class="empty">아직 등록된 기념일이 없습니다.<br>아래 <b>＋ 가족 추가</b>로 시작하세요.</p>`;
  return rows.map(({ p, e, date }) => {
    const n = daysBetween(t, date);
    const [, mm, dd] = date.split('-');
    return `<div class="item ${e.type === '기일' ? 'memorial' : ''}" data-id="${p.id}" role="button" tabindex="0">
      <div class="dday">${n === 0 ? '오늘' : 'D-' + n}</div>
      <div class="what"><b>${h(p.name)}</b> ${h(e.type)} <span class="sub">${h(p.rel)}</span>
      <div class="sub">${+mm}월 ${+dd}일 · ${describe(e)}</div></div></div>`;
  }).join('');
}

function tree() {
  if (!data.people.length) return `<p class="empty">가족을 추가하면 여기에 가계도가 그려집니다.</p>`;
  const done = new Set();
  const card = p => {
    const ev = (p.events || []).map(e => `${e.type} ${describe(e)}`).join('<br>');
    return `<button class="person ${p.events?.some(e => e.type === '기일') ? 'gone' : ''}" data-id="${p.id}">
      <b>${h(p.name)}</b><small>${h(p.rel)}</small>${ev ? `<br><small>${ev}</small>` : ''}</button>`;
  };
  const node = p => {
    done.add(p.id);
    const s = byId(p.spouseId);
    if (s) done.add(s.id);
    const ids = [p.id, s?.id];
    const kids = data.people.filter(c => c.parentId && ids.includes(c.parentId) && !done.has(c.id));
    return `<li><span class="couple">${card(p)}${s ? `<span class="heart" aria-label="배우자">♥</span>${card(s)}` : ''}</span>
      ${kids.length ? `<ul>${kids.map(k => done.has(k.id) ? '' : node(k)).join('')}</ul>` : ''}</li>`;
  };
  // 부모가 등록 안 된 사람부터. 배우자 쪽에 부모가 있으면 그쪽 가지에서 함께 그린다.
  const roots = data.people.filter(p => !byId(p.parentId) && !byId(byId(p.spouseId)?.parentId));
  // 양가처럼 자녀가 이미 다른 가지에 그려진 경우엔 "○○의 부모님"으로 이어 준다.
  let html = roots.map(p => {
    if (done.has(p.id)) return '';
    const linked = data.people.filter(c => c.parentId && [p.id, p.spouseId].includes(c.parentId) && done.has(c.id));
    const cap = linked.length ? `<div class="sub">↳ ${linked.map(c => h(c.name) + (c.rel ? `(${h(c.rel)})` : '')).join(', ')}의 부모님</div>` : '';
    return `<div class="branch">${cap}<ul>${node(p)}</ul></div>`;
  }).join('');
  const rest = data.people.filter(p => !done.has(p.id)); // 순환 등으로 빠진 사람도 보이게
  if (rest.length) html += `<div class="branch"><ul>${rest.map(p => `<li>${card(p)}</li>`).join('')}</ul></div>`;
  return `<div class="tree">${html}</div><p class="sub">카드를 누르면 수정할 수 있습니다. 점선 카드는 기일이 있는 분입니다.</p>`;
}

function share() {
  return `<div class="panel"><h2>📅 폰 달력에 알림 넣기</h2>
    <p class="sub">앞으로 20년치 생신·기일을 양력 날짜로 바꿔 달력 파일로 받습니다. 음력도 해마다 맞는 날짜로 들어갑니다.
    아이폰은 <b>7일 전·전날 오전 9시</b> 알림이 함께 들어갑니다. 구글 캘린더는 가져올 때 알림이 빠지므로 캘린더의 기본 알림을 켜 두세요.</p>
    <button class="btn" id="ics">달력 파일 받기 (.ics)</button></div>
    <div class="panel"><h2>👨‍👩‍👧 가족과 공유</h2>
    <p class="sub">공유 링크를 카톡으로 보내면 받은 사람이 같은 가족도·기념일을 그대로 가져갑니다.
    링크를 보낸 시점의 내용이라, 나중에 고친 내용은 다시 보내야 합니다.</p>
    <button class="btn" id="link">공유 링크 보내기</button></div>`;
}

function render() {
  $('#view').innerHTML = tab === 'upcoming' ? upcoming() : tab === 'tree' ? tree() : share();
  $('#add').hidden = tab === 'share';
  if (tab === 'share') {
    $('#ics').onclick = () => {
      if (!data.people.length) return alert('먼저 가족을 추가해 주세요.');
      const url = URL.createObjectURL(new Blob([buildIcs(data.people, today())], { type: 'text/calendar' }));
      Object.assign(document.createElement('a'), { href: url, download: '우리집기념일.ics' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#link').onclick = async () => {
      if (!data.people.length) return alert('먼저 가족을 추가해 주세요.');
      const url = `${location.origin}${location.pathname}#d=${encodeShare(data)}`;
      if (navigator.share) { try { await navigator.share({ title: '우리집 기념일', text: '우리 가족 생신·기일 달력이에요', url }); } catch {} }
      else { await navigator.clipboard.writeText(url); alert('링크를 복사했습니다. 카톡에 붙여넣어 보내세요.'); }
    };
  }
}

$('#view').addEventListener('click', e => { const el = e.target.closest('[data-id]'); if (el) openForm(el.dataset.id); });
$('#view').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.id) openForm(e.target.dataset.id); });

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
  const opts = sel => `<option value="">없음</option>` + data.people.filter(x => x.id !== id)
    .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${h(x.name)} ${x.rel ? '(' + h(x.rel) + ')' : ''}</option>`).join('');
  form.name.value = p.name || '';
  form.rel.value = p.rel || '';
  form.parentId.innerHTML = opts(p.parentId);
  form.spouseId.innerHTML = opts(p.spouseId);
  form.querySelectorAll('fieldset').forEach(fs => {
    const e = p.events.find(x => x.type === fs.dataset.ev) || {};
    fs.querySelector('[name=cal]').value = e.cal || '';
    fs.querySelector('[name=m]').value = e.m || '';
    fs.querySelector('[name=d]').value = e.d || '';
    fs.querySelector('[name=leap]').checked = !!e.leap;
    const eve = fs.querySelector('[name=eve]'); if (eve) eve.checked = !!e.eve;
  });
  dlg.showModal();
  form.name.focus();
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
  const p = byId(editing) || { id: crypto.randomUUID() };
  const oldSpouse = p.spouseId;
  Object.assign(p, { name: form.name.value.trim(), rel: form.rel.value.trim(), parentId: form.parentId.value || null, spouseId: form.spouseId.value || null, events });
  if (!editing) data.people.push(p);
  // 배우자는 양쪽에 같이 기록
  if (oldSpouse && oldSpouse !== p.spouseId && byId(oldSpouse)) byId(oldSpouse).spouseId = null;
  if (p.spouseId) {
    const s = byId(p.spouseId);
    if (s.spouseId && s.spouseId !== p.id && byId(s.spouseId)) byId(s.spouseId).spouseId = null;
    s.spouseId = p.id;
  }
  save(); render();
};

$('#del').onclick = () => {
  const p = byId(editing);
  if (!confirm(`${p.name} 님을 삭제할까요? 연결된 가족 관계도 함께 끊어집니다.`)) return;
  data.people = data.people.filter(x => x.id !== p.id);
  data.people.forEach(x => { if (x.parentId === p.id) x.parentId = null; if (x.spouseId === p.id) x.spouseId = null; });
  save(); dlg.close(); render();
};

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
