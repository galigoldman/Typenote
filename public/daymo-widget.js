// src/styles.css
var styles_default = '/* ============================================================================\n   DAYMO WIDGET \u2014 themeable template stylesheet\n   ----------------------------------------------------------------------------\n   Every visual property reads from a --dw-* custom property. To re-skin the\n   widget you only override tokens \u2014 never the rules. The default token set\n   lives on :host below; the three shipped themes (data-theme="aurelia" /\n   "lume" / "onyx") override a subset of it.\n\n   Custom themes from the host page (custom properties inherit through the\n   shadow boundary, and outer-page rules on the host element win over :host):\n\n       #daymo-widget-root {\n         --dw-accent: #4f46e5;\n         --dw-surface: #ffffff;\n         --dw-radius: 16px;\n         --dw-font: "Inter", sans-serif;\n       }\n\n   Fonts: no third-party requests here by design (same policy as\n   help-center.css). Theme font stacks use Cormorant Garamond / Hanken\n   Grotesk / Schibsted Grotesk when the host page loads them, and fall back\n   to the system stack otherwise.\n   ============================================================================ */\n\n:host {\n  all: initial;\n  font-family: var(--dw-font);\n  color: var(--dw-ink);\n  -webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;\n\n  /* ---- default tokens (themes + host pages override these) ---- */\n  /* geometry */\n  --dw-panel-w: 364px;\n  --dw-panel-h: 540px;\n  --dw-bubble-size: 58px;\n  --dw-edge: 18px;\n  --dw-radius: 18px;\n  --dw-radius-sm: 12px;\n  --dw-radius-pill: 999px;\n  /* type */\n  --dw-font: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;\n  --dw-font-display: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;\n  --dw-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;\n  /* color */\n  --dw-surface: #ffffff;\n  --dw-surface-2: #f5f5f4;\n  --dw-ink: #1c1917;\n  --dw-muted: #78716c;\n  --dw-border: #e7e5e4;\n  --dw-accent: #1c1917;\n  --dw-accent-fg: #ffffff;\n  --dw-bubble-bg: #1c1917;\n  --dw-bubble-fg: #ffffff;\n  --dw-user-bg: #f0efee;\n  --dw-user-fg: #1c1917;\n  --dw-online: #34d399;\n  --dw-error-bg: #fef2f2;\n  --dw-error-fg: #991b1b;\n  --dw-error-border: #fee2e2;\n  /* effects */\n  --dw-ring: rgba(28, 25, 23, 0.14);\n  --dw-ease: cubic-bezier(0.34, 1.2, 0.4, 1);\n  --dw-shadow: 0 24px 60px rgba(20, 16, 12, 0.16), 0 6px 16px rgba(20, 16, 12, 0.07);\n  --dw-shadow-bubble: 0 8px 22px rgba(20, 16, 12, 0.22), 0 2px 6px rgba(20, 16, 12, 0.1);\n}\n\n/* ---------- THEME: AURELIA \u2014 warm editorial luxury ------------------------- */\n:host([data-theme="aurelia"]) {\n  --dw-font-display: "Cormorant Garamond", Georgia, serif;\n  --dw-greeting-size: 27px;\n  --dw-surface: #fffdf8;\n  --dw-surface-2: #f7f0e3;\n  --dw-header-bg: #fbf6ec;\n  --dw-ink: #2c2218;\n  --dw-muted: #998a73;\n  --dw-border: #ece2cf;\n  --dw-accent: #9c7a3c;\n  --dw-accent-fg: #fffdf8;\n  --dw-bubble-bg: #2c2218;\n  --dw-bubble-fg: #f6eddc;\n  --dw-user-bg: #efe5d1;\n  --dw-user-fg: #2c2218;\n  --dw-online: #6fae84;\n  --dw-ring: rgba(156, 122, 60, 0.2);\n  --dw-radius: 22px;\n  --dw-radius-sm: 14px;\n  --dw-bubble-size: 60px;\n  --dw-shadow: 0 26px 64px rgba(74, 53, 24, 0.18), 0 6px 18px rgba(74, 53, 24, 0.08);\n  --dw-shadow-bubble: 0 10px 26px rgba(44, 34, 24, 0.3);\n}\n\n/* ---------- THEME: LUME \u2014 minimal modern mono ------------------------------ */\n:host([data-theme="lume"]) {\n  --dw-font: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;\n  --dw-font-display: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;\n  --dw-greeting-size: 22px;\n  --dw-title-tracking: -0.02em;\n  --dw-surface: #ffffff;\n  --dw-surface-2: #f5f5f5;\n  --dw-header-bg: #ffffff;\n  --dw-ink: #0c0c0d;\n  --dw-muted: #8a8a8e;\n  --dw-border: #ebebeb;\n  --dw-accent: #0c0c0d;\n  --dw-accent-fg: #ffffff;\n  --dw-mark-radius: 9px;\n  --dw-bubble-bg: #0c0c0d;\n  --dw-bubble-fg: #ffffff;\n  --dw-user-bg: #f0f0f0;\n  --dw-user-fg: #0c0c0d;\n  --dw-online: #16a34a;\n  --dw-ring: rgba(12, 12, 13, 0.1);\n  --dw-radius: 14px;\n  --dw-radius-sm: 9px;\n  --dw-bubble-size: 56px;\n  --dw-ease: cubic-bezier(0.4, 0, 0.2, 1);\n  --dw-shadow: 0 20px 50px rgba(0, 0, 0, 0.13), 0 4px 12px rgba(0, 0, 0, 0.06);\n  --dw-shadow-bubble: 0 6px 18px rgba(0, 0, 0, 0.2);\n}\n\n/* ---------- THEME: ONYX \u2014 dark luxe ---------------------------------------- */\n:host([data-theme="onyx"]) {\n  --dw-font-display: "Cormorant Garamond", Georgia, serif;\n  --dw-greeting-size: 27px;\n  --dw-surface: #16140f;\n  --dw-surface-2: #211e16;\n  --dw-header-bg: #1b1812;\n  --dw-ink: #f3ede0;\n  --dw-muted: #a99f8a;\n  --dw-border: rgba(233, 214, 170, 0.13);\n  --dw-accent: #cba868;\n  --dw-accent-fg: #1a160d;\n  --dw-bubble-bg: #cba868;\n  --dw-bubble-fg: #1a160d;\n  --dw-user-bg: #2b271c;\n  --dw-user-fg: #f3ede0;\n  --dw-online: #8fce9c;\n  --dw-error-bg: #2b1a18;\n  --dw-error-fg: #f1b6ae;\n  --dw-error-border: #45231f;\n  --dw-ring: rgba(203, 168, 104, 0.28);\n  --dw-radius: 20px;\n  --dw-radius-sm: 13px;\n  --dw-bubble-size: 60px;\n  --dw-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 8px 22px rgba(0, 0, 0, 0.45);\n  --dw-shadow-bubble: 0 12px 30px rgba(0, 0, 0, 0.5);\n}\n\n*, *::before, *::after { box-sizing: border-box; }\nbutton { font-family: inherit; }\n\n/* ============================================================================\n   FLOATING BUBBLE\n   ============================================================================ */\n.dw-bubble {\n  position: fixed;\n  bottom: var(--dw-edge);\n  right: var(--dw-edge);\n  width: var(--dw-bubble-size);\n  height: var(--dw-bubble-size);\n  border-radius: 50%;\n  background: var(--dw-bubble-bg);\n  color: var(--dw-bubble-fg);\n  border: var(--dw-bubble-border, none);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: var(--dw-shadow-bubble);\n  z-index: 2147483647;\n  transition: transform 0.22s var(--dw-ease), box-shadow 0.22s var(--dw-ease);\n}\n.dw-bubble:hover { transform: translateY(-2px) scale(1.04); }\n.dw-bubble:active { transform: translateY(0) scale(0.98); }\n.dw-bubble:focus-visible { outline: 2px solid var(--dw-ring); outline-offset: 4px; }\n.dw-bubble svg { width: 45%; height: 45%; }\n.dw-bubble .dw-bubble-dot {\n  position: absolute;\n  top: 10%; right: 10%;\n  width: 22%; height: 22%;\n  max-width: 13px; max-height: 13px;\n  border-radius: 50%;\n  background: var(--dw-online);\n  border: 2px solid var(--dw-bubble-bg);\n}\n:host([data-open="true"]) .dw-bubble { display: none; }\n\n/* ============================================================================\n   PANEL\n   ============================================================================ */\n.dw-panel {\n  position: fixed;\n  bottom: var(--dw-edge);\n  right: var(--dw-edge);\n  width: var(--dw-panel-w);\n  max-width: calc(100vw - var(--dw-edge) * 2);\n  height: var(--dw-panel-h);\n  max-height: calc(100dvh - var(--dw-edge) * 2);\n  background: var(--dw-surface);\n  border: 1px solid var(--dw-border);\n  border-radius: var(--dw-radius);\n  box-shadow: var(--dw-shadow);\n  display: none;\n  flex-direction: column;\n  overflow: hidden;\n  z-index: 2147483647;\n}\n:host([data-open="true"]) .dw-panel {\n  display: flex;\n  animation: dwPanelIn 0.34s cubic-bezier(0.16, 1, 0.3, 1);\n}\n@keyframes dwPanelIn {\n  from { opacity: 0; transform: translateY(14px) scale(0.985); }\n  to   { opacity: 1; transform: translateY(0) scale(1); }\n}\n\n/* ---- Header --------------------------------------------------------------- */\n.dw-header {\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 11px;\n  padding: 15px 16px;\n  background: var(--dw-header-bg, var(--dw-surface));\n  border-bottom: 1px solid var(--dw-border);\n}\n.dw-mark {\n  flex-shrink: 0;\n  width: 34px; height: 34px;\n  border-radius: var(--dw-mark-radius, 50%);\n  background: var(--dw-accent);\n  color: var(--dw-accent-fg);\n  display: flex; align-items: center; justify-content: center;\n  font-family: var(--dw-font-display);\n  font-weight: 600;\n  font-size: 17px;\n  line-height: 1;\n}\n.dw-head-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }\n.dw-title {\n  font-family: var(--dw-font-display);\n  font-weight: var(--dw-title-weight, 600);\n  font-size: 16px;\n  letter-spacing: var(--dw-title-tracking, -0.01em);\n  color: var(--dw-ink);\n  line-height: 1.1;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dw-subtitle {\n  font-size: 11.5px;\n  color: var(--dw-muted);\n  display: flex; align-items: center; gap: 5px;\n}\n.dw-subtitle::before {\n  content: "";\n  width: 6px; height: 6px; border-radius: 50%;\n  background: var(--dw-online);\n}\n.dw-close {\n  flex-shrink: 0;\n  width: 30px; height: 30px;\n  border-radius: var(--dw-radius-sm);\n  background: transparent;\n  color: var(--dw-muted);\n  border: 0;\n  cursor: pointer;\n  display: flex; align-items: center; justify-content: center;\n  transition: background 0.14s, color 0.14s;\n}\n.dw-close:hover { background: var(--dw-surface-2); color: var(--dw-ink); }\n.dw-close svg { width: 15px; height: 15px; }\n\n/* ---- Error banner ----------------------------------------------------------- */\n.dw-error {\n  flex-shrink: 0;\n  background: var(--dw-error-bg);\n  color: var(--dw-error-fg);\n  padding: 10px 16px;\n  font-size: 12.5px;\n  line-height: 1.4;\n  border-bottom: 1px solid var(--dw-error-border);\n}\n\n/* ---- Thread ----------------------------------------------------------------- */\n.dw-thread {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  scroll-behavior: smooth;\n  background: var(--dw-surface);\n}\n.dw-thread::-webkit-scrollbar { width: 7px; }\n.dw-thread::-webkit-scrollbar-thumb {\n  background: var(--dw-border);\n  border-radius: 99px;\n  border: 2px solid var(--dw-surface);\n}\n\n.dw-greeting {\n  font-family: var(--dw-font-display);\n  font-size: var(--dw-greeting-size, 21px);\n  line-height: 1.25;\n  letter-spacing: -0.01em;\n  color: var(--dw-ink);\n  margin: 2px 0;\n}\n.dw-greeting-sub { font-size: 13px; color: var(--dw-muted); line-height: 1.5; margin: -6px 0 0; }\n\n.dw-suggest-label {\n  font-size: 10.5px;\n  text-transform: uppercase;\n  letter-spacing: 0.09em;\n  font-weight: 600;\n  color: var(--dw-muted);\n  margin-top: 4px;\n}\n.dw-suggestions { display: flex; flex-direction: column; gap: 7px; }\n.dw-chip {\n  text-align: left;\n  background: var(--dw-surface-2);\n  border: 1px solid var(--dw-border);\n  border-radius: var(--dw-radius-sm);\n  padding: 11px 13px;\n  font-size: 13px;\n  line-height: 1.35;\n  color: var(--dw-ink);\n  cursor: pointer;\n  display: flex; align-items: center; gap: 9px;\n  transition: border-color 0.14s, background 0.14s, transform 0.14s;\n}\n.dw-chip:hover { border-color: var(--dw-accent); transform: translateX(2px); }\n.dw-chip svg { width: 14px; height: 14px; color: var(--dw-accent); flex-shrink: 0; }\n\n/* ---- Messages ----------------------------------------------------------------- */\n.dw-msg { max-width: 88%; animation: dwFade 0.24s ease-out; }\n@keyframes dwFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }\n\n.dw-msg-user {\n  align-self: flex-end;\n  background: var(--dw-user-bg);\n  color: var(--dw-user-fg);\n  padding: 9px 13px;\n  border-radius: var(--dw-radius-sm);\n  border-bottom-right-radius: 4px;\n  font-size: 13.5px;\n  line-height: 1.4;\n  word-wrap: break-word;\n}\n.dw-msg-assistant { align-self: flex-start; display: flex; flex-direction: column; gap: 10px; width: 100%; }\n.dw-msg-assistant p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--dw-ink); }\n\n/* ---- Video answer card ----------------------------------------------------- */\n.dw-video-card {\n  width: 100%;\n  border: 1px solid var(--dw-border);\n  border-radius: var(--dw-radius-sm);\n  overflow: hidden;\n  background: var(--dw-surface-2);\n  cursor: pointer;\n  text-align: left;\n  padding: 0;\n  display: block;\n  transition: transform 0.16s var(--dw-ease), box-shadow 0.16s var(--dw-ease), border-color 0.16s;\n}\n.dw-video-card:hover { transform: translateY(-2px); box-shadow: var(--dw-shadow); border-color: var(--dw-accent); }\n.dw-video-card:focus-visible { outline: 2px solid var(--dw-ring); outline-offset: 2px; }\n.dw-thumb {\n  position: relative;\n  aspect-ratio: 16 / 10;\n  background: #1a1a1a center/cover no-repeat;\n  display: block;\n}\n.dw-thumb video {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  object-position: center top;\n  pointer-events: none;\n}\n.dw-thumb::after {\n  content: "";\n  position: absolute; inset: 0;\n  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.55) 100%);\n}\n.dw-play {\n  position: absolute;\n  left: 12px; bottom: 12px;\n  z-index: 1;\n  width: 38px; height: 38px;\n  border-radius: 50%;\n  background: var(--dw-accent);\n  color: var(--dw-accent-fg);\n  display: flex; align-items: center; justify-content: center;\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);\n  transition: transform 0.16s var(--dw-ease);\n}\n.dw-video-card:hover .dw-play { transform: scale(1.08); }\n.dw-play svg { width: 16px; height: 16px; margin-left: 2px; }\n.dw-duration {\n  position: absolute;\n  right: 10px; bottom: 12px;\n  z-index: 1;\n  font-family: var(--dw-font-mono);\n  font-size: 11px;\n  color: #fff;\n  background: rgba(0, 0, 0, 0.55);\n  padding: 3px 7px;\n  border-radius: 6px;\n  font-variant-numeric: tabular-nums;\n}\n.dw-card-foot {\n  padding: 10px 12px;\n  display: flex; align-items: center; gap: 8px;\n}\n.dw-card-foot .dw-tour-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dw-accent); flex-shrink: 0; }\n.dw-card-label { font-size: 12.5px; font-weight: 500; color: var(--dw-ink); line-height: 1.3; }\n\n/* ---- Typing indicator ----------------------------------------------------- */\n.dw-typing { align-self: flex-start; display: inline-flex; gap: 5px; padding: 8px 2px; }\n.dw-typing span {\n  width: 7px; height: 7px; border-radius: 50%;\n  background: var(--dw-muted);\n  animation: dwBounce 1.3s infinite ease-in-out;\n}\n.dw-typing span:nth-child(2) { animation-delay: 0.18s; }\n.dw-typing span:nth-child(3) { animation-delay: 0.36s; }\n@keyframes dwBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.35; } 30% { transform: translateY(-5px); opacity: 1; } }\n\n/* ---- Input ------------------------------------------------------------------ */\n.dw-input-row {\n  flex-shrink: 0;\n  padding: 12px 13px;\n  border-top: 1px solid var(--dw-border);\n  background: var(--dw-header-bg, var(--dw-surface));\n  display: flex; align-items: center; gap: 8px;\n}\n.dw-input {\n  flex: 1; min-width: 0;\n  border: 1px solid var(--dw-border);\n  background: var(--dw-surface-2);\n  border-radius: var(--dw-radius-pill);\n  padding: 11px 15px;\n  font-size: 13.5px;\n  font-family: inherit;\n  color: var(--dw-ink);\n  outline: none;\n  transition: border-color 0.14s, box-shadow 0.14s;\n}\n.dw-input::placeholder { color: var(--dw-muted); }\n.dw-input:focus { border-color: var(--dw-accent); box-shadow: 0 0 0 3px var(--dw-ring); }\n.dw-send {\n  flex-shrink: 0;\n  width: 40px; height: 40px;\n  border-radius: 50%;\n  border: 0;\n  background: var(--dw-accent);\n  color: var(--dw-accent-fg);\n  display: flex; align-items: center; justify-content: center;\n  cursor: pointer;\n  transition: transform 0.14s var(--dw-ease), opacity 0.14s;\n}\n.dw-send:hover:not(:disabled) { transform: scale(1.06); }\n.dw-send:disabled { opacity: 0.4; cursor: not-allowed; }\n.dw-send svg { width: 16px; height: 16px; }\n\n.dw-footer-note {\n  flex-shrink: 0;\n  text-align: center;\n  font-size: 10.5px;\n  color: var(--dw-muted);\n  padding: 0 0 10px;\n  background: var(--dw-header-bg, var(--dw-surface));\n}\n.dw-footer-note b { color: var(--dw-ink); font-weight: 600; }\n\n/* ============================================================================\n   LIGHTBOX  (theme-neutral)\n   ============================================================================ */\n.dw-lightbox {\n  position: fixed; inset: 0; z-index: 2147483647;\n  background: rgba(8, 8, 10, 0.86);\n  backdrop-filter: blur(6px);\n  display: flex;\n  align-items: center; justify-content: center;\n  padding: 5vmin;\n  animation: dwLbFade 0.2s ease-out;\n}\n@keyframes dwLbFade { from { opacity: 0; } to { opacity: 1; } }\n.dw-lb-inner { position: relative; width: min(92vw, 1100px); display: flex; flex-direction: column; gap: 14px; }\n.dw-lb-inner video {\n  width: 100%; aspect-ratio: 16 / 10; background: #000;\n  border-radius: 14px; display: block;\n  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);\n}\n.dw-lb-caption { color: #e9e6df; font-size: 14px; text-align: center; line-height: 1.5; }\n.dw-lb-caption b { color: #fff; font-weight: 600; }\n.dw-lb-close {\n  position: absolute; top: -46px; right: 0;\n  width: 36px; height: 36px; border-radius: 50%;\n  background: rgba(255, 255, 255, 0.12); color: #fff; border: 0;\n  cursor: pointer; display: flex; align-items: center; justify-content: center;\n  transition: background 0.14s;\n}\n.dw-lb-close:hover { background: rgba(255, 255, 255, 0.24); }\n.dw-lb-close svg { width: 18px; height: 18px; }\n\n/* ---- Mobile ------------------------------------------------------------------ */\n@media (max-width: 600px) {\n  .dw-panel {\n    bottom: 0;\n    right: 0;\n    width: 100vw;\n    max-width: 100vw;\n    height: 100dvh;\n    max-height: 100dvh;\n    border-radius: 0;\n    border: 0;\n    padding-bottom: env(safe-area-inset-bottom);\n  }\n  :host([data-open="true"]) .dw-panel { animation: none; }\n}\n\n/* ---- Reduced motion ------------------------------------------------------------ */\n@media (prefers-reduced-motion: reduce) {\n  .dw-bubble, .dw-panel, .dw-msg, .dw-video-card, .dw-lightbox { animation: none; transition: none; }\n}\n';

