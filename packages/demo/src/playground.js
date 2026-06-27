// Warrant Playground — interactive, in-browser, zero-dep. Pick or paste a warrant;
// it is RE-VERIFIED in your browser (the verdict is re-derived from evidence, never
// trusted), with a live claim-vs-world view, a tamper toggle, and a "drop the
// independent evidence" toggle that shows the moat collapse to `unverifiable`.
// This is the browser twin of @warrant/verify's computeVerdict + checkVerdict.
(function () {
  "use strict";
  var WARRANTS = window.__WARRANTS__ || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var pretty = function (v) { return typeof v === "string" ? v : JSON.stringify(v); };

  // ---- browser twin of the verifier ---------------------------------------
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === "object") {
      var ka = Object.keys(a), kb = Object.keys(b);
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (ka.length !== kb.length) return false;
      return ka.every(function (k) { return deepEqual(a[k], b[k]); });
    }
    return false;
  }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function contradicts(m) { return m === "mismatch" || m === "absent"; }

  // computeVerdict — mirrors verdict.ts. dropIndep simulates "no independent evidence".
  function computeVerdict(verification, opts) {
    opts = opts || {};
    var all = (verification.evidence || []).filter(function (e) {
      if (opts.dropIndependent && e.independent) return false;
      if (opts.recognized && e.independent && !opts.recognized(e.source)) return false;
      return true;
    });
    var indep = all.filter(function (e) { return e.independent === true; });
    if (verification.method === "none" || indep.length === 0)
      return { value: "unverifiable", reasoning: "No independent world-state evidence — the claim can't be checked against ground truth." };
    var bad = indep.filter(function (e) { return contradicts(e.match); });
    if (bad.length) return { value: "refuted", reasoning: "Independent evidence contradicts the claim (" + bad.map(function (e) { return e.source; }).join(", ") + ")." };
    var good = indep.filter(function (e) { return e.match === "match"; });
    if (good.length) return { value: "warranted", reasoning: "Independent evidence confirms the claim (" + good.map(function (e) { return e.source; }).join(", ") + ")." };
    return { value: "unverifiable", reasoning: "Independent probes ran but were inconclusive." };
  }

  function reverify(w, opts) {
    var errors = [];
    if (!w || typeof w !== "object") return { ok: false, errors: ["not a JSON object"], derived: { value: "unverifiable", reasoning: "" } };
    ["warrant_version", "warrant_id", "issued_at"].forEach(function (k) { if (typeof w[k] !== "string") errors.push("missing " + k); });
    if (!w.issuer || !w.subject) errors.push("missing issuer/subject");
    else if (w.issuer.id === w.subject.id) errors.push("issuer.id must differ from subject.id (no self-warranting)");
    if (!w.claimed_outcome || w.claimed_outcome.source !== "self-report") errors.push('claimed_outcome.source must be "self-report"');
    if (!w.verification || !Array.isArray(w.verification.evidence) || !w.verification.evidence.length) errors.push("verification.evidence required");
    var derived = w.verification ? computeVerdict(w.verification, opts) : { value: "unverifiable", reasoning: "no verification" };
    var stated = w.verdict && w.verdict.value;
    if (stated && stated !== derived.value) errors.push('stated "' + stated + '" ≠ evidence-derived "' + derived.value + '"');
    if (stated === "warranted") {
      var ok = (w.verification.evidence || []).some(function (e) { return e.independent && e.match === "match" && !(opts && opts.dropIndependent); });
      if (!ok) errors.push("warranted requires an independent + match evidence item");
    }
    return { ok: errors.length === 0, errors: errors, derived: derived };
  }

  // ---- rendering ----------------------------------------------------------
  var chip = function (v) { var k = v === "warranted" || v === "refuted" || v === "unverifiable" ? v : "unverifiable"; return '<span class="chip ' + k + '">' + esc(v) + "</span>"; };
  var state = { id: null, filter: "all", tamper: false, drop: false };

  function evidenceRow(e) {
    return '<tr><td class="mono">' + esc(e.source) + (e.independent ? ' <span class="indep">independent</span>' : ' <span class="self">self</span>') +
      '</td><td class="mono dim">' + esc(e.probe || "—") + '</td><td class="mono">' + esc(pretty(e.observed)) +
      '</td><td class="mono dim">' + esc(pretty(e.expected)) + '</td><td>' + chip2(e.match) + "</td></tr>";
  }
  function chip2(m) { var c = m === "match" ? "hi" : m === "mismatch" || m === "absent" ? "lo" : "mid"; return '<span class="mtag ' + c + '">' + esc(m) + "</span>"; }

  function renderInspector(orig) {
    var w = JSON.parse(JSON.stringify(orig));
    if (state.tamper && w.verdict) { var order = ["warranted", "refuted", "unverifiable"]; w.verdict.value = order[(order.indexOf(w.verdict.value) + 1) % 3]; }
    var r = reverify(w, { dropIndependent: state.drop });
    var cls = r.derived.value;
    var ev = (w.verification && w.verification.evidence) || [];
    var claim = w.claimed_outcome || {};
    var host = $("#inspector");
    host.innerHTML =
      '<div class="banner ' + cls + '">' +
        '<div class="bigv">' + (cls === "warranted" ? "✓ warranted" : cls === "refuted" ? "✗ refuted" : "? unverifiable") + "</div>" +
        '<div class="bsub">' + esc(r.derived.reasoning) + "</div>" +
      "</div>" +

      '<div class="vs">' +
        '<div class="vs-col claim"><div class="vs-h">The claim — self-reported</div>' +
          '<div class="vs-body"><div class="status">A2A task status: <b>' + esc(claim.status || "?") + '</b></div>' +
          '<div class="summary">' + esc(claim.summary || "") + "</div>" +
          (claim.asserted_facts ? '<pre class="mono">' + esc(JSON.stringify(claim.asserted_facts, null, 1)) + "</pre>" : "") +
          '<div class="warn">This is what a silently-failing agent fabricates.</div></div></div>' +
        '<div class="vs-col world"><div class="vs-h">The world — independently probed</div>' +
          '<div class="vs-body"><table class="ev"><thead><tr><th>source</th><th>probe</th><th>observed</th><th>expected</th><th>match</th></tr></thead><tbody>' +
          ev.map(evidenceRow).join("") + "</tbody></table>" +
          '<div class="okline">method: <span class="mono">' + esc((w.verification || {}).method || "?") + "</span></div></div></div>" +
      "</div>" +

      '<div class="reverify ' + (r.ok ? "ok" : "bad") + '">' +
        "<b>Don't trust the stamp.</b> Stated verdict: " + chip((orig.verdict || {}).value) +
        " · re-derived from evidence: " + chip(r.derived.value) +
        " → " + (r.ok ? '<span class="pass">OK — justified by the evidence</span>' : '<span class="fail">REJECTED</span>') +
        (r.errors.length ? "<ul>" + r.errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "") +
      "</div>" +

      '<div class="controls">' +
        '<label><input type="checkbox" id="t-tamper"' + (state.tamper ? " checked" : "") + "> Tamper: flip the verdict stamp</label>" +
        '<label><input type="checkbox" id="t-drop"' + (state.drop ? " checked" : "") + "> Ignore the independent evidence (self-report only)</label>" +
      "</div>" +

      '<details class="raw"><summary>Full warrant JSON</summary><pre class="mono">' + esc(JSON.stringify(orig, null, 2)) + "</pre></details>";

    $("#t-tamper").onchange = function () { state.tamper = this.checked; renderInspector(orig); };
    $("#t-drop").onchange = function () { state.drop = this.checked; renderInspector(orig); };
  }

  function cardList() {
    var items = WARRANTS.filter(function (w) {
      if (state.filter === "all") return true;
      if (state.filter === "real") return (w.task_context.tags || []).indexOf("real") >= 0;
      if (state.filter === "judged") return (w.verification || {}).method === "judge";
      return w.verdict.value === state.filter;
    });
    $("#cards").innerHTML = items.map(function (w) {
      var on = w.warrant_id === state.id ? " on" : "";
      return '<button class="card' + on + '" data-id="' + esc(w.warrant_id) + '">' +
        '<div class="c-top"><span class="c-agent">' + esc(w.subject.name) + "</span>" + chip(w.verdict.value) + "</div>" +
        '<div class="c-dom mono">' + esc(w.task_context.domain) + "</div>" +
        '<div class="c-claim">' + esc((w.claimed_outcome.summary || "").slice(0, 90)) + "</div></button>";
    }).join("") || '<div class="empty">no warrants</div>';
    Array.prototype.forEach.call(document.querySelectorAll(".card"), function (b) {
      b.onclick = function () { select(b.getAttribute("data-id")); };
    });
  }

  function select(id) {
    var w = WARRANTS.filter(function (x) { return x.warrant_id === id; })[0];
    if (!w) return;
    state.id = id; state.tamper = false; state.drop = false;
    if (history.replaceState) history.replaceState(null, "", "#" + id);
    cardList(); renderInspector(w);
  }

  function setFilter(f) { state.filter = f; Array.prototype.forEach.call(document.querySelectorAll(".fchip"), function (c) { c.classList.toggle("on", c.getAttribute("data-f") === f); }); cardList(); }

  // paste-your-own
  function showPaste() {
    var raw = window.prompt("Paste a warrant JSON to verify in your browser:");
    if (!raw) return;
    try {
      var w = JSON.parse(raw);
      state.id = w.warrant_id || "(pasted)"; state.tamper = false; state.drop = false;
      renderInspector(w);
    } catch (e) { alert("Invalid JSON: " + e.message); }
  }

  // ---- boot ---------------------------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll(".fchip"), function (c) { c.onclick = function () { setFilter(c.getAttribute("data-f")); }; });
  var pb = $("#btn-paste"); if (pb) pb.onclick = showPaste;
  cardList();
  var hash = (location.hash || "").replace(/^#/, "");
  select(hash && WARRANTS.some(function (w) { return w.warrant_id === hash; }) ? hash : (WARRANTS[0] && WARRANTS[0].warrant_id));
})();
