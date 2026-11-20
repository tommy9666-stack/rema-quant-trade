/* 텔레그램 미니 앱 연결(11-20 결재) — 공식 SDK(telegram-web-app.js) 없이 문서에 나온 메시지만 직접 보냄.
   왜 직접: 외부 스크립트를 안 받는 지금 보안 구조(CSP script-src 'self', connect-src 'none') 그대로 두려고. 네트워크 요청 없음.
   근거: core.telegram.org/api/web-events · /api/bots/webapps
   - 보냄: web_app_ready · web_app_expand(전체 화면) · web_app_setup_back_button{is_visible} · web_app_set_header_color · web_app_set_background_color
   - 받음: back_button_pressed · theme_changed (모바일·데스크톱은 window.Telegram.WebView.receiveEvent, 웹은 postMessage)
   - 다크 모드: 텔레그램이 '#' 뒤에 붙이는 tgWebAppThemeParams의 bg_color 밝기로 판단(기기 설정이 아니라 텔레그램 테마를 따름)
   텔레그램 밖에서 열면 아무것도 보내지 않음(조용히 무시). */
(function () {
  'use strict';
  var WEB_ORIGIN = 'https://web.telegram.org';
  var handlers = {};

  function post(type, data) {
    try {
      if (window.TelegramWebviewProxy && typeof window.TelegramWebviewProxy.postEvent === 'function') {
        window.TelegramWebviewProxy.postEvent(type, JSON.stringify(data || {}));
      } else if (window.external && typeof window.external.notify === 'function') {
        window.external.notify(JSON.stringify({ eventType: type, eventData: data || {} }));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data || {} }), WEB_ORIGIN);
      }
    } catch (e) { /* 텔레그램 밖·옛 버전 — 화면은 그대로 */ }
  }

  function receive(type, data) {
    (handlers[type] || []).forEach(function (fn) { try { fn(data); } catch (e) { /* 한 처리기 오류가 다른 것을 막지 않게 */ } });
  }
  window.Telegram = window.Telegram || {};
  window.Telegram.WebView = window.Telegram.WebView || {};
  window.Telegram.WebView.receiveEvent = receive;
  window.TelegramGameProxy = window.TelegramGameProxy || {};
  window.TelegramGameProxy.receiveEvent = receive;
  window.addEventListener('message', function (ev) {
    if (ev.origin !== WEB_ORIGIN || typeof ev.data !== 'string') return;
    try {
      var m = JSON.parse(ev.data);
      if (m && typeof m.eventType === 'string') receive(m.eventType, m.eventData);
    } catch (e) { /* 다른 메시지 무시 */ }
  });

  function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }

  function hashParam(name) {
    var m = (location.hash || '').match(new RegExp('[#&]' + name + '=([^&#]*)'));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }

  function isDarkColor(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    if (!m) return null;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }

  function applyTheme(params) {
    var dark = params && isDarkColor(params.bg_color);
    if (dark === null) return;
    document.documentElement.classList.toggle('dark', dark);
    post('web_app_set_background_color', { color: dark ? '#0B1220' : '#F5F6F8' });
  }

  var inTelegram = /[#&]tgWebAppVersion=/.test(location.hash || '');
  var theme = null;
  try { theme = JSON.parse(hashParam('tgWebAppThemeParams') || 'null'); } catch (e) { theme = null; }
  if (inTelegram) {
    applyTheme(theme);
    on('theme_changed', function (d) { applyTheme(d && d.theme_params); });
    post('web_app_set_header_color', { color: '#0B1F3A' });   // 머리띠 남색과 이어지게(DESIGN.md night)
    post('web_app_ready', {});
    post('web_app_expand', {});
  }

  var backFn = null;
  on('back_button_pressed', function () { if (backFn) backFn(); });
  // fn이 있으면 텔레그램 뒤로 버튼을 보이고 누르면 fn, 없으면 숨김
  function setBack(fn) {
    backFn = fn || null;
    if (inTelegram) post('web_app_setup_back_button', { is_visible: !!fn });
  }

  window.RemaTG = { inTelegram: inTelegram, post: post, on: on, setBack: setBack, isDarkColor: isDarkColor, hashParam: hashParam };
})();
