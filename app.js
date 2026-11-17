/* Rema 미니 앱 (11-17) — 보기 전용
 * 숫자는 봇이 보낸 링크의 '#d=' 뒤(zlib + base64url)에만 있다. 서버로 보내지 않고(조각은 요청에 안 실림),
 * 어디에도 연결하지 않으며(CSP connect-src 'none'), 화면에는 textContent로만 넣는다(HTML로 해석 안 함).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_STR = 80;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function str(v) { return typeof v === 'string' ? v.slice(0, MAX_STR) : ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function pct(v) { var n = num(v); return n === null ? 0 : Math.max(0, Math.min(100, n)); }
  function won(v) { var n = num(v); return n === null ? '—' : '₩' + Math.round(n).toLocaleString('ko-KR'); }
  function man(v) { var n = num(v); return n === null ? '—' : Math.round(n / 10000).toLocaleString('ko-KR'); }

  function b64urlBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function readPayload() {
    // 텔레그램은 열 때 '#' 뒤에 실행 정보(tgWebApp…)를 덧붙임 — '&'로든 '#'로든 이어져도 d= 만 골라 읽음
    var m = (location.hash || '').match(/(?:^#|[#&])d=([A-Za-z0-9_-]+)/);
    var token = m ? m[1] : null;
    if (!token || token.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(token)) return Promise.resolve(null);
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('old'));
    var stream = new Blob([b64urlBytes(token)]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(stream).text().then(function (t) {
      if (t.length > 100000) return null;
      var p = JSON.parse(t);
      return (p && p.v === 1 && typeof p === 'object') ? p : null;
    });
  }

  function renderHome(h) {
    h = h || {};
    $('val').textContent = won(h.val);
    var pl = num(h.pl);
    $('pl').textContent = pl === null ? '—' : (pl > 0 ? '+' : '') + pl.toFixed(1) + '%';
    var box = $('sleeves');
    (Array.isArray(h.sl) ? h.sl : []).slice(0, 4).forEach(function (r) {
      if (!Array.isArray(r)) return;
      var now = pct(r[1]), tgt = pct(r[2]), d = Math.round(now - tgt);
      var wrap = el('div', 'sl');
      var top = el('div', 'row');
      top.appendChild(el('span', 'name', str(r[0])));
      var right = el('span', 'mono small', now + '% / ' + tgt + '% · ');
      right.appendChild(el('b', Math.abs(d) >= 4 ? 'warn' : '', (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + '%p'));
      top.appendChild(right);
      var track = el('div', 'track');
      var bar = el('div', 'bar'); bar.style.width = now + '%';
      var mk = el('div', 'tgt'); mk.style.left = 'calc(' + tgt + '% - 1px)';
      track.appendChild(bar); track.appendChild(mk);
      wrap.appendChild(top); wrap.appendChild(track);
      box.appendChild(wrap);
    });
    var plan = h.plan || {};
    $('plan-total').textContent = num(plan.m) === null ? '—' : '이달 ' + Math.round(plan.m).toLocaleString('ko-KR') + '만원';
    (Array.isArray(plan.parts) ? plan.parts : []).slice(0, 6).forEach(function (p) {
      if (Array.isArray(p)) $('parts').appendChild(el('span', 'part mono', str(p[0]) + ' ' + (num(p[1]) || 0).toLocaleString('ko-KR') + '만'));
    });
    if (num(plan.pool)) $('pool').textContent = '장투 대기 자금 약 ' + Math.round(plan.pool).toLocaleString('ko-KR') + '만원 — 🔔 구간이 올 때만 꺼내 씀';
    var todos = $('todos');
    var list = Array.isArray(h.todo) ? h.todo.slice(0, 3) : [];
    if (!list.length) todos.appendChild(el('p', 'note', '지금 할 일 없음'));
    list.forEach(function (t) {
      if (!Array.isArray(t)) return;
      var it = el('div', 'item');
      var mk = el('span', 'mk', str(t[0]).slice(0, 4)); mk.setAttribute('aria-hidden', 'true');
      var tx = el('div', 'txt');
      tx.appendChild(el('span', 't', str(t[1])));
      tx.appendChild(el('span', 's', str(t[2])));
      it.appendChild(mk); it.appendChild(tx);
      it.appendChild(el('span', 'when mono', str(t[3])));
      todos.appendChild(it);
    });
  }

  function renderDiv(d) {
    d = d || {};
    $('dg').textContent = won(d.g);
    $('dn').textContent = won(d.n);
    var months = Array.isArray(d.m) ? d.m.slice(0, 12) : [];
    var max = Math.max.apply(null, months.map(function (v) { return num(v) || 0; }).concat([1]));
    var bars = $('bars'), label = [];
    for (var i = 0; i < 12; i++) {
      var v = num(months[i]) || 0;
      var col = el('div', 'col');
      col.appendChild(el('span', 'v mono', v >= 5000 ? man(v) : ''));
      var b = el('div', v ? 'b' : 'b zero'); b.style.height = (v ? Math.max(3, Math.round(v / max * 92)) : 2) + 'px';
      col.appendChild(b);
      col.appendChild(el('span', 'm mono', String(i + 1)));
      bars.appendChild(col);
      if (v) label.push((i + 1) + '월 ' + man(v) + '만원');
    }
    bars.setAttribute('aria-label', '달별 예상 배당: ' + (label.join(', ') || '없음'));
    var g = num(d.g) || 0, lim = num(d.lim) || 20000000, warn = num(d.warn) || 15000000;
    $('fin').textContent = man(g) + '만 / ' + man(lim) + '만';
    $('fin-fill').style.width = Math.min(100, g / lim * 100) + '%';
    $('fin-mark').style.left = 'calc(' + Math.min(100, warn / lim * 100) + '% - 1px)';
    var rows = $('drows');
    var list = Array.isArray(d.r) ? d.r.slice(0, 6) : [];
    if (!list.length) rows.appendChild(el('p', 'note', '보유 종목이 없거나 배당 자료를 못 받았습니다 — /holding 으로 등록'));
    list.forEach(function (r) {
      if (!Array.isArray(r)) return;
      var it = el('div', 'item');
      var tx = el('div', 'txt');
      tx.appendChild(el('span', 't', str(r[0])));
      var mo = str(r[3]);
      tx.appendChild(el('span', 's', (mo ? mo + '월 · ' : '') + '수익률 ' + (num(r[2]) || 0).toFixed(1) + '%'));
      it.appendChild(tx);
      it.appendChild(el('span', 'amt mono', won(r[1])));
      rows.appendChild(it);
    });
  }

  function show(view) {
    var home = view === 'home';
    $('view-home').hidden = !home; $('home-chip').hidden = !home;
    $('view-div').hidden = home; $('div-chip').hidden = home;
    $('title').textContent = home ? '내 자산 한눈에' : '💵 내 배당 달력';
    $('tab-home').setAttribute('aria-current', home ? 'page' : 'false');
    $('tab-div').setAttribute('aria-current', home ? 'false' : 'page');
  }

  function empty(msg) {
    $('view-home').hidden = true; $('view-div').hidden = true; $('home-chip').hidden = true;
    $('view-empty').hidden = false;
    if (msg) $('view-empty').querySelector('.note').textContent = msg;
  }

  var inTelegram = /[#&]tgWebAppVersion=/.test(location.hash || '');   // replaceState 전에 확인
  $('tab-home').addEventListener('click', function () { show('home'); });
  $('tab-div').addEventListener('click', function () { show('div'); });

  readPayload().then(function (p) {
    if (!p) { empty(); return; }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 주소창에서 숫자 지우기 — 실패해도 화면은 그대로 */ }
    if (!inTelegram) $('outside').hidden = false;   // 11-17 보안 검토: 남이 만든 가짜 링크일 수 있음
    var t = str(p.t);
    $('asof').textContent = t ? t.slice(5) + ' 기준' : '—';
    var ts = Date.parse(t.replace(' ', 'T') + ':00+09:00');
    if (isFinite(ts) && Date.now() - ts > 24 * 3600 * 1000) $('stale').hidden = false;
    renderHome(p.h);
    renderDiv(p.d);
    show(location.search.indexOf('tab=div') >= 0 ? 'div' : 'home');
  }).catch(function () {
    empty('이 화면을 열 수 없습니다 — 텔레그램 앱을 최신으로 업데이트한 뒤 /app 을 다시 보내 주세요.');
  });
})();
