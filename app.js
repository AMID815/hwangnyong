"use strict";
/* 코스피200 상대강도 대시보드 — rs-latest.json(data 브랜치) fetch 후 렌더.
   데이터 계약: docs/web-data-contract.md (스크리너 프로젝트) — v2 windows+big_value 스키마.
   windows 키는 하드코딩하지 않고 순회(RS_WINDOWS 설정 변화 대응). */

const DATA_URL = "https://raw.githubusercontent.com/AMID815/hwangnyong/data/rs-latest.json";
const IDX_ORDER = ["201", "401", "150", "772"]; // 지수 표시 순서 — 그 외 코드는 뒤에
const TIER_ORDER = ["1000", "700"];             // 표시 순서 — 데이터에 있는 것만 노출
const TIER_LABEL = { "1000": "1,000억+", "700": "700억+" };
const SORTS = [["value", "거래대금순"], ["strong", "강한순"], ["weak", "약한순"]];
const STALE_MS = 5 * 60 * 1000;                 // 탭 복귀 시 이보다 오래됐으면 재로딩

let data = null, indicesMap = {}, loadedAt = 0;
let idx = null, win = null, dir = "강세", tier = "all", sort = "value";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,
  m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const sign = n => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2);
const dashDate = d => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
const shortDate = d => /^\d{8}$/.test(d) ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
function weekday(d) {
  if (!/^\d{8}$/.test(d)) return "";
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
  return "일월화수목금토"[t.getUTCDay()];
}
// 조 단위 넘어가면 N조M억 (예: 180761 → 18조761억, 20000 → 2조)
function eok(e) {
  e = Math.round(e);
  if (e >= 10000) {
    const jo = Math.floor(e / 10000), rem = e % 10000;
    return rem > 0 ? `${jo}조${rem.toLocaleString("en-US")}억` : `${jo}조`;
  }
  return `${e.toLocaleString("en-US")}억`;
}
// v2.1 다지수(indices) 우선, v2 단일 스키마는 코스피200 하나로 정규화
function buildIndicesMap(d) {
  if (d && d.indices && Object.keys(d.indices).length) return d.indices;
  if (d && d.windows && Object.keys(d.windows).length)
    return { "201": { name: "코스피200", index: d.index, windows: d.windows } };
  return {};
}
// 숫자형 키 객체는 삽입 순서가 무시됨(JS 스펙: 정수형 키는 오름차순) — 순서를 직접 계산
const idxKeys = () =>
  IDX_ORDER.filter(cd => indicesMap[cd])
    .concat(Object.keys(indicesMap).filter(cd => !IDX_ORDER.includes(cd)));
const curIdx = () => indicesMap[idx] || {};
const idxLabel = cd => (indicesMap[cd] && indicesMap[cd].name) || cd;
const winKeys = () => Object.keys(curIdx().windows || {}).sort((a, b) => +a - +b);
const curWin = () => (curIdx().windows || {})[win] || {};

function showNotice(html, warn) {
  const n = $("notice");
  n.innerHTML = html;
  n.className = "notice" + (warn ? " warn" : "");
  n.hidden = false;
}
function hideNotice() { $("notice").hidden = true; }

// ---- header ----
function renderHeader() {
  $("meta").innerHTML =
    `<span class="num">${dashDate(data.date)}</span> (${weekday(data.date)}) · 15:37 마감 기준 · 키움`;
  const im = curIdx().index || {};
  $("stats").innerHTML = winKeys().map(n => {
    const m = im["merged_" + n], ws = im["window_start_" + n];
    if (m == null) return "";
    return `<div class="stat ${m >= 0 ? "up" : "down"}">
      <div class="k">${esc(idxLabel(idx))} 몸통 · ${n}캔들</div>
      <div class="v num">${sign(m)}<span style="font-size:14px">%</span></div>
      <div class="cap">${ws ? shortDate(ws) + " 시가 → 오늘 종가" : ""}</div></div>`;
  }).join("");
}

