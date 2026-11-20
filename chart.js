/* Rema 움직이는 차트 (11-19) — 보기 전용
 * 숫자는 봇이 보낸 링크의 '#d=' 뒤(zlib + base64url)에만 있다(chart_app.py가 만듦). 서버로 보내지 않고,
 * 어디에도 연결하지 않으며(CSP connect-src 'none'), 화면 글은 textContent로만 넣는다.
 * 차트는 같은 사이트 vendor/의 Lightweight Charts 5.3.0이 캔버스에 그린다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_BARS = 300, MAX_STR = 80;
  var TF = { '1d': '일봉', '4h': '4시간봉' };

  function str(v, n) { return typeof v === 'string' ? v.slice(0, n || MAX_STR) : ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function ints(v) { return Array.isArray(v) && v.length <= MAX_BARS ? v : null; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function b64urlBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function readPayload() {
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

  // 차이로 적은 배열 → 값 (null은 그대로)
  function undelta(xs) {
    var out = [], cur = null;
    (xs || []).forEach(function (x) {
      var n = num(x);
      if (n === null) { out.push(null); return; }
      cur = cur === null ? n : cur + n;
      out.push(cur);
    });
    return out;
  }

  function decodeBars(p) {
    var s = num(p.s), t0 = num(p.t0), u = num(p.u), vs = num(p.vs) || 1, mq = num(p.mq) || 1;
    var dt = ints(p.dt), c = ints(p.c), o = ints(p.o), h = ints(p.h), l = ints(p.l), vo = ints(p.vo);
    if (!s || s <= 0 || t0 === null || !u || !dt || !c || !o || !h || !l || !vo) return null;
    var n = c.length;
    if ([dt, o, h, l, vo].some(function (a) { return a.length !== n; })) return null;
    var close = undelta(c), t = t0, bars = [], vol = [];
    for (var i = 0; i < n; i++) {
      var dti = num(dt[i]), oi = num(o[i]), hi = num(h[i]), li = num(l[i]), vi = num(vo[i]);
      if (dti === null || oi === null || hi === null || li === null || close[i] === null) return null;
      t += dti * u;
      var cl = close[i] / s, op = (close[i] + oi) / s;
      bars.push({ time: t, open: op, high: (close[i] + hi) / s, low: (close[i] + li) / s, close: cl });
      vol.push({ time: t, value: (vi || 0) * vs, color: cl >= op ? 'rgba(8,153,129,.25)' : 'rgba(242,54,69,.25)' });
    }
    var ma = (Array.isArray(p.ma) ? p.ma.slice(0, 2) : []).map(function (m) {
      var vals = ints(m) ? undelta(m) : [];
      var out = [];
      vals.forEach(function (v, i) { if (v !== null && bars[i]) out.push({ time: bars[i].time, value: v * mq / s }); });
      return out;
    });
    var rv = ints(p.r) ? undelta(p.r) : [], rsi = [];
    rv.forEach(function (v, i) { if (v !== null && bars[i]) rsi.push({ time: bars[i].time, value: v }); });
    return { bars: bars, vol: vol, ma: ma, rsi: rsi, s: s };
  }

  function fmt(market, v) {
    if (market === 'KR') return Math.round(v).toLocaleString('ko-KR');
    var a = Math.abs(v), d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function when(t, tf) {
    var d = new Date(t * 1000);   // 시장 시계를 UTC로 실었으므로 UTC로 읽음
    var s = two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate());
    return tf === '4h' ? s + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) : s;
  }

  function render(p, D) {
    var LW = window.LightweightCharts;
    var market = str(p.m, 8), tf = TF[p.tf] ? p.tf : '1d';
    var f = function (v) { return fmt(market, v); };
    var last = D.bars[D.bars.length - 1], prev = D.bars.length > 1 ? D.bars[D.bars.length - 2] : last;
    var chg = (last.close / prev.close - 1) * 100;
    $('title').textContent = str(p.n, 20) || '차트';
    $('px').textContent = f(last.close);
    $('tf').textContent = TF[tf] + ' · ' + D.bars.length + '개 봉';
    $('chg').textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    $('chg').className = 'mono chg ' + (chg >= 0 ? 'up' : 'dn');

    var dark = document.documentElement.classList.contains('dark');   // 11-20: 텔레그램 다크 테마(tg.js)
    var C = dark ? { bg: '#111A2B', text: '#AEBBD0', line: '#24406A', grid: '#1A2740' }
                 : { bg: '#FFFFFF', text: '#4B5563', line: '#E5E9EE', grid: '#F1F3F6' };
    var chart = LW.createChart($('chart'), {
      autoSize: true,
      layout: { background: { color: C.bg }, textColor: C.text, fontSize: 11, attributionLogo: false,
                fontFamily: "system-ui,-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif", panes: { separatorColor: C.line } },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.line },
      timeScale: { borderColor: C.line, rightOffset: 4, timeVisible: tf === '4h', secondsVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal },
      localization: { locale: 'ko-KR', priceFormatter: f,
                      timeFormatter: function (t) { var d = new Date(t * 1000); return d.getUTCFullYear() + '-' + when(t, tf); } }
    });
    var candle = chart.addSeries(LW.CandlestickSeries, { upColor: '#089981', downColor: '#F23645', borderVisible: false,
      wickUpColor: '#089981', wickDownColor: '#F23645' });
    candle.setData(D.bars);
    var vol = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(D.vol);
    var maColors = ['#2962FF', '#7A5A12'], maS = D.ma.map(function (m, i) {
      var sr = chart.addSeries(LW.LineSeries, { color: maColors[i], lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      sr.setData(m); return sr;
    });
    var mal = Array.isArray(p.mal) ? p.mal.slice(0, 2).map(function (x) { return str(x, 10); }).join('·') : '';
    if (mal) $('ma-label').textContent = mal;
    if (D.rsi.length) {
      var rsi = chart.addSeries(LW.LineSeries, { color: '#7E57C2', lineWidth: 1, priceLineVisible: false }, 1);
      rsi.setData(D.rsi);
      [30, 70].forEach(function (y) { rsi.createPriceLine({ price: y, color: '#B0B7C3', lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: false }); });
      try { chart.panes()[1].setHeight(90); } catch (e) { /* 칸 높이는 기본값 */ }
    }

    var lv = (p.lv && typeof p.lv === 'object') ? p.lv : {}, why = (p.why && typeof p.why === 'object') ? p.why : {};
    var px = function (k) { var n = num(lv[k]); return n === null ? null : n / D.s; };
    var L = { buy: [], down: [], fib: [] };
    function add(g, price, color, title, style, width) {
      if (price === null || !(price > 0)) return;
      L[g].push({ price: price, color: color, lineWidth: width || 1, lineStyle: style, axisLabelVisible: true, title: title });
    }
    var z = Array.isArray(lv.z) ? lv.z.map(num) : [];
    if (z.length === 2 && z[0] !== null && z[1] !== null) {
      add('buy', z[1] / D.s, '#0F6E5A', '진입', LW.LineStyle.Solid, 2);
      add('buy', z[0] / D.s, '#0F6E5A', '', LW.LineStyle.Solid, 2);
    }
    add('buy', px('st'), '#D32F2F', '손절', LW.LineStyle.Solid, 1);
    add('buy', px('t1'), '#2962FF', '목표1', LW.LineStyle.Dashed);
    add('buy', px('t2'), '#2962FF', '목표2', LW.LineStyle.Dashed);
    if (!(z.length === 2)) add('down', px('tr'), '#E65100', '하락 기준', LW.LineStyle.Dotted);
    add('down', px('d1'), '#E65100', '하락1', LW.LineStyle.Dashed, 2);
    add('down', px('d2'), '#E65100', '하락2', LW.LineStyle.Dashed, 2);
    (Array.isArray(p.fib) ? p.fib.slice(0, 6) : []).forEach(function (x) {
      if (Array.isArray(x) && num(x[1]) !== null) add('fib', x[1] / D.s, '#9CA3AF', 'Fib ' + str(String(x[0]), 6), LW.LineStyle.Dotted);
    });
    var drawn = { buy: [], down: [], fib: [] };
    function show(g, on) {
      drawn[g].forEach(function (pl) { candle.removePriceLine(pl); });
      drawn[g] = on ? L[g].map(function (o) { return candle.createPriceLine(o); }) : [];
    }
    var state = { buy: true, down: true, fib: false, ma: true };
    Object.keys(L).forEach(function (g) { show(g, state[g]); });
    Array.prototype.forEach.call(document.querySelectorAll('#layers button'), function (b) {
      var g = b.getAttribute('data-l');
      if (g !== 'ma' && !L[g].length) { b.hidden = true; return; }
      if (g === 'ma' && !maS.length) { b.hidden = true; return; }
      b.addEventListener('click', function () {
        state[g] = !state[g];
        b.setAttribute('aria-pressed', state[g] ? 'true' : 'false');
        if (g === 'ma') maS.forEach(function (sr) { sr.applyOptions({ visible: state.ma }); });
        else show(g, state[g]);
      });
    });
    chart.timeScale().fitContent();

    function legend(bar) {
      $('legend').textContent = when(bar.time, tf) + ' 시' + f(bar.open) + ' 고' + f(bar.high) + ' 저' + f(bar.low) + ' 종' + f(bar.close);
    }
    legend(last);
    chart.subscribeCrosshairMove(function (e) {
      var bar = e && e.time ? e.seriesData.get(candle) : null;
      legend(bar || last);
    });

    // 숫자 정리
    var kv = $('kv');
    function row(tag, k, v, sub) {
      var it = el('div', 'item'), a = el('span', 'k');
      if (tag) a.appendChild(el('span', 'tag ' + tag[0], tag[1]));
      a.appendChild(document.createTextNode(k));
      var b = el('span', 'v mono', v);
      if (sub) b.appendChild(el('span', 'why', sub));
      it.appendChild(a); it.appendChild(b); kv.appendChild(it);
    }
    var pc = function (v) { return (v / last.close - 1) * 100; };
    var pcs = function (v) { var n = pc(v); return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; };
    var B = ['buy', '매수'], X = ['down', '하락'];
    if (z.length === 2 && z[0] !== null) row(B, '진입 구간', f(z[0] / D.s) + '~' + f(z[1] / D.s), '참고 타점 — 신호 아님');
    if (px('st') !== null) row(B, '손절', f(px('st')) + ' (' + pcs(px('st')) + ')', '구간 아래끝 − 일봉 ATR 0.5배');
    if (px('t1') !== null) row(B, '1·2차 목표', f(px('t1')) + (px('t2') !== null ? ' · ' + f(px('t2')) : ''), [str(why.t1, 28), str(why.t2, 28)].filter(Boolean).join(' · '));
    if (px('tr') !== null) row(X, '하락 전환 기준', f(px('tr')) + ' (' + pcs(px('tr')) + ')', '4시간봉 종가가 이 아래로 마감하면 · ' + str(why.tr, 28));
    if (px('d1') !== null) row(X, '1·2차 하락 목표', f(px('d1')) + ' (' + pcs(px('d1')) + ')' + (px('d2') !== null ? ' · ' + f(px('d2')) + ' (' + pcs(px('d2')) + ')' : ''),
      [str(why.d1, 28), str(why.d2, 28)].filter(Boolean).join(' · '));
    if (num(p.mv) !== null) row(X, '보통 흔들림(10거래일)', '±' + num(p.mv).toFixed(1) + '%',
      num(p.ph) !== null ? '1차 하락 목표까지 무작위로도 약 ' + Math.round(num(p.ph)) + '% 확률로 닿는 거리' : '');
    if (!kv.firstChild) kv.appendChild(el('p', 'note', '이 시간대엔 참고 타점·하락 시나리오가 없습니다'));
    var vd = str(p.vd, 60);
    $('verdict').textContent = vd ? '· ' + vd.split(' — ')[0] : '';
    var warn = Array.isArray(p.warn) ? p.warn.slice(0, 3).map(function (w) { return str(w, 24); }).filter(Boolean) : [];
    $('warn').textContent = (warn.length ? '경계 신호: ' + warn.join(', ') + ' · ' : '') +
      '참고 타점·하락 시나리오는 검증 전이라 매수·매도·공매도 신호가 아닙니다. 장투 종목은 떨어지면 다음 구간에서 나눠 삽니다.';
  }

  function empty(msg) {
    $('view-chart').hidden = true;
    $('empty').hidden = false;
    if (msg) $('empty-msg').textContent = msg;
  }

  var inTelegram = /tgWebAppVersion=/.test(location.hash || '');
  readPayload().then(function (p) {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 주소 정리 실패는 무시 */ }
    if (!p) { empty(); return; }
    var D = decodeBars(p);
    if (!D || D.bars.length < 2 || !window.LightweightCharts) { empty('차트 숫자를 읽지 못했습니다 — /chart 를 다시 보내 주세요.'); return; }
    $('asof').textContent = str(p.t, 16);
    if (!inTelegram) $('outside').hidden = false;
    var at = Date.parse(str(p.t, 16).replace(' ', 'T') + ':00+09:00');
    if (isFinite(at) && Date.now() - at > 24 * 3600 * 1000) $('stale').hidden = false;
    render(p, D);
  }).catch(function () {
    empty('이 텔레그램 버전에선 열 수 없습니다 — 앱을 업데이트해 주세요.');
  });
})();
