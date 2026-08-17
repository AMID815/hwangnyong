/* 종가베팅 대시보드 — 기준봉 → 눌림 음봉 (2026-08-17).
   섹션: ① 오늘 신호 ② 관찰 중 ③ 오늘 신규 기준봉 ④ 최근 종결.
   외부 링크 없음 — 종목을 눌러도 아무 데도 가지 않는다(관찰 일지만 펴진다).
   상대강도·눌림베팅 페이지와 코드를 공유하지 않는다(한쪽이 깨져도 다른 쪽은 살아있게). */
(function () {
  "use strict";

  var DATA_URL = "https://raw.githubusercontent.com/AMID815/hwangnyong/data/jongbae-latest.json";
  var LOCAL_URL = "jongbae-latest.json";   // 로컬 렌더 확인용

  var WARN = {
    rank_unavailable: "거래대금 순위 조회 실패 — 기준봉 누락 가능",
    min15_unavailable: "15분봉 조회 실패 — 일부 종목의 이평 조건 미확인",
    min15_short: "15분봉이 이평 기간에 미달 — 해당 종목은 이평 조건 미확인(조건 미달과 다름)",
    calendar_short: "거래일 달력이 관찰 창보다 짧음 — 신호·만료 확정을 보류했습니다",
    naver_mismatch: "네이버와 음봉 판정 불일치 — 확인 필요",
    naver_unavailable: "네이버 교차검증 생략"
  };
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

  // 이번에 그린 데이터가 쓴 조건값 — 카드 라벨을 여기서 만든다(숫자 하드코딩 금지).
  var CRIT = {};

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ymd(s) {
    s = String(s || "");
    return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6) : s;
  }
  function mdDow(s) {
    s = String(s || "");
    if (s.length !== 8) return s;
    var d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6));
    return s.slice(4, 6) + "/" + s.slice(6) + "(" + DOW[d.getDay()] + ")";
  }
  function won(v) {
    return v == null ? "—" : Math.round(Number(v)).toLocaleString();
  }
  function eok(v) {
    if (v == null) return "—";
    return Number(v) >= 10000
      ? (Number(v) / 10000).toFixed(1) + "조"
      : Math.round(Number(v)).toLocaleString() + "억";
  }
  function pct(v, d) {
    if (v == null || isNaN(v)) return "—";
    return (v > 0 ? "+" : "") + Number(v).toFixed(d == null ? 1 : d) + "%";
  }
  /** 등락 색 클래스 — style.css 의 .p(상승)·.n(하락)·.z(보합) 토큰. */
  function cls(v) { return v == null ? "z" : (v > 0 ? "p" : (v < 0 ? "n" : "z")); }

  // ── 렌더 ────────────────────────────────────────────────────────
  function render(d) {
    var sig = d.signals || [], watch = d.watching || [];
    var bases = d.bases_today || [], closed = d.closed || [];

    $("meta").textContent = ymd(d.date) + " · 신호 " + sig.length +
      " · 관찰 " + watch.length + " · 오늘 기준봉 " + bases.length;

    var prov = $("prov");
    prov.hidden = false;
    if (d.provisional) {
      prov.className = "prov";
      prov.textContent = "⚠ " + (d.as_of || "장중") +
        " 기준 잠정 · 종가 미확정 (15:45 확정 실행이 정본)";
    } else {
      prov.className = "prov final";
      prov.textContent = "✔ " + (d.as_of || "") + " 종가 확정 기준 (정규장 캔들)";
    }

    // criteria 는 **그 데이터를 만든 실행이 실제로 쓴 값**이다.
    // 없는 항목에 기본값을 채워 넣으면 적용되지도 않은 조건을 보여주게 된다.
    var c = d.criteria || {};
    CRIT = c;
    $("stats").innerHTML =
      stat("거래대금", c.value_eok == null ? "—" : eok(c.value_eok) + "↑") +
      stat("기준봉", c.rise_pct == null ? "—" : c.rise_pct + "%↑", "양봉만") +
      stat("시가총액", c.mcap_eok == null ? "—" : eok(c.mcap_eok) + "↑", "전날 종가") +
      stat("눌림 하한",
           c.level_keep_pct == null ? "—" : c.level_keep_pct + "%",
           c.ma_n == null ? "" : "· " + c.ma_n + "이평 " + c.ma_floor_pct + "%");

    $("warns").innerHTML = (d.warnings || []).map(function (w) {
      return "<div>⚠ " + esc(WARN[w] || w) + "</div>";
    }).join("");

    fillCriteria(c);

    // 잠정 실행은 관찰을 종료하지 않는다 — "종료"라고 쓰면 화면이 거짓말을 한다.
    $("sections").innerHTML =
      section(d.provisional ? "신호 후보 (잠정)" : "오늘 신호", sig, "hot",
              d.provisional ? "동시호가 전 판단용 · 종가에 뒤집힐 수 있음"
                            : "조건 3개를 모두 충족 — 관찰 종료",
              d.provisional ? "현재 신호 후보 없음" : "오늘 신호 없음") +
      section("관찰 중", watch, "",
              "기준봉 후 " + (c.observe_days == null ? "—" : c.observe_days) +
              "거래일 이내", "관찰 중인 기준봉 없음") +
      baseSection(bases) +
      section("최근 종결", closed, "", "신호·만료·갱신", "");

    bindToggles();
  }

  function stat(k, v, cap) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' +
      esc(v) + "</div>" +
      (cap ? '<div class="cap">' + esc(cap) + "</div>" : "") + "</div>";
  }

  /** 범례·푸터의 조건 수치를 criteria 로 채운다 — 문서에 숫자를 박아 두면
      .env 를 바꾼 날 화면과 실제 판정이 어긋난다(둘을 한 소스로 묶는다). */
  function fillCriteria(c) {
    var pct = function (v) { return v == null ? "—" : v + "%"; };
    var vals = {
      value: c.value_eok == null ? "—" : eok(c.value_eok),
      rise: pct(c.rise_pct),
      mcap: c.mcap_eok == null ? "—" : eok(c.mcap_eok),
      keep: pct(c.level_keep_pct), keep2: pct(c.level_keep_pct),
      man: c.ma_n == null ? "—" : String(c.ma_n),
      man2: c.ma_n == null ? "—" : String(c.ma_n),
      mafloor: pct(c.ma_floor_pct), mafloor2: pct(c.ma_floor_pct),
      days: c.observe_days == null ? "—" : String(c.observe_days)
    };
    var nodes = document.querySelectorAll("[data-c]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-c");
      if (vals[key] != null) nodes[i].textContent = vals[key];
    }
  }

  function section(title, rows, cls, hint, emptyMsg) {
    if (!rows.length && !emptyMsg) return "";
    return '<section class="sec ' + cls + '">' +
      '<div class="sec-h"><b>' + esc(title) + "</b>" +
      '<span class="n">' + rows.length + "</span>" +
      '<span class="hint">' + esc(hint) + "</span></div>" +
      (rows.length ? rows.map(card).join("")
                   : '<div class="empty">' + esc(emptyMsg) + "</div>") +
      "</section>";
  }

  /** 오늘 새로 나온 기준봉 — 아직 관찰 D+0 이라 일지가 없다. 요약 줄만. */
  function baseSection(bases) {
    if (!bases.length) return "";
    return '<section class="sec">' +
      '<div class="sec-h"><b>오늘 신규 기준봉</b><span class="n">' + bases.length +
      '</span><span class="hint">내일부터 관찰</span></div>' +
      bases.map(function (b) {
        return '<div class="card"><div class="chead" style="cursor:default">' +
          '<span class="nm">' + esc(b.name || b.code) + "</span>" +
          '<span class="cd">' + esc(b.code) + "</span>" +
          '<span class="rt"><span class="chip ok">' + pct(b.rise_pct) + "</span></span>" +
          "</div>" +
          '<div class="lv">' +
          lvCell("기준봉 시가", won(b.open), "dim") +
          lvCell("기준봉 종가", won(b.close), "dim") +
          lvCell(keepLabel(), won(b.level60), "") +
          "</div>" +
          '<div class="bs"><span>거래대금 <b>' + eok(b.value_eok) + "</b></span>" +
          "<span>시총 <b>" + eok(b.mcap_eok) + "</b></span></div>" +
          "</div>";
      }).join("") + "</section>";
  }

  function lvCell(k, v, cls) {
    return '<div><div class="k">' + esc(k) + '</div><div class="v ' + cls + '">' +
      esc(v) + "</div></div>";
  }

  /** 매수 레벨 칸의 라벨 — 조건값에서 만든다 (임계값을 바꾸면 라벨도 따라간다). */
  function keepLabel() {
    return (CRIT.level_keep_pct == null ? "—" : CRIT.level_keep_pct + "%") + " 보전선";
  }
  function maLabel() {
    return "15분 " + (CRIT.ma_n == null ? "—" : CRIT.ma_n) + "이평 " +
      (CRIT.ma_floor_pct == null ? "—" : CRIT.ma_floor_pct + "%");
  }

  /** 관찰 카드 — 헤더(종목·D+n) + 매수 레벨 3칸 + 기준봉 요약 + 일지(접힘). */
  function card(w) {
    var base = w.base || {}, jn = w.journal || [];
    var last = jn.length ? jn[jn.length - 1] : null;
    var isSig = w.status === "signaled";
    var cls = "card" + (isSig ? " sig" : "") +
      (w.status === "expired" || w.status === "renewed" ? " done" : "");

    var closeCls = last ? (last.level_ok && last.ma_ok ? "ok" : "no") : "dim";
    var maFloor = last && last.ma_floor_price != null
      ? won(last.ma_floor_price) : "—";

    return '<div class="' + cls + '">' +
      '<button class="chead" type="button" aria-expanded="false">' +
      '<span class="nm">' + esc(w.name || w.code) + "</span>" +
      '<span class="cd">' + esc(w.code) + "</span>" +
      '<span class="rt">' + statusChip(w) +
      '<span class="dn">D+' + (w.elapsed == null ? "?" : w.elapsed) + "</span>" +
      '<span class="arw">▶</span></span></button>' +

      '<div class="lv">' +
      lvCell(keepLabel(), won(base.level60), "") +
      lvCell(maLabel(), maFloor, "") +
      lvCell(last && last.provisional ? "현재가(잠정)" : "종가",
             last ? won(last.close) : "—", closeCls) +
      "</div>" +

      '<div class="bs">' +
      "<span>기준봉 <b>" + mdDow(w.base_date) + "</b></span>" +
      "<span>" + won(base.open) + " → <b>" + won(base.close) + "</b> " +
      '<span class="up">' + pct(base.rise_pct) + "</span></span>" +
      "<span>거래대금 <b>" + eok(base.value_eok) + "</b></span>" +
      "<span>시총 <b>" + eok(base.mcap_eok) + "</b></span>" +
      "</div>" +

      '<div class="jn">' + (jn.length ? jn.map(jrow).join("")
        : '<div class="jrow"><span class="c">아직 관찰 기록 없음</span></div>') +
      "</div></div>";
  }

  function statusChip(w) {
    if (w.status === "signaled") return '<span class="chip ok">신호</span>';
    if (w.status === "expired") return '<span class="chip miss">만료</span>';
    if (w.status === "renewed") return '<span class="chip warn">갱신</span>';
    return "";
  }

  /** 일지 한 줄 — 그날 3조건 + 진단 라벨.
      진단 라벨(상승형·갭·몸통위치·고점대비)은 판정에 관여하지 않는다 — 갭상승
      음봉을 자동 배제하지 않고 눈으로 구분하기 위한 표시다(사용자 결정 2026-08-17). */
  function jrow(r) {
    var flags =
      chip(r.bearish, "음봉") +
      chip(r.level_ok, "60%") +
      chip(r.ma_ok, "MA") +
      (r.rising_bear ? '<span class="chip rb">상승형</span>' : "") +
      (r.ma_unverified ? '<span class="chip warn">MA미검증</span>' : "") +
      (r.window_unverified ? '<span class="chip warn">창미확인</span>' : "") +
      (r.reason === "no_bar" ? '<span class="chip miss">봉없음</span>' : "") +
      (r.provisional ? '<span class="chip prov">잠정</span>' : "");
    return '<div class="jrow' + (r.signal ? " hit" : "") + '">' +
      '<span class="d">' + mdDow(r.dt) + "</span>" +
      '<span class="e">D+' + (r.elapsed == null ? "?" : r.elapsed) + "</span>" +
      '<span class="c">' + won(r.open) + " → <b>" + won(r.close) + "</b>" +
      (r.day_pct == null ? "" :
        ' <span class="' + cls(r.day_pct) + '">' + pct(r.day_pct) + "</span>") +
      (r.below_open ? ' <span class="chip dn">시가이탈</span>' : "") + "</span>" +
      '<span class="fl">' + flags + "</span></div>" +
      diagRow(r);
  }

  /** 진단 수치 줄 — 캔들 모양(갭·몸통위치·고점대비)과 **거래량을 분리**해 보여준다.
      거래량(기준봉 대비 %)은 아직 판정 조건이 아니라 관찰용 수치다(사용자 지시
      2026-08-17: 데이터가 쌓이면 조건식에 추가). 그래서 별도 칸에 명시적으로 라벨을
      붙여, 조건 칩(음봉·60%·MA)과 섞이지 않게 한다. */
  function diagRow(r) {
    var shape = [];
    if (r.gap_pct != null) shape.push("갭 " + pct(r.gap_pct));
    if (r.body_pos_pct != null)
      shape.push('몸통 <b class="' + (r.body_pos_pct > 100 ? "over" : "") + '">' +
                 Math.round(r.body_pos_pct) + "%</b>");
    if (r.drop_from_high_pct != null) shape.push("고점대비 " + pct(r.drop_from_high_pct));

    var vol = r.vol_ratio_pct == null
      ? ""
      : '<span class="vol">기준봉 대비 거래량 <b>' +
        Math.round(r.vol_ratio_pct) + "%</b></span>";

    if (!shape.length && !vol) return "";
    return '<div class="jdiag">' +
      (shape.length ? '<span class="shape">' + shape.join(" · ") + "</span>" : "") +
      vol + "</div>";
  }

  function chip(ok, label) {
    return '<span class="chip ' + (ok ? "ok" : "miss") + '">' +
      (ok ? "" : "✕") + esc(label) + "</span>";
  }

  function bindToggles() {
    var heads = document.querySelectorAll(".chead[aria-expanded]");
    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener("click", function () {
        var card = this.parentNode;
        var open = card.classList.toggle("open");
        this.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  function fail(msg) {
    var n = $("notice");
    n.hidden = false;
    n.className = "notice warn";
    n.innerHTML = "<b>데이터를 불러오지 못했습니다.</b><br>" + esc(msg);
    $("meta").textContent = "불러오기 실패";
  }

  // ── 로드: 원격 우선, 실패 시 로컬 샘플 (개발 중 렌더 확인) ──────
  function load(url, onFail) {
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (e) { onFail(e.message); });
  }

  load(DATA_URL, function (msg) {
    load(LOCAL_URL, function () { fail(msg); });
  });
})();