// ---- tabs ----
function buildTabs() {
  const idxSeg = $("idxSeg"), winSeg = $("winSeg"), dirSeg = $("dirSeg"), tierSeg = $("tierSeg");
  idxSeg.querySelectorAll("button").forEach(b => b.remove());
  idxKeys().forEach(cd => idxSeg.insertAdjacentHTML("beforeend",
    `<button role="tab" data-i="${cd}" aria-selected="${cd === idx}">${esc(idxLabel(cd))}</button>`));
  idxSeg.hidden = idxKeys().length <= 1;
  winSeg.querySelectorAll("button").forEach(b => b.remove());
  winKeys().forEach(k => winSeg.insertAdjacentHTML("beforeend",
    `<button role="tab" data-w="${k}" aria-selected="${k === win}">${k}캔들</button>`));
  dirSeg.querySelectorAll("button").forEach(b => b.remove());
  [["강세", "강세 (지수보다↑)"], ["약세", "약세 (지수보다↓)"]].forEach(([k, l]) =>
    dirSeg.insertAdjacentHTML("beforeend",
      `<button role="tab" data-d="${k}" aria-selected="${k === dir}">${l}</button>`));
  const bv = curWin().big_value || {};
  const tiers = ["all"].concat(TIER_ORDER.filter(t => Array.isArray(bv[t])));
  if (!tiers.includes(tier)) tier = "all";
  tierSeg.querySelectorAll("button").forEach(b => b.remove());
  tiers.forEach(k => tierSeg.insertAdjacentHTML("beforeend",
    `<button role="tab" data-t="${k}" aria-selected="${k === tier}">${k === "all" ? "전체" : TIER_LABEL[k]}</button>`));
  tierSeg.parentElement.hidden = false;
  tierSeg.hidden = tiers.length <= 1;
}

// ---- rows ----
function chipsRS(r) {
  let s = "";
  if (r.loss) s += `<span class="chip loss">적자</span>`;
  const vr = r.value_ratio;
  if (vr != null) s += vr >= 2
    ? `<span class="chip fire">🔥${vr.toFixed(1)}×</span>`
    : `<span class="chip v">${vr.toFixed(1)}×</span>`;
  if ((r.appearances || 0) >= 2) s += `<span class="chip star">★${r.appearances}</span>`;
  return s;
}
// 재무 서브라인 (2026-07-23) — ROE · PER · 52주 고점 대비. 필드 없으면 줄 생략(구 데이터 호환)
function fundLine(r) {
  if (r.roe == null && r.per == null && r.hi52 == null) return "";
  const roe = r.roe == null ? "—"
    : (r.roe < 0 ? `<span class="neg">${r.roe.toFixed(1)}</span>` : r.roe.toFixed(1));
  const per = r.per == null ? "—" : r.per.toFixed(1);
  let hi = "—";
  if (r.hi52 != null) {
    const t = `${sign(r.hi52)}%`;
    hi = r.hi52 >= -5 ? `<span class="hot">${t}</span>` : t;  // 신고가 −5% 이내 = 금색
  }
  return `<div class="fund num"><span>ROE <b>${roe}</b></span><span>PER <b>${per}</b></span><span>고점 <b>${hi}</b></span></div>`;
}
function rowRS(r, maxAbs, i) {
  const cls = r.rs >= 0 ? "p" : "n";
  const mgColor = r.merged_return >= 0 ? "up" : "down";
  const w = Math.max(4, Math.round(Math.abs(r.rs) / (maxAbs || 1) * 100));
  return `<li><div class="row">
    <div class="top">
      <span class="rank num">${i}</span>
      <span class="name">${esc(r.name)}<span class="code">${esc(r.code)}</span></span>
      <span class="chips">${chipsRS(r)}</span>
    </div>
    <div class="metrics">
      <span class="rs ${cls} num">${sign(r.rs)}<span class="u">%p</span></span>
      <span class="sub2 num">몸통 <b style="color:var(--${mgColor})">${sign(r.merged_return)}%</b> · <span style="color:var(--dim)">${eok(r.trading_value_eok)}</span></span>
    </div>
    ${fundLine(r)}
    <div class="bar"><i class="${cls}" style="width:${w}%"></i></div>
  </div></li>`;
}
function rowTier(r, winN, i) {
  const rsHtml = r.rs == null
    ? `<span class="rs none num">—</span>`
    : `<span class="rs ${r.rs >= 0 ? "p" : "n"} num">${sign(r.rs)}<span class="u">%p</span></span>`;
  const w = Math.min(100, Math.round((r.days || 0) / winN * 100));
  return `<li><div class="row tierrow">
    <div class="top">
      <span class="rank tier num">${i}</span>
      <span class="name">${esc(r.name)}<span class="code">${esc(r.code)}</span></span>
      ${r.loss ? '<span class="chip loss">적자</span>' : ""}
      ${r.new_breach ? '<span class="chip new">🆕</span>' : ""}
      ${rsHtml}
    </div>
    <div class="metrics">
      <span class="big num">${eok(r.max_value_eok)}</span>
      <span class="sub2 num" style="color:var(--faint)">최대 ${shortDate(r.max_value_dt)}</span>
      <span class="sub2 num">돌파 <b class="brk">${r.days}일</b></span>
    </div>
    ${fundLine(r)}
    <div class="bar"><i class="g" style="width:${w}%"></i></div>
  </div></li>`;
}