// src/chat-state.ts
var MAX_TURNS = 2;
function createChatState() {
  let snap = {
    phase: "closed",
    history: [],
    pendingMessage: null,
    lastResponse: null,
    errorKind: null
  };
  const subs = /* @__PURE__ */ new Set();
  function notify() {
    for (const fn of subs) fn(snap);
  }
  function trimHistory(h) {
    const maxEntries = MAX_TURNS * 2;
    if (h.length <= maxEntries) return h;
    return h.slice(h.length - maxEntries);
  }
  function summarizeAnswer(resp) {
    if (resp.kind === "no_match") return resp.text;
    const firstText = resp.parts.find((p) => p.kind === "text");
    return firstText?.kind === "text" ? firstText.text : "(answer)";
  }
  return {
    getState() {
      return snap;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    open() {
      snap = { ...snap, phase: "open-idle" };
      notify();
    },
    close() {
      snap = { ...snap, phase: "closed" };
      notify();
    },
    submitMessage(text) {
      snap = {
        ...snap,
        phase: "awaiting",
        pendingMessage: text,
        history: trimHistory([...snap.history, { role: "user", content: text }])
      };
      notify();
    },
    receiveAnswer(resp) {
      snap = {
        ...snap,
        phase: "open-idle",
        pendingMessage: null,
        lastResponse: resp,
        history: trimHistory([...snap.history, { role: "assistant", content: summarizeAnswer(resp) }])
      };
      notify();
    },
    receiveError(kind) {
      snap = { ...snap, phase: "error", errorKind: kind };
      notify();
    },
    clearError() {
      snap = { ...snap, phase: "open-idle", errorKind: null };
      notify();
    }
  };
}

// src/api.ts
var ApiError = class extends Error {
  constructor(status, retryAfterSec, message) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
};
async function callWithRetry(doIt, parseOk) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await doIt();
    if (res.ok) return parseOk(res);
    const retryAfterHeader = res.headers.get?.("Retry-After") ?? null;
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : 0;
    lastErr = new ApiError(res.status, retryAfterSec, `HTTP ${res.status}`);
    if (res.status !== 502) throw lastErr;
  }
  throw lastErr;
}
function createApi(opts) {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");
  return {
    async chat(req) {
      return callWithRetry(
        () => fetchFn(`${base}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req)
        }),
        (r) => r.json()
      );
    },
    async getConfig(widgetId) {
      return callWithRetry(
        () => fetchFn(`${base}/widget-config/${encodeURIComponent(widgetId)}`),
        (r) => r.json()
      );
    }
  };
}

// src/render-parts.ts
var PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
function renderParts(root, parts, onPlay, resolveSource) {
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const part of parts) {
    if (part.kind === "text") {
      const p = document.createElement("p");
      p.textContent = part.text;
      root.appendChild(p);
    } else {
      root.appendChild(renderVideoPart(part, onPlay, resolveSource(part)));
    }
  }
}
function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1e3));
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function renderVideoPart(part, onPlay, source) {
  const card = document.createElement("button");
  card.className = "dw-video-card";
  card.type = "button";
  card.setAttribute("aria-label", `Play clip: ${part.caption}`);
  const thumb = document.createElement("span");
  thumb.className = "dw-thumb";
  if (source.posterUrl) {
    thumb.style.backgroundImage = `url("${source.posterUrl}")`;
  } else {
    const startSec = (part.startMs / 1e3).toFixed(3).replace(/\.?0+$/, "");
    const video = document.createElement("video");
    video.src = `${source.mp4Url}#t=${startSec}`;
    video.setAttribute("preload", "metadata");
    video.setAttribute("playsinline", "");
    video.muted = true;
    thumb.appendChild(video);
  }
  const play = document.createElement("span");
  play.className = "dw-play";
  play.innerHTML = PLAY_SVG;
  thumb.appendChild(play);
  const dur = document.createElement("span");
  dur.className = "dw-duration";
  dur.textContent = formatDuration(part.endMs - part.startMs);
  thumb.appendChild(dur);
  const foot = document.createElement("span");
  foot.className = "dw-card-foot";
  const dot = document.createElement("span");
  dot.className = "dw-tour-dot";
  const label = document.createElement("span");
  label.className = "dw-card-label";
  label.textContent = part.caption;
  foot.appendChild(dot);
  foot.appendChild(label);
  card.addEventListener("click", () => onPlay(part));
  card.appendChild(thumb);
  card.appendChild(foot);
  return card;
}

// src/manifest.ts
async function loadManifest(url, fetchFn = fetch) {
  const byId = /* @__PURE__ */ new Map();
  try {
    const res = await fetchFn(url);
    if (!res.ok) return byId;
    const manifest = await res.json();
    if (!Array.isArray(manifest?.demos)) return byId;
    for (const d of manifest.demos) {
      if (d?.demoId && d?.videoUrl) byId.set(d.demoId, d);
    }
  } catch {
  }
  return byId;
}
function resolveVideoSource(part, demos) {
  const demo = demos.get(part.demoId);
  if (!demo) return { mp4Url: part.mp4Url };
  return { mp4Url: demo.videoUrl, posterUrl: demo.posterUrl, title: demo.title };
}

// src/locales/en.json
var en_default = {
  greeting: "Hi! Ask me how to do anything.",
  inputPlaceholder: "Type a question\u2026",
  send: "Send",
  open: "Open product help",
  close: "Close",
  back: "Back",
  suggestedHeader: "Try:",
  rateLimitMessage: "Too many questions \u2014 give me a moment.",
  upstreamErrorMessage: "Couldn't reach the assistant. Try again.",
  noMatchPrefix: "I don't have that in the demos. Try:",
  notConfiguredMessage: "This help widget is not configured.",
  caption: "Caption",
  subtitle: "How-to assistant",
  greetingSub: "Ask a question and I'll point you to the exact moment in a short walkthrough.",
  footerNote: "Answers shown as clips \u2014 powered by"
};

// src/locales/es.json
var es_default = {
  greeting: "\xA1Hola! Preg\xFAntame c\xF3mo hacer cualquier cosa.",
  inputPlaceholder: "Escribe una pregunta\u2026",
  send: "Enviar",
  open: "Abrir ayuda del producto",
  close: "Cerrar",
  back: "Atr\xE1s",
  suggestedHeader: "Prueba:",
  rateLimitMessage: "Demasiadas preguntas \u2014 dame un momento.",
  upstreamErrorMessage: "No pude contactar al asistente. Intenta de nuevo.",
  noMatchPrefix: "No tengo eso en las demos. Prueba:",
  notConfiguredMessage: "Este widget de ayuda no est\xE1 configurado.",
  caption: "Subt\xEDtulo",
  subtitle: "Asistente de ayuda",
  greetingSub: "Haz una pregunta y te llevar\xE9 al momento exacto de un breve tutorial.",
  footerNote: "Respuestas en forma de clips \u2014 con tecnolog\xEDa de"
};

// src/locales/fr.json
var fr_default = {
  greeting: "Bonjour ! Demandez-moi comment faire n'importe quoi.",
  inputPlaceholder: "Tapez une question\u2026",
  send: "Envoyer",
  open: "Ouvrir l'aide produit",
  close: "Fermer",
  back: "Retour",
  suggestedHeader: "Essayez :",
  rateLimitMessage: "Trop de questions \u2014 donnez-moi un instant.",
  upstreamErrorMessage: "Impossible de joindre l'assistant. R\xE9essayez.",
  noMatchPrefix: "Je n'ai pas \xE7a dans les d\xE9mos. Essayez :",
  notConfiguredMessage: "Ce widget d'aide n'est pas configur\xE9.",
  caption: "L\xE9gende",
  subtitle: "Assistant d'aide",
  greetingSub: "Posez une question et je vous montrerai le moment exact dans une courte d\xE9monstration.",
  footerNote: "R\xE9ponses sous forme de clips \u2014 propuls\xE9 par"
};

// src/locales/de.json
var de_default = {
  greeting: "Hi! Frag mich, wie man etwas macht.",
  inputPlaceholder: "Stelle eine Frage\u2026",
  send: "Senden",
  open: "Produkthilfe \xF6ffnen",
  close: "Schlie\xDFen",
  back: "Zur\xFCck",
  suggestedHeader: "Versuche:",
  rateLimitMessage: "Zu viele Fragen \u2014 gib mir einen Moment.",
  upstreamErrorMessage: "Konnte den Assistenten nicht erreichen. Versuche es erneut.",
  noMatchPrefix: "Ich habe das nicht in den Demos. Versuche:",
  notConfiguredMessage: "Dieses Hilfe-Widget ist nicht konfiguriert.",
  caption: "Untertitel",
  subtitle: "Hilfe-Assistent",
  greetingSub: "Stelle eine Frage und ich zeige dir den genauen Moment in einem kurzen Rundgang.",
  footerNote: "Antworten als Clips \u2014 bereitgestellt von"
};

// src/locales/ja.json
var ja_default = {
  greeting: "\u3053\u3093\u306B\u3061\u306F\uFF01\u4F55\u3067\u3082\u8CEA\u554F\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  inputPlaceholder: "\u8CEA\u554F\u3092\u5165\u529B\u2026",
  send: "\u9001\u4FE1",
  open: "\u30D8\u30EB\u30D7\u3092\u958B\u304F",
  close: "\u9589\u3058\u308B",
  back: "\u623B\u308B",
  suggestedHeader: "\u4F8B:",
  rateLimitMessage: "\u8CEA\u554F\u304C\u591A\u3059\u304E\u307E\u3059 \u2014 \u5C11\u3057\u5F85\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
  upstreamErrorMessage: "\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  noMatchPrefix: "\u30C7\u30E2\u306B\u305D\u308C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u304A\u8A66\u3057\u304F\u3060\u3055\u3044:",
  notConfiguredMessage: "\u3053\u306E\u30D8\u30EB\u30D7\u30A6\u30A3\u30B8\u30A7\u30C3\u30C8\u306F\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
  caption: "\u30AD\u30E3\u30D7\u30B7\u30E7\u30F3",
  subtitle: "\u64CD\u4F5C\u30AC\u30A4\u30C9\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8",
  greetingSub: "\u8CEA\u554F\u3059\u308B\u3068\u3001\u77ED\u3044\u30A6\u30A9\u30FC\u30AF\u30B9\u30EB\u30FC\u306E\u8A72\u5F53\u7B87\u6240\u3092\u30D4\u30F3\u30DD\u30A4\u30F3\u30C8\u3067\u3054\u6848\u5185\u3057\u307E\u3059\u3002",
  footerNote: "\u56DE\u7B54\u306F\u30AF\u30EA\u30C3\u30D7\u3067\u8868\u793A \u2014 \u63D0\u4F9B:"
};

// src/locales/pt.json
var pt_default = {
  greeting: "Oi! Pergunte-me como fazer qualquer coisa.",
  inputPlaceholder: "Digite uma pergunta\u2026",
  send: "Enviar",
  open: "Abrir ajuda do produto",
  close: "Fechar",
  back: "Voltar",
  suggestedHeader: "Experimente:",
  rateLimitMessage: "Muitas perguntas \u2014 d\xEA-me um momento.",
  upstreamErrorMessage: "N\xE3o consegui contatar o assistente. Tente novamente.",
  noMatchPrefix: "N\xE3o tenho isso nas demos. Experimente:",
  notConfiguredMessage: "Este widget de ajuda n\xE3o est\xE1 configurado.",
  caption: "Legenda",
  subtitle: "Assistente de ajuda",
  greetingSub: "Fa\xE7a uma pergunta e eu aponto o momento exato em um breve tutorial.",
  footerNote: "Respostas em forma de clipes \u2014 desenvolvido por"
};

// src/locales/zh-CN.json
var zh_CN_default = {
  greeting: "\u4F60\u597D\uFF01\u8BF7\u95EE\u5982\u4F55\u64CD\u4F5C\uFF1F",
  inputPlaceholder: "\u8F93\u5165\u95EE\u9898\u2026",
  send: "\u53D1\u9001",
  open: "\u6253\u5F00\u4EA7\u54C1\u5E2E\u52A9",
  close: "\u5173\u95ED",
  back: "\u8FD4\u56DE",
  suggestedHeader: "\u8BD5\u8BD5\uFF1A",
  rateLimitMessage: "\u95EE\u9898\u592A\u591A \u2014 \u8BF7\u7A0D\u5019\u3002",
  upstreamErrorMessage: "\u65E0\u6CD5\u8FDE\u63A5\u5230\u52A9\u624B\u3002\u8BF7\u91CD\u8BD5\u3002",
  noMatchPrefix: "\u6F14\u793A\u4E2D\u6CA1\u6709\u76F8\u5173\u5185\u5BB9\u3002\u8BD5\u8BD5\uFF1A",
  notConfiguredMessage: "\u6B64\u5E2E\u52A9\u5C0F\u90E8\u4EF6\u672A\u914D\u7F6E\u3002",
  caption: "\u5B57\u5E55",
  subtitle: "\u64CD\u4F5C\u6307\u5357\u52A9\u624B",
  greetingSub: "\u63D0\u51FA\u95EE\u9898\uFF0C\u6211\u4F1A\u5E26\u4F60\u76F4\u8FBE\u77ED\u89C6\u9891\u6F14\u793A\u4E2D\u7684\u786E\u5207\u65F6\u523B\u3002",
  footerNote: "\u56DE\u7B54\u4EE5\u7247\u6BB5\u5F62\u5F0F\u5448\u73B0 \u2014 \u6280\u672F\u652F\u6301\uFF1A"
};

// src/locales/it.json
var it_default = {
  greeting: "Ciao! Chiedimi come fare qualsiasi cosa.",
  inputPlaceholder: "Digita una domanda\u2026",
  send: "Invia",
  open: "Apri aiuto prodotto",
  close: "Chiudi",
  back: "Indietro",
  suggestedHeader: "Prova:",
  rateLimitMessage: "Troppe domande \u2014 un attimo.",
  upstreamErrorMessage: "Impossibile raggiungere l'assistente. Riprova.",
  noMatchPrefix: "Non ho quello nelle demo. Prova:",
  notConfiguredMessage: "Questo widget di aiuto non \xE8 configurato.",
  caption: "Didascalia",
  subtitle: "Assistente di aiuto",
  greetingSub: "Fai una domanda e ti indicher\xF2 il momento esatto in una breve guida.",
  footerNote: "Risposte sotto forma di clip \u2014 realizzato con"
};

// src/locale.ts
var BUNDLES = {
  en: en_default,
  es: es_default,
  fr: fr_default,
  de: de_default,
  ja: ja_default,
  pt: pt_default,
  "zh-CN": zh_CN_default,
  it: it_default
};
function getStrings(locale) {
  if (locale in BUNDLES) return BUNDLES[locale];
  return BUNDLES.en;
}
function resolveLocale(input) {
  const candidates = [input.override, input.htmlLang, input.navigatorLang].filter(Boolean);
  for (const c of candidates) {
    if (c in BUNDLES) return c;
    const short = c.split("-")[0];
    if (short in BUNDLES) return short;
  }
  return "en";
}

// src/mount.ts
var CHAT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
var CLOSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
var SEND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>`;
var SPARK_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2z"/></svg>`;
async function mount(opts) {
  const host = document.createElement("div");
  host.id = "daymo-widget-root";
  host.setAttribute("data-open", "false");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles_default;
  shadow.appendChild(style);
  const locale = resolveLocale({
    override: opts.localeOverride,
    htmlLang: document.documentElement.lang,
    navigatorLang: navigator.language
  });
  const strings = getStrings(locale);
  const api = createApi({ baseUrl: opts.baseUrl });
  const state = createChatState();
  let config = null;
  try {
    config = await api.getConfig(opts.widgetId);
  } catch {
  }
  const theme = opts.theme ?? config?.theme;
  if (theme) {
    host.setAttribute("data-theme", theme);
  } else if (config?.brandColor) {
    host.style.setProperty("--dw-accent", config.brandColor);
    host.style.setProperty("--dw-bubble-bg", config.brandColor);
  }
  let demos = /* @__PURE__ */ new Map();
  const manifestUrl = opts.manifestUrl ?? config?.manifestUrl;
  if (manifestUrl) {
    void loadManifest(manifestUrl).then((m) => {
      demos = m;
      if (state.getState().phase !== "closed") renderThread();
    });
  }
  const bubble = document.createElement("button");
  bubble.className = "dw-bubble";
  bubble.setAttribute("aria-label", strings.open);
  bubble.innerHTML = `${CHAT_SVG}<span class="dw-bubble-dot"></span>`;
  shadow.appendChild(bubble);
  let panel = null;
  let thread = null;
  let input = null;
  let errorBanner = null;
  let sendBtn = null;
  let lightbox = null;
  let lightboxVideo = null;
  let lightboxCaption = null;
  let lightboxClipEnd = null;
  function buildLightbox() {
    lightbox = document.createElement("div");
    lightbox.className = "dw-lightbox";
    lightbox.style.display = "none";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    const inner = document.createElement("div");
    inner.className = "dw-lb-inner";
    const closeBtn = document.createElement("button");
    closeBtn.className = "dw-lb-close";
    closeBtn.setAttribute("aria-label", strings.close);
    closeBtn.innerHTML = CLOSE_SVG;
    closeBtn.addEventListener("click", closeLightbox);
    inner.appendChild(closeBtn);
    lightboxVideo = document.createElement("video");
    lightboxVideo.controls = true;
    lightboxVideo.setAttribute("playsinline", "");
    lightboxVideo.addEventListener("timeupdate", () => {
      if (lightboxClipEnd !== null && lightboxVideo.currentTime >= lightboxClipEnd) {
        lightboxVideo.pause();
      }
    });
    inner.appendChild(lightboxVideo);
    lightboxCaption = document.createElement("div");
    lightboxCaption.className = "dw-lb-caption";
    inner.appendChild(lightboxCaption);
    lightbox.appendChild(inner);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    shadow.appendChild(lightbox);
  }
  function openLightbox(part) {
    if (!lightbox) buildLightbox();
    const source = resolveVideoSource(part, demos);
    const startSec = part.startMs / 1e3;
    const endSec = part.endMs / 1e3;
    lightboxClipEnd = endSec;
    lightboxVideo.src = `${source.mp4Url}#t=${startSec.toFixed(3)},${endSec.toFixed(3)}`;
    if (source.posterUrl) lightboxVideo.poster = source.posterUrl;
    lightboxCaption.textContent = "";
    const b = document.createElement("b");
    b.textContent = part.caption;
    lightboxCaption.appendChild(b);
    if (source.title) lightboxCaption.appendChild(document.createTextNode(` \u2014 ${source.title}`));
    lightbox.style.display = "flex";
    lightboxVideo.currentTime = startSec;
    lightboxVideo.play().catch(() => {
    });
  }
  function closeLightbox() {
    if (!lightbox || !lightboxVideo) return;
    lightboxVideo.pause();
    lightbox.style.display = "none";
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox && lightbox.style.display !== "none") {
      closeLightbox();
    }
  });
  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "dw-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    const name = config?.name ?? opts.widgetId;
    const header = document.createElement("div");
    header.className = "dw-header";
    const mark = document.createElement("div");
    mark.className = "dw-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = name.trim().charAt(0).toUpperCase();
    header.appendChild(mark);
    const headText = document.createElement("div");
    headText.className = "dw-head-text";
    const title = document.createElement("div");
    title.id = "chat-title";
    title.className = "dw-title";
    title.textContent = name;
    panel.setAttribute("aria-labelledby", "chat-title");
    const subtitle = document.createElement("div");
    subtitle.className = "dw-subtitle";
    subtitle.textContent = strings.subtitle;
    headText.appendChild(title);
    headText.appendChild(subtitle);
    header.appendChild(headText);
    const closeBtn = document.createElement("button");
    closeBtn.className = "dw-close";
    closeBtn.setAttribute("aria-label", strings.close);
    closeBtn.innerHTML = CLOSE_SVG;
    closeBtn.addEventListener("click", () => state.close());
    header.appendChild(closeBtn);
    panel.appendChild(header);
    errorBanner = document.createElement("div");
    errorBanner.className = "dw-error";
    errorBanner.style.display = "none";
    panel.appendChild(errorBanner);
    thread = document.createElement("div");
    thread.className = "dw-thread";
    panel.appendChild(thread);
    const inputRow = document.createElement("div");
    inputRow.className = "dw-input-row";
    input = document.createElement("input");
    input.className = "dw-input";
    input.type = "text";
    input.placeholder = strings.inputPlaceholder;
    input.setAttribute("aria-label", strings.inputPlaceholder);
    sendBtn = document.createElement("button");
    sendBtn.className = "dw-send";
    sendBtn.setAttribute("aria-label", strings.send);
    sendBtn.innerHTML = SEND_SVG;
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);
    const footer = document.createElement("div");
    footer.className = "dw-footer-note";
    footer.appendChild(document.createTextNode(`${strings.footerNote} `));
    const brand = document.createElement("b");
    brand.textContent = "Daymo";
    footer.appendChild(brand);
    panel.appendChild(footer);
    function submit() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      ask(text);
    }
    sendBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    shadow.appendChild(panel);
  }
  function ask(text) {
    if (state.getState().phase === "awaiting") return;
    state.submitMessage(text);
    void sendChat(text);
  }
  function makeChip(question) {
    const chip = document.createElement("button");
    chip.className = "dw-chip";
    chip.innerHTML = SPARK_SVG;
    const label = document.createElement("span");
    label.textContent = question;
    chip.appendChild(label);
    chip.addEventListener("click", () => ask(question));
    return chip;
  }
  function renderThread() {
    if (!thread) return;
    while (thread.firstChild) thread.removeChild(thread.firstChild);
    const s = state.getState();
    if (s.history.length === 0) {
      const greet = document.createElement("div");
      greet.className = "dw-greeting";
      greet.textContent = strings.greeting;
      thread.appendChild(greet);
      const greetSub = document.createElement("div");
      greetSub.className = "dw-greeting-sub";
      greetSub.textContent = strings.greetingSub;
      thread.appendChild(greetSub);
      const suggested = config?.suggestedQuestions ?? [];
      if (suggested.length > 0) {
        const header = document.createElement("div");
        header.className = "dw-suggest-label";
        header.textContent = strings.suggestedHeader;
        thread.appendChild(header);
        const wrap = document.createElement("div");
        wrap.className = "dw-suggestions";
        for (const q of suggested) wrap.appendChild(makeChip(q));
        thread.appendChild(wrap);
      }
    }
    for (let i = 0; i < s.history.length; i++) {
      const turn = s.history[i];
      if (turn.role === "user") {
        const el = document.createElement("div");
        el.className = "dw-msg dw-msg-user";
        el.textContent = turn.content;
        thread.appendChild(el);
      } else {
        const isLast = i === s.history.length - 1;
        const wrap = document.createElement("div");
        wrap.className = "dw-msg dw-msg-assistant";
        if (isLast && s.lastResponse) {
          if (s.lastResponse.kind === "answer") {
            renderParts(wrap, s.lastResponse.parts, openLightbox, (p) => resolveVideoSource(p, demos));
          } else {
            const p = document.createElement("p");
            p.textContent = `${strings.noMatchPrefix} ${s.lastResponse.text}`;
            wrap.appendChild(p);
            if (s.lastResponse.suggestions?.length) {
              const sugg = document.createElement("div");
              sugg.className = "dw-suggestions";
              for (const q of s.lastResponse.suggestions) sugg.appendChild(makeChip(q));
              wrap.appendChild(sugg);
            }
          }
        } else {
          const p = document.createElement("p");
          p.textContent = turn.content;
          wrap.appendChild(p);
        }
        thread.appendChild(wrap);
      }
    }
    if (s.phase === "awaiting") {
      const typing = document.createElement("div");
      typing.className = "dw-typing";
      typing.innerHTML = `<span></span><span></span><span></span>`;
      thread.appendChild(typing);
    }
    thread.scrollTop = thread.scrollHeight;
  }
  function renderError() {
    if (!errorBanner) return;
    const s = state.getState();
    if (s.phase !== "error") {
      errorBanner.style.display = "none";
      return;
    }
    errorBanner.style.display = "block";
    errorBanner.textContent = s.errorKind === "ratelimit" ? strings.rateLimitMessage : s.errorKind === "not-configured" ? strings.notConfiguredMessage : strings.upstreamErrorMessage;
  }
  async function sendChat(text) {
    try {
      const resp = await api.chat({
        widgetId: opts.widgetId,
        message: text,
        history: state.getState().history.slice(0, -1),
        locale
      });
      state.receiveAnswer(resp);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) state.receiveError("ratelimit");
      else if (e instanceof ApiError && e.status === 404) state.receiveError("not-configured");
      else state.receiveError("upstream");
    }
  }
  state.subscribe(() => {
    const s = state.getState();
    if (s.phase === "closed") {
      host.setAttribute("data-open", "false");
    } else {
      if (!panel) buildPanel();
      host.setAttribute("data-open", "true");
      renderThread();
      renderError();
      if (sendBtn) sendBtn.disabled = s.phase === "awaiting";
      if (s.phase === "open-idle" && input) input.focus();
    }
  });
  bubble.addEventListener("click", () => state.open());
}

// src/widget.ts
function init() {
  const script = document.currentScript ?? document.querySelector("script[data-widget-id]");
  if (!script) {
    console.warn("[daymo-widget] script tag with data-widget-id not found");
    return;
  }
  const widgetId = script.getAttribute("data-widget-id");
  const baseUrl = script.getAttribute("data-base-url") ?? new URL(script.src).origin;
  const locale = script.getAttribute("data-locale") ?? void 0;
  const theme = script.getAttribute("data-theme") ?? void 0;
  const manifestUrl = script.getAttribute("data-manifest-url") ?? void 0;
  if (!widgetId) {
    console.warn("[daymo-widget] data-widget-id is required");
    return;
  }
  mount({ widgetId, baseUrl, localeOverride: locale ?? void 0, theme, manifestUrl }).catch((err) => {
    console.error("[daymo-widget] mount failed:", err);
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
//# sourceMappingURL=widget.js.map
