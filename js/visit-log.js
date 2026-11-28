/* 博客前台访问日志埋点
 * 从 window.LOCAL.visitLog 读取配置（enabled / endpoint）。
 * - URL 变化（初始加载、PJAX 切换、前进后退）时上报 enter
 * - 离开页面 / 切后台时上报 leave 补全停留时长
 * 优先用 navigator.sendBeacon，卸载时更可靠；失败静默，不影响浏览。
 */
(function () {
  'use strict';
  var cfg = (window.LOCAL && window.LOCAL.visitLog) || {};
  if (!cfg.enabled) return;
  var endpoint = cfg.endpoint;
  if (!endpoint) return;

  var lastUrl = null;   // 已上报过 enter 的 URL，用于去重
  var enterTime = 0;    // 当前页面进入时间，0 表示未在计时
  var currentPath = ''; // 当前正在计时的页面路径

  function screenSize() {
    try {
      return window.screen.width + 'x' + window.screen.height;
    } catch (e) {
      return '';
    }
  }
  function currentUrl() {
    return location.pathname + location.search;
  }

  function send(data) {
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
      } else {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          keepalive: true
        });
      }
    } catch (e) {
      /* 埋点失败不影响正常浏览 */
    }
  }

  // URL 变化：先补旧页面停留时长，再进入新页面
  function onUrlChange() {
    var url = currentUrl();
    // 同页且已在计时，跳过（避免重复上报）
    if (url === lastUrl && enterTime) return;
    // 切到不同页面：先补旧页面停留时长
    if (enterTime && currentPath && currentPath !== url) {
      var dur = Math.max(0, Math.round((Date.now() - enterTime) / 1000));
      send({ type: 'leave', path: currentPath, enterTime: enterTime, duration: dur });
    }
    lastUrl = url;
    currentPath = url;
    enterTime = Date.now();
    send({
      type: 'enter',
      path: url,
      title: document.title,
      referrer: document.referrer,
      enterTime: enterTime,
      lang: navigator.language,
      screen: screenSize()
    });
  }

  // 离开 / 切后台：补停留时长
  function onLeave() {
    if (!enterTime) return;
    var dur = Math.max(0, Math.round((Date.now() - enterTime) / 1000));
    send({ type: 'leave', path: currentPath, enterTime: enterTime, duration: dur });
    enterTime = 0;
  }

  // URL 变化检测：覆盖初始加载、PJAX 切换、前进后退
  window.setInterval(function () {
    if (document.visibilityState !== 'hidden') onUrlChange();
  }, 800);

  // 离开页面 / 切后台
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      onLeave();
    } else if (document.visibilityState === 'visible' && !enterTime) {
      // 从后台回到前台，重新计一次访问
      onUrlChange();
    }
  });
})();
