/* 종가베팅 대시보드 — eunhaengnamu-latest.json 한 파일만 fetch 한다.
   상대강도 페이지와 코드를 공유하지 않는다(한쪽이 깨져도 다른 쪽은 살아있게). */
(function () {
  "use strict";

  var DATA_URL = "https://raw.githubusercontent.com/AMID815/hwangnyong/data/eunhaengnamu-latest.json";
  var LOCAL_URL = "eunhaengnamu-latest.json";   // 로컬 렌더 확인용 폴백
  var NAVER = "https://m.stock.naver.com/domestic/stock/";

  var MISS = {
    not_bearish: "양봉",
    mcap: "시총 미달",
    value_not_down: "대금 감소 부족",
    prev_not_down: "전일比 증가",
    no_quote: "시세 없음"
  };

  var WARN = {
    rank_cutoff_above_threshold: "순위 100위 커트라인이 임계값 위 — 후보 누락 가능",
    snapshot_unavailable: "전일 스냅샷 없음 — 순위 소스만 사용",
    rank_unavailable: "순위 조회 실패 — 스냅샷 소스만 사용",
    naver_mismatch: "네이버와 음봉 판정 불일치 — 확인 필요",
    naver_unavailable: "네이버 교차검증 생략",
    mac_unit_mismatch: "시가총액 단위 불일치 — 상장주식수 기준으로 대체"
  };

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
  function md(s) {
    s = String(s || "");
    return s.length === 8 ? s.slice(4, 6) + "-" + s.slice(6) : s;
  }
  function sign(v, digits) {
    if (v == null || isNaN(v)) return "—";
    var d = digits == null ? 2 : digits;
    return (v > 0 ? "+" : "") + Number(v).toFixed(d) + "%";
  }
  function cls(v) { return v == null ? "z" : (v > 0 ? "p" : (v < 0 ? "n" : "z")); }
  function eok(v) {
    if (v == null) return "—";
    return Number(v) >= 10000
      ? (Number(v) / 10000).toFixed(1) + "조"
      : Math.round(Number(v)).toLocaleString() + "억";
  }

  var state = { tab: "picks", data: null };

  function render(d) {
    state.data = d;

    $("meta").textContent =
      ymd(d.date) + " · 기준봉 " + ymd(d.base_date) +
      " · 검출 " + (d.picks || []).length + "종목";

    var prov = $("prov");
    if (d.provisional) {
      prov.hidden = false;
      prov.textContent = "⚠ " + (d.as_of || "장중") + " 기준 잠정 · 종가 미확정 (15:20~15:30 동시호가에서 변동)";
    }

    var c = d.criteria || {};
    var dropPct = Math.round((1 - (c.value_drop_ratio != null ? c.value_drop_ratio : 0.7)) * 100);
    var rise = c.rise_pct != null ? c.rise_pct : 13;
    var wdays = c.watch_days != null ? c.watch_days : 10;
    // 긴 문구는 큰 글씨(.v)가 아니라 캡션 줄(.cap)로 내린다 — 모바일에서 카드 폭이
    // 95px 남짓이라 .v 에 문장을 넣으면 잘린다 (2026-08-03 실측).
    $("stats").innerHTML =
      stat("기준봉", rise + "%↑", "거래대금 " + eok(c.value_eok) + "↑") +
      stat("감시 " + wdays + "거래일", "대금 " + dropPct + "%↓", "+ 음봉") +
      stat("시가총액", eok(c.mcap_eok) + "↑");

    var warns = (d.warnings || []).map(function (w) {
      return "<div>⚠ " + esc(WARN[w] || w) + "</div>";
    }).join("");
    var host = document.querySelector(".warns");
    if (!host) {
      host = document.createElement("div");
      host.className = "warns";
      document.querySelector("main").insertBefore(host, $("notice"));
    }
    host.innerHTML = warns;

    paint();
  }

  function stat(k, v, cap) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' +
      esc(v) + "</div>" +
      (cap ? '<div class="cap">' + esc(cap) + "</div>" : "") + "</div>";
  }

  function paint() {
    var d = state.data || {};
    var t = state.tab;
    $("list").hidden = t !== "picks";
    $("lead").hidden = t !== "picks";
    $("watchWrap").hidden = t !== "watch";
    $("trackWrap").hidden = t !== "track";
    if (t === "picks") paintPicks(d);
    else if (t === "watch") paintWatch(d);
    else paintTrack(d);
  }

  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }

  function paintPicks(d) {
    var picks = d.picks || [];
    var f = d.funnel || {};
    $("lead").hidden = false;
    $("lead").innerHTML =
      "<b>" + picks.length + "종목</b> 검출 · 기준봉 거래대금 순" +
      '<span class="hint">신규 기준봉 ' + (f.new_bases || 0) + " · 감시 " +
      (f.watching_total || 0) + " → 검출 " + (f.detected || 0) + "</span>";

    if (!picks.length) {
      $("list").innerHTML =
        '<li class="empty">조건에 맞는 종목이 없습니다.<br>' +
        "매매할 게 없는 날은 안 하는 것이 정상입니다." +
        (f.watching_pending ? "<br>감시중 " + f.watching_pending + "종목은 '감시중' 탭에." : "") +
        "</li>";
      return;
    }

    $("list").innerHTML = picks.map(function (p) {
      var chips = "";
      if (p.day_n != null) chips += '<span class="chip dn">D+' + p.day_n + "</span>";
      if (p.rising_bear) chips += '<span class="chip rb">상승형</span>';
      if (p.vol_down_prev) chips += '<span class="chip pv">전일↓</span>';
      if (p.repeat_n > 1) chips += '<span class="chip rep">↻' + p.repeat_n + "</span>";

      var gapCls = (p.gap_pct != null && p.gap_pct <= -3) ? " class='bad'" : "";

      return '<li><a class="row" href="' + NAVER + esc(p.code) + '/total"' +
        ' target="_blank" rel="noopener">' +
        '<div class="top">' +
          '<span class="rank">' + p.rank + "</span>" +
          '<span class="name">' + esc(p.name) +
            '<span class="code">' + esc(p.code) + "</span></span>" +
          '<span class="chips">' + chips + "</span>" +
        "</div>" +
        '<div class="metrics">' +
          '<span class="rs p">' + sign(p.base_rise_pct) +
            '<span class="u">' + md(p.base_date) + " 기준봉</span></span>" +
          '<span class="sub2">' + eok(p.base_value_eok) + " · 시총 " + eok(p.mcap_eok) + "</span>" +
        "</div>" +
        '<div class="vline">' +
          '<span class="big">대금 ' + pct(p.value_ratio) + "</span>" +
          '<span class="cap">' + eok(p.value_eok) + " / 기준봉 " + eok(p.base_value_eok) +
            (p.prev_value_ratio == null ? "" : " · <b>전일比</b> " + pct(p.prev_value_ratio)) +
          "</span>" +
        "</div>" +
        '<div class="metrics">' +
          '<span class="rs ' + cls(p.today_pct) + '">' + sign(p.today_pct) +
            '<span class="u">지금</span></span>' +
          '<span class="sub2">시가대비 ' + sign(p.vs_open_pct) + " · " +
            Number(p.price || 0).toLocaleString() + "원</span>" +
        "</div>" +
        '<div class="dline">' +
          "<span" + gapCls + "><b>갭</b> " + sign(p.gap_pct, 1) + "</span>" +
          "<span><b>거래량</b> " + pct(p.vol_ratio) + "</span>" +
        "</div>" +
        "</a></li>";
    }).join("");
  }

  function paintWatch(d) {
    var rows = d.watching || [];
    $("watchLead").innerHTML =
      "<b>" + rows.length + "종목</b> 감시중 · 기준봉 이후 " +
      ((d.criteria || {}).watch_days || 10) + "거래일" +
      '<span class="hint">아직 조건을 못 맞춘 종목</span>';

    if (!rows.length) {
      $("watchList").innerHTML =
        '<li class="empty">감시 중인 종목이 없습니다.<br>' +
        "기준봉이 나오면 여기에 올라옵니다.</li>";
      return;
    }

    $("watchList").innerHTML = rows.map(function (w) {
      var miss = (w.miss || []).map(function (m) {
        return "<span>" + esc(MISS[m] || m) + "</span>";
      }).join("");
      if (w.bearish) miss = '<span class="ok">음봉</span>' + miss;

      return '<li><a class="wrow" href="' + NAVER + esc(w.code) + '/total"' +
        ' target="_blank" rel="noopener">' +
        '<div class="top">' +
          '<span class="rank">D+' + (w.day_n == null ? "?" : w.day_n) + "</span>" +
          '<span class="name">' + esc(w.name) +
            '<span class="code">' + esc(w.code) + "</span></span>" +
          '<span class="chips"><span class="chip dn">' + md(w.base_date) + "</span></span>" +
        "</div>" +
        '<div class="vline">' +
          '<span class="big miss">대금 ' + pct(w.value_ratio) + "</span>" +
          '<span class="cap">' + eok(w.value_eok) + " / 기준봉 " + eok(w.base_value_eok) +
            " · 기준봉 " + sign(w.base_rise_pct) + "</span>" +
        "</div>" +
        '<div class="miss">' + miss + "</div>" +
        "</a></li>";
    }).join("");
  }

  function paintTrack(d) {
    var rows = d.tracking || [];
    var n = 10;
    (rows[0] && rows[0].closes_pct) && (n = rows[0].closes_pct.length);

    $("trackLead").innerHTML =
      "<b>" + rows.length + "건</b> 추적 · 기준가는 검출일 종가(확정)" +
      '<span class="hint">D+1 ~ D+' + n + " 종가 등락률</span>";

    if (!rows.length) {
      $("track").innerHTML =
        '<tbody><tr><td class="l"><div class="empty">' +
        "아직 추적할 검출이 없습니다.</div></td></tr></tbody>";
      return;
    }

    var head = '<tr><th class="l">검출일</th><th class="l">종목</th>' +
      '<th class="sep">기준가</th><th>D+1갭</th><th>D+1고</th>';
    for (var i = 1; i <= n; i++) head += '<th' + (i === 1 ? ' class="sep"' : "") + ">D+" + i + "</th>";
    head += '<th class="sep">최고</th><th>최저</th></tr>';

    var body = rows.map(function (r) {
      var tds = '<td class="l dt">' + md(r.date) + "</td>" +
        '<td class="l nm"><a href="' + NAVER + esc(r.code) + '/total" target="_blank"' +
        ' rel="noopener">' + esc(r.name) + '<span class="code">' + esc(r.code) +
        "</span></a></td>" +
        '<td class="sep">' + Number(r.base_close || 0).toLocaleString() + "</td>" +
        '<td class="' + cls(r.d1_open_pct) + '">' + sign(r.d1_open_pct, 1) + "</td>" +
        '<td class="' + cls(r.d1_high_pct) + '">' + sign(r.d1_high_pct, 1) + "</td>";
      var cp = r.closes_pct || [];
      for (var i = 0; i < n; i++) {
        var v = cp[i];
        tds += '<td class="' + cls(v) + (i === 0 ? " sep" : "") + '">' + sign(v, 1) + "</td>";
      }
      tds += '<td class="' + cls(r.max_pct) + ' sep">' + sign(r.max_pct, 1) + "</td>" +
        '<td class="' + cls(r.min_pct) + '">' + sign(r.min_pct, 1) + "</td>";
      return "<tr>" + tds + "</tr>";
    }).join("");

    $("track").innerHTML = "<thead>" + head + "</thead><tbody>" + body + "</tbody>";
  }

  function fail(msg) {
    $("meta").textContent = "불러오기 실패";
    $("notice").hidden = false;
    $("notice").className = "notice warn";
    $("notice").innerHTML = "<b>데이터를 불러오지 못했습니다.</b><br>" + esc(msg);
  }

  document.getElementById("tabSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-selected", String(x === b));
    });
    paint();
  });

  function load(url) {
    return fetch(url + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  load(DATA_URL)
    .catch(function () { return load(LOCAL_URL); })
    .then(render)
    .catch(function (e) { fail(e.message || String(e)); });
})();
