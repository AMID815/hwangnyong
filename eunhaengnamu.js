/* 눌림베팅(구 종가베팅) 대시보드 v2 — 일자별 카드 (2026-08-09).
   기준봉이 나온 날별로 카드를 만들고 그 안에 검출 종목과 이후 추이를 넣는다.
   외부 링크 없음 — 종목을 눌러도 아무 데도 가지 않는다 (사용자 지시).
   상대강도 페이지와 코드를 공유하지 않는다(한쪽이 깨져도 다른 쪽은 살아있게). */
(function () {
  "use strict";

  var DATA_URL = "https://raw.githubusercontent.com/AMID815/hwangnyong/data/eunhaengnamu-latest.json";
  var LOCAL_URL = "eunhaengnamu-latest.json";   // 로컬 렌더 확인용

  var WARN = {
    rank_unavailable: "거래대금 순위 조회 실패 — 후보 누락 가능",
    naver_mismatch: "네이버와 캔들 방향 불일치 — 확인 필요",
    naver_unavailable: "네이버 교차검증 생략",
    mac_unit_mismatch: "시가총액 단위 불일치 — 상장주식수 기준으로 대체",
    ma_off: "이평선 조건 꺼짐 (MA_FILTER=0) — 값 조건만 적용 중",
    legacy_spec: "구 조건(v1)으로 만들어진 데이터입니다 — 위 수치는 그때 쓴 값이며, " +
      "새 조건은 다음 실행부터 반영됩니다"
  };
  var MA_LABEL = { align: "정배열", slope: "기울기", both: "정배열+기울기" };
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

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
  /** 한국 날짜 YYYYMMDD — 브라우저가 어느 시간대에 있든 장 기준으로 판단한다. */
  function kstToday() {
    var d = new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + 9 * 3600000);
    var m = d.getMonth() + 1, dd = d.getDate();
    return "" + d.getFullYear() + (m < 10 ? "0" : "") + m + (dd < 10 ? "0" : "") + dd;
  }

  function mdDow(s) {
    s = String(s || "");
    if (s.length !== 8) return s;
    var d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6));
    return s.slice(4, 6) + "-" + s.slice(6) + " (" + DOW[d.getDay()] + ")";
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

  function render(d) {
    var rows = d.tracking || [];
    var todayN = (d.picks || []).length;

    $("meta").textContent =
      ymd(d.date) + " · 오늘 기준봉 " + todayN + "종목 · 추적 " + rows.length + "건";

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

    // ⚠ criteria 는 **그 데이터를 만든 실행이 실제로 쓴 값**이다. 없는 항목에
    //   기본값을 채워 넣으면 적용되지도 않은 조건을 적용된 것처럼 보여주게 된다
    //   (2026-08-09: v1 데이터에 "or 갭 10%↑" 가 붙어 나온 버그). 없으면 안 쓴다.
    var c = d.criteria || {};
    var pctTxt = function (v) { return v == null ? "—" : v + "%↑"; };
    // 갭 임계 0 이하 = 갭 가지 끔(screener.Thresholds 규약). 끈 조건을
    // "갭 0%↑" 로 적어 두면 켜져 있는 것처럼 읽힌다 — 아예 표시하지 않는다.
    var gapOn = c.gap_pct != null && c.gap_pct > 0;
    // 큰 글씨(.v)에는 값 하나만 — 카드 폭이 390px에서 93px뿐이라 문장을 넣으면
    // 잘린다(08-03·08-09 실측). 부가 조건은 캡션 줄(.cap)로 내린다.
    $("stats").innerHTML =
      stat("거래대금", c.value_eok == null ? "—" : eok(c.value_eok) + "↑") +
      stat("기준봉", pctTxt(c.rise_pct), gapOn ? "or 갭 " + c.gap_pct + "%↑" : "") +
      stat("시가총액", c.mcap_eok == null ? "—" : eok(c.mcap_eok) + "↑",
           "전날 종가 기준");

    var warns = (d.warnings || []).slice();
    // 이평선 조건이 꺼진 건 설정 이상이다 — 캡션에 묻지 말고 경고로 올린다.
    if (c.ma_filter === false) warns.push("ma_off");
    // 구 조건(v1)으로 만들어진 데이터면 화면 수치가 현재 설정과 다르다.
    // 표시 오류로 오해하지 않도록 명시한다 — 다음 실행부터 새 조건이 반영된다.
    if (c.gap_pct == null || c.value_drop_ratio != null) warns.push("legacy_spec");
    $("warns").innerHTML = warns.map(function (w) {
      return "<div>⚠ " + esc(WARN[w] || w) + "</div>";
    }).join("");

    paintCards(rows, d.date);
  }

  function stat(k, v, cap) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' +
      esc(v) + "</div>" +
      (cap ? '<div class="cap">' + esc(cap) + "</div>" : "") + "</div>";
  }

  function paintCards(rows, today) {
    if (!rows.length) {
      $("cards").innerHTML =
        '<div class="empty">아직 검출된 기준봉이 없습니다.<br>' +
        "조건을 만족하는 날이 없으면 비어 있는 것이 정상입니다.</div>";
      return;
    }

    // 기준봉일별로 묶는다 — 최신 날짜가 위로
    var byDate = {};
    rows.forEach(function (r) {
      (byDate[r.date] = byDate[r.date] || []).push(r);
    });
    var dates = Object.keys(byDate).sort().reverse();
    var kst = kstToday();

    $("cards").innerHTML = dates.map(function (dt, i) {
      var list = byDate[dt].slice().sort(function (a, b) {
        return (b.value_eok || 0) - (a.value_eok || 0);   // 거래대금 순
      });
      // 강조는 '이번 실행이 만든 카드'(= 데이터의 실행일)에 준다.
      // 다만 배지 문구는 실제 날짜와 대조한다 — 주말·휴장에 지난 데이터를 보면서
      // 금요일 카드에 "오늘"이라고 쓰면 거짓말이 된다 (2026-08-09 실측).
      var isRunDate = dt === today;
      var tag = isRunDate ? (dt === kst ? "오늘" : "최근 실행") : "";
      // 카드 20개 × 종목 10~20개면 400행이라 다 펼쳐두면 못 쓴다.
      // 최신 카드만 펼치고 나머지는 접는다 (2026-08-09 사용자 지시).
      var open = i === 0;
      var lid = "dl-" + dt;
      var avg = avgLatest(list);

      return '<section class="daycard' + (isRunDate ? " today" : "") + '">' +
        '<button class="dhead" type="button" aria-expanded="' + open + '"' +
          ' aria-controls="' + lid + '">' +
          '<span class="dchev" aria-hidden="true"></span>' +
          '<span class="ddate">' + esc(mdDow(dt)) + "</span>" +
          (tag ? '<span class="dtag">' + tag + "</span>" : "") +
          // 퍼센트·종목수는 **항상** 자리를 차지한다. 값이 없다고 슬롯을 빼면
          // 카드마다 숫자 위치가 흔들려 세로로 훑을 수가 없다 (2026-08-09 지시).
          '<span class="dsum">' +
            '<b class="' + (avg == null ? "z" : cls(avg)) + '">' +
              (avg == null ? "—" : sign(avg, 1)) + "</b>" +
            '<span class="dcount">' + list.length + "종목</span>" +
          "</span>" +
        "</button>" +
        '<ul class="dlist" id="' + lid + '"' + (open ? "" : " hidden") + ">" +
        list.map(row).join("") + "</ul>" +
        "</section>";
    }).join("");
  }

  /** 그날 검출분의 '현재까지' 평균 등락률 — 접힌 카드에서 하루를 한눈에 보려고. */
  function avgLatest(list) {
    var vals = [];
    list.forEach(function (r) {
      var cp = r.closes_pct || [];
      for (var i = cp.length - 1; i >= 0; i--) {
        if (cp[i] != null) { vals.push(cp[i]); break; }
      }
    });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function row(r) {
    var chips = "";
    if (r.ma) chips += '<span class="chip pv">' + esc(MA_LABEL[r.ma] || r.ma) + "</span>";
    if (r.trigger === "gap") chips += '<span class="chip rb">갭</span>';
    if (r.bearish) chips += '<span class="chip dn">음봉</span>';

    var meta = [];
    if (r.gap_pct != null) meta.push("갭 " + sign(r.gap_pct, 1));
    if (r.value_eok != null) meta.push(eok(r.value_eok));
    if (r.mcap_eok != null) meta.push("시총 " + eok(r.mcap_eok));
    if (r.base_close) meta.push(Number(r.base_close).toLocaleString() + "원");

    return '<li class="drow">' +
      '<div class="top">' +
        '<span class="name">' + esc(r.name) +
          '<span class="code">' + esc(r.code) + "</span></span>" +
        '<span class="chips">' + chips + "</span>" +
      "</div>" +
      '<div class="bline">' +
        '<span class="rs ' + cls(r.rise_pct) + '">' + sign(r.rise_pct) + "</span>" +
        '<span class="sub2">' + esc(meta.join(" · ")) + "</span>" +
      "</div>" +
      perf(r) +
      "</li>";
  }

  function perf(r) {
    var cp = r.closes_pct || [];
    var n = r.days_elapsed || 0;
    if (!n) {
      return '<div class="perf none">추적 시작 — 다음 거래일부터 표시</div>';
    }
    var cells = "";
    for (var i = 0; i < cp.length; i++) {
      if (cp[i] == null) continue;
      cells += '<span class="pd"><i>D' + (i + 1) + '</i>' +
        '<b class="' + cls(cp[i]) + '">' + sign(cp[i], 1) + "</b></span>";
    }
    var ext = "";
    if (r.max_pct != null || r.min_pct != null) {
      ext = '<span class="pext">최고 <b class="' + cls(r.max_pct) + '">' +
        sign(r.max_pct, 1) + '</b> · 최저 <b class="' + cls(r.min_pct) + '">' +
        sign(r.min_pct, 1) + "</b></span>";
    }
    return '<div class="perf">' + cells + ext + "</div>";
  }

  // 카드 헤더를 눌러 그날 종목을 펴고 접는다. 위임이라 재렌더에도 살아남는다.
  // 헤더가 <button> 이라 키보드(Enter/Space)로도 동작한다.
  $("cards").addEventListener("click", function (e) {
    var head = e.target.closest(".dhead");
    if (!head) return;
    var list = document.getElementById(head.getAttribute("aria-controls"));
    if (!list) return;
    var open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!open));
    list.hidden = open;
  });

  function fail(msg) {
    $("meta").textContent = "불러오기 실패";
    $("notice").hidden = false;
    $("notice").className = "notice warn";
    $("notice").innerHTML = "<b>데이터를 불러오지 못했습니다.</b><br>" + esc(msg);
  }

  function load(url) {
    return fetch(url + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // 로컬 개발(localhost)에서는 로컬 샘플을 우선한다 — 원격 라이브 데이터가
  // 이미 존재하면 로컬 렌더 확인이 불가능해지기 때문 (2026-08-09).
  var isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var first = isLocal ? LOCAL_URL : DATA_URL;
  var second = isLocal ? DATA_URL : LOCAL_URL;
  load(first)
    .catch(function () { return load(second); })
    .then(render)
    .catch(function (e) { fail(e.message || String(e)); });
})();