// 선택 조합의 티어 종목 = 1,000억+ (∪ 700억 구간) 를 방향(RS 부호)으로 필터.
// rs가 null(평가 제외)인 종목은 방향을 알 수 없어 양쪽 모두에 표시(정렬은 맨 뒤).
function tierRows() {
  const bv = curWin().big_value || {};
  let rows = (bv["1000"] || []).slice();
  if (tier === "700") rows = rows.concat(bv["700"] || []);
  const up = dir === "강세";
  rows = rows.filter(r => r.rs == null || (up ? r.rs >= 0 : r.rs < 0));
  if (sort === "strong") rows.sort((a, b) => (b.rs ?? -1e9) - (a.rs ?? -1e9));
  else if (sort === "weak") rows.sort((a, b) => (a.rs ?? 1e9) - (b.rs ?? 1e9));
  else rows.sort((a, b) => b.max_value_eok - a.max_value_eok);
  return rows;
}

// ---- main render ----
function render() {
  if (!winKeys().includes(win)) win = winKeys()[0] || null;  // 지수 전환 시 창 재검증
  renderHeader();  // 지수 몸통 카드도 선택 지수 기준
  buildTabs();
  const lead = $("lead"), sortEl = $("sortEl"), list = $("list");
  lead.hidden = false;
  const up = dir === "강세", col = up ? "up" : "down";
  if (tier === "all") {           // 거래대금 무관 순수 RS 랭킹 (strong/weak 이미 정렬돼 옴)
    sortEl.innerHTML = "";
    const rows = curWin()[up ? "strong" : "weak"] || [];
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.rs)), 0);
    lead.innerHTML = `<b>${win}캔들 · ${dir} · 전체 <span style="color:var(--${col})">${rows.length}종목</span></b><span class="hint">${up ? "지수보다 강함 · RS 높은 순" : "지수보다 약함(소외) · RS 낮은 순"}</span>`;
    list.innerHTML = rows.length
      ? rows.map((r, i) => rowRS(r, maxAbs, i + 1)).join("")
      : `<li class="empty">해당 종목 없음</li>`;
    return;
  }
  const rows = tierRows();
  const t = TIER_LABEL[tier];
  lead.innerHTML = `<b>${win}캔들 · ${dir} · ${t} <span style="color:var(--${col})">${rows.length}종목</span></b><span class="hint">하루라도 ${t} 거래 · ${up ? "지수↑" : "지수↓"}</span>`;
  sortEl.innerHTML = `<span class="lab">정렬</span>` + SORTS.map(([k, l]) =>
    `<button data-sort="${k}" aria-selected="${k === sort}">${l}</button>`).join("");
  list.innerHTML = rows.length
    ? rows.map((r, i) => rowTier(r, parseInt(win, 10), i + 1)).join("")
    : `<li class="empty">해당 종목 없음</li>`;
}

function renderStatus() {
  const controls = $("controls");
  $("lead").hidden = true;
  $("sortEl").innerHTML = "";
  $("list").innerHTML = "";
  if (data.status === "executed" && idxKeys().length) {
    hideNotice();
    controls.hidden = false;
    render();
    return;
  }
  controls.hidden = true;
  const d = dashDate(data.date || "");
  let msg;
  if (data.status === "skipped_holiday")
    msg = `<b>휴장일</b> — ${d}에는 검출이 실행되지 않았습니다.`;
  else if (data.status === "suspected_data_delay")
    msg = `<b>데이터 확인 필요</b> — ${d} 시세가 아직 갱신되지 않았을 수 있습니다.`;
  else if (data.status === "error")
    msg = `<b>실행 오류</b> — ${esc(data.error || "원인 미상")}`;
  else
    msg = `<b>${esc(data.status || "데이터 없음")}</b> (${d})`;
  showNotice(msg, true);
}

// ---- load ----
async function fetchJson(url) {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function load() {
  try {
    try {
      data = await fetchJson(DATA_URL);
    } catch (e) {
      data = await fetchJson("rs-latest.json");  // 로컬 미리보기 폴백
    }
  } catch (e) {
    if (data) return;  // 탭 복귀 재로딩 실패 — 기존 화면(기준일 포함) 그대로 유지
    $("meta").textContent = "—";
    showNotice("<b>데이터를 불러오지 못했습니다</b> — 네트워크 확인 후 새로고침해 주세요.", true);
    return;
  }
  loadedAt = Date.now();
  indicesMap = buildIndicesMap(data);
  if (!idxKeys().includes(idx)) idx = idxKeys()[0] || null;
  if (!winKeys().includes(win)) win = winKeys()[0] || null;
  renderHeader();
  renderStatus();
}

// ---- events ----
$("idxSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !data) return;
  idx = b.dataset.i; render();
});
$("winSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !data) return;
  win = b.dataset.w; render();
});
$("dirSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !data) return;
  dir = b.dataset.d; render();
});
$("tierSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !data) return;
  tier = b.dataset.t; render();
});
$("sortEl").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !data) return;
  sort = b.dataset.sort; render();
});
document.addEventListener("visibilitychange", () => {  // 폰에서 다음날 탭 복귀 시 자동 갱신
  if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_MS) load();
});
load();
