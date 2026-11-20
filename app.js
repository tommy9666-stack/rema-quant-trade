/* Rema 미니 앱 (11-17) — 보기 전용
 * 숫자는 봇이 보낸 링크의 '#d=' 뒤(zlib + base64url)에만 있다. 서버로 보내지 않고(조각은 요청에 안 실림),
 * 어디에도 연결하지 않으며(CSP connect-src 'none'), 화면에는 textContent로만 넣는다(HTML로 해석 안 함).
 * 링크마다 든 화면만 탭으로 보인다: 홈·배당·성적 / 종목(관심종목 보드) / 운영(관리자).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SVG = 'http://www.w3.org/2000/svg';
  var MAX_STR = 80;
  var VIEWS = { home: '내 자산 한눈에', div: '💵 내 배당 달력', perf: '📈 성적표', board: '📋 관심종목 보드', ops: '🛠 운영 상태판' };

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
  function signed(v, d) { var n = num(v); return n === null ? '—' : (n > 0 ? '+' : '') + n.toFixed(d === undefined ? 1 : d) + '%'; }
  function list(v, n) { return Array.isArray(v) ? v.slice(0, n) : []; }

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
    if (!token || token.length > 6000) return Promise.resolve(null);
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('old'));
    var stream = new Blob([b64urlBytes(token)]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(stream).text().then(function (t) {
      if (t.length > 100000) return null;
      var p = JSON.parse(t);
      return (p && typeof p === 'object' && p.v === 1) ? p : null;
    });
  }

  function item(mark, title, sub, right, rightCls) {
    var it = el('div', 'item');
    if (mark) { var mk = el('span', 'mk', str(mark).slice(0, 4)); mk.setAttribute('aria-hidden', 'true'); it.appendChild(mk); }
    var tx = el('div', 'txt');
    tx.appendChild(el('span', 't', title));
    if (sub) tx.appendChild(el('span', 's', sub));
    it.appendChild(tx);
    if (right !== undefined && right !== null) it.appendChild(el('span', rightCls || 'when mono', right));
    return it;
  }

  // ── 홈 ──
  function renderHome(h) {
    $('val').textContent = won(h.val);
    $('pl').textContent = signed(h.pl);
    var box = $('sleeves');
    list(h.sl, 4).forEach(function (r) {
      if (!Array.isArray(r)) return;
      var now = pct(r[1]), tgt = pct(r[2]), d = Math.round(now - tgt);
      var wrap = el('div', 'sl'), top = el('div', 'row');
      top.appendChild(el('span', 'name', str(r[0])));
      var right = el('span', 'mono small', now + '% / ' + tgt + '% · ');
      right.appendChild(el('b', Math.abs(d) >= 4 ? 'warn' : '', (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + '%p'));
      top.appendChild(right);
      var track = el('div', 'track'), bar = el('div', 'bar'), mk = el('div', 'tgt');
      bar.style.width = now + '%'; mk.style.left = 'calc(' + tgt + '% - 1px)';
      track.appendChild(bar); track.appendChild(mk);
      wrap.appendChild(top); wrap.appendChild(track); box.appendChild(wrap);
    });
    var plan = h.plan || {};
    $('plan-total').textContent = num(plan.m) === null ? '—' : '이달 ' + Math.round(plan.m).toLocaleString('ko-KR') + '만원';
    list(plan.parts, 6).forEach(function (p) {
      if (Array.isArray(p)) $('parts').appendChild(el('span', 'part mono', str(p[0]) + ' ' + (num(p[1]) || 0).toLocaleString('ko-KR') + '만'));
    });
    if (num(plan.pool)) $('pool').textContent = '장투 대기 자금 약 ' + Math.round(plan.pool).toLocaleString('ko-KR') + '만원 — 🔔 구간이 올 때만 꺼내 씀';
    var todos = list(h.todo, 3);
    if (!todos.length) $('todos').appendChild(el('p', 'note', '지금 할 일 없음'));
    todos.forEach(function (t) { if (Array.isArray(t)) $('todos').appendChild(item(t[0], str(t[1]), str(t[2]), str(t[3]))); });
  }

  // ── 배당 ──
  function renderDiv(d) {
    $('dg').textContent = won(d.g);
    $('dn').textContent = won(d.n);
    var months = list(d.m, 12);
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
    var rows = list(d.r, 6);
    if (!rows.length) $('drows').appendChild(el('p', 'note', '보유 종목이 없거나 배당 자료를 못 받았습니다 — /holding 으로 등록'));
    rows.forEach(function (r) {
      if (!Array.isArray(r)) return;
      var mo = str(r[3]);
      $('drows').appendChild(item(null, str(r[0]), (mo ? mo + '월 · ' : '') + '수익률 ' + (num(r[2]) || 0).toFixed(1) + '%', won(r[1]), 'amt mono'));
    });
  }

  // ── 성적 ──
  function line(svg, vals, lo, hi, color, width) {
    if (vals.length < 2) return;
    var pts = vals.map(function (v, i) {
      var x = 4 + i * (332 / (vals.length - 1));
      var y = 8 + (hi - v) / ((hi - lo) || 1) * 124;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var pl = document.createElementNS(SVG, 'polyline');
    pl.setAttribute('points', pts); pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', color); pl.setAttribute('stroke-width', String(width));
    pl.setAttribute('stroke-linejoin', 'round'); pl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(pl);
  }
  function series(c, k) { return list(c[k], 60).map(function (v) { return (num(v) || 0) / 10; }); }

  function renderPerf(p) {
    var c = p.c;
    if (c && typeof c === 'object') {
      var e = series(c, 'e'), k = series(c, 'k'), n = series(c, 'n');
      var all = e.concat(k, n, [0]);
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      var svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 340 140'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
      var zero = document.createElementNS(SVG, 'line');
      var zy = (8 + hi / ((hi - lo) || 1) * 124).toFixed(1);
      zero.setAttribute('x1', '0'); zero.setAttribute('x2', '340'); zero.setAttribute('y1', zy); zero.setAttribute('y2', zy);
      zero.setAttribute('stroke', '#D9DEE5'); zero.setAttribute('stroke-dasharray', '3 3');
      svg.appendChild(zero);
      line(svg, k, lo, hi, '#C9A55A', 1.6); line(svg, n, lo, hi, '#2962FF', 1.6); line(svg, e, lo, hi, '#0B1F3A', 2.6);
      $('pchart').appendChild(svg);
      $('pc-range').textContent = str(c.from) + ' → ' + str(c.to);
      $('pc-e').textContent = signed(e[e.length - 1]); $('pc-k').textContent = signed(k[k.length - 1]); $('pc-n').textContent = signed(n[n.length - 1]);
      $('pchart').setAttribute('aria-label', '누적 수익: 지수 엔진 ' + signed(e[e.length - 1]) + ', 코스피 ' + signed(k[k.length - 1]) + ', 나스닥 ' + signed(n[n.length - 1]));
    } else {
      $('pchart').appendChild(el('p', 'note', '실전 곡선을 못 받았습니다 — /track'));
    }
    renderAccount(p.a);
    var papers = list(p.papers, 4);
    if (!papers.length) $('papers').appendChild(el('p', 'note', '종이 펀드 기록을 못 읽었습니다'));
    papers.forEach(function (r) { if (Array.isArray(r)) $('papers').appendChild(item(null, str(r[0]), str(r[1]), str(r[2]), 'when')); });
    var j = p.j || {};
    $('j-period').textContent = j.period ? str(j.period) : '기록 없음';
    var kv = $('journal');
    if (!j.period) { kv.appendChild(el('p', 'note', '지난달 매매 기록이 없습니다 — 사고팔 때 "매수 …"·"매도 …"로 남기면 여기에 모입니다')); return; }
    [['산 횟수', (num(j.buys) || 0) + '번'], ['판 횟수', (num(j.sells) || 0) + '번'],
     ['실현 손익', won(j.pnl)], ['이긴 비율', num(j.win) === null ? '—' : num(j.win) + '%']].forEach(function (x) {
      var d = el('div'); d.appendChild(el('span', 'k', x[0])); d.appendChild(el('span', 'v mono', x[1])); kv.appendChild(d);
    });
  }

  // ── 내 계좌 곡선 ──
  function renderAccount(a) {
    var box = $('achart'), leg = $('ac-legend');
    if (!a || typeof a !== 'object') {
      box.appendChild(el('p', 'note', '기록이 2번 쌓이면 보입니다 — /app을 다른 날 다시 열거나 매주 월요일 보유종목 점검 뒤'));
      return;
    }
    var v = series(a, 'v');
    if (v.length < 2) { box.appendChild(el('p', 'note', '기록이 아직 적습니다')); return; }
    var lo = Math.min.apply(null, v.concat([0])), hi = Math.max.apply(null, v.concat([0]));
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 340 140'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    var zero = document.createElementNS(SVG, 'line'), zy = (8 + hi / ((hi - lo) || 1) * 124).toFixed(1);
    zero.setAttribute('x1', '0'); zero.setAttribute('x2', '340'); zero.setAttribute('y1', zy); zero.setAttribute('y2', zy);
    zero.setAttribute('stroke', '#D9DEE5'); zero.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(zero);
    line(svg, v, lo, hi, '#0B1F3A', 2.6);
    box.appendChild(svg);
    $('ac-range').textContent = str(a.from) + ' → ' + str(a.to) + ' · 기록 ' + (num(a.n) || 0) + '번';
    var last = v[v.length - 1], parts = [['e', '내 계좌', last]];
    if (num(a.e) !== null) parts.push(['n', '같은 기간 지수 엔진', num(a.e) / 10]);
    if (num(a.k) !== null) parts.push(['k', '코스피', num(a.k) / 10]);
    parts.forEach(function (x) {
      var s = el('span'), i = el('i', 'sw ' + x[0]); s.appendChild(i); s.appendChild(document.createTextNode(x[1] + ' '));
      s.appendChild(el('b', 'mono', signed(x[2]))); leg.appendChild(s);
    });
    box.setAttribute('aria-label', '내 계좌 누적 수익 ' + signed(last));
  }

  // ── 관심종목 보드 ──
  var boardState = { f: 'all', s: 'as' };
  // 11-20 규칙 신호판: r[5] 칸(x 정리·c 주의·b 살 때·w 기다릴 때), r[6] 칸 설명, r[7] 참고(회색) — 점수 아님
  var LV = { x: ['🔴', '정리'], c: ['🟠', '주의'], b: ['🟢', '살 때'], w: ['⚪', '기다릴 때'] };
  var LV_ORDER = { x: 0, c: 1, b: 2, w: 3 };
  function lvOf(r) { var k = str(r[5]); return LV[k] ? k : 'w'; }
  function renderBoardHead(s) {
    var box = $('board-head');
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    list(s, 4).forEach(function (t) { box.appendChild(el('p', 'bhead', str(t).slice(0, 160))); });
    box.hidden = !box.firstChild;
  }
  function renderBoard(w, bot) {
    var rows = list(w, 20).filter(Array.isArray);
    var okBot = typeof bot === 'string' && /^[A-Za-z0-9_]{3,40}$/.test(bot);
    var box = $('board');
    while (box.firstChild) box.removeChild(box.firstChild);
    if (!rows.length) { box.appendChild(el('p', 'note', '관심종목이 없습니다 — 종목 이름을 채팅으로 보내 분석한 뒤 ➕로 담아 주세요')); return; }
    if (rows.length >= 3) $('board-ctl').hidden = false;
    var shown = rows.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) {
      return boardState.f === 'all' || str(x.r[1]) === boardState.f;
    });
    if (boardState.s === 'lv') {
      shown.sort(function (a, b) { return LV_ORDER[lvOf(a.r)] - LV_ORDER[lvOf(b.r)] || a.i - b.i; });
    }
    if (boardState.s === 'near') {
      shown.sort(function (a, b) {
        var ga = num(a.r[4]), gb = num(b.r[4]);
        if (ga === null && gb === null) return a.i - b.i;
        if (ga === null) return 1;
        if (gb === null) return -1;
        return ga - gb || a.i - b.i;
      });
    }
    if (!shown.length) box.appendChild(el('p', 'note', '이 조건에 맞는 종목이 없습니다'));
    shown.forEach(function (x) {
      var r = x.r, param = str(r[3]), lv = lvOf(r);
      var row = item(LV[lv][0], str(r[1]) + ' ' + str(r[0]), str(r[2]));
      var tx = row.querySelector('.txt');
      var sig = el('span', 'sig lv-' + lv, LV[lv][1] + (str(r[6]) ? ' · ' + str(r[6]).slice(0, 80) : ''));
      tx.insertBefore(sig, tx.children[1] || null);
      if (str(r[7])) tx.appendChild(el('span', 'ref', '참고: ' + str(r[7]).slice(0, 120)));
      row.setAttribute('aria-label', str(r[0]) + ' ' + LV[lv][1]);
      if (okBot && /^ch_[A-Za-z0-9_]{1,60}$/.test(param)) {
        var a = el('a', 'item');
        a.href = 'https://t.me/' + bot + '?start=' + param;
        while (row.firstChild) a.appendChild(row.firstChild);
        var go = el('span', 'go', '›'); go.setAttribute('aria-hidden', 'true'); a.appendChild(go);
        box.appendChild(a);
      } else {
        box.appendChild(row);
      }
    });
  }
  function wireBoard(w, bot) {
    Array.prototype.forEach.call(document.querySelectorAll('#board-ctl button'), function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-f'), s = b.getAttribute('data-s');
        if (f) boardState.f = f;
        if (s) boardState.s = s;
        Array.prototype.forEach.call(document.querySelectorAll('#board-ctl button'), function (o) {
          var on = o.getAttribute('data-f') ? o.getAttribute('data-f') === boardState.f : o.getAttribute('data-s') === boardState.s;
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        renderBoard(w, bot);
      });
    });
  }

  // ── 운영 상태판(관리자 링크에만 있음) ──
  function renderOps(o) {
    $('rm-at').textContent = o.rm_at ? str(o.rm_at) : '—';
    var total = 0, n = 0;
    list(o.rm, 7).forEach(function (a) {
      if (!Array.isArray(a)) return;
      var v = pct(a[1]); total += v; n++;
      var wrap = el('div', 'rm'), top = el('div', 'row');
      top.appendChild(el('span', 'name', str(a[0])));
      top.appendChild(el('span', 'mono small', v + '%'));
      var track = el('div', 'track'), bar = el('div', 'bar'); bar.style.width = v + '%';
      track.appendChild(bar);
      wrap.appendChild(top); wrap.appendChild(track); wrap.appendChild(el('span', 'note', a[2] === '채움' ? '모든 항목 채움' : '다음: ' + str(a[2])));
      $('roadmap').appendChild(wrap);
    });
    if (n) $('roadmap').appendChild(el('p', 'note', '평균 ' + Math.round(total / n) + '% · 영역마다 항목 점수의 합 — 서버 기록으로 자동 계산, 회의 판정 항목만 손으로(ops/roadmap.json)'));
    list(o.live, 6).forEach(function (x) { if (Array.isArray(x)) $('live').appendChild(item(null, str(x[0]), null, str(x[1]))); });
    var jobs = o.jobs || {}, meet = o.meet || {}, ver = o.ver || {};
    var bad = list(jobs.bad, 4);
    $('opsrows').appendChild(item(null, '정기 작업', bad.length ? bad.map(str).join(' / ') : '문제 없음',
      (num(jobs.ok) || 0) + '/' + (num(jobs.all) || 0) + ' 정상', bad.length ? 'when mono warn' : 'when mono ok'));
    var agenda = list(meet.agenda, 6).map(str).filter(Boolean);
    $('opsrows').appendChild(item(null, '다음 투자위원회', (agenda.length ? '안건 미리 보기: ' + agenda.join(' · ') : '') +
      (meet.sent ? (agenda.length ? ' / ' : '') + '지난 자료 ' + str(meet.sent) : ''), str(meet.next)));
    var same = ver.head && ver.green && ver.head === ver.green;
    $('opsrows').appendChild(item(null, '배포된 코드', same ? '자동 검증을 통과한 커밋과 같음' : '자동 검증 통과본과 다르거나 확인 못 함',
      str(ver.head) || '—', same ? 'when mono ok' : 'when mono warn'));
  }

  // ── 탭 ──
  var present = [];
  function show(view) {
    present.forEach(function (v) { $('view-' + v).hidden = v !== view; });
    $('home-chip').hidden = view !== 'home';
    $('div-chip').hidden = view !== 'div';
    $('title').textContent = VIEWS[view] || '';
    if (window.RemaTG) window.RemaTG.setBack(view !== present[0] ? function () { show(present[0]); } : null);   // 11-20: 텔레그램 뒤로 버튼 = 첫 탭
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-view') === view ? 'page' : 'false');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });

  function empty(msg) {
    ['home', 'div', 'perf', 'board', 'ops'].forEach(function (v) { $('view-' + v).hidden = true; });
    $('home-chip').hidden = true; $('tabs').hidden = true;
    $('view-empty').hidden = false;
    if (msg) $('view-empty').querySelector('.note').textContent = msg;
  }

  var inTelegram = /[#&]tgWebAppVersion=/.test(location.hash || '');   // replaceState 전에 확인
  readPayload().then(function (p) {
    if (!p) { empty(); return; }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 주소창에서 숫자 지우기 — 실패해도 화면은 그대로 */ }
    if (!inTelegram) $('outside').hidden = false;   // 11-17 보안 검토: 남이 만든 가짜 링크일 수 있음
    var t = str(p.t);
    $('asof').textContent = t ? t.slice(5) + ' 기준' : '—';
    var ts = Date.parse(t.replace(' ', 'T') + ':00+09:00');
    if (isFinite(ts) && Date.now() - ts > 24 * 3600 * 1000) $('stale').hidden = false;
    var parts = [['home', 'h', renderHome], ['div', 'd', renderDiv], ['perf', 'p', renderPerf], ['ops', 'o', renderOps]];
    parts.forEach(function (x) {
      if (p[x[1]] && typeof p[x[1]] === 'object') { present.push(x[0]); x[2](p[x[1]]); }
    });
    if (Array.isArray(p.w)) { present.push('board'); renderBoardHead(p.s); renderBoard(p.w, p.b); wireBoard(p.w, p.b); }
    if (!present.length) { empty(); return; }
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.hidden = present.indexOf(b.getAttribute('data-view')) < 0;
    });
    if (present.length < 2) $('tabs').hidden = true;
    show(present[0]);
  }).catch(function () {
    empty('이 화면을 열 수 없습니다 — 텔레그램 앱을 최신으로 업데이트한 뒤 /app 을 다시 보내 주세요.');
  });
})();
