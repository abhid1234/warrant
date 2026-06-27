// Live-board progressive enhancement (browser, zero-dep). Activates only with
// ?registry=<url>: fetches <url>/board.json and re-renders the data-driven
// sections from the registry. Without the param, the static snapshot stands
// (so the board still works over file://). This is the browser twin of
// @warrant/verify's tallyReputation + the board renderers — kept compact.
(function () {
  var params = new URLSearchParams(location.search);
  // ?registry=<url> overrides; otherwise a build-time default (window.__WARRANT_REGISTRY__).
  var reg = params.get("registry") || (typeof window !== "undefined" && window.__WARRANT_REGISTRY__) || "";
  var badge = document.getElementById("w-live");
  // On local file:// opens, stay with the static snapshot (no fetch, no offline noise).
  if (!reg || (location.protocol === "file:" && !params.get("registry"))) return;
  var base = reg.replace(/\/+$/, "");

  fetch(base + "/board.json")
    .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
    .then(function (ws) {
      render(ws);
      if (badge) { badge.hidden = false; badge.className = "live-badge"; badge.textContent = "● live · " + ws.length + " warrants"; }
    })
    .catch(function () {
      if (badge) { badge.hidden = false; badge.className = "live-badge off"; badge.textContent = "○ registry offline — showing snapshot"; }
    });

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function harnessOf(w) { return w.body && w.body.harness && typeof w.body.harness.name === "string" ? w.body.harness.name : null; }
  function pct(s) { return s == null ? "—" : Math.round(s * 100) + "%"; }
  function cls(s) { return s == null ? "mid" : s >= 0.8 ? "hi" : s <= 0.34 ? "lo" : "mid"; }
  function wilson(pos, total) { if (total <= 0) return 0; var z = 1.96, p = pos / total, d = 1 + z * z / total; return Math.max(0, (p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / d); }
  // All registry data is untrusted: escape every string and constrain the chip
  // class to the known enum so verdict.value can't break out of the attribute.
  function chip(v) { var k = v === "warranted" || v === "refuted" || v === "unverifiable" ? v : "unverifiable"; return '<span class="chip ' + k + '">' + esc(v) + "</span>"; }

  function tally(ws) {
    var byDomain = {}, order = [], seen = {}, hSets = {}, allH = {}, totals = { warranted: 0, refuted: 0, unverifiable: 0, total: 0 };
    ws.forEach(function (w) {
      var d = w.task_context.domain, id = w.subject.id, name = w.subject.name || id;
      if (!seen[id]) { seen[id] = 1; order.push({ id: id, name: name }); }
      byDomain[d] = byDomain[d] || {};
      if (!byDomain[d][id]) byDomain[d][id] = { agentId: id, name: name, warranted: 0, refuted: 0, unverifiable: 0, total: 0, score: null };
      var rep = byDomain[d][id]; rep.total++; totals.total++;
      var v = w.verdict.value;
      if (v === "warranted") { rep.warranted++; totals.warranted++; }
      else if (v === "refuted") { rep.refuted++; totals.refuted++; }
      else { rep.unverifiable++; totals.unverifiable++; }
      var h = harnessOf(w); if (h) { allH[h] = 1; var k = d + " " + id; (hSets[k] = hSets[k] || {})[h] = 1; }
    });
    var domains = Object.keys(byDomain).sort().map(function (d) {
      var agents = Object.keys(byDomain[d]).map(function (id) {
        var a = byDomain[d][id];
        a.score = a.warranted + a.refuted === 0 ? null : a.warranted / (a.warranted + a.refuted);
        a.confidence = wilson(a.warranted, a.warranted + a.refuted);
        return a;
      });
      agents.sort(function (x, y) { return (y.score == null ? -1 : y.score) - (x.score == null ? -1 : x.score) || y.warranted - x.warranted; });
      return { domain: d, agents: agents };
    });
    return { domains: domains, agentOrder: order, totals: totals };
  }

  function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  function render(ws) {
    var rep = tally(ws), t = rep.totals;
    setHTML("w-summary",
      '<div class="w"><b>' + t.warranted + "</b>warranted</div>" +
      '<div class="r"><b>' + t.refuted + "</b>refuted</div>" +
      "<div><b>" + t.unverifiable + "</b>unverifiable</div>" +
      "<div><b>" + t.total + "</b>total warrants</div>");

    setHTML("w-boards", rep.domains.map(function (d) {
      var rows = d.agents.map(function (a) {
        var c = cls(a.score);
        return '<tr><td class="agent">' + esc(a.name) + "</td>" +
          '<td class="num"><span class="bar"><span class="' + c + '" style="width:' + (a.score == null ? 0 : Math.round(a.score * 100)) + '%"></span></span><span class="rate ' + c + '">' + pct(a.score) + "</span></td>" +
          '<td class="num dim">' + pct(a.confidence) + '</td>' +
          '<td class="num">' + a.warranted + '</td><td class="num">' + a.refuted + '</td><td class="num dim">' + a.unverifiable + '</td><td class="num dim">' + a.total + "</td></tr>";
      }).join("");
      return '<section><h3>' + esc(d.domain) + '</h3><table class="board"><thead><tr><th>agent</th><th class="num">warranted&nbsp;rate</th><th class="num dim">conf</th><th class="num">✓</th><th class="num">✗</th><th class="num dim">?</th><th class="num dim">n</th></tr></thead><tbody>' + rows + "</tbody></table></section>";
    }).join(""));

    var domains = rep.domains.map(function (d) { return d.domain; });
    var head = "<tr><th></th>" + domains.map(function (d) { return '<th class="num">' + esc(d) + "</th>"; }).join("") + "</tr>";
    var body = rep.agentOrder.map(function (o) {
      var cells = domains.map(function (dn) {
        var dd = rep.domains.filter(function (x) { return x.domain === dn; })[0];
        var a = dd && dd.agents.filter(function (x) { return x.agentId === o.id; })[0];
        if (!a) return '<td class="num cell empty">—</td>';
        return '<td class="num cell ' + cls(a.score) + '">' + pct(a.score) + '<span class="celln">' + a.warranted + "/" + (a.warranted + a.refuted) + "</span></td>";
      }).join("");
      return '<tr><td class="agent">' + esc(o.name) + "</td>" + cells + "</tr>";
    }).join("");
    setHTML("w-matrix", '<table class="board matrix"><thead>' + head + "</thead><tbody>" + body + "</tbody></table>");

    var rrows = ws.map(function (w) {
      var ev = w.verification.evidence[0], live = (w.task_context.tags || []).indexOf("live-demo") >= 0, h = harnessOf(w);
      return '<tr class="' + (live ? "live" : "") + '"><td class="agent">' + esc(w.subject.name) + (live ? ' <span class="tag">live</span>' : "") + "</td>" +
        '<td class="dim">' + esc(w.task_context.domain) + "</td><td>" + esc(w.claimed_outcome.summary || "") + "</td>" +
        '<td class="mono dim">' + esc(ev.source) + (ev.independent ? "" : " (self)") + '</td><td class="mono dim">' + (h ? esc(h) : "—") + "</td><td>" + chip(w.verdict.value) + "</td></tr>";
    }).join("");
    setHTML("w-recent", '<table class="board recent"><thead><tr><th>agent</th><th>context</th><th>claim</th><th>evidence&nbsp;source</th><th>harness</th><th>verdict</th></tr></thead><tbody>' + rrows + "</tbody></table>");
  }
})();
