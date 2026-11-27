(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtD = d => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const fmtDT = d => fmtD(d) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const cColor = c => CARRIERS[c] || "var(--autre)";
  const CB = { "TNT": "tnt", "UPS": "ups", "DHL Express": "dhl", "Chronopost": "chrono", "FedEx": "fedex", "GLS France": "gls", "GEODIS": "geodis", "MTI Express": "mti" };
  const cb = (c, sz) => `<span class="cb cc-${CB[c] || "autre"} ${sz || ""}">${esc(c)}</span>`;
  const ago = h => h < 1 ? "à l'instant" : h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
  const toast = m => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2200); };

  $("#clock").textContent = NOW.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + " — " + NOW.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  var OPS = ["Wessim FARAG", "Léa FIXMAN", "Karim BENALI", "Sarah MOREAU"];
  var shortN = n => { const [p, ...r] = n.split(" "); return p + " " + (r.join(" ")[0] || "") + "."; };
  var ini = n => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  var avatar = n => `<span class="av av${OPS.indexOf(n) + 1}" title="${esc(n)}">${ini(n)}</span>`;
  var RL_MOTIFS = ["Destinataire absent", "Adresse erronée / incomplète", "Refus du destinataire", "Non réclamé en point relais", "Colis endommagé — renvoi", "Demande du client", "Réétiquetage TNT (nouveau n° en agence)"];
  var RL_RE = "Réétiquetage transporteur (déjà facturé sur l'envoi)";
  var isRe = r => r.type === "reetiq";
  var isRet = r => r.type === "retour";
  var RT_MOTIFS = ["Refus du destinataire", "Destinataire absent / non réclamé", "Délai de garde dépassé en point relais", "Adresse erronée / incomplète", "Colis endommagé", "Demande du client (rappel du colis)"];
  var rlName = r => isRe(r) ? "Réétiquetage" : (isRet(r) ? "Retour " : "Relivraison ") + r.n;
  var rlFem = r => isRet(r) || isRe(r) ? "" : "e";
  var RL_WHY = [RL_RE, "Geste commercial", "Faute du transporteur", "Erreur MTI", "Inclus dans le contrat client"];
  var rlSt = r => isRet(r) ? (r.statut === "livre" ? ["Retourné à l'expéditeur", "ok"] : ["Retour en cours", "warn"]) : r.statut === "livre" ? ["Livrée", "ok"] : r.statut === "echec" ? ["Échec", "crit"] : ["En cours", "blue"];
  var rlFact = r => r.fact.k === "oui" ? `<span class="rlf oui">Facturé${rlFem(r)} ${((r.fact.p || 0) + (r.opts || []).reduce((a, o) => a + o.p * (o.q || 1), 0)).toFixed(2)} €</span>${(r.opts || []).length ? `<span class="rlf opt">+${r.opts.length} option${r.opts.length > 1 ? "s" : ""}</span>` : ""}` : r.fact.k === "non" ? `<span class="rlf non" title="${r.fact.why || ""}">Non facturé${rlFem(r)}</span>` : `<span class="rlf q">Facturer ?</span>`;
  var cslug = c => ({ "DHL Express": "dhl", "GLS France": "gls", "MTI Express": "mti" })[c] || c.toLowerCase();

  // ================= NAVIGATION =================
  function go(p) {
    $("#page-suivi").hidden = p !== "suivi";
    $("#page-enlev").hidden = p !== "enlev";
    $("#nav-suivi").classList.toggle("on", p === "suivi");
    $("#nav-enlev").classList.toggle("on", p === "enlev");
    $("#side").classList.remove("on");
    closeDrawer();
    window.scrollTo(0, 0);
  }
  $$(".nav").forEach(a => a.addEventListener("click", () => a.dataset.go !== "none" ? go(a.dataset.go) : toast("Hors maquette")));
  $("#burger").addEventListener("click", () => $("#side").classList.toggle("on"));

  // ================= SUIVI DES ENVOIS =================
  const STEPS = ["Bordereau créé", "Ramassé", "En transit", "En livraison", "Livré"];
  const ST = {
    attente: { l: "En attente de prise en charge", n: 1, c: "warn" },
    transit: { l: "En transit", n: 3, c: "" },
    livraison: { l: "En cours de livraison", n: 4, c: "" },
    relais: { l: "Livré en point relais", n: 4, c: "warn", k: "relais" },
    anomalie: { l: "Anomalie", n: 3, c: "crit", k: "anom" },
    livre: { l: "Livré", n: 5, c: "ok" }
  };
  const state = { q: "", carriers: new Set(), view: "todo", kpi: null, sort: "urgence", sel: new Set(), open: null, tab: "apercu", ask: null, editPrix: null, dkind: null,
    saved: [{ n: "Mes anomalies TNT", s: { q: "", carriers: ["TNT"], view: "todo", kpi: "anom", sort: "urgence" } }, { n: "À facturer cette semaine", s: { q: "", carriers: [], view: "fact", kpi: null, sort: "date" } }, { n: "UPS sans nouvelles", s: { q: "", carriers: ["UPS"], view: "todo", kpi: "noscan", sort: "scan" } }], savingView: false };

  const KPIS = [
    { id: "prio", l: "À traiter en priorité", h: "alerte rouge", cls: "crit", f: e => (e.prio === 2 && !extra(e).lock) || reouv(e) },
    { id: "noscan", l: "Aucun scan > 48 h", h: "hors livrés", cls: "warn", f: e => e.statut !== "livre" && e.lastScanH > 48 },
    { id: "anom", l: "Anomalies", h: "absent, adresse, casse…", cls: "crit", f: e => e.statut === "anomalie" },
    { id: "relais", l: "En point relais", h: "à prévenir", cls: "warn", f: e => e.statut === "relais" },
    { id: "nonlivre", l: "Non livrés", h: "tous transporteurs", cls: "blue", f: e => e.statut !== "livre" },
    { id: "ext", l: "Enlèvements extérieurs", h: "ouvrir la page dédiée →", cls: "", f: null, go: "enlev" }
  ];
  const VIEWS = [
    { id: "todo", l: "À traiter", f: e => (e.prio > 0 && !extra(e).lock) || reouv(e) },
    { id: "cours", l: "En cours", f: e => e.statut !== "livre" },
    { id: "fact", l: "À facturer", f: e => aFacturer(e) },
    { id: "livre", l: "Livrés", f: e => e.statut === "livre" && !extra(e).lock },
    { id: "reliv", l: "↻ Relivraisons & retours", f: e => extra(e).reliv.length > 0 },
    { id: "clos", l: "Traités ★", f: e => !!extra(e).lock },
    { id: "all", l: "Tous", f: () => true }
  ];

  function baseFilter(e) {
    const q = state.q.trim().toLowerCase();
    if (q) {
      const hay = [e.bord, ...(extra(e).reliv || []).map(r => r.bord || ""), e.ref, e.client, e.sub, e.dep.nom, e.dep.ville, e.dep.cp, e.liv.nom, e.liv.ville, e.liv.cp].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const fc = $("#f-client").value, fd = $("#f-dossier").value, fco = $("#f-contenu").value;
    if (fc && e.client !== fc) return false;
    if (fd && e.dossier !== fd) return false;
    if (fco && e.contenu !== fco) return false;
    if ($("#f-ext").checked && !e.ext) return false;
    const fo = $("#f-op").value, fsr = $("#f-src").value, xs = extra(e);
    if (fo && xs.src.by !== fo && !(xs.lock && xs.lock.by === fo)) return false;
    if (fsr && xs.src.k !== fsr) return false;
    const du = $("#f-du").value, au = $("#f-au").value;
    if (du && e.ramasse < new Date(du)) return false;
    if (au && e.ramasse > new Date(au + "T23:59")) return false;
    return true;
  }
  function list() {
    let l = ENVOIS.filter(baseFilter);
    if (state.carriers.size) l = l.filter(e => state.carriers.has(e.carrier));
    if (state.kpi) l = l.filter(KPIS.find(k => k.id === state.kpi).f);
    else l = l.filter(VIEWS.find(v => v.id === state.view).f);
    const so = {
      urgence: (a, b) => b.prio - a.prio || b.lastScanH - a.lastScanH,
      scan: (a, b) => b.lastScanH - a.lastScanH,
      date: (a, b) => b.ramasse - a.ramasse,
      client: (a, b) => a.client.localeCompare(b.client)
    }[state.sort];
    return l.sort(so);
  }

  function renderKpis() {
    const base = ENVOIS.filter(baseFilter);
    $("#kpis").innerHTML = KPIS.map(k => {
      const v = k.f ? base.filter(k.f).length : ENLEVEMENTS.filter(x => x.etat !== "ramasse").length;
      return `<button class="kpi ${k.cls} ${state.kpi === k.id ? "on" : ""}" data-k="${k.id}"><div class="v">${v}</div><div class="l">${k.l}</div><div class="h">${k.h}</div></button>`;
    }).join("");
    $$("#kpis .kpi").forEach(b => b.onclick = () => {
      const k = KPIS.find(x => x.id === b.dataset.k);
      if (k.go) return go(k.go);
      state.kpi = state.kpi === k.id ? null : k.id;
      render();
    });
    $("#nav-suivi-nb").textContent = ENVOIS.filter(e => e.prio === 2).length;
  }
  function renderChips() {
    const base = ENVOIS.filter(baseFilter);
    const cs = Object.keys(CARRIERS).filter(c => ENVOIS.some(e => e.carrier === c));
    $("#carrier-chips").innerHTML = `<button class="ctog all ${state.carriers.size ? "" : "on"}" data-c="">Tous</button>` + cs.map(c => `<button class="ctog ${state.carriers.has(c) ? "on" : ""}" data-c="${c}" aria-pressed="${state.carriers.has(c)}">${cb(c)}<span class="n">${base.filter(e => e.carrier === c).length}</span></button>`).join("");
    $("#carrier-chips").classList.toggle("has-sel", state.carriers.size > 0);
    $$("#carrier-chips .ctog").forEach(b => b.onclick = () => { const c = b.dataset.c; if (!c) state.carriers.clear(); else state.carriers.has(c) ? state.carriers.delete(c) : state.carriers.add(c); render(); });
  }
  function renderViews() {
    const base = ENVOIS.filter(baseFilter).filter(e => !state.carriers.size || state.carriers.has(e.carrier));
    $("#views").innerHTML = VIEWS.map(v => `<button class="tab ${!state.kpi && state.view === v.id ? "on" : ""}" data-v="${v.id}">${v.l}<span class="n">${base.filter(v.f).length}</span></button>`).join("")
      + (state.kpi ? `<button class="tab on" data-v="__kpi">Filtre : ${KPIS.find(k => k.id === state.kpi).l} ✕</button>` : "");
    $$("#views .tab").forEach(b => b.onclick = () => { if (b.dataset.v === "__kpi") state.kpi = null; else { state.view = b.dataset.v; state.kpi = null; } render(); });
  }

  function progress(e) {
    const s = ST[e.statut];
    return `<div class="prog ${s.k || ""}">${STEPS.map((_, i) => `<i class="${i < s.n ? "d" : ""}"></i>`).join("")}</div><div class="st ${s.c}">${s.l}</div>`;
  }
  function rlLines(e) {
    const x = extra(e); if (!x.reliv.length) return "";
    return `<div class="rlv-g" data-rl="1" title="Relivraison(s) regroupée(s) avec l'envoi initial — cliquer pour ouvrir">${x.reliv.map(r => { const st = rlSt(r);
      return `<div class="rlv"><span class="rlv-b">${isRe(r) ? "⟳ Réétiq." : (isRet(r) ? "↩ Retour " : "↻ Reliv. ") + r.n}</span><span class="mono">${r.bord ? esc(r.bord) : "même n°"}</span><span class="rlv-s ${st[1]}">${st[0]}</span>${isRe(r) ? `<span class="rlf re" title="Les options de l'envoi suivent sur le nouveau n°, sans refacturation">${x.options.length ? x.options.length + " option" + (x.options.length > 1 ? "s" : "") + " suivie" + (x.options.length > 1 ? "s" : "") : "Pas de refacturation"}</span>${r.fact.k === "oui" ? rlFact(r) : ""}` : rlFact(r)}</div>`; }).join("")}</div>`;
  }
  function srcLine(e) {
    const x = extra(e), sc = x.src;
    return sc.k === "import"
      ? `<div class="src" title="Importé depuis l'export du site ${esc(e.carrier)} (${esc(sc.file)}) par ${esc(sc.by)} le ${sc.d}"><span class="srcb imp">⇣ Import ${esc(e.carrier)}</span>${avatar(sc.by)}<span>${esc(shortN(sc.by))}</span></div>`
      : `<div class="src" title="Créé dans le TMS par ${esc(sc.by)} le ${sc.d}"><span class="srcb tms">Créé TMS</span>${avatar(sc.by)}<span>${esc(shortN(sc.by))}</span></div>`;
  }
  function row(e) {
    const s = ST[e.statut];
    const since = e.statut === "livre" ? "" : e.lastScanH > 48 ? "crit" : e.lastScanH > 24 ? "warn" : "";
    const x = extra(e);
    const als = x.lock ? [] : e.al.filter(a => !(a.a === "Demander la preuve" && x.preuve)).concat(rlTodo(x) ? [{ lv: "warn", t: (x.reliv.find(r => r.fact.k == null) || {}).type === "retour" ? "Retour : facturer ou pas ?" : "Relivraison : facturer ou pas ?", a: "Décider" }] : []).concat(aFacturer(e) ? [{ lv: "warn", t: `À facturer : ${eur(e.ht + optTotal(x))} HT`, a: "Valider la facturation" }] : []);
    const tby = x.lock ? `<div class="tby">${avatar(x.lock.by)}<span><b>★ Traité par ${esc(shortN(x.lock.by))}</b><br><span class="muted">le ${x.lock.d}</span></span></div>` : "";
    const todo = reouv(e) ? `<div class="al crit"><i></i><span>Nouveau mail après traitement — à regarder</span></div>${tby}` : x.lock ? tby : als.length ? als.slice(0, 2).map(a => `<div class="al ${a.lv}"><i></i><span>${esc(a.t)}</span></div>`).join("")
      + `<div class="qa">${als.slice(0, 2).map(a => `<button data-a="${esc(a.a)}">${esc(a.a)}</button>`).join("")}</div>`
      : `<span class="muted">Rien à faire</span>`;
    const pr = reouv(e) ? "crit" : x.lock ? "lk" : ["ok", "warn", "crit"][e.prio];
    const stc = x.lock ? `<span class="rstar on" title="Traité par ${esc(x.lock.by)} le ${x.lock.d}" aria-label="Traité">★</span>` : `<span class="rstar" title="Pas encore traité — se coche depuis la fiche" aria-label="Non traité">☆</span>`;
    return `<tr class="u-${pr} ${x.lock ? "locked" : ""} ${state.sel.has(e.id) ? "sel" : ""} ${state.open === e.id ? "open" : ""} ${state.flash === e.id ? "flash" : ""}" data-id="${e.id}">
      <td><input type="checkbox" class="ck" ${state.sel.has(e.id) ? "checked" : ""} aria-label="Sélectionner"></td>
      <td class="stc">${stc}</td>
      <td class="tc">${cb(e.carrier)}<div class="presta">${esc(e.presta)}</div></td>
      <td><div class="bord">${esc(e.bord)}</div><div class="ref">${esc(e.ref)}${e.colis > 1 ? ` · ${e.colis} colis` : ""}</div>${srcLine(e)}${rlLines(e)}${mailBadge(e)}</td>
      <td><div class="cl">${esc(e.client)}</div><div class="cl-sub">${esc(e.sub || "—")}</div>${e.tags.filter(t => t[0] !== "ext").map(t => `<span class="tag ${t[0]}">${t[1]}</span>`).join("")}</td>
      <td><div class="trajet">
        <div class="pt"><span class="lbl">Dép.</span><span class="nm">${esc(e.dep.nom)}</span><span class="vl">${esc(e.dep.cp)} ${esc(e.dep.ville)}</span>${e.ext ? `<span class="tag ext" style="margin:0">Extérieur</span>` : ""}</div>
        <div class="pt"><span class="lbl">Liv.</span><span class="nm">${esc(e.liv.nom)}</span><span class="vl">${esc(e.liv.cp)} ${esc(e.liv.ville)}${e.liv.pays !== "France" ? ` · <b>${esc(e.liv.pays)}</b>` : ""}</span></div>
      </div></td>
      <td>${progress(e)}<div class="since-sub" style="margin-top:3px">Dernier scan <span class="since ${since}">${ago(e.lastScanH)}</span></div><div class="since-sub">${e.statut === "attente" ? "Créé le" : "Ramassé le"} ${fmtD(e.ramasse)}</div></td>
      <td><div class="todo">${todo}</div></td>
    </tr>`;
  }
  function renderRows() {
    const l = list();
    $("#rows").innerHTML = l.map(row).join("");
    $("#empty").hidden = l.length > 0;
    $("#count").textContent = `${l.length} envoi${l.length > 1 ? "s" : ""} affiché${l.length > 1 ? "s" : ""}`;
    $$("#rows tr").forEach(tr => {
      const id = +tr.dataset.id;
      tr.onclick = ev => {
        if (ev.target.classList.contains("ck")) { ev.stopPropagation(); state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id); renderBulk(); tr.classList.toggle("sel"); return; }
        if (ev.target.closest("[data-rl]")) { ev.stopPropagation(); openEnvoi(id, "reliv"); return; }
        if (ev.target.dataset.a === "Décider") { ev.stopPropagation(); openEnvoi(id, "reliv"); return; }
        if (ev.target.closest("[data-mail]")) { ev.stopPropagation(); mstate.open = true; openEnvoi(id); return; }
        if (ev.target.dataset.a) {
          ev.stopPropagation();
          const a = ev.target.dataset.a, k = { "Valider la facturation": "valider", "Demander la preuve": "preuve", "Relancer": "relance", "Ouvrir une enquête": "enquete", "Prévenir": "client", "Rafraîchir": "refresh" }[a];
          if (k) doAct(ENVOIS[id], k, false); else toast(`${a} — ${ENVOIS[id].bord}`);
          return;
        }
        openEnvoi(id);
      };
    });
    $("#ck-all").checked = l.length && l.every(e => state.sel.has(e.id));
  }
  function renderBulk() {
    $("#bulk").hidden = !state.sel.size;
    $("#bulk-n").textContent = state.sel.size;
  }
  function moreCount() {
    const n = ["#f-client", "#f-op", "#f-src", "#f-dossier", "#f-contenu", "#f-du", "#f-au"].filter(s => $(s).value).length + ["#f-ext", "#f-payeur", "#f-annule"].filter(s => $(s).checked).length;
    $("#mf-count").hidden = !n; $("#mf-count").textContent = n;
    $("#reset").hidden = !(n || state.q || state.carriers.size || state.kpi);
  }
  function renderRelance() {
    const base = ENVOIS.filter(baseFilter).filter(e => e.statut !== "livre" && e.lastScanH > 48);
    const by = {}; base.forEach(e => by[e.carrier] = (by[e.carrier] || 0) + 1);
    const ent = Object.entries(by).sort((a, b) => b[1] - a[1]);
    $("#relance").innerHTML = ent.length ? `<span class="rl-l">Sans nouvelles depuis plus de 48 h :</span>${ent.map(([c, n]) => `<button class="rl-c" data-c="${c}" title="Afficher ces envois">${cb(c, "sm")} <b>${n}</b></button>`).join("")}<button class="btn sm" id="rl-all">Relancer les ${ent.length} transporteurs</button>` : "";
    $$("#relance .rl-c").forEach(b => b.onclick = () => { state.carriers = new Set([b.dataset.c]); state.kpi = "noscan"; render(); });
    if ($("#rl-all")) $("#rl-all").onclick = () => toast(`Relance envoyée à ${ent.map(x => x[0]).join(", ")} (${base.length} envois)`);
  }
  const snap = () => ({ q: state.q, carriers: [...state.carriers].sort(), view: state.view, kpi: state.kpi, sort: state.sort });
  function renderSaved() {
    const cur = JSON.stringify(snap());
    $("#saved").innerHTML = `<span class="sv-l">Vues enregistrées</span>${state.saved.map((v, i) => `<span class="sv ${JSON.stringify(v.s) === cur ? "on" : ""}"><button data-i="${i}">${esc(v.n)}</button><button class="sv-x" data-x="${i}" title="Supprimer la vue" aria-label="Supprimer">✕</button></span>`).join("")}`
      + (state.savingView ? `<span class="sv-new"><input id="sv-n" placeholder="Nom de la vue…"><button class="btn sm primary" id="sv-ok">Enregistrer</button><button class="link" id="sv-no">Annuler</button></span>` : `<button class="link" id="sv-add">+ Enregistrer la vue actuelle</button>`);
    $$("#saved [data-i]").forEach(b => b.onclick = () => { const s = state.saved[+b.dataset.i].s; state.q = s.q; $("#q").value = s.q; state.carriers = new Set(s.carriers); state.view = s.view; state.kpi = s.kpi; state.sort = s.sort; $("#sort").value = s.sort; render(); });
    $$("#saved [data-x]").forEach(b => b.onclick = () => { state.saved.splice(+b.dataset.x, 1); renderSaved(); });
    if ($("#sv-add")) $("#sv-add").onclick = () => { state.savingView = true; renderSaved(); $("#sv-n").focus(); };
    if ($("#sv-ok")) {
      const ok = () => { const n = $("#sv-n").value.trim(); if (!n) return $("#sv-n").focus(); state.saved.push({ n, s: snap() }); state.savingView = false; renderSaved(); toast("Vue « " + n + " » enregistrée"); };
      $("#sv-ok").onclick = ok; $("#sv-n").onkeydown = ev => { if (ev.key === "Enter") ok(); };
      $("#sv-no").onclick = () => { state.savingView = false; renderSaved(); };
    }
  }
  function render() { renderKpis(); renderChips(); renderRelance(); renderSaved(); renderViews(); renderRows(); renderBulk(); moreCount(); }

  // filtres
  OPS.forEach(o => $("#f-op").insertAdjacentHTML("beforeend", `<option>${esc(o)}</option>`));
  [...new Set(ENVOIS.map(e => e.client))].sort().forEach(c => $("#f-client").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`));
  $("#q").addEventListener("input", e => { state.q = e.target.value; render(); });
  $("#gsearch").addEventListener("input", e => { go("suivi"); $("#q").value = e.target.value; state.q = e.target.value; state.view = "all"; state.kpi = null; render(); });
  $("#more-filters").onclick = () => { $("#more").hidden = !$("#more").hidden; $("#more-filters").classList.toggle("on", !$("#more").hidden); };
  $$("#more select, #more input").forEach(i => i.addEventListener("change", render));
  const reset = () => { $$("#more select, #more input[type=date]").forEach(i => i.value = ""); $$("#more input[type=checkbox]").forEach(i => i.checked = false); state.q = ""; $("#q").value = ""; state.carriers.clear(); state.kpi = null; render(); };
  $("#reset").onclick = reset; $("#empty-reset").onclick = reset;
  $("#sort").onchange = e => { state.sort = e.target.value; renderRows(); };
  $("#ck-all").onchange = e => { list().forEach(x => e.target.checked ? state.sel.add(x.id) : state.sel.delete(x.id)); renderRows(); renderBulk(); };
  $("#bulk-clear").onclick = () => { state.sel.clear(); renderRows(); renderBulk(); };
  $("#btn-export").onclick = () => toast(`Export CSV — ${list().length} envois`);
  $$("#bulk [data-b]").forEach(b => b.onclick = () => {
    const k = b.dataset.b, sel = [...state.sel].map(i => ENVOIS[i]);
    const free = sel.filter(e => !extra(e).lock), skipped = sel.length - free.length;
    let n = 0, msg;
    if (k === "lock") { free.forEach(e => { doLock(e); n++; }); msg = `${n} envoi(s) traité(s) ★${sel.length - n ? ` · ${sel.length - n} déjà traité(s)` : ""}`; }
    else if (k === "valider") { free.filter(aFacturer).forEach(e => { const x = extra(e); x.factValide = true; logx(x, `Facturation validée (${eur(e.ht + optTotal(x))} HT)`); n++; }); msg = `${n} facturation(s) validée(s)`; }
    else if (k === "nofact") { free.forEach(e => { const x = extra(e); x.noFact = true; logx(x, "Marqué « ne pas facturer »"); n++; }); msg = `${n} envoi(s) marqué(s) « ne pas facturer »`; }
    else { free.forEach(e => logx(extra(e), b.textContent.trim())); msg = `${b.textContent.trim()} — ${free.length} envoi(s)`; }
    if (skipped && k !== "lock") msg += ` · ${skipped} traité(s) ★ ignoré(s)`;
    toast(msg); render();
  });
  $$("#density button").forEach(b => b.onclick = () => { document.body.classList.toggle("compact", b.dataset.d === "compact"); $$("#density button").forEach(x => x.classList.toggle("on", x === b)); });

  // ================= PANNEAU DE DÉTAIL =================
  function openDrawer() { $("#drawer").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false"); $("#scrim").hidden = false; renderMail(); }
  function closeDrawer() { state.ask = null; state.editPrix = null; $("#drawer").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); state.enl = null; mstate.open = false; mstate.compose = null; $("#mail-tab").hidden = true; $("#mailp").classList.remove("on"); document.body.classList.remove("mail-open"); $("#scrim").hidden = true; if (state.open !== null) { state.open = null; $$("#rows tr.open").forEach(t => t.classList.remove("open")); } render(); renderEnl(); }
  $("#d-close").onclick = closeDrawer; $("#scrim").onclick = closeDrawer;
  $("#mail-tab").onclick = () => { mstate.open = !mstate.open; renderMail(); if (!mstate.open) refreshFiche(); };
  $("#d-prev").onclick = () => navEnvoi(-1); $("#d-next").onclick = () => navEnvoi(1);
  const kb = $("#kb");
  $("#kb-btn").onclick = () => kb.hidden = !kb.hidden; $("#kb-close").onclick = () => kb.hidden = true;
  document.addEventListener("keydown", e => {
    const t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#gsearch").focus(); return; }
    if (e.key === "Escape") { if (typing) return t.blur(); if (!kb.hidden) return kb.hidden = true; if (mstate.open) { mstate.open = false; renderMail(); return; } return closeDrawer(); }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "?") { kb.hidden = !kb.hidden; return; }
    if (e.key === "/") { e.preventDefault(); ($("#page-enlev").hidden ? $("#q") : $("#qe")).focus(); return; }
    const dOpen = $("#drawer").classList.contains("on") && state.dkind === "envoi";
    if (dOpen && (e.key === "j" || e.key === "ArrowRight")) { e.preventDefault(); navEnvoi(1); }
    else if (dOpen && (e.key === "k" || e.key === "ArrowLeft")) { e.preventDefault(); navEnvoi(-1); }
    else if (dOpen && /^[1-8]$/.test(e.key)) openEnvoi(state.open, TABS_E[+e.key - 1]);
    else if (dOpen && e.key === "s") askLock(ENVOIS[state.open]);
    else if (!dOpen && !$("#page-suivi").hidden && (e.key === "j" || e.key === "Enter")) { const l = list(); if (l[0]) openEnvoi(l[0].id); }
  });

  function drawerTabs(tabs, cur, cb) {
    $("#d-tabs").innerHTML = tabs.map(t => `<button class="tab ${t.id === cur ? "on" : ""}" data-t="${t.id}">${t.l}${t.n ? `<span class="n">${t.n}</span>` : ""}${t.dot ? `<i class="tdot" title="À vérifier"></i>` : ""}</button>`).join("");
    $$("#d-tabs .tab").forEach(b => b.onclick = () => cb(b.dataset.t));
    $$("#d-tabs .tab").forEach((b, i) => b.title = `${b.textContent.replace(/\d+$/, "").trim()} (touche ${i + 1})`);
  }
  function actions(list) {
    $("#d-actions").innerHTML = list.map(a => `<button class="btn sm ${a[1] || ""}">${a[0]}</button>`).join("");
    $$("#d-actions .btn").forEach(b => b.onclick = () => toast(b.textContent));
  }
  function events(e) {
    const ev = [];
    const t0 = new Date(e.ramasse);
    const add = (h, txt, loc, bad) => { const d = new Date(t0); d.setHours(d.getHours() + h); if (d <= NOW) ev.push({ d, txt, loc, bad }); };
    add(-20, "Ordre de transport enregistré", "MTI");
    if (ST[e.statut].n >= 2) add(0, "Pris en charge par le transporteur", e.dep.ville);
    if (ST[e.statut].n >= 3) { add(6, "Arrivé à l'agence de départ", "Hub " + e.dep.ville); add(18, "En transit", "Lyon"); }
    if (e.statut === "anomalie") add(30, e.al.find(a => a.lv === "crit" && !a.t.startsWith("Pas pris") && !a.t.startsWith("Bloqué"))?.t || "Anomalie", e.liv.ville, true);
    if (ST[e.statut].n >= 4) add(26, "Mis en livraison", e.liv.ville);
    if (e.statut === "relais") add(30, "Déposé en point relais", e.liv.ville);
    if (e.statut === "livre") add(30, "Livré — signé", e.liv.ville);
    return ev.reverse();
  }

  const OPTIONS = [
    ["Assurance / valeur déclarée", 5], ["Batteries lithium (non booké)", 15], ["Boîte carboglace L (livraison incluse)", 215], ["Boîte carboglace M (livraison incluse)", 175],
    ["Boîte carboglace S (livraison incluse)", 135], ["Boîte carboglace XL (livraison incluse)", 255], ["Carboglace (Dry Ice UN1845)", 35], ["Colis hors gabarit (dimensions)", 50],
    ["Colis hors norme (poids)", 80], ["Colis non convoyable", 40], ["Colis non empilable", 250], ["Colis non mécanisable", 15], ["Conditionnement / réemballage", null],
    ["Correction / changement d'adresse", 15], ["Corse & îles", 30], ["Dépôt en point relais", 9], ["Enlèvement chez un tiers", 15], ["Enlèvement le samedi", 30],
    ["Garantie livraison (suivi dédié)", 56], ["Livraison à domicile (particulier)", 5], ["Livraison avant 10h / 10h30", 15], ["Livraison avant 12h", 8], ["Livraison avant 9h", 25],
    ["Livraison en relais colis", 9], ["Livraison le samedi", 12], ["Livraison par QR Code", 2.5], ["Livraison sur plage horaire", 10], ["Livraison sur rendez-vous (créneau 1 h)", 15],
    ["Marchandises dangereuses — quantité exceptée (EQ)", 20], ["Marchandises dangereuses — quantité limitée (LQ)", 50], ["Matières dangereuses (ADR)", 100],
    ["Passage à vide (enlèvement infructueux)", 15], ["Priorité (traitement prioritaire)", 20], ["Relivraison (nouvelle étiquette)", null], ["Stockage (agence / sous douane)", null],
    ["Urgence — livraison sous 2 h", 45], ["Zone difficile d'accès", 25]
  ];
  const STATUTS = ["En attente de prise en charge", "Pris en charge", "En transit", "En cours de livraison", "Livré", "Livré en point relais", "Anomalie", "Retour expéditeur", "Annulé"];
  const eur = v => v.toFixed(2) + " €";
  const H = (icon, title, right = "") => `<div class="sec-h"><span class="sec-i">${icon}</span><span class="sec-t">${title}</span><span class="sec-r">${right}</span></div>`;
  const row2 = (l, v, cls = "") => `<div class="r2 ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const ME = "Wessim FARAG";
  let clk = 40;
  const nowS = () => { clk++; return `23/11 ${16 + Math.floor(clk / 60)}:${String(clk % 60).padStart(2, "0")}`; };
  const logx = (x, t) => x.log.push({ d: nowS(), w: ME, t });
  const optQ = o => o.q || 1;
  const optOnly = x => x.options.reduce((a, o) => a + (o.p || 0) * optQ(o), 0);
  const rOptT = r => (r.opts || []).reduce((a, o) => a + (o.p || 0) * (o.q || 1), 0);
  const rTot = r => (r.fact.p || 0) + rOptT(r);
  // Une option = une seule fois par n° de bordereau
  const okey = l => l.replace(/\s*\(\+?\d+\s*kg\)$/i, "").trim().toLowerCase();
  const sameNo = r => !r.bord || isRe(r); // même n° que l'envoi, ou réétiquetage (les options suivent)
  const takenEnv = (x, skipR) => [...x.options.map(o => o.l), ...x.reliv.filter(r => r !== skipR && !r.bord && !isRe(r)).flatMap(r => r.opts.map(o => o.l))].map(okey);
  const takenR = (x, r) => [...r.opts.map(o => o.l), ...(sameNo(r) ? takenEnv(x, r) : [])].map(okey);
  const bordOf = (e, r) => r && r.bord ? r.bord : e.bord;
  const relivT = x => (x.reliv || []).reduce((a, r) => a + (r.fact.k === "oui" ? rTot(r) : 0), 0);
  const optTotal = x => optOnly(x) + relivT(x);
  const rlTodo = x => (x.reliv || []).some(r => r.fact.k == null);
  const newBord = (e, n) => /^\d+$/.test(e.bord) ? e.bord.slice(0, -4) + String((+e.bord.slice(-4) + 37 * n) % 10000).padStart(4, "0") : e.bord + "-R" + n;
  const OCAT = l => /carboglace|dangereuses|lithium|Dry Ice/i.test(l) || /\bADR\b/.test(l) ? "Marchandises réglementées"
    : /^Livraison|Relivraison|Urgence|Garantie|Corse|Zone/i.test(l) ? "Livraison"
    : /^Enlèvement|Passage à vide/i.test(l) ? "Enlèvement"
    : /^Colis|Conditionnement|Réajustement/i.test(l) ? "Colis"
    : /adresse|Stockage/i.test(l) ? "Incidents & corrections" : "Services";
  const OCATS = ["Livraison", "Enlèvement", "Colis", "Marchandises réglementées", "Incidents & corrections", "Services"];
  const grille = l => { const o = OPTIONS.find(o => o[0] === l); return o ? o[1] : null; };
  const OSRC = { manuel: ["Saisie opérateur", "tms"], auto: ["Auto · écart de poids", "lk"], import: ["Export transporteur", "imp"] };
  function extra(e) {
    if (e._x) return e._x;
    const kg = parseInt(e.poids), livre = e.statut === "livre";
    const x = e._x = {
      dims: ["45×40×15", "50×10×30", "30×30×30", "60×40×40", "20×15×10"][e.id % 5] + " cm",
      nature: "STATUT C", cat: e.contenu === "Document" ? "Document" : "Marchandise",
      options: e.ext ? [{ l: "Enlèvement chez un tiers", p: 15, q: 1, by: "Léa FIXMAN", d: "03/11 10:16", src: "manuel", note: "Départ chez un tiers (adresse extérieure)" }] : [],
      noFact: false, comments: [], snaps: 4 + (e.id % 9),
      dem: { id: "dem-17930" + (21283932 + e.id * 917) + "-" + ["cgoy4", "ab7k2", "pq9x1", "zt3m8"][e.id % 4], canal: ["email", "portail", "téléphone"][e.id % 3], statut: "confirmee",
        recue: new Date(e.ramasse.getTime() - 864e5), service: e.carrier === "TNT" ? "Expédition National Express" : "Expédition " + e.presta, poids: kg + " kg", pal: 1, prix: +(e.ht * .7).toFixed(2) },
      signataire: livre ? (e.livCt.split(" ")[0] === "Service" ? "M Maslo" : e.livCt) + " - " + e.liv.nom.toUpperCase() : null,
      preuve: livre && e.id % 5 !== 0,
      mesure: e.id % 4 === 0 && e.carrier !== "MTI Express" && e.statut !== "attente" ? kg + 3 : null, ecartOk: false,
      factValide: livre && e.id % 3 === 1, lock: null, log: []
    };
    const cd = new Date(e.ramasse.getTime() - 20 * 36e5);
    x.src = e.carrier !== "MTI Express" && e.id % 3 === 2
      ? { k: "import", by: OPS[(e.id >> 1) % 4], d: fmtDT(cd), file: `export_${cslug(e.carrier)}_${String(cd.getDate()).padStart(2, "0")}${String(cd.getMonth() + 1).padStart(2, "0")}.csv` }
      : { k: "tms", by: OPS[e.id % 4], d: fmtDT(cd) };
    if (e.id % 5 === 1) x.options.push({ l: "Livraison avant 12h", p: 8, q: 1, by: x.src.by, d: x.src.d, src: "manuel", note: "Demandé par le client" });
    if (e.id % 11 === 3) x.options.push({ l: "Assurance / valeur déclarée", p: 5, q: 1, by: x.src.by, d: x.src.d, src: "manuel", note: "Valeur déclarée 700 €" });
    if (x.src.k === "import" && e.id % 2 === 0) x.options.push({ l: "Correction / changement d'adresse", p: 15, q: 1, by: x.src.by, d: x.src.d, src: "import", note: `Surcharge présente dans ${x.src.file}` });
    if (x.src.k === "import" && e.id % 4 === 1) x.options.push({ l: "Livraison le samedi", p: 12, q: 1, by: x.src.by, d: x.src.d, src: "import", note: `Surcharge présente dans ${x.src.file}` });
    if (e.id % 13 === 6) x.options.push({ l: "Livraison sur rendez-vous (créneau 1 h)", p: 12, q: 1, by: OPS[2], d: "21/11 14:05", src: "manuel", note: "Prix négocié client (grille 15 €)" });
    x.reliv = [];
    const mk = (n, motif, statut, fact, d, adr) => { const re = e.carrier === "TNT" && n === 1 && e.id !== 57;
      x.reliv.push({ n, type: re ? "reetiq" : "reliv", bord: re || n > 1 || e.id % 2 ? newBord(e, n) : null, motif: re ? RL_MOTIFS[6] : motif, statut, fact: re ? { k: "non", why: RL_RE } : fact, by: OPS[(e.id + n) % 4], d, adr: adr || null, opts: [],
        det: re ? `Nouveau n° trouvé dans l'export ${e.carrier} du ${d.slice(0, 5)} et rattaché automatiquement` : "" }); };
    if (e.statut === "livre" && e.id % 10 === 3) { mk(1, RL_MOTIFS[0], "livre", { k: "oui", p: e.ht }, "18/11 09:20"); if (e.id % 20 === 13) mk(2, RL_MOTIFS[1], "livre", { k: "non", why: RL_WHY[2] }, "19/11 14:02", "Nouvelle adresse : 12 rue des Lilas, " + e.liv.cp + " " + e.liv.ville); }
    if (e.statut === "livre" && e.id % 10 === 7) mk(1, RL_MOTIFS[3], "livre", { k: "non", why: RL_WHY[2] }, "17/11 11:45");
    if ((e.statut === "livraison" || e.statut === "transit") && e.id % 8 === 5) mk(1, RL_MOTIFS[0], "cours", { k: null }, "22/11 10:" + String(10 + e.id % 40));
    if (e.id === 47) { x.reliv[0].fact = { k: "oui", p: e.ht }; mk(2, RL_MOTIFS[1], "livre", { k: "non", why: RL_WHY[2] }, "19/11 14:02", "Nouvelle adresse : 12 rue des Lilas, " + e.liv.cp + " " + e.liv.ville); }
    if (e.statut === "anomalie" && e.carrier !== "TNT" && e.id % 6 === 2) mk(1, RL_MOTIFS[0], "cours", { k: null }, "23/11 09:" + String(10 + e.id % 40));
    const mkR = (motif, statut, fact, d, opt) => { const n = x.reliv.filter(isRet).length + 1; x.reliv.push({ n, type: "retour", bord: e.id % 3 ? newBord(e, 5 + n) : null, motif, statut, fact, by: OPS[(e.id + 2) % 4], d, adr: "Retour à l'expéditeur : " + e.dep.nom + ", " + e.dep.cp + " " + e.dep.ville, opts: opt ? [opt] : [], det: "" }); };
    if (e.id === 47) mkR(RT_MOTIFS[0], "livre", { k: "oui", p: e.ht }, "21/11 16:20", { l: "Stockage (agence / sous douane)", p: 10, q: 2, by: OPS[1], d: "21/11 16:25", note: "2 jours en agence avant retour" });
    if (!x.reliv.length && e.statut === "anomalie" && e.id % 6 === 4) mkR(RT_MOTIFS[1], "cours", { k: null }, "24/11 11:" + String(10 + e.id % 40));
    if (!x.reliv.length && e.statut === "livre" && e.id % 10 === 9) mkR(RT_MOTIFS[e.id % 3 === 0 ? 3 : 2], "livre", e.id % 20 === 9 ? { k: "oui", p: e.ht } : { k: "non", why: RL_WHY[2] }, "19/11 10:" + String(10 + e.id % 40));
    if (e.id === 57) { x.reliv[0].fact = { k: "oui", p: 18 }; x.reliv[0].opts.push({ l: "Livraison avant 12h", p: 8, q: 1, by: x.reliv[0].by, d: x.reliv[0].d, note: "Reprise de l'envoi initial" }); }
    if (e.id === 47) x.reliv[0].opts.push({ l: "Livraison le samedi", p: 12, q: 1, by: x.reliv[0].by, d: x.reliv[0].d, note: "Demandé par le client pour la relivraison" });
    { const seen = new Set(); x.options = x.options.filter(o => !seen.has(okey(o.l)) && seen.add(okey(o.l))); x.reliv.forEach(r => { const t = new Set(r.opts.length && sameNo(r) ? takenEnv(x, r) : []); r.opts = r.opts.filter(o => !t.has(okey(o.l)) && t.add(okey(o.l))); }); }
    x.reliv.forEach(r => x.log.push({ d: r.d, w: r.by, t: `${isRe(r) ? "Réétiquetage " + e.carrier : rlName(r)} créé(e) — ${r.motif}${r.bord ? " · nouveau bordereau " + r.bord : " · même bordereau"}` }));
    if (x.src.k === "import") { x.dem = null; x.log.push({ d: x.src.d, w: x.src.by, t: `Envoi importé depuis l'export du site ${e.carrier} (${x.src.file}) — pas de demande liée` }); }
    else x.log.push({ d: x.src.d, w: x.src.by, t: "Envoi créé dans le TMS — demande " + x.dem.id + " (" + x.dem.canal + ")" });
    if (x.options.length) x.log.push({ d: "03/11 10:16", w: "Léa FIXMAN", t: "Option ajoutée : Enlèvement chez un tiers (15.00 €)" });
    if (livre && e.id % 7 === 0) {
      x.factValide = true; x.ecartOk = true; x.preuve = true;
      x.log.push({ d: "20/11 10:58", w: "Léa FIXMAN", t: "Facturation validée" });
      x.lock = { by: OPS[(e.id + 1) % 4], d: "20/11 11:02" };
      x.log.push({ d: "20/11 11:02", w: x.lock.by, t: "Marqué comme traité ★ — suivi terminé, envoi verrouillé" });
    } else if (!livre && e.statut !== "attente" && e.id % 9 === 4) {
      x.lock = { by: OPS[(e.id + 2) % 4], d: "22/11 17:10" }; x.demoReouv = e.id % 18 === 4;
      x.log.push({ d: "22/11 17:10", w: x.lock.by, t: "Marqué comme traité ★ — suivi terminé, envoi verrouillé" });
    } else if (x.factValide) x.log.push({ d: "21/11 09:30", w: "Compta", t: "Facturation validée" });
    return x;
  }
  const reouv = e => { const x = extra(e); return !!x.lock && unreadOf(ctxE(e)) > 0; }; // traité ★ mais un nouveau mail est arrivé
  const aFacturer = e => { const x = extra(e); return e.statut === "livre" && !x.factValide && !x.noFact && !x.lock; };
  const dotsOf = e => { const x = extra(e); return { colis: !!x.mesure && !x.ecartOk && !x.lock, fact: aFacturer(e), docs: e.statut === "livre" && !x.preuve }; };
  const guard = x => { if (x.lock) { toast("Envoi traité ★ — rouvrez-le pour le modifier"); return true; } return false; };

  function summary(e) {
    const x = extra(e), tot = e.ht + optTotal(x);
    if (x.lock) return { cls: reouv(e) ? "crit" : "lock", txt: `<b>★ Traité</b> par ${esc(x.lock.by)} le ${x.lock.d}${e.statut === "livre" ? ` · facturé ${eur(tot)} HT` : ` · ${ST[e.statut].l.toLowerCase()}`} · consultation seule${reouv(e) ? ` · <b class="c-crit">nouveau mail reçu depuis</b>` : ""}`, acts: reouv(e) ? [["Lire le mail", "mails", "primary"], ["Rouvrir l'envoi", "lock"]] : [] };
    if (e.statut === "livre") {
      const lv = events(e)[0];
      const p = [`<b>Livré le ${fmtDT(lv.d)}</b>${x.signataire ? " à " + esc(x.signataire.split(" - ")[0]) : ""}`,
        x.preuve ? "preuve reçue" : `<b class="c-warn">preuve manquante</b>`,
        x.noFact ? "ne pas facturer" : x.factValide ? `facturation validée (${eur(tot)} HT)` : `<b class="c-warn">${eur(tot)} HT à facturer${x.options.length ? ` dont ${eur(optTotal(x))} d'options` : ""}</b>`];
      if (x.mesure && !x.ecartOk) p.push(`<b class="c-warn">+${x.mesure - parseInt(e.poids)} kg mesurés</b>`);
      const acts = [];
      if (!x.preuve) acts.push(["Demander la preuve", "preuve"]);
      if (!x.factValide && !x.noFact) acts.push(["Valider la facturation", "valider"]);
      acts.push(["★ Marquer comme traité", "lock", "primary"]);
      return { cls: !x.preuve || aFacturer(e) ? "warn" : "ok", txt: p.join(" · "), acts };
    }
    if (e.statut === "anomalie") { const a = e.al.find(a => a.a === "Ouvrir une enquête"); return { cls: "crit", txt: `<b>Anomalie</b> : ${esc(a ? a.t : "à analyser")} · dernier scan ${ago(e.lastScanH)}`, acts: [["Ouvrir une enquête", "enquete", "primary"], ["Prévenir le client", "client"]] }; }
    if (e.statut === "attente") return { cls: e.lastScanH > 48 ? "crit" : "warn", txt: `<b>Pas encore pris en charge</b> · bordereau créé ${ago(e.lastScanH)}`, acts: [["Relancer " + e.carrier, "relance", "primary"], ["Prévenir le client", "client"]] };
    if (e.statut === "relais") return { cls: "warn", txt: `<b>En point relais</b> à ${esc(e.liv.ville)} · le destinataire doit être prévenu`, acts: [["Prévenir le destinataire", "client", "primary"]] };
    const late = e.lastScanH > 48;
    return { cls: late ? "crit" : "", txt: `<b>${ST[e.statut].l}</b> · dernier scan ${ago(e.lastScanH)}${late ? " — sans nouvelles depuis plus de 48 h" : ""}`, acts: late ? [["Relancer " + e.carrier, "relance", "primary"], ["Rafraîchir le suivi", "refresh"]] : [["Rafraîchir le suivi", "refresh"]] };
  }
  function doAct(e, k, reopen = true) {
    const x = extra(e);
    if (k === "lock") return askLock(e);
    if (k === "mails") { mstate.open = true; return openEnvoi(e.id, state.tab); }
    if (guard(x)) return;
    if (k === "valider") { x.factValide = true; logx(x, `Facturation validée (${eur(e.ht + optTotal(x))} HT)`); toast("Facturation validée"); }
    else {
      const m = { preuve: "Preuve de livraison demandée à " + e.carrier, enquete: "Enquête ouverte chez " + e.carrier, client: "Mail préparé pour le client", relance: "Relance envoyée à " + e.carrier, refresh: "Suivi rafraîchi" }[k] || k;
      logx(x, m); toast(m);
      if (["preuve", "enquete", "client", "relance"].includes(k)) { const so = state.open, sk = state.dkind; state.open = e.id; state.dkind = "envoi"; autoMail(ctx(), k); state.open = so; state.dkind = sk; }
    }
    render(); if (reopen && state.open === e.id) openEnvoi(e.id, state.tab);
  }
  // Étoile : un clic = traité (ou rouvert), avec « Annuler » quelques secondes
  function askLock(e) {
    const x = extra(e), was = { lock: x.lock, fv: x.factValide, n: x.log.length, ur: mailsOf(ctxE(e)).map(m => m.unread) };
    const on = !x.lock;
    on ? doLock(e) : doUnlock(e);
    state.ask = null; render(); if (state.open === e.id) openEnvoi(e.id, state.tab);
    toastUndo(on ? `★ ${e.ref} traité — rangé dans « Traités ★ »` : `${e.ref} rouvert — de nouveau à suivre`, () => {
      x.lock = was.lock; x.factValide = was.fv; x.log.length = was.n; mailsOf(ctxE(e)).forEach((m, i) => m.unread = was.ur[i]);
      render(); if (state.open === e.id) openEnvoi(e.id, state.tab); toast("Annulé");
    });
  }
  function toastUndo(msg, undo) {
    const t = $("#toast"); t.innerHTML = `<span>${esc(msg)}</span><button class="t-undo" id="t-undo">Annuler</button>`; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 6000);
    $("#t-undo").onclick = () => { clearTimeout(t._t); t.hidden = true; undo(); };
  }
  function doLock(e) {
    const x = extra(e);
    if (e.statut === "livre" && !x.factValide && !x.noFact) { x.factValide = true; logx(x, `Facturation validée (${eur(e.ht + optTotal(x))} HT)`); }
    state.flash = e.id; setTimeout(() => { if (state.flash === e.id) state.flash = null; }, 1800);
    x.lock = { by: ME, d: nowS() }; logx(x, "Marqué comme traité ★ — suivi terminé, envoi verrouillé");
    mailsOf(ctxE(e)).forEach(m => m.unread = false); // traité = mails lus
  }
  function doUnlock(e) { const x = extra(e); x.lock = null; logx(x, "Envoi rouvert — de nouveau à suivre et modifiable"); }
  function navEnvoi(d) {
    const L = list(), i = L.findIndex(y => y.id === state.open);
    const n = L[i + d]; if (n) openEnvoi(n.id, state.tab); else toast(d > 0 ? "Dernier envoi de la liste" : "Premier envoi de la liste");
  }

  // ===== Mails rattachés à la demande =====
  const MBOX = "suivi@mti-express.fr";
  const CMAIL = { "TNT": "service.client@tnt.fr", "UPS": "support.fr@ups.com", "DHL Express": "cs.express.fr@dhl.com", "Chronopost": "relation.client@chronopost.fr", "FedEx": "service.fr@fedex.com", "GLS France": "service.client@gls-france.com", "GEODIS": "suivi.messagerie@geodis.com", "MTI Express": "exploitation@mti-express.fr" };
  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  const cliMail = (ct, cl) => (/^(service|accueil|réception|m\.)/i.test(ct) ? "contact" : slug(ct.split(" ")[0])) + "@" + slug(cl).slice(0, 14) + ".fr";
  const mstate = { open: false, compose: null, linking: false, sel: null };
  const INBOX = [ // mails reçus non rattachés, proposés au rattachement
    { from: "Samira RIABI <samira@nysos.fr>", subj: "Livraison prévue quand ?", body: "Bonjour, pouvez-vous me dire quand mon colis sera livré ? Merci.", d: "23/11 15:12" },
    { from: "TNT <service.client@tnt.fr>", subj: "Avis de passage — destinataire absent", body: "Le destinataire était absent lors du passage. Une nouvelle tentative aura lieu demain.", d: "23/11 14:05" },
    { from: "Service achats <achats@ffgolf.fr>", subj: "Demande de facture", body: "Bonjour, merci de nous transmettre la facture de cet envoi.", d: "23/11 11:40" }
  ];
  function ctx() { // objet courant du panneau
    if (state.dkind === "envoi" && state.open !== null) return ctxE(ENVOIS[state.open]);
    if (state.dkind === "enl" && state.enl != null) return ctxL(ENLEVEMENTS[state.enl]);
    return null;
  }
  function ctxE(e) { { const x = extra(e); return { kind: "envoi", o: e, x, ref: e.ref, bord: e.bord, carrier: e.carrier, cli: e.client, ct: e.depCt, cmail: cliMail(e.depCt, e.client), label: "cet envoi" }; } }
  function ctxL(x) { { return { kind: "enl", o: x, x, ref: "ENL-" + (2026100 + x.id), bord: x.conf || "", carrier: x.carrier, cli: x.client, ct: x.lieu.contact, cmail: cliMail(x.lieu.contact, x.client), label: "cet enlèvement" }; } }
  const tagS = c => `[${c.ref}${c.bord ? " · " + c.bord : ""}]`;
  function mailsOf(c) {
    const x = c.x; if (x.mails) return x.mails;
    const M = x.mails = [];
    const cli = `${c.ct} <${c.cmail}>`, car = `${c.carrier} <${CMAIL[c.carrier] || "contact@transporteur.fr"}>`;
    if (c.kind === "envoi") {
      const e = c.o;
      if (x.dem && x.dem.canal === "email") M.push({ dir: "in", from: cli, to: MBOX, d: fmtDT(x.dem.recue), subj: `Demande d'expédition ${e.dep.ville} → ${e.liv.ville}`, body: `Bonjour,\n\nMerci d'organiser l'expédition de ${e.colis} colis (${e.poids}) depuis ${e.dep.nom}, ${e.dep.ville}, vers ${e.liv.nom}, ${e.liv.ville}.\n\nCordialement,\n${c.ct}`, how: "Demande d'origine — rattachée à la création de l'envoi" });
      M.push({ dir: "out", from: MBOX, to: cli, d: fmtDT(new Date(e.ramasse.getTime() - 18 * 36e5)), subj: `${tagS(c)} Votre bordereau ${c.carrier}`, body: `Bonjour,\n\nVotre envoi est enregistré sous la référence ${e.ref}. Vous trouverez le bordereau ${c.carrier} n° ${e.bord} en pièce jointe, à coller sur le colis.\n\nL'équipe MTI Express`, pj: "Bordereau_" + e.bord + ".pdf", how: "Envoyé automatiquement par le TMS" });
      if (e.statut === "anomalie") M.push({ dir: "in", from: car, to: MBOX, d: fmtDT(new Date(NOW.getTime() - e.lastScanH * 36e5)), subj: `${tagS(c)} Avis d'anomalie sur votre envoi`, body: `Bonjour,\n\nUne anomalie a été signalée sur l'envoi ${e.bord} : ${e.statLbl || "adresse incomplète / destinataire absent"}. Merci de nous indiquer la marche à suivre.\n\n${c.carrier} — Service client`, unread: true, how: "Rattaché automatiquement : n° de bordereau dans l'objet" });
      if (x.demoReouv) M.push({ dir: "in", from: cli, to: MBOX, d: "23/11 15:48", subj: `RE: ${tagS(c)} Votre bordereau ${c.carrier}`, body: `Bonjour,\n\nLe destinataire nous dit qu'il manque un colis à la livraison. Pouvez-vous vérifier ?\n\nMerci,\n${c.ct}`, unread: true, how: "Rattaché automatiquement : réponse au fil — arrivé après le traitement ★" });
      if (e.statut !== "livre" && e.id % 6 === 2 && !x.lock) M.push({ dir: "in", from: cli, to: MBOX, d: "23/11 09:" + String(10 + e.id % 40).padStart(2, "0"), subj: `RE: ${tagS(c)} Votre bordereau ${c.carrier}`, body: `Bonjour,\n\nOù en est ce colis ? Le destinataire ne l'a toujours pas reçu.\n\nMerci,\n${c.ct}`, unread: true, how: "Rattaché automatiquement : réponse au fil" });
    } else {
      const o = c.o;
      if (o.demandePar === "Mail") M.push({ dir: "in", from: cli, to: MBOX, d: fmtD(new Date(o.date.getTime() - 2 * 864e5)) + " 10:12", subj: `Demande d'enlèvement — ${o.lieu.ville}`, body: `Bonjour,\n\nPouvez-vous programmer un enlèvement de ${o.colis} colis (${o.poids}) chez ${o.lieu.nom}, ${o.lieu.adr}, ${o.lieu.cp} ${o.lieu.ville} ?\nCréneau souhaité : ${o.slot}.\n\n${o.lieu.contact} — ${o.lieu.tel}`, how: "Demande d'origine — rattachée à la création de l'enlèvement" });
      M.push({ dir: "out", from: MBOX, to: cli, d: fmtD(new Date(o.date.getTime() - 2 * 864e5)) + " 10:30", subj: `${tagS(c)} Votre demande d'enlèvement est bien reçue`, body: `Bonjour ${c.ct},\n\nNous avons bien reçu votre demande d'enlèvement (${o.colis} colis, ${o.slot}). Nous revenons vers vous dès la confirmation du transporteur.\n\nMTI Express — Exploitation`, how: "Accusé de réception envoyé automatiquement par le TMS" });
      if (o.etat !== "a_reserver") M.push({ dir: "out", from: MBOX, to: car, d: fmtD(new Date(o.date.getTime() - 864e5)) + " 14:30", subj: `${tagS(c)} Demande d'enlèvement ${o.lieu.cp} ${o.lieu.ville}`, body: `Bonjour,\n\nMerci de programmer un enlèvement :\n${o.lieu.nom}, ${o.lieu.adr}, ${o.lieu.cp} ${o.lieu.ville}\n${o.colis} colis · ${o.poids} · créneau ${o.slot}\nContact sur place : ${o.lieu.contact} ${o.lieu.tel}\n\nMTI Express — Exploitation`, how: "Envoyé à la réservation" });
      if (o.conf && !o.estime) M.push({ dir: "in", from: car, to: MBOX, d: fmtD(new Date(o.date.getTime() - 864e5)) + " 15:02", subj: `RE: ${tagS(c)} Confirmation d'enlèvement n° ${o.conf}`, body: `Bonjour,\n\nNous confirmons l'enlèvement n° ${o.conf}, ${o.slot}.\n\n${c.carrier}`, how: "Rattaché automatiquement : réponse au fil" });
      if (o.etat === "echec") M.push({ dir: "in", from: car, to: MBOX, d: fmtD(o.date) + " 18:20", subj: `${tagS(c)} Enlèvement non effectué`, body: `Bonjour,\n\nLe chauffeur n'a pas pu effectuer l'enlèvement (${o.motif || "colis non prêt"}). Merci de reprogrammer.\n\n${c.carrier}`, unread: true, how: "Rattaché automatiquement : n° d'enlèvement dans l'objet" });
    }
    return M;
  }
  const unreadOf = c => mailsOf(c).filter(m => m.unread).length;
  function mailBadge(e) {
    const c = ctxE(e), n = unreadOf(c), t = mailsOf(c).length;
    if (n) return `<button class="mbadge new" data-mail="1" title="${n} mail(s) non lu(s) — ouvrir les mails">✉ ${n} nouveau${n > 1 ? "x" : ""}</button>`;
    return t ? `<button class="mbadge" data-mail="1" title="Mails rattachés — ouvrir">✉ ${t}</button>` : "";
  }
  function pushMail(c, to, subj, body, how) {
    if (!c) return; mailsOf(c).push({ dir: "out", from: MBOX, to, d: nowS(), subj: `${tagS(c)} ${subj}`, body, how: how || "Envoyé depuis la fiche", by: ME });
    if (c.kind === "envoi") logx(c.x, `Mail envoyé à ${to.split(" <")[0]} : ${subj}`); else c.x.hist.push([`Mail envoyé à ${to.split(" <")[0]} : ${subj}`, ME]);
  }
  const TPL = c => ({
    relance: { to: "car", s: "Relance — merci de nous donner des nouvelles", b: `Bonjour,\n\nNous n'avons pas de nouvelles de l'envoi ${c.bord} depuis plus de 48 h. Pouvez-vous nous indiquer où il se trouve ?\n\nMTI Express — Suivi` },
    preuve: { to: "car", s: "Demande de preuve de livraison", b: `Bonjour,\n\nMerci de nous transmettre la preuve de livraison (POD) de l'envoi ${c.bord}.\n\nMTI Express — Suivi` },
    enquete: { to: "car", s: "Ouverture d'enquête", b: `Bonjour,\n\nNous ouvrons une enquête sur l'envoi ${c.bord}. Merci de nous tenir informés.\n\nMTI Express — Suivi` },
    client: { to: "cli", s: "Information sur votre envoi", b: `Bonjour ${c.ct},\n\nNous vous informons que votre envoi ${c.ref} (${c.carrier} ${c.bord}) …\n\nL'équipe MTI Express` },
    conf: { to: "car", s: "Demande de confirmation d'enlèvement", b: `Bonjour,\n\nMerci de nous confirmer l'enlèvement prévu (n° de confirmation et créneau).\n\nMTI Express — Exploitation` }
  });
  function renderMail() {
    const c = ctx(), P = $("#mailp"), T = $("#mail-tab");
    const on = $("#drawer").classList.contains("on") && !!c;
    T.hidden = !on; if (!on) { P.classList.remove("on"); document.body.classList.remove("mail-open"); return; }
    const M = mailsOf(c), nu = unreadOf(c);
    T.innerHTML = `<span class="mt-ch">${mstate.open ? "›" : "‹"}</span><span class="mt-l">Mails (${M.length})</span>${nu ? `<span class="mt-n">${nu}</span>` : ""}`;
    T.title = mstate.open ? "Masquer les mails" : "Afficher les mails rattachés à " + c.label;
    P.classList.toggle("on", mstate.open); document.body.classList.toggle("mail-open", mstate.open);
    if (!mstate.open) return;
    if (mstate.open) M.forEach(m => { if (m.unread) { m.unread = false; m._was = true; } });
    const cliA = `${c.ct} <${c.cmail}>`, carA = `${c.carrier} <${CMAIL[c.carrier] || "contact@transporteur.fr"}>`;
    const cp = mstate.compose;
    const list = M.slice().reverse().map((m, i) => { const k = M.length - 1 - i; return `<div class="ml ${m.dir} ${m._was ? "new" : ""} ${mstate.sel === k ? "open" : ""}" data-k="${k}">
      <div class="ml-h"><span class="ml-dir">${m.dir === "in" ? "Reçu" : "Envoyé"}</span><b class="ml-f">${esc((m.dir === "in" ? m.from : m.to).split(" <")[0])}</b><span class="ml-d">${m.d}</span></div>
      <div class="ml-s">${esc(m.subj)}</div>
      ${mstate.sel === k ? `<div class="ml-meta">De : ${esc(m.from)}<br>À : ${esc(m.to)}</div><div class="ml-b">${esc(m.body).replace(/\n/g, "<br>")}</div>${m.pj ? `<div class="ml-pj">📎 ${esc(m.pj)}</div>` : ""}<div class="ml-how">${esc(m.how || "")}${m.by ? " · " + esc(m.by) : ""}</div><div class="ml-act"><button class="btn sm" data-rep="${k}">Répondre</button><button class="btn sm" data-fwd="${k}">Transférer</button></div>` : `<div class="ml-p">${esc(m.body.replace(/\n+/g, " ").slice(0, 110))}…</div>`}
    </div>`; }).join("");
    $("#mail-body").innerHTML = `
      <div class="mp-h"><div><b>Mails de ${c.label}</b><div class="muted mp-sub">Tout mail dont l'objet contient <span class="mono">${esc(c.ref)}</span>${c.bord ? ` ou <span class="mono">${esc(c.bord)}</span>` : ""} est rattaché automatiquement, réponses comprises.</div></div><button class="icon-btn" id="mp-x" aria-label="Fermer les mails">✕</button></div>
      <div class="mp-acts"><button class="btn sm primary" id="mp-new">✉ Nouveau mail</button><button class="btn sm" id="mp-link">Rattacher un mail reçu</button></div>
      ${mstate.linking ? `<div class="mp-link"><div class="sub-h">Boîte ${MBOX} — mails non rattachés</div>${INBOX.length ? INBOX.map((m, i) => `<div class="ib"><div><b>${esc(m.from.split(" <")[0])}</b> · <span class="muted">${m.d}</span><div>${esc(m.subj)}</div></div><button class="btn sm" data-ib="${i}">Rattacher</button></div>`).join("") : `<div class="muted" style="font-size:13px">Aucun mail en attente.</div>`}</div>` : ""}
      ${cp ? `<div class="mp-comp">
        <div class="tpls">${Object.entries({ relance: "Relance", preuve: "Preuve de livraison", enquete: "Enquête", client: "Prévenir le client", ...(c.kind === "enl" ? { conf: "Confirmation" } : {}) }).map(([k, l]) => `<button class="chip" data-tpl="${k}">${l}</button>`).join("")}</div>
        <label class="fl">À<select id="mc-to" class="fld"><option value="cli" ${cp.to === "cli" ? "selected" : ""}>${esc(cliA)} — client</option><option value="car" ${cp.to === "car" ? "selected" : ""}>${esc(carA)} — transporteur</option></select></label>
        <label class="fl">Objet<div class="subj"><span class="mono tagp">${esc(tagS(c))}</span><input id="mc-s" class="fld" value="${esc(cp.s || "")}" placeholder="Objet du mail"></div></label>
        <label class="fl">Message<textarea id="mc-b" class="fld" rows="7">${esc(cp.b || "")}</textarea></label>
        <div class="muted" style="font-size:12px;margin:4px 0 8px">La référence reste dans l'objet : la réponse reviendra ici toute seule.</div>
        <div style="display:flex;gap:8px"><button class="btn sm primary" id="mc-go">Envoyer</button><button class="link" id="mc-no">Annuler</button></div></div>` : ""}
      <div class="mp-list">${list || `<div class="muted" style="font-size:13px;padding:10px 0">Aucun mail rattaché pour l'instant.</div>`}</div>`;
    M.forEach(m => delete m._was);
    const re = () => { renderMail(); refreshFiche(); };
    $("#mp-x").onclick = () => { mstate.open = false; renderMail(); };
    $("#mp-new").onclick = () => { mstate.compose = { to: c.kind === "enl" ? "car" : "cli", s: "", b: "" }; mstate.linking = false; renderMail(); $("#mc-s").focus(); };
    $("#mp-link").onclick = () => { mstate.linking = !mstate.linking; renderMail(); };
    $$("#mail-body [data-ib]").forEach(b => b.onclick = () => { const m = INBOX.splice(+b.dataset.ib, 1)[0]; M.push({ dir: "in", from: m.from, to: MBOX, d: m.d, subj: m.subj, body: m.body, how: "Rattaché manuellement par " + ME }); if (c.kind === "envoi") logx(c.x, "Mail rattaché : " + m.subj); else c.x.hist.push(["Mail rattaché : " + m.subj, ME]); mstate.linking = false; mstate.sel = M.length - 1; toast("Mail rattaché à " + c.label); re(); });
    $$("#mail-body .ml").forEach(d => d.onclick = ev => { if (ev.target.closest("button")) return; const k = +d.dataset.k; mstate.sel = mstate.sel === k ? null : k; renderMail(); });
    $$("#mail-body [data-rep]").forEach(b => b.onclick = () => { const m = M[+b.dataset.rep]; mstate.compose = { to: m.dir === "in" ? (m.from.includes(c.cmail) ? "cli" : "car") : (m.to.includes(c.cmail) ? "cli" : "car"), s: "RE: " + m.subj.replace(tagS(c), "").replace(/^RE:\s*/, "").trim(), b: `\n\n\n— Le ${m.d}, ${m.from.split(" <")[0]} a écrit :\n> ` + m.body.replace(/\n/g, "\n> ") }; renderMail(); $("#mc-b").focus(); $("#mc-b").setSelectionRange(0, 0); });
    $$("#mail-body [data-fwd]").forEach(b => b.onclick = () => { const m = M[+b.dataset.fwd]; mstate.compose = { to: m.from.includes(c.cmail) ? "car" : "cli", s: "TR: " + m.subj.replace(tagS(c), "").trim(), b: `\n\n— Message transféré —\nDe : ${m.from}\n\n${m.body}` }; renderMail(); });
    if (cp) {
      const T2 = TPL(c);
      $$("#mail-body [data-tpl]").forEach(b => b.onclick = () => { const t = T2[b.dataset.tpl]; mstate.compose = { to: t.to, s: t.s, b: t.b }; renderMail(); });
      $("#mc-no").onclick = () => { mstate.compose = null; renderMail(); };
      $("#mc-go").onclick = () => { const s = $("#mc-s").value.trim(), bd = $("#mc-b").value.trim(); if (!s) return $("#mc-s").focus(); const to = $("#mc-to").value === "cli" ? cliA : carA; pushMail(c, to, s, bd); mstate.compose = null; mstate.sel = M.length - 1; toast("Mail envoyé à " + to.split(" <")[0] + " — rattaché à " + c.label); re(); };
    }
  }
  function refreshFiche() { if (state.dkind === "envoi" && state.open !== null) { render(); openEnvoi(state.open, state.tab); } else if (state.dkind === "enl" && state.enl != null) { renderEnl(); openEnl(state.enl, state.etab || "apercu"); } }
  // mail auto quand une action « écrit » au transporteur ou au client
  function autoMail(c, k) {
    if (!c) return; const t = TPL(c)[k]; if (!t) return;
    const to = t.to === "cli" ? `${c.ct} <${c.cmail}>` : `${c.carrier} <${CMAIL[c.carrier] || "contact@transporteur.fr"}>`;
    pushMail(c, to, t.s, t.b, "Envoyé depuis le bouton « " + { relance: "Relancer", preuve: "Demander la preuve", enquete: "Ouvrir une enquête", client: "Prévenir le client", conf: "Demander la confirmation" }[k] + " »");
  }
  const TABS_E = ["apercu", "suivi", "reliv", "colis", "fact", "docs", "cmt", "hist"];

  function openEnvoi(id, tab = "apercu") {
    const e = ENVOIS[id];
    if (state.ask && state.ask.id !== id) state.ask = null;
    if (state.open !== id) { mstate.sel = null; mstate.compose = null; mstate.linking = false; }
    state.open = id; state.tab = tab; state.dkind = "envoi";
    const x = extra(e), D = dotsOf(e), lk = !!x.lock;
    $$("#rows tr").forEach(t => t.classList.toggle("open", +t.dataset.id === id));
    const s = ST[e.statut];
    const L = list(), idx = L.findIndex(y => y.id === id);
    $("#d-nav").hidden = false;
    $("#d-pos").textContent = idx >= 0 ? `${idx + 1} / ${L.length}` : "";
    $("#d-prev").disabled = idx <= 0; $("#d-next").disabled = idx < 0 || idx >= L.length - 1;
    const starTitle = lk ? "Envoi traité — cliquer pour le rouvrir" : "Suivi terminé ? Cliquer pour marquer comme traité";
    $("#d-ref").innerHTML = `<button class="star ${lk ? "on" : ""}" id="d-star" title="${starTitle}" aria-label="${starTitle}">${lk ? "★" : "☆"}</button><span>Détail transporteur — ${esc(e.ref)}</span><span class="st ${s.c}">${s.l}</span>`;
    $("#d-sub").innerHTML = `<span class="mono">${esc(e.bord)}</span> · ${esc(e.client)} · ${cb(e.carrier, "sm")} ${esc(e.presta)}`;
    $("#d-actions").innerHTML = `<button class="btn sm" data-h="refresh">↻ Rafraîchir le suivi</button><button class="btn sm" data-h="preuve">Demander la preuve</button><button class="btn sm ${e.prio === 2 ? "primary" : "outline-p"}" data-h="enquete">Ouvrir une enquête</button>
      <select class="btn sm sel-btn"><option>Déplacer dans dossier en cours</option><option>Non lu</option><option>En cours</option><option>Terminé</option></select><button class="btn sm" data-h="Envoi masqué de la liste">Masquer</button>`;
    $$("#d-actions button").forEach(b => b.onclick = () => doAct(e, b.dataset.h));
    $("#d-actions select").onchange = ev => { if (guard(x)) return; logx(x, "Déplacé dans le dossier : " + ev.target.value); toast("Déplacé dans : " + ev.target.value); ev.target.selectedIndex = 0; };
    $("#d-star").onclick = () => askLock(e);

    // résumé + confirmation
    const S = summary(e);
    if (!x.lock && !S.acts.some(a => a[1] === "lock")) S.acts.push(["★ Suivi terminé", "lock"]);
    let sum = `<div class="sum ${S.cls}"><div class="sum-t">${S.txt}</div>${S.acts.length ? `<div class="sum-a">${S.acts.map(a => `<button class="btn sm ${a[2] || ""}" data-k="${a[1]}">${a[0]}</button>`).join("")}</div>` : ""}</div>`;
    if (state.ask && state.ask.id === id) {
      const need = e.statut === "livre" && !x.factValide && !x.noFact;
      sum += state.ask.kind === "lock"
        ? `<div class="confirm"><b>★ Le suivi de cet envoi est terminé ?</b> Il sort de « À traiter » et passe dans « Traités ★ » : on n'a plus besoin d'y revenir. Il est verrouillé, plus personne ne peut le modifier.${need ? ` La facturation (${eur(e.ht + optTotal(x))} HT) sera validée en même temps.` : ""}${e.statut !== "livre" ? ` Il reviendra tout seul dans « À traiter » si un nouveau mail arrive.` : ""}<div class="acts"><button class="btn sm primary" id="cf-yes">★ Oui, marquer comme traité</button><button class="btn sm" id="cf-no">Annuler</button></div></div>`
        : `<div class="confirm"><b>Rouvrir cet envoi ?</b> Il revient dans le suivi et redevient modifiable. Ce sera noté dans l'historique.<div class="acts"><button class="btn sm primary" id="cf-yes">Rouvrir</button><button class="btn sm" id="cf-no">Annuler</button></div></div>`;
    }
    $("#d-sum").innerHTML = sum; $("#d-sum").hidden = false;
    $$("#d-sum [data-k]").forEach(b => b.onclick = () => doAct(e, b.dataset.k));
    if ($("#cf-yes")) {
      $("#cf-yes").onclick = () => { const k = state.ask.kind; state.ask = null; k === "lock" ? (doLock(e), toast("★ Envoi traité — il sort de « À traiter »")) : (doUnlock(e), toast("Envoi rouvert")); render(); openEnvoi(id, state.tab); };
      $("#cf-no").onclick = () => { state.ask = null; openEnvoi(id, state.tab); };
    }

    const ev = events(e);
    const totalOpt = optTotal(x);
    drawerTabs([
      { id: "apercu", l: "Envoi" }, { id: "suivi", l: "Suivi", n: ev.length }, ...(x.reliv.length || tab === "reliv" ? [{ id: "reliv", l: "↻ Relivraisons & retours", n: x.reliv.length, dot: rlTodo(x) }] : []),
      { id: "colis", l: "Colis", dot: D.colis }, { id: "fact", l: "Facturation", n: x.options.length, dot: D.fact },
      { id: "docs", l: "Documents", n: x.preuve ? 1 : 0, dot: D.docs }, { id: "cmt", l: "Échanges", n: x.comments.length },
      { id: "hist", l: "Historique", n: x.log.length }
    ], tab, t => openEnvoi(id, t));
    const B = $("#d-body");
    const lockBar = lk ? `<div class="lock-bar"><span class="lk-i">★</span><div><b>Envoi traité</b> par ${esc(x.lock.by)} le ${x.lock.d} — suivi terminé, consultation seule.</div><button class="link" id="unlock-l" data-ro>Rouvrir</button></div>` : "";
    const stepper = `<div class="stepper">${STEPS.map((st, i) => `<div class="step ${i < s.n ? "d" : ""} ${i === s.n - 1 ? "cur" : ""} ${e.statut === "anomalie" && i === s.n - 1 ? "x" : ""}"><b></b>${st}</div>`).join("")}</div>`;
    const fmtAdr = (nom, ct, adr, cp, ville, pays) => [nom, ct, adr, `${cp} ${ville}`, pays].filter(Boolean).map(esc).join(" · ");
    const priseD = e.statut === "attente" ? new Date(e.ramasse.getTime() + 864e5) : e.ramasse;
    const kg = parseInt(e.poids);
    let html = "";

    if (tab === "apercu") html = `${stepper}
      <div class="sec">${H("🚚", "Enlèvement, livraison &amp; compte")}
        <div class="acc-row acc-col"><span class="lbl">Client (payeur)</span><span class="val big">${esc(e.client)} <button class="pen" title="Changer le payeur">✎</button></span></div>
        <div class="acc-row"><span class="lbl">Opérateurs</span><span class="val ops">${x.src.k === "import" ? `<span class="srcb imp">⇣ Import site ${esc(e.carrier)}</span> par ${avatar(x.src.by)} <b>${esc(x.src.by)}</b> le ${x.src.d} <span class="muted mono" style="font-size:11px">${esc(x.src.file)}</span>` : `<span class="srcb tms">Créé dans le TMS</span> par ${avatar(x.src.by)} <b>${esc(x.src.by)}</b> le ${x.src.d}`}${x.lock ? `<br><span class="srcb lk">★ Traité</span> par ${avatar(x.lock.by)} <b>${esc(x.lock.by)}</b> le ${x.lock.d}` : `<br><span class="muted">★ Pas encore traité</span>`}</span></div>
        <div class="acc-row"><span class="lbl">Sous-compte / Référence / N° de commande</span><input class="inline-in" value="${esc(e.sousCompte)}" placeholder="Saisir…"></div>
        <div class="acc-row"><span class="lbl">Enlèvement</span><span class="val">${fmtAdr(e.dep.nom, e.depCt, e.depAdr, e.dep.cp, e.dep.ville, "France")}${e.ext ? ` <span class="tag ext">Extérieur</span>` : ""}</span></div>
        <div class="acc-row"><span class="lbl">Livraison</span><span class="val">${fmtAdr(e.liv.nom, e.livCt, e.livAdr, e.liv.cp, e.liv.ville, e.liv.pays)}</span></div>
        <div class="acc-row"><span class="lbl">Tél. destinataire</span><span class="val">${e.tel}</span></div>
        <div class="acc-row"><span class="lbl">Prise en charge</span><span class="val">${priseD.toLocaleDateString("fr-FR")}${e.statut === "attente" ? " (prévue)" : ""}</span></div>
        <div class="acc-row"><span class="lbl">Changer le statut</span><span class="val st-change"><select id="st-sel"><option value="">Choisir…</option>${STATUTS.map(s => `<option>${s}</option>`).join("")}</select> au <input type="date" value="2026-11-23"> <button class="btn sm primary" id="st-apply" disabled>Appliquer</button></span></div>
        <div class="acc-foot"><button class="link mono" data-ro>${esc(e.bord)}</button> <span class="muted" style="font-size:12px">envoi</span>${e.colis > 1 ? ` <span class="muted" style="font-size:12px">· ${e.colis} colis</span>` : ""}</div>
      </div>
      <div class="sec">${H("🕓", "Livraison")}
        ${row2("Signataire", x.signataire ? `<b>${esc(x.signataire)}</b>` : `<span class="muted">Pas encore livré</span>`)}
      </div>`;

    if (tab === "suivi") html = `
      <div class="sec">${H("📍", "Parcours", ev.length + " évén.")}
        <ul class="tl">${ev.map((y, i) => `<li class="${i === 0 ? "first" : ""} ${y.bad ? "bad" : ""}"><span class="t">${fmtDT(y.d)}</span><span class="b"></span><span><b style="font-weight:500">${esc(y.txt)}</b> <span class="loc">· ${esc(y.loc)} <span class="code">[000]</span></span></span></li>`).join("")}</ul>
      </div>
      <div class="sec">${H("📄", `Réponses du transporteur`, `${x.snaps} instantanés`)}
        <details class="snaps"><summary>Afficher les réponses brutes du transporteur</summary>${Array.from({ length: Math.min(x.snaps, 4) }, (_, i) => `<div class="snap"><span class="mono">${fmtDT(new Date(NOW.getTime() - i * 36e5 * 7))}</span> — réponse API ${esc(e.carrier)} · ${i ? "inchangée" : "statut mis à jour"}</div>`).join("")}${x.snaps > 4 ? `<div class="muted" style="font-size:12px;padding-top:4px">+ ${x.snaps - 4} autres</div>` : ""}</details>
      </div>
      <div class="sec">${H("✈", "Répondre")}
        <div class="muted" style="font-size:12.5px;margin-bottom:8px">Envoyer une instruction au transporteur (conservée dans l'historique).</div>
        <div class="two"><select class="fld" id="rp-i"><option value="">Instruction…</option><option>Nouvelle présentation</option><option>Mise en instance</option><option>Retour expéditeur</option><option>Changement d'adresse</option></select><input type="date" class="fld" value="2026-11-24"></div>
        <textarea id="rp-t" placeholder="Message au transporteur…" style="margin-top:8px"></textarea>
        <div style="margin-top:8px"><button class="btn sm primary" id="rp-go">Envoyer</button></div>
      </div>`;

    if (tab === "colis") {
      const ass = e.tags.find(t => t[0] === "ass");
      const diff = x.mesure ? x.mesure - kg : 0;
      html = `
      <div class="sec">${H("⚖", "Colis mesuré")}
        <div class="two">
          <div><div class="sub-h">Déclaré</div>${row2("Poids", e.poids)}${row2("Dimensions", x.dims)}${row2("Colis", e.colis)}${row2("Nature", x.nature)}${row2("Catégorie", `<span class="tag">${x.cat}</span>`)}</div>
          <div><div class="sub-h">Mesuré par le transporteur</div>${x.mesure ? row2("Poids", `<b class="${x.ecartOk ? "" : "c-crit"}">${x.mesure} kg</b>`) + row2("Dimensions", x.dims) : `<div class="muted" style="font-style:italic;font-size:13px">Non communiqué par ce transporteur.</div>`}</div>
        </div>
        ${diff > 0 ? `<div class="ecart ${x.ecartOk ? "done" : ""}"><b>Écart : +${diff} kg mesurés par ${esc(e.carrier)}</b><div>Surcoût estimé : <b>${eur(diff * 4)} HT</b> (4,00 €/kg au-delà du poids déclaré)${x.ecartOk ? " — traité" : ""}</div>${x.ecartOk ? "" : `<div class="acts"><button class="btn sm primary" id="ec-add">Ajouter le surcoût en option</button><button class="btn sm" id="ec-ign">Accepter sans surcoût</button></div>`}</div>` : ""}
        <button class="btn sm" style="margin-top:10px" id="ec-fix">⚖ Corriger le poids / les dimensions</button>
      </div>
      <div class="sec">${H("🛡", "Couverture", `<span class="pill">${ass ? "assurée" : "non assurée"}</span>`)}
        ${row2("Indemnité transporteur", `<b>${kg * 33} € (33 €/kg)</b>`)}
        <div class="warn-txt">Barème valeur appliqué par l'équipe Suivi — à confirmer contrat par contrat — à vérifier avant de l'annoncer au client.</div>
        ${row2("Départ", e.ext ? "Extérieur (chez le client)" : "MTI")}
        ${row2("Nature de la marchandise", x.nature)}
        <div class="muted" style="font-style:italic;font-size:13px;margin-top:6px">${ass ? esc(ass[1]) + " — valeur déclarée couverte." : "Marchandise non assurée : seule l'indemnité du transporteur s'appliquera."}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">Calcul incomplet — manque : valeur de la marchandise (facture du client).</div>
      </div>`;
    }

    if (tab === "reliv") {
      const f = state.rlNew === id;
      html = `<div class="sec">${H("↻", "Envoi initial, relivraisons et retours", (() => { const a = x.reliv.filter(r => !isRet(r)).length, b = x.reliv.filter(isRet).length; return [a ? a + " relivraison" + (a > 1 ? "s" : "") : "", b ? b + " retour" + (b > 1 ? "s" : "") : ""].filter(Boolean).join(" · "); })())}
        <div class="muted" style="font-size:12.5px;margin-bottom:10px">Les relivraisons et les retours restent regroupés avec l'envoi initial : même fiche, même ligne dans la liste, une seule facturation.</div>
        <div class="chain">
          <div class="ch-i ch-0"><span class="ch-dot"></span><div><div class="ch-h"><b>Envoi initial</b> <span class="mono">${esc(e.bord)}</span> ${cb(e.carrier, "sm")}</div>
            <div class="ch-d">Ramassé le ${fmtD(e.ramasse)} · ${esc(e.dep.ville)} → ${esc(e.liv.ville)} · ${e.colis} colis · ${esc(e.poids)}${x.reliv.length ? isRe(x.reliv[0]) ? ` · <span style="color:#0e7490">réétiqueté par ${esc(e.carrier)} en agence, nouveau n° ${esc(x.reliv[0].bord)}</span>` : ` · <span class="c-crit">livraison non aboutie : ${esc(x.reliv[0].motif.charAt(0).toLowerCase() + x.reliv[0].motif.slice(1))}</span>` : ""}</div></div></div>
          ${x.reliv.map((r, i) => { const st = rlSt(r);
            return `<div class="ch-i ${isRet(r) ? "ch-ret" : ""}"><span class="ch-dot ${st[1]}"></span><div style="flex:1">
              <div class="ch-h"><b>${isRe(r) ? "Réétiquetage " + esc(e.carrier) : rlName(r)}</b> <span class="mono">${r.bord ? esc(r.bord) : "même bordereau"}</span> <span class="rlv-s ${st[1]}">${st[0]}</span></div>
              <div class="ch-d">${esc(r.motif)} · ${r.adr ? esc(r.adr) : "même adresse"} · créé${rlFem(r)} par ${avatar(r.by)} ${esc(shortN(r.by))} le ${r.d}</div>
              <div class="rf">
                <span class="rf-l">Facturation</span>
                <div class="seg seg-sm"><button data-rf="${i}:oui" class="${r.fact.k === "oui" ? "on" : ""}" ${lk ? "disabled" : ""}>Facturer au client</button><button data-rf="${i}:non" class="${r.fact.k === "non" ? "on" : ""}" ${lk ? "disabled" : ""}>Ne pas facturer</button></div>
                ${r.fact.k === "oui" ? `<label class="rf-p"><input class="fld" data-rp="${i}" value="${(r.fact.p || 0).toFixed(2)}" ${lk ? "disabled" : ""}> € HT</label>${Math.abs((r.fact.p || 0) - e.ht) < .005 ? `<span class="rp-h ok">✓ Prix du transport initial repris (${esc(e.carrier)} — ${esc(e.presta)})</span>` : `<span class="rp-h c-warn">Différent du transport initial (${eur(e.ht)})${lk ? "" : ` <button class="link" data-rpi="${i}">↺ Reprendre ${eur(e.ht)}</button>`}</span>`}`
                  : r.fact.k === "non" ? `<select class="fld" data-rw="${i}" ${lk ? "disabled" : ""}><option value="">Motif…</option>${RL_WHY.map(w => `<option ${w === r.fact.why ? "selected" : ""}>${w}</option>`).join("")}</select>`
                  : `<span class="c-warn" style="font-size:12.5px">À décider avant de valider la facturation</span>`}
              </div>
              ${isRet(r) ? `<div class="rt-box"><b>Retour à l'expéditeur.</b> Le colis revient chez ${esc(e.dep.nom)} (${esc(e.dep.cp)} ${esc(e.dep.ville)}). S'il est refacturé, il reprend le prix du transport initial ; ajoutez les frais éventuels (stockage, réétiquetage…) en options.</div>` : ""}
              ${isRe(r) ? `<div class="re-box"><b>Même envoi, nouveau n° posé par ${esc(e.carrier)}.</b> ${r.det ? esc(r.det) + ". " : ""}Les options déjà vendues suivent automatiquement sur le nouveau n° : elles restent facturées une seule fois, sur l'envoi initial.
                ${x.options.length ? `<div class="re-opts">${x.options.map(o => `<div class="re-o"><span class="ok-i">✓</span><b>${esc(o.l)}</b><span class="muted">${eur((o.p || 0) * (o.q || 1))} · facturée sur l'envoi initial</span></div>`).join("")}</div>` : `<div class="muted" style="margin-top:4px">Aucune option sur l'envoi initial.</div>`}</div>` : ""}
              <div class="ro">
                <div class="ro-h"><span class="rf-l">${isRe(r) ? "Frais en plus (ex. réétiquetage facturé par le transporteur)" : isRet(r) ? "Options du retour" : "Options de la relivraison"}</span>${r.opts.length ? `<span class="muted" style="font-size:12px">${r.opts.length} · ${eur(rOptT(r))} HT${r.fact.k === "non" ? " · non refacturées" : ""}</span>` : ""}</div>
                ${r.opts.map((o, j) => `<div class="ro-l ${r.fact.k === "non" ? "off" : ""}"><div><b>${esc(o.l)}</b><div class="fo-d">${avatar(o.by)} ${esc(shortN(o.by))} · ${o.d}${o.note ? " · " + esc(o.note) : ""}</div></div><span class="n">${o.q || 1} × ${eur(o.p)}</span><b class="n">${eur(o.p * (o.q || 1))}</b>${lk ? "" : `<button class="link danger-l" data-rorm="${i}:${j}" title="Retirer">🗑</button>`}</div>`).join("") || `<div class="muted" style="font-size:12.5px">${isRe(r) ? "Aucun frais en plus." : isRet(r) ? "Aucune option refacturée sur ce retour." : "Aucune option refacturée sur cette relivraison."}</div>`}
                ${lk ? "" : `<div class="ro-add">
                  <select class="fld" id="ro-s-${i}"><option value="">+ Ajouter une option…</option>${OCATS.map(c => `<optgroup label="${c}">${OPTIONS.map((o, k) => [o, k]).filter(([o]) => OCAT(o[0]) === c).map(([o, k]) => `${takenR(x, r).includes(okey(o[0])) ? `<option value="${k}" disabled>✓ ${o[0]} — déjà sur ce bordereau</option>` : `<option value="${k}">${o[0]} — ${o[1] == null ? "tarif à saisir" : eur(o[1])}</option>`}`).join("")}</optgroup>`).join("")}</select>
                  <input class="fld" id="ro-q-${i}" value="1" style="width:48px" title="Quantité">
                  <input class="fld" id="ro-p-${i}" placeholder="€ HT" style="width:76px" title="Prix unitaire HT">
                  <button class="btn sm" data-roadd="${i}">Ajouter</button>
                  ${x.options.length && !isRe(r) && r.bord ? `<button class="link" data-rocp="${i}" title="Copier les options vendues sur l'envoi initial">Reprendre les options de l'envoi (${x.options.length})</button>` : ""}
                </div>`}
              </div></div></div>`; }).join("")}
        </div>
        ${lk ? "" : f ? `<div class="rl-form">
          <div class="sub-h">${state.rlKind === "retour" ? "Nouveau retour à l'expéditeur" : "Nouvelle relivraison"}</div>
          <div class="rl-grid">
            <label>Motif <select class="fld" id="rl-m">${(state.rlKind === "retour" ? RT_MOTIFS : RL_MOTIFS).map(m => `<option>${m}</option>`).join("")}</select></label>
            <label>${state.rlKind === "retour" ? "N° de retour" : "Nouveau bordereau"} <input class="fld" id="rl-b" placeholder="Vide = même n° de bordereau"></label>
            <label>${state.rlKind === "retour" ? "Retour vers" : "Adresse"} <select class="fld" id="rl-a">${state.rlKind === "retour" ? `<option value="">Expéditeur — ${esc(e.dep.nom)}, ${esc(e.dep.ville)}</option><option value="new">Autre adresse…</option>` : `<option value="">Même adresse</option><option value="new">Nouvelle adresse…</option>`}</select></label>
            <label id="rl-a2w" hidden>Nouvelle adresse <input class="fld" id="rl-a2" placeholder="Rue, CP, ville"></label>
          </div>
          <div class="rf" style="margin-top:8px"><span class="rf-l">Facturation</span>
            <div class="seg seg-sm" id="rl-fk"><button data-k="oui" class="on">Facturer au client</button><button data-k="non">Ne pas facturer</button><button data-k="">Décider plus tard</button></div>
            <label class="rf-p" id="rl-pw"><input class="fld" id="rl-p" value="${e.ht.toFixed(2)}"> € HT <span class="muted rp-h">= prix du transport initial</span></label>
            <select class="fld" id="rl-w" hidden><option value="">Motif…</option>${RL_WHY.map(w => `<option>${w}</option>`).join("")}</select>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm primary" id="rl-ok">${state.rlKind === "retour" ? "Créer le retour" : "Créer la relivraison"}</button><button class="btn sm" id="rl-no">Annuler</button></div>
        </div>` : `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="rl-new">+ Créer une relivraison</button><button class="btn sm" id="rt-new">↩ Créer un retour</button></div>`}
      </div>`;
    }

    if (tab === "fact") {
      const byCat = OCATS.map(c => [c, x.options.map((o, i) => [o, i]).filter(([o]) => OCAT(o.l) === c)]).filter(c => c[1].length);
      const ro = lk;
      const oline = ([o, i]) => { const g = grille(o.l), src = OSRC[o.src || "manuel"], diff = g != null && Math.abs(g - o.p) > .001;
        return `<tr class="fo"><td><b>${esc(o.l)}</b><div class="fo-d"><span class="srcb ${src[1]}">${src[0]}</span> ${avatar(o.by)} ${esc(shortN(o.by))} · ${o.d}${diff ? ` · <span class="c-warn">grille ${eur(g)}</span>` : g == null && !/Réajustement/.test(o.l) ? ` · <span class="muted">tarif saisi</span>` : ""}${o.note ? `<div class="fo-n">${esc(o.note)}</div>` : ""}</div></td>
          <td class="n">${optQ(o)}</td><td class="n">${eur(o.p || 0)}</td><td class="n"><b>${eur((o.p || 0) * optQ(o))}</b></td><td class="n">${ro ? "" : `<button class="link danger-l" data-rm="${i}" title="Retirer l'option">🗑</button>`}</td></tr>`; };
      const tot = e.ht + totalOpt, tva = tot * .2;
      html = `
      <div class="sec">${H("€", "Facturation", eur(tot) + " HT")}
        ${x.factValide ? `<div class="okline">✓ Facturation validée</div>` : x.noFact ? "" : e.statut === "livre" ? `<div class="todoline">À facturer : envoi livré, facturation pas encore validée <button class="btn sm primary" id="f-val">Valider la facturation</button></div>` : `<div class="muted" style="font-size:12.5px;margin-bottom:6px">Facturable une fois l'envoi livré.</div>`}
        <table class="ftab">
          <thead><tr><th>Ligne</th><th class="n">Qté</th><th class="n">PU HT</th><th class="n">Total HT</th><th></th></tr></thead>
          <tbody>
            <tr class="fcat"><td colspan="5">Transport</td></tr>
            <tr class="fo"><td><b>${esc(e.carrier)} — ${esc(e.presta)}</b><div class="fo-d">${e.colis} colis · ${esc(e.poids)} · ${esc(e.dep.ville)} → ${esc(e.liv.ville)}${x.dem ? ` · prix proposé à la demande ${eur(x.dem.prix)}` : ` · <span class="srcb imp">Import ${esc(e.carrier)}</span>`}</div></td>
              <td class="n">1</td><td class="n">${state.editPrix === id ? `<span class="prix-ed"><input id="px-in" class="fld" value="${e.ht.toFixed(2)}" style="width:80px"> <button class="btn sm primary" id="px-ok">OK</button><button class="link" id="px-no">✕</button></span>` : `${eur(e.ht)}${ro ? "" : ` <button class="link" id="px-ed" title="Modifier le prix de vente">✎</button>`}`}</td><td class="n"><b>${eur(e.ht)}</b></td><td></td></tr>
            ${byCat.map(([c, l]) => `<tr class="fcat"><td colspan="5">${c} <span class="muted">· ${l.length} option${l.length > 1 ? "s" : ""} · ${eur(l.reduce((a, [o]) => a + o.p * optQ(o), 0))}</span></td></tr>${l.map(oline).join("")}`).join("")}
            ${x.options.length ? "" : `<tr><td colspan="5" class="muted" style="font-size:13px;padding:10px 6px">Aucune option vendue sur cet envoi.</td></tr>`}
            ${x.reliv.length ? `<tr class="fcat"><td colspan="5">Relivraisons, retours &amp; réétiquetages <span class="muted">· ${x.reliv.length} · ${eur(relivT(x))}</span></td></tr>${x.reliv.map(r => `<tr class="fo ${r.fact.k === "non" ? "fo-off" : ""}"><td><b>${isRe(r) ? "Réétiquetage " + esc(e.carrier) : rlName(r)}</b> <span class="mono" style="font-size:11.5px">${r.bord ? esc(r.bord) : "même n°"}</span><div class="fo-d">${esc(r.motif)} · ${avatar(r.by)} ${esc(shortN(r.by))} · ${r.d}${r.fact.k === "oui" ? `<div class="fo-n">${Math.abs((r.fact.p || 0) - e.ht) < .005 ? "Prix du transport initial repris" : "Prix modifié — transport initial " + eur(e.ht)}</div>` : ""}${r.fact.k === "non" ? `<div class="fo-n">Non facturée${r.fact.why ? " — " + esc(r.fact.why) : ""}</div>` : r.fact.k == null ? `<div class="fo-n c-warn">À décider : facturer ou non <button class="link" data-rlgo>Choisir</button></div>` : ""}</div></td><td class="n">1</td><td class="n">${r.fact.k === "oui" ? eur(r.fact.p || 0) : "—"}</td><td class="n"><b>${r.fact.k === "oui" ? eur(r.fact.p || 0) : r.fact.k === "non" ? "0.00 €" : "?"}</b></td><td></td></tr>${isRe(r) && x.options.length ? `<tr class="fo fo-sub fo-info"><td colspan="5"><span class="sub-a">↳</span> Options suivies sur le nouveau n°, déjà comptées plus haut : ${x.options.map(o => esc(o.l)).join(", ")} — pas de double facturation</td></tr>` : ""}${r.opts.map(o => `<tr class="fo fo-sub ${r.fact.k !== "oui" ? "fo-off" : ""}"><td><span class="sub-a">↳</span> <b>${esc(o.l)}</b><div class="fo-d">Option ${isRet(r) ? "du retour" : "de la relivraison"} ${r.n} · ${avatar(o.by)} ${esc(shortN(o.by))}${o.note ? `<div class="fo-n">${esc(o.note)}</div>` : ""}</div></td><td class="n">${o.q || 1}</td><td class="n">${eur(o.p)}</td><td class="n"><b>${r.fact.k === "oui" ? eur(o.p * (o.q || 1)) : r.fact.k === "non" ? "0.00 €" : "?"}</b></td><td></td></tr>`).join("")}`).join("")}` : ""}
          </tbody>
          <tfoot>
            ${(() => { const qx = o => (o.q || 1) > 1 ? ` <span class="muted">(${o.q} × ${eur(o.p)})</span>` : "";
              const ol = (o, sub) => `<tr class="tt-o ${sub ? "tt-sub" : ""}"><td colspan="3">${sub ? "↳ " : ""}Option : ${esc(o.l)}${qx(o)}</td><td class="n">${eur(o.p * (o.q || 1))}</td><td></td></tr>`;
              const same = x.reliv.filter(r => !r.bord && !isRe(r)), own = x.reliv.filter(r => r.bord && !isRe(r)), ret = x.reliv.filter(isRe);
              const rl = r => r.fact.k === "oui" ? `<tr class="tt-o"><td colspan="3">${rlName(r)} : transport</td><td class="n">${eur(r.fact.p || 0)}</td><td></td></tr>${r.opts.map(o => ol(o, 1)).join("")}`
                : `<tr class="tt-o"><td colspan="3" class="muted">${rlName(r)} ${r.fact.k === "non" ? "non facturé" + rlFem(r) + (r.fact.why ? " — " + esc(r.fact.why) : "") : "à décider"}</td><td class="n muted">${r.fact.k == null ? "?" : eur(0)}</td><td></td></tr>`;
              const sub = l => eur(l);
              let h = `<tr class="tt-b"><td colspan="3">Bordereau <span class="mono">${esc(e.bord)}</span> <span class="muted">· envoi initial${ret.length ? " · réétiqueté " + ret.map(r => esc(r.bord)).join(", ") : ""}</span></td><td class="n">${sub(e.ht + optOnly(x) + same.reduce((t, r) => t + (r.fact.k === "oui" ? rTot(r) : 0), 0) + ret.reduce((t, r) => t + (r.fact.k === "oui" ? rTot(r) : 0), 0))}</td><td></td></tr>
                <tr class="tt-o"><td colspan="3">Transport ${esc(e.carrier)} — ${esc(e.presta)}</td><td class="n">${eur(e.ht)}</td><td></td></tr>
                ${x.options.map(o => ol(o)).join("") || `<tr class="tt-o"><td colspan="3" class="muted">Aucune option</td><td class="n muted">${eur(0)}</td><td></td></tr>`}
                ${ret.map(r => `<tr class="tt-o"><td colspan="3">Réétiquetage ${esc(e.carrier)} <span class="mono">${esc(r.bord)}</span> <span class="muted">· options suivies, non refacturées</span></td><td class="n">${r.fact.k === "oui" ? eur(r.fact.p || 0) : eur(0)}</td><td></td></tr>${r.opts.map(o => ol(o, 1)).join("")}`).join("")}
                ${same.map(rl).join("")}`;
              own.forEach(r => { h += `<tr class="tt-b"><td colspan="3">Bordereau <span class="mono">${esc(r.bord)}</span> <span class="muted">· ${rlName(r).toLowerCase()}</span></td><td class="n">${r.fact.k === "oui" ? sub(rTot(r)) : r.fact.k == null ? "?" : eur(0)}</td><td></td></tr>${rl(r)}`; });
              return h; })()}
            <tr class="t"><td colspan="3">Total HT</td><td class="n">${eur(tot)}</td><td></td></tr>
            <tr><td colspan="3">TVA 20 %</td><td class="n">${eur(tva)}</td><td></td></tr>
            <tr class="t2"><td colspan="3">Total TTC</td><td class="n">${eur(tot + tva)}</td><td></td></tr>
          </tfoot>
        </table>
        ${ro ? `<div class="muted" style="font-size:12.5px;margin-top:8px">★ Envoi traité : facturation en consultation seule. Rouvrir l'envoi pour la modifier.</div>` : `
        <div class="sub-h" style="margin-top:14px">Ajouter une option</div>
        <div class="opt-add2">
          <select id="opt-sel" class="fld"><option value="">Choisir une option…</option>${OCATS.map(c => `<optgroup label="${c}">${OPTIONS.map((o, i) => [o, i]).filter(([o]) => OCAT(o[0]) === c).map(([o, i]) => takenEnv(x).includes(okey(o[0])) ? `<option value="${i}" disabled>✓ ${o[0]} — déjà sur ce bordereau</option>` : `<option value="${i}">${o[0]} — ${o[1] == null ? "tarif à saisir" : eur(o[1])}</option>`).join("")}</optgroup>`).join("")}</select>
          <label>Qté <input id="opt-q" class="fld" value="1" style="width:52px"></label>
          <label>PU HT <input id="opt-p" class="fld" placeholder="€" style="width:80px"></label>
          <input id="opt-n" class="fld" placeholder="Motif / commentaire (facultatif)" style="flex:1;min-width:160px">
          <button class="btn sm primary" id="opt-add" disabled>Ajouter</button>
        </div>
        <div class="muted" id="opt-hint" style="font-size:12px;margin-top:4px"></div>
        <button class="link danger-l" id="nofact" style="margin-top:10px">${x.noFact ? "✓ Envoi marqué « ne pas facturer » — annuler" : "Ne pas facturer cet envoi"}</button>`}
      </div>
      <div class="sec">${!x.dem ? `${H("📋", "Demande liée", `<span class="srcb imp">Import ${esc(e.carrier)}</span>`)}
        <div class="muted" style="font-size:13px;margin-bottom:8px">Aucune demande : cet envoi a été fait sur le site ${esc(e.carrier)}, puis intégré au TMS par l'export transporteur.</div>
        ${row2("Fichier importé", `<span class="mono">${esc(x.src.file)}</span>`)}${row2("Importé par", esc(x.src.by))}${row2("Importé le", x.src.d)}
        <div style="margin-top:8px"><button class="btn sm">+ Rattacher une demande</button></div>` : `${H("📋", "Demande liée", `<span class="mono" style="font-size:11px">${x.dem.id}</span>`)}
        ${row2("Canal", x.dem.canal)}${row2("Statut", x.dem.statut)}${row2("Reçue le", fmtDT(x.dem.recue))}${row2("Service demandé", x.dem.service)}
        ${row2("Enlèvement demandé", e.ramasse.toISOString().slice(0, 10))}${row2("Poids annoncé", x.dem.poids)}${row2("Palettes", x.dem.pal)}${row2("Nature annoncée", x.nature)}${row2("Prix proposé", `<b>${x.dem.prix.toFixed(2)} € HT</b>`)}`}
      </div>`;
    }

    if (tab === "docs") html = `
      <div class="sec">${H("🗄", "Pièces conservées", x.preuve ? 1 : 0)}
        ${x.preuve ? `<div class="piece"><span>📄</span><div style="flex:1"><b style="font-weight:500">Preuve de livraison</b><div class="muted" style="font-size:12px">${esc(e.carrier)} · fournie par le transporteur · ${fmtDT(new Date(e.ramasse.getTime() + 30 * 36e5))} · 16 ko</div></div><button class="btn sm" data-ro>Ouvrir</button></div>` : `<div class="muted" style="font-size:13px">${e.statut === "livre" ? `<b class="c-warn">Preuve de livraison manquante.</b> ` : "Aucune pièce. "}<button class="link" id="dc-preuve">Demander la preuve</button></div>`}
      </div>
      <div class="sec">${H("📄", "Bordereau / Étiquette", "PDF")}
        ${row2("Format conservé", "PDF")}
        <button class="btn sm" style="margin-top:8px" data-ro>📄 Voir l'étiquette</button>
      </div>
      <div class="sec">${H("📷", "Photos du colis &amp; signatures")}
        <div class="muted" style="font-style:italic;font-size:13px">${e.carrier === "MTI Express" ? "Aucune photo pour l'instant — elles arriveront depuis l'app chauffeur." : "Aucune preuve terrain. Les photos et signatures viennent de l'app chauffeur : un envoi confié directement à un transporteur n'en a pas."}</div>
      </div>`;

    if (tab === "cmt") html = `
      <div class="sec">${H("💬", "Commentaires", x.comments.length)}
        ${x.comments.length ? x.comments.map(c => `<div class="cmt"><div class="w">${c.w}${c.vis ? " · visible du client" : ""}</div>${esc(c.t)}</div>`).join("") : `<div class="muted" style="font-style:italic;font-size:13px;margin-bottom:8px">Rien encore. Un mot ici remplace un mail à un collègue — et reste lisible par celui qui reprendra le dossier.</div>`}
        <textarea id="cmt-t" placeholder="Ce qu'il faut savoir sur cet envoi…"></textarea>
        <div style="margin-top:8px;display:flex;gap:10px;align-items:center"><button class="btn sm primary" id="cmt-add" disabled>Ajouter</button><label class="muted" style="font-size:12.5px;display:flex;gap:5px;align-items:center"><input type="checkbox" id="cmt-vis"> Visible du client</label></div>
      </div>
      <div class="sec">${H("✉", "Mails", mailsOf(ctx()).length)}
        ${mailsOf(ctx()).slice(-3).reverse().map(m => `<div class="mini-ml"><span class="ml-dir ${m.dir}">${m.dir === "in" ? "Reçu" : "Envoyé"}</span><b>${esc((m.dir === "in" ? m.from : m.to).split(" <")[0])}</b> · ${esc(m.subj.replace(tagS(ctx()), "").trim())} <span class="muted">${m.d}</span></div>`).join("") || `<div class="muted" style="font-size:13px">Aucun mail rattaché.</div>`}
        <button class="btn sm" data-ro id="open-mails" style="margin-top:8px">Ouvrir les mails</button>
      </div>`;

    if (tab === "hist") html = `
      <div class="sec">${H("🕘", "Historique des modifications", x.log.length)}
        <div class="muted" style="font-size:12.5px;margin-bottom:8px">Qui a changé quoi, et quand : statut, prix, options, facturation, traitement ★.</div>
        <ul class="tl">${x.log.slice().reverse().map((l, i) => `<li class="${i === 0 ? "first" : ""}"><span class="t">${l.d}</span><span class="b"></span><span>${esc(l.t)}<div class="loc">${esc(l.w)}</div></span></li>`).join("")}</ul>
      </div>`;

    B.innerHTML = lockBar + html;

    // ---- interactions
    const re = () => { render(); openEnvoi(id, state.tab); };
    if ($("#open-mails")) $("#open-mails").onclick = () => { mstate.open = true; renderMail(); };
    $$("#d-body .pen").forEach(b => b.onclick = () => { if (!guard(x)) toast("Changer le client payeur"); });
    $$("#d-body [data-ro]").forEach(b => { if (!b.id) b.onclick = () => toast(b.textContent.trim()); });
    if ($("#unlock-l")) $("#unlock-l").onclick = () => askLock(e);
    const sel = $("#st-sel");
    if (sel) { sel.onchange = () => $("#st-apply").disabled = !sel.value; $("#st-apply").onclick = () => { logx(x, `Statut changé : « ${sel.value} »`); toast(`Statut « ${sel.value} » appliqué`); re(); }; }
    if ($("#rp-go")) $("#rp-go").onclick = () => { const i = $("#rp-i").value || "Message"; logx(x, `Instruction envoyée à ${e.carrier} : ${i}`); toast("Envoyé à " + e.carrier); re(); };
    if ($("#ec-add")) {
      $("#ec-add").onclick = () => { const d = x.mesure - kg; if (takenEnv(x).includes(okey("Réajustement poids"))) return toast("Un réajustement poids est déjà sur ce bordereau"); x.options.push({ l: `Réajustement poids (+${d} kg)`, p: 4, q: d, by: ME, d: nowS(), src: "auto", note: `Pesé ${x.mesure} kg par le transporteur, déclaré ${kg} kg · 4,00 € / kg` }); x.ecartOk = true; logx(x, `Surcoût poids ajouté en option : +${d} kg = ${eur(d * 4)}`); toast("Surcoût ajouté dans Facturation"); re(); };
      $("#ec-ign").onclick = () => { x.ecartOk = true; logx(x, "Écart de poids accepté sans surcoût"); re(); };
    }
    if ($("#ec-fix")) $("#ec-fix").onclick = () => toast("Corriger le poids / les dimensions");
    if ($("#f-val")) $("#f-val").onclick = () => { if (rlTodo(x)) { toast("Décidez d'abord si la relivraison / le retour est facturé"); return openEnvoi(id, "reliv"); } doAct(e, "valider"); };
    $$("[data-rlgo]").forEach(b => b.onclick = () => openEnvoi(id, "reliv"));
    $$("[data-rf]").forEach(b => b.onclick = () => { if (guard(x)) return; const [i, k] = b.dataset.rf.split(":"), r = x.reliv[+i]; if (r.fact.k === k) return;
      r.fact = k === "oui" ? { k, p: r.fact.p || e.ht } : { k, why: r.fact.why || "" }; logx(x, `${rlName(r)} : ${k === "oui" ? "facturé" + rlFem(r) + " " + eur(r.fact.p) : "non facturé" + rlFem(r)}`); toast(k === "oui" ? `${rlName(r)} facturé${rlFem(r)} ${eur(r.fact.p)} HT` : `${rlName(r)} non facturé${rlFem(r)}`); re(); });
    $$("[data-rp]").forEach(inp => inp.onchange = () => { const r = x.reliv[+inp.dataset.rp], v = parseFloat(inp.value.replace(",", ".")); if (!(v >= 0)) return toast("Prix invalide"); r.fact.p = v; logx(x, `${rlName(r)} : prix ${eur(v)} HT`); re(); });
    $$("[data-rpi]").forEach(b => b.onclick = () => { if (guard(x)) return; const r = x.reliv[+b.dataset.rpi]; r.fact.p = e.ht; logx(x, `${rlName(r)} : prix du transport initial repris (${eur(e.ht)} HT)`); re(); });
    $$("[data-rw]").forEach(sl => sl.onchange = () => { const r = x.reliv[+sl.dataset.rw]; r.fact.why = sl.value; logx(x, `${rlName(r)} non facturé${rlFem(r)} — ${sl.value}`); re(); });
    $$("[id^=ro-s-]").forEach(sl => sl.onchange = () => { const o = OPTIONS[sl.value], i = sl.id.slice(5); $("#ro-p-" + i).value = o && o[1] != null ? o[1].toFixed(2) : ""; });
    $$("[data-roadd]").forEach(b => b.onclick = () => { if (guard(x)) return; const i = +b.dataset.roadd, r = x.reliv[i], o = OPTIONS[$("#ro-s-" + i).value]; if (!o) return toast("Choisissez une option");
      const pu = parseFloat(($("#ro-p-" + i).value || "0").replace(",", ".")) || 0, q = Math.max(1, parseInt($("#ro-q-" + i).value) || 1);
      if (takenR(x, r).includes(okey(o[0]))) return toast(`« ${o[0]} » est déjà sur le bordereau ${bordOf(e, r)}${sameNo(r) && !r.opts.some(y => okey(y.l) === okey(o[0])) ? " (envoi initial, même n°)" : ""}`);
      r.opts.push({ l: o[0], p: pu, q, by: ME, d: nowS(), note: "" }); logx(x, `${rlName(r)} : option ajoutée — ${o[0]} (${q} × ${eur(pu)})`); toast(`Option ajoutée ${isRet(r) ? "au retour" : "à la relivraison"} ${r.n}`); re(); });
    $$("[data-rocp]").forEach(b => b.onclick = () => { if (guard(x)) return; const r = x.reliv[+b.dataset.rocp]; let n = 0;
      if (sameNo(r)) return toast(`Même n° de bordereau que l'envoi (${e.bord}) : les options y sont déjà, pas de doublon`);
      x.options.forEach(o => { if (!takenR(x, r).includes(okey(o.l))) { r.opts.push({ l: o.l, p: o.p, q: o.q || 1, by: ME, d: nowS(), note: "Reprise de l'envoi initial" }); n++; } });
      logx(x, `${rlName(r)} : ${n} option(s) reprise(s) de l'envoi initial`); toast(n ? `${n} option(s) reprise(s) sur ${isRet(r) ? "le retour" : "la relivraison"} ${r.n}` : "Options déjà reprises"); re(); });
    $$("[data-rorm]").forEach(b => b.onclick = () => { if (guard(x)) return; const [i, j] = b.dataset.rorm.split(":").map(Number), r = x.reliv[i], o = r.opts.splice(j, 1)[0]; logx(x, `${rlName(r)} : option retirée — ${o.l}`); re(); });
    if ($("#rl-new")) $("#rl-new").onclick = () => { state.rlNew = id; state.rlKind = "reliv"; openEnvoi(id, "reliv"); };
    if ($("#rt-new")) $("#rt-new").onclick = () => { state.rlNew = id; state.rlKind = "retour"; openEnvoi(id, "reliv"); };
    if ($("#rl-no")) $("#rl-no").onclick = () => { state.rlNew = null; openEnvoi(id, "reliv"); };
    if ($("#rl-ok")) {
      let fk = "oui";
      $("#rl-a").onchange = () => $("#rl-a2w").hidden = $("#rl-a").value !== "new";
      $("#rl-m").onchange = () => { if (state.rlKind !== "retour" && $("#rl-m").value === RL_MOTIFS[6]) { $$("#rl-fk button")[1].click(); $("#rl-w").value = RL_RE; $("#rl-b").placeholder = "Nouveau n° (obligatoire)"; toast("Réétiquetage : les options de l'envoi suivront sans être refacturées"); } else $("#rl-b").placeholder = "Vide = même n° de bordereau"; };
      $$("#rl-fk button").forEach(b => b.onclick = () => { fk = b.dataset.k; $$("#rl-fk button").forEach(y => y.classList.toggle("on", y === b)); $("#rl-pw").hidden = fk !== "oui"; $("#rl-w").hidden = fk !== "non"; });
      $("#rl-ok").onclick = () => { const rt = state.rlKind === "retour", b = $("#rl-b").value.trim(), a2 = $("#rl-a").value === "new" ? $("#rl-a2").value.trim() : "";
        const mt = $("#rl-m").value, re2 = !rt && mt === RL_MOTIFS[6], ty = rt ? "retour" : re2 ? "reetiq" : "reliv", n = x.reliv.filter(y => (y.type || "reliv") === ty).length + 1;
        if (re2 && !b) { toast("Indiquez le nouveau n° posé par le transporteur"); return $("#rl-b").focus(); }
        const r = { n, type: ty, det: "", opts: [], bord: b || null, motif: mt, statut: "cours", by: ME, d: nowS(), adr: rt ? (a2 ? "Retour vers : " + a2 : "Retour à l'expéditeur : " + e.dep.nom + ", " + e.dep.cp + " " + e.dep.ville) : a2 ? "Nouvelle adresse : " + a2 : null,
          fact: fk === "oui" ? { k: "oui", p: parseFloat($("#rl-p").value.replace(",", ".")) || 0 } : fk === "non" ? { k: "non", why: $("#rl-w").value } : { k: null } };
        x.reliv.push(r); state.rlNew = null;
        logx(x, `${rlName(r)} créé${rlFem(r)} — ${r.motif}${r.bord ? " · nouveau bordereau " + r.bord : " · même bordereau"}${r.fact.k === "oui" ? " · facturé" + rlFem(r) + " " + eur(r.fact.p) : r.fact.k === "non" ? " · non facturé" + rlFem(r) : ""}`);
        toast(`${rlName(r)} ajouté${rlFem(r)} à ${e.ref}`); re(); };
    }
    if ($("#dc-preuve")) $("#dc-preuve").onclick = () => doAct(e, "preuve");
    if ($("#px-ed")) $("#px-ed").onclick = () => { state.editPrix = id; openEnvoi(id, "fact"); $("#px-in").focus(); };
    if ($("#px-ok")) {
      $("#px-ok").onclick = () => { const v = parseFloat($("#px-in").value.replace(",", ".")); if (!(v >= 0)) return toast("Prix invalide"); if (v !== e.ht) logx(x, `Prix de vente modifié : ${eur(e.ht)} → ${eur(v)}`); e.ht = v; state.editPrix = null; re(); };
      $("#px-no").onclick = () => { state.editPrix = null; openEnvoi(id, "fact"); };
    }
    const os = $("#opt-sel");
    if (os) {
      const hint = () => { const o = OPTIONS[os.value]; if (!o) return $("#opt-hint").textContent = ""; const p = parseFloat(($("#opt-p").value || "0").replace(",", ".")) || 0, q = Math.max(1, parseInt($("#opt-q").value) || 1);
        $("#opt-hint").innerHTML = `${OCAT(o[0])} · ${q} × ${eur(p)} = <b>${eur(p * q)} HT</b>${o[1] != null && Math.abs(o[1] - p) > .001 ? ` · <span class="c-warn">différent de la grille (${eur(o[1])}) — indiquez le motif</span>` : o[1] == null ? " · tarif à saisir" : " · tarif grille"}`; };
      os.onchange = () => { const o = OPTIONS[os.value]; $("#opt-p").value = o && o[1] != null ? o[1].toFixed(2) : ""; $("#opt-add").disabled = !os.value; hint(); };
      $("#opt-p").oninput = hint; $("#opt-q").oninput = hint;
      $("#opt-add").onclick = () => { const o = OPTIONS[os.value]; const p = parseFloat(($("#opt-p").value || "0").replace(",", ".")) || 0, q = Math.max(1, parseInt($("#opt-q").value) || 1), note = $("#opt-n").value.trim();
        if (takenEnv(x).includes(okey(o[0]))) return toast(`« ${o[0]} » est déjà sur le bordereau ${e.bord} — modifiez la quantité plutôt que de l'ajouter deux fois`);
        x.options.push({ l: o[0], p, q, by: ME, d: nowS(), src: "manuel", note }); logx(x, `Option ajoutée : ${o[0]} (${q} × ${eur(p)} = ${eur(p * q)})${note ? " — " + note : ""}`); toast("Option ajoutée : " + o[0]); re(); };
      $$("[data-rm]").forEach(b => b.onclick = () => { const o = x.options.splice(+b.dataset.rm, 1)[0]; logx(x, `Option retirée : ${o.l}`); re(); });
      $("#nofact").onclick = () => { x.noFact = !x.noFact; logx(x, x.noFact ? "Marqué « ne pas facturer »" : "Remis en facturation"); re(); };
    }
    const ct = $("#cmt-t");
    if (ct) { ct.oninput = () => $("#cmt-add").disabled = !ct.value.trim(); $("#cmt-add").onclick = () => { x.comments.push({ t: ct.value.trim(), w: ME + " · " + nowS(), vis: $("#cmt-vis").checked }); logx(x, "Commentaire ajouté" + ($("#cmt-vis").checked ? " (visible du client)" : "")); re(); }; }
    if (lk) {
      $$("#d-body input, #d-body select, #d-body textarea, #d-body button:not([data-ro])").forEach(b => b.disabled = true);
      $$("#d-actions button, #d-actions select").forEach(b => b.disabled = true);
    }
    openDrawer();
  }

  // ================= ENLÈVEMENTS EXTÉRIEURS =================
  const ES = {
    a_reserver: { l: "À réserver", h: "Demande reçue, pas encore réservée chez le transporteur" },
    reserve: { l: "Réservé", h: "Enlèvement réservé, chauffeur pas encore passé" },
    ramasse: { l: "Ramassé", h: "Premier scan reçu du transporteur" },
    echec: { l: "Non effectué", h: "Chauffeur non passé ou échec — à replanifier" }
  };
  const est = { q: "", carriers: new Set(), mode: "list", kpi: null, cf: {}, sort: { k: "date", dir: 1 }, from: null, to: null, calM: 0, picking: false, pop: null };
  est.cf.carrier = est.carriers;
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const today0 = new Date(NOW); today0.setHours(0, 0, 0, 0);
  const isLate = x => x.etat === "echec" || (x.etat !== "ramasse" && x.date < today0);
  const slotEnd = x => { const [h, m] = x.slot.split("–")[1].split(":").map(Number); const d = new Date(x.date); d.setHours(h, m, 0, 0); return d; };
  const SLOTS = ["08:30–12:30", "09:00–12:00", "10:00–13:00", "13:00–17:00", "14:00–18:00"];
  const DEPTS = { "25": "Doubs", "69": "Rhône", "33": "Gironde", "26": "Drôme", "67": "Bas-Rhin", "38": "Isère", "92": "Hauts-de-Seine" };
  // Règle automatique : réservé, créneau terminé et aucun scan → Non effectué
  ENLEVEMENTS.forEach(x => {
    x.hist = [];
    if (x.etat === "reserve" && slotEnd(x) < NOW) { x.etat = "echec"; x.auto = true; x.motif = `Aucun scan après la fin du créneau (${x.slot.split("–")[1]})`; }
  });
  function demConf(x) { x.demConf = "23/11 16:4" + (x.id % 10); x.hist.push(["Confirmation demandée à " + x.carrier, ME]); const se = state.enl, sk = state.dkind; state.enl = x.id; state.dkind = "enl"; autoMail(ctx(), "conf"); state.enl = se; state.dkind = sk; }

  // ---- 4 statuts définitifs ----
  const ST4 = {
    encours: { l: "En cours", c: "or", h: "prévu aujourd'hui, pas encore réalisé" },
    planifie: { l: "Planifié", c: "bl", h: "prévu à une autre date" },
    nonfait: { l: "Non effectué", c: "rd", h: "non réalisé à la date prévue" },
    realise: { l: "Enlèvement réalisé", c: "gr", h: "marchandise récupérée par le transporteur" }
  };
  const ST4O = ["encours", "planifie", "nonfait", "realise"], ST4S = ["nonfait", "encours", "planifie", "realise"];
  const st4 = x => x.etat === "ramasse" ? "realise" : isLate(x) ? "nonfait" : sameDay(x.date, NOW) ? "encours" : "planifie";
  const eref = x => "ENL-" + (2026100 + x.id);
  const fD = d => d.toLocaleDateString("fr-FR");
  const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0, 0, 0, 0); return r; };
  const ECOLS = [
    { k: "date", l: "Date d'enlèvement", v: x => fD(x.date), s: (a, b) => a.date - b.date || a.slot.localeCompare(b.slot), so: ["Plus ancienne d'abord", "Plus récente d'abord"] },
    { k: "ref", l: "Réf. / Client", v: x => x.client, s: (a, b) => a.client.localeCompare(b.client) || a.id - b.id },
    { k: "adr", l: "Adresse de départ", v: x => x.lieu.cp + " " + x.lieu.ville, s: (a, b) => a.lieu.cp.localeCompare(b.lieu.cp) || a.lieu.nom.localeCompare(b.lieu.nom) },
    { k: "carrier", l: "Transporteur", v: x => x.carrier, s: (a, b) => a.carrier.localeCompare(b.carrier) },
    { k: "dest", l: "Destination", v: x => x.dest.cp + " " + x.dest.ville, s: (a, b) => a.dest.ville.localeCompare(b.dest.ville) },
    { k: "statut", l: "Statut", v: x => ST4[st4(x)].l, s: (a, b) => ST4S.indexOf(st4(a)) - ST4S.indexOf(st4(b)), so: ["Non effectués d'abord", "Réalisés d'abord"] }
  ];
  const EK = [
    ...ST4O.map(k => ({ id: k, l: ST4[k].l, h: ST4[k].h, cls: "k4 k-" + ST4[k].c, st: k })),
    { id: "estime", l: "Non confirmés", h: "date estimée, sans n° de confirmation", cls: "warn", f: x => x.estime && x.etat === "reserve" },
    { id: "colis", l: "Colis attendus", h: "aujourd'hui", cls: "", f: null }
  ];
  function pass(x, skip) {
    const q = est.q.trim().toLowerCase();
    if (q && ![eref(x), x.conf, x.client, x.lieu.nom, x.lieu.adr, x.lieu.ville, x.lieu.cp, x.dest.ville, x.dest.cp, x.carrier, ...x.bords].join(" ").toLowerCase().includes(q)) return false;
    for (const c of ECOLS) { if (c.k === skip) continue; const S = est.cf[c.k]; if (S && S.size && !S.has(c.v(x))) return false; }
    return true;
  }
  const inRange = x => (!est.from || x.date >= est.from) && (!est.to || x.date <= est.to);
  const ebase = x => pass(x);
  function elist() {
    let l = ENLEVEMENTS.filter(x => pass(x) && inRange(x));
    if (est.kpi) l = l.filter(EK.find(k => k.id === est.kpi).f);
    const c = ECOLS.find(c => c.k === est.sort.k), d = est.sort.dir;
    return l.sort((a, b) => d * c.s(a, b) || (a.date - b.date) || a.slot.localeCompare(b.slot));
  }
  function setRange(f, t) { est.from = f; est.to = t || f; est.picking = false; }
  function calLabel() {
    if (!est.from) return "Toutes les dates";
    if (sameDay(est.from, est.to)) return sameDay(est.from, NOW) ? "Aujourd'hui · " + fD(est.from) : "Le " + fD(est.from);
    return `Du ${fD(est.from)} au ${fD(est.to)}`;
  }
  function calHTML() {
    const m0 = new Date(NOW.getFullYear(), NOW.getMonth() + est.calM, 1), st = addD(m0, -((m0.getDay() + 6) % 7));
    const t0 = today0, mon = addD(t0, -((t0.getDay() + 6) % 7));
    const pre = [["Aujourd'hui", t0, t0], ["Demain", addD(t0, 1), addD(t0, 1)], ["Hier", addD(t0, -1), addD(t0, -1)], ["Cette semaine", mon, addD(mon, 6)], ["Semaine prochaine", addD(mon, 7), addD(mon, 13)], ["7 derniers jours", addD(t0, -6), t0], ["Ce mois-ci", new Date(t0.getFullYear(), t0.getMonth(), 1), new Date(t0.getFullYear(), t0.getMonth() + 1, 0)]];
    const isOn = (f, t) => est.from && sameDay(est.from, f) && sameDay(est.to, t);
    const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = addD(st, i), its = ENLEVEMENTS.filter(x => pass(x) && sameDay(x.date, d));
      const inR = est.from && d >= est.from && d <= est.to, edge = est.from && (sameDay(d, est.from) || sameDay(d, est.to));
      const sts = ST4O.filter(k => its.some(x => st4(x) === k));
      cells += `<button class="cd ${d.getMonth() !== m0.getMonth() ? "out" : ""} ${sameDay(d, NOW) ? "now" : ""} ${inR ? "in" : ""} ${edge ? "edge" : ""}" data-cd="${d.getTime()}" title="${its.length} enlèvement(s)"><span class="cn">${d.getDate()}</span><span class="cdots">${sts.map(k => `<i class="lg ${ST4[k].c}"></i>`).join("")}</span>${its.length ? `<span class="cc">${its.length}</span>` : ""}</button>`;
    }
    return `<div class="cal">
      <div class="cal-pre">${pre.map(([l, f, t], i) => `<button class="chip ${isOn(f, t) ? "on" : ""}" data-pre="${i}">${l}</button>`).join("")}<button class="chip ${est.from ? "" : "on"}" data-pre="all">Toutes les dates</button></div>
      <div class="cal-m"><div class="cal-h"><button class="icon-btn" data-cm="-1" aria-label="Mois précédent">‹</button><b>${m0.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</b><button class="icon-btn" data-cm="1" aria-label="Mois suivant">›</button></div>
        <div class="cal-g">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map(d => `<span class="cw">${d}</span>`).join("")}${cells}</div>
        <div class="cal-in"><label>Du <input type="date" class="fld" id="cal-f" value="${iso(est.from)}"></label><label>Au <input type="date" class="fld" id="cal-t" value="${iso(est.to)}"></label></div>
        <div class="cal-hint muted">${est.picking ? "Cliquez sur la date de fin (ou gardez ce seul jour)" : "Cliquez un jour, puis un 2e pour une période"}</div></div>
    </div>`;
  }
  function bindCal(root, again) {
    const t0 = today0, mon = addD(t0, -((t0.getDay() + 6) % 7));
    const pre = [[t0, t0], [addD(t0, 1), addD(t0, 1)], [addD(t0, -1), addD(t0, -1)], [mon, addD(mon, 6)], [addD(mon, 7), addD(mon, 13)], [addD(t0, -6), t0], [new Date(t0.getFullYear(), t0.getMonth(), 1), new Date(t0.getFullYear(), t0.getMonth() + 1, 0)]];
    root.querySelectorAll("[data-pre]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const v = b.dataset.pre; if (v === "all") { est.from = est.to = null; est.picking = false; } else setRange(...pre[+v]); renderEnl(); again(); });
    root.querySelectorAll("[data-cm]").forEach(b => b.onclick = ev => { ev.stopPropagation(); est.calM += +b.dataset.cm; again(); });
    root.querySelectorAll("[data-cd]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const d = new Date(+b.dataset.cd);
      if (est.picking && est.from) { if (d < est.from) { est.to = est.from; est.from = d; } else est.to = d; est.picking = false; } else { est.from = est.to = d; est.picking = true; }
      renderEnl(); again(); });
    const fi = root.querySelector("#cal-f"), ti = root.querySelector("#cal-t");
    const upd = () => { const f = fi.value ? new Date(fi.value + "T00:00") : null, t = ti.value ? new Date(ti.value + "T00:00") : f; if (!f) { est.from = est.to = null; } else { est.from = f; est.to = t < f ? f : t; } est.picking = false; renderEnl(); again(); };
    fi.onchange = upd; ti.onchange = upd;
  }
  // ---- popover (calendrier / filtre de colonne) ----
  function closePop() { est.pop = null; $("#e-pop").hidden = true; $$(".e4t th.pop-on, #cal-btn.on").forEach(t => t.classList.remove("pop-on", "on")); }
  function placePop(anchor) { const r = anchor.getBoundingClientRect(), P = $("#e-pop"); P.hidden = false; const w = P.offsetWidth; P.style.top = (r.bottom + 6) + "px"; P.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 12)) + "px"; }
  function openPop(k, anchor) {
    est.pop = k; const P = $("#e-pop");
    if (k !== "cal" && !(anchor && anchor.isConnected)) anchor = $(`.e4t th[data-k="${k}"]`);
    $$(".e4t th.pop-on").forEach(t => t.classList.remove("pop-on")); $("#cal-btn").classList.toggle("on", k === "cal");
    if (k === "cal") { P.className = "pop pop-cal"; P.innerHTML = calHTML(); bindCal(P, () => openPop("cal", anchor)); return placePop(anchor); }
    const c = ECOLS.find(c => c.k === k), th = $(`.e4t th[data-k="${k}"]`); th && th.classList.add("pop-on");
    const so = c.so || ["Trier de A à Z", "Trier de Z à A"];
    const sortH = `<div class="cf-sort"><button class="${est.sort.k === k && est.sort.dir === 1 ? "on" : ""}" data-so="1">↑ ${so[0]}</button><button class="${est.sort.k === k && est.sort.dir === -1 ? "on" : ""}" data-so="-1">↓ ${so[1]}</button></div>`;
    if (k === "date") { P.className = "pop pop-cal"; P.innerHTML = `<div class="cf-t">${c.l}</div>${sortH}${calHTML()}`; bindCal(P, () => openPop("date", anchor)); }
    else {
      const S = est.cf[k] || (est.cf[k] = new Set()), q0 = (P.querySelector(".cf-q") || {}).value || "";
      const cnt = {}; ENLEVEMENTS.filter(x => pass(x, k) && inRange(x)).forEach(x => { const v = c.v(x); cnt[v] = (cnt[v] || 0) + 1; });
      S.forEach(v => cnt[v] = cnt[v] || 0);
      let vals = Object.keys(cnt); vals.sort(k === "statut" ? (a, b) => ST4O.findIndex(s => ST4[s].l === a) - ST4O.findIndex(s => ST4[s].l === b) : (a, b) => a.localeCompare(b));
      const shown = vals.filter(v => v.toLowerCase().includes(q0.toLowerCase()));
      const lab = v => k === "carrier" ? cb(v, "sm") : k === "statut" ? `<span class="p4 p4-${ST4[ST4O.find(s => ST4[s].l === v)].c}">${esc(v)}</span>` : esc(v);
      P.className = "pop pop-cf";
      P.innerHTML = `<div class="cf-t">${c.l}</div>${sortH}<div class="cf-f">Filtrer</div><input class="fld cf-q" placeholder="Rechercher une valeur…" value="${esc(q0)}">
        <label class="cf-o cf-all"><input type="checkbox" data-all ${S.size ? "" : "checked"}> <span>(Tout sélectionner)</span></label>
        <div class="cf-l">${shown.map(v => `<label class="cf-o"><input type="checkbox" data-v="${esc(v)}" ${!S.size || S.has(v) ? "checked" : ""}> <span class="cf-v">${lab(v)}</span><span class="n">${cnt[v]}</span></label>`).join("") || `<div class="muted" style="padding:6px 4px">Aucune valeur</div>`}</div>
        <div class="cf-b"><button class="btn sm" data-clr ${S.size ? "" : "disabled"}>Effacer le filtre</button><button class="btn sm primary" data-ok>OK</button></div>`;
      const again = () => openPop(k, anchor);
      P.querySelector(".cf-q").oninput = ev => { const pos = ev.target.selectionStart; openPop(k, anchor); const qi = P.querySelector(".cf-q"); qi.focus(); qi.setSelectionRange(pos, pos); };
      P.querySelector("[data-all]").onchange = () => { S.clear(); renderEnl(); again(); };
      P.querySelectorAll("[data-v]").forEach(cbx => cbx.onchange = () => { const v = cbx.dataset.v;
        if (!S.size) { vals.forEach(y => S.add(y)); S.delete(v); } else if (cbx.checked) S.add(v); else S.delete(v);
        if (vals.every(y => S.has(y))) S.clear(); if (!S.size && !cbx.checked) { /* tout décoché */ S.add("\u0000"); }
        renderEnl(); again(); });
      P.querySelector("[data-clr]").onclick = () => { S.clear(); renderEnl(); again(); };
      P.querySelector("[data-ok]").onclick = closePop;
    }
    P.querySelectorAll("[data-so]").forEach(b => b.onclick = ev => { ev.stopPropagation(); est.sort = { k, dir: +b.dataset.so }; renderEnl(); openPop(k, anchor); });
    placePop(anchor);
  }
  document.addEventListener("click", ev => { if (est.pop && !ev.target.closest("#e-pop") && !ev.target.closest("#cal-btn") && !ev.target.closest(".e4t th")) closePop(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && est.pop) { ev.stopPropagation(); closePop(); } }, true);
  addEventListener("resize", () => est.pop && closePop());

  function dsub(x) {
    const s = st4(x);
    if (s === "realise") return sameDay(x.date, NOW) ? "Enlevé aujourd'hui" : "Enlevé";
    if (s === "nonfait") return sameDay(x.date, NOW) ? "Aujourd'hui · créneau dépassé" : "Date dépassée";
    if (s === "encours") return "Aujourd'hui · Jour J";
    return sameDay(x.date, addD(today0, 1)) ? "Demain" : x.date.toLocaleDateString("fr-FR", { weekday: "long" });
  }
  function shint(x) {
    const u = unreadOf(ctxL(x));
    const h = x.etat === "a_reserver" ? "Pas encore réservé" : st4(x) === "nonfait" ? (x.motif || "Aucun scan du transporteur") + (x.auto ? " · auto" : "") : x.estime && x.etat === "reserve" ? (x.demConf ? "Date estimée · confirmation demandée" : "Date estimée, non confirmé") : "";
    return (h ? `<div class="e4-h">${esc(h)}</div>` : "") + (u ? `<span class="mbadge new">✉ ${u}</span>` : "");
  }
  const pill = x => { const s = ST4[st4(x)]; return `<span class="p4 p4-${s.c}">${s.c === "gr" ? "✓ " : ""}${s.l}</span>`; };

  function renderEnl() {
    const base = ENLEVEMENTS.filter(x => pass(x, "statut") && inRange(x));
    const S = est.cf.statut || (est.cf.statut = new Set());
    $("#kpis-enl").innerHTML = EK.map(k => {
      const v = k.st ? base.filter(x => st4(x) === k.st).length : k.f ? base.filter(k.f).length : ENLEVEMENTS.filter(x => pass(x) && sameDay(x.date, NOW) && x.etat !== "ramasse").reduce((s, x) => s + x.colis, 0);
      const on = k.st ? S.size === 1 && S.has(ST4[k.st].l) : est.kpi === k.id;
      return `<button class="kpi ${k.cls} ${on ? "on" : ""}" data-k="${k.id}"><div class="v">${v}</div><div class="l">${k.l}</div><div class="h">${k.h}</div></button>`;
    }).join("");
    $$("#kpis-enl .kpi").forEach(b => b.onclick = () => { const k = EK.find(k => k.id === b.dataset.k);
      if (k.id === "colis") { setRange(today0); est.kpi = null; }
      else if (k.st) { const l = ST4[k.st].l, on = S.size === 1 && S.has(l); S.clear(); if (!on) S.add(l); }
      else est.kpi = est.kpi === k.id ? null : k.id;
      renderEnl(); });
    $("#nav-enlev-nb").textContent = ENLEVEMENTS.filter(x => x.etat !== "ramasse").length;

    const cs = [...new Set(ENLEVEMENTS.map(x => x.carrier))];
    $("#carrier-chips-e").innerHTML = `<button class="ctog all ${est.carriers.size ? "" : "on"}" data-c="">Tous</button>` + cs.map(c => `<button class="ctog ${est.carriers.has(c) ? "on" : ""}" data-c="${c}" aria-pressed="${est.carriers.has(c)}">${cb(c)}<span class="n">${ENLEVEMENTS.filter(x => x.carrier === c).length}</span></button>`).join("");
    $("#carrier-chips-e").classList.toggle("has-sel", est.carriers.size > 0);
    $$("#carrier-chips-e .ctog").forEach(b => b.onclick = () => { const c = b.dataset.c; if (!c) est.carriers.clear(); else est.carriers.has(c) ? est.carriers.delete(c) : est.carriers.add(c); renderEnl(); });

    // jours (raccourcis du calendrier)
    const days = [...new Set(ENLEVEMENTS.map(x => x.date.toDateString()))].map(s => new Date(s)).sort((a, b) => a - b);
    const b0 = ENLEVEMENTS.filter(x => pass(x));
    $("#days").innerHTML = `<button class="day ${est.from ? "" : "on"}" data-d="all"><div class="d1">Période</div><div class="d2">Tous</div><div class="d3">${b0.length} enlèv.</div></button>` + days.map(d => {
      const its = b0.filter(x => sameDay(x.date, d)), late = its.filter(isLate).length;
      const lbl = sameDay(d, NOW) ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "long" });
      const on = est.from && sameDay(est.from, d) && sameDay(est.to, d), inR = est.from && !on && d >= est.from && d <= est.to;
      return `<button class="day ${on ? "on" : ""} ${inR ? "inr" : ""} ${late ? "late" : ""}" data-d="${d.getTime()}"><div class="d1">${lbl}</div><div class="d2">${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "short" })}</div><div class="d3">${late ? late + " non effectué" + (late > 1 ? "s" : "") : its.length + " enlèv."}</div></button>`;
    }).join("");
    $$("#days .day").forEach(b => b.onclick = () => { if (b.dataset.d === "all") { est.from = est.to = null; est.picking = false; } else setRange(new Date(+b.dataset.d)); renderEnl(); });
    $("#cal-l").textContent = calLabel(); $("#cal-btn").classList.toggle("act", !!est.from);

    const l = elist();
    const ests = ENLEVEMENTS.filter(x => x.estime && x.etat === "reserve");
    const todo = ests.filter(x => !x.demConf);
    $("#est-banner").innerHTML = ests.length ? `<div class="est-ban"><span class="badge est">Estimé</span><div><b>${ests.length} enlèvement${ests.length > 1 ? "s" : ""} à date estimée</b> — le transporteur n'a pas encore confirmé le passage.${todo.length < ests.length ? ` <span class="muted">${ests.length - todo.length} confirmation(s) déjà demandée(s).</span>` : ""}</div><div class="acts">${todo.length ? `<button class="btn sm primary" id="ask-all">Demander les ${todo.length} confirmations</button>` : ""}<button class="btn sm" id="see-est">Voir</button></div></div>` : "";
    if ($("#ask-all")) $("#ask-all").onclick = () => { todo.forEach(demConf); toast(`${todo.length} demandes de confirmation envoyées`); renderEnl(); };
    if ($("#see-est")) $("#see-est").onclick = () => { est.kpi = "estime"; renderEnl(); };
    // filtres actifs
    const act = [];
    if (est.from) act.push([`Date : ${calLabel()}`, () => { est.from = est.to = null; }]);
    ECOLS.forEach(c => { const F = est.cf[c.k]; if (F && F.size) act.push([`${c.l} : ${[...F].filter(v => v !== "\u0000").join(", ") || "aucune valeur"}`, () => F.clear()]); });
    if (est.kpi) act.push([EK.find(k => k.id === est.kpi).l, () => { est.kpi = null; }]);
    if (est.q.trim()) act.push([`Recherche : « ${est.q.trim()} »`, () => { est.q = ""; $("#qe").value = ""; }]);
    $("#e-actf").innerHTML = `<span class="e-cnt"><b>${l.length}</b> enlèvement${l.length > 1 ? "s" : ""}</span>` + act.map(([t], i) => `<button class="fchip" data-af="${i}" title="Retirer ce filtre">${esc(t)} <span>✕</span></button>`).join("") + (act.length > 1 ? `<button class="link" data-af="all">Tout effacer</button>` : "");
    $$("#e-actf [data-af]").forEach(b => b.onclick = () => { if (b.dataset.af === "all") act.forEach(a => a[1]()); else act[+b.dataset.af][1](); renderEnl(); });

    $("#board").hidden = est.mode !== "board"; $("#elist").hidden = est.mode !== "list"; $("#villes").hidden = est.mode !== "ville";
    if (est.mode === "ville") {
      const g = {}; l.forEach(x => (g[x.lieu.cp.slice(0, 2)] ||= []).push(x));
      $("#villes").innerHTML = Object.entries(g).sort((p, q) => q[1].length - p[1].length).map(([dp, its]) => {
        const by = {}; its.forEach(x => by[x.carrier] = (by[x.carrier] || 0) + 1);
        const kg = {}; its.filter(x => x.etat !== "ramasse").forEach(x => (kg[x.carrier + "|" + x.date.toDateString()] ||= []).push(x));
        const reg = Object.entries(kg).filter(([, v]) => v.length > 1);
        return `<div class="vgroup"><div class="vg-h"><span class="vg-d">${dp}</span><div><b>${DEPTS[dp] || "Département " + dp}</b><div class="muted" style="font-size:12px">${[...new Set(its.map(x => x.lieu.ville))].map(esc).join(", ")}</div></div><span class="vg-n">${its.length} enlèv. · ${Object.entries(by).map(([c, n]) => `${c} ×${n}`).join(", ")}</span></div>
          ${reg.map(([k, v]) => `<div class="vg-reg"><span><b>${v.length} enlèvements ${k.split("|")[0]}</b> le ${sameDay(v[0].date, NOW) ? "aujourd'hui" : fmtD(v[0].date)} dans ce secteur — un seul passage chauffeur possible.</span><button class="btn sm" data-a="Regrouper en un seul enlèvement">Regrouper</button></div>`).join("")}
          <div class="vg-list">${its.map(card).join("")}</div></div>`;
      }).join("") || `<div class="muted">Aucun enlèvement</div>`;
    }
    $("#board").innerHTML = ST4O.map(k => {
      const its = l.filter(x => st4(x) === k);
      return `<div class="col c4-${ST4[k].c}"><div class="col-h"><div>${ST4[k].l}<small>${ST4[k].h}</small></div><span class="n">${its.length}</span></div>${its.map(card).join("") || `<div class="muted" style="font-size:12px;padding:8px 4px">Aucun enlèvement</div>`}</div>`;
    }).join("");
    $("#ehead").innerHTML = ECOLS.map(c => { const F = est.cf[c.k], fon = (F && F.size) || (c.k === "date" && est.from), son = est.sort.k === c.k;
      return `<th data-k="${c.k}" class="${fon ? "f-on" : ""} ${son ? "s-on" : ""}"><button class="th-s" data-sort="${c.k}" title="Trier">${c.l}<span class="sa">${son ? (est.sort.dir === 1 ? "↑" : "↓") : "↕"}</span></button><button class="th-f" data-cf="${c.k}" title="Filtrer${c.k === "date" ? " — calendrier" : ""}" aria-label="Filtrer ${c.l}">${c.k === "date" ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="${fon ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>`}</button></th>`; }).join("");
    $$("#ehead [data-sort]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const k = b.dataset.sort; est.sort = est.sort.k === k ? { k, dir: -est.sort.dir } : { k, dir: 1 }; renderEnl(); });
    $$("#ehead [data-cf]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const k = b.dataset.cf; if (est.pop === k) return closePop(); openPop(k, b.closest("th")); });
    $("#erows").innerHTML = l.map(x => { const s = ST4[st4(x)];
      return `<tr data-id="${x.id}" class="e4 e4-${s.c}">
        <td><b>${fD(x.date)}</b><div class="e4-s cap">${dsub(x)}</div><div class="e4-s">${x.slot}</div></td>
        <td><b>${eref(x)}</b><div class="e4-s up">${esc(x.client)}</div></td>
        <td><b>${esc(x.lieu.nom)}</b><div class="e4-s">${esc(x.lieu.adr)}</div><div class="e4-s">${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div></td>
        <td>${cb(x.carrier)}<div class="e4-s">${x.colis} colis · ${x.poids}</div>${x.conf ? `<div class="e4-s">N° <span class="mono">${x.conf}</span></div>` : ""}</td>
        <td><b>${esc(x.dest.ville)}</b><div class="e4-s">${esc(x.dest.cp)}</div></td>
        <td>${pill(x)}${shint(x)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Aucun enlèvement pour ces filtres</td></tr>`;
    if (est.pop && est.pop !== "cal") { const th = $(`.e4t th[data-k="${est.pop}"]`); th && th.classList.add("pop-on"); }
    $$("#villes [data-a]").forEach(b => { if (!b.closest(".card")) b.onclick = ev => { ev.stopPropagation(); toast(b.dataset.a); }; });
    $$("#board .card, #villes .card, #erows tr[data-id]").forEach(c => c.onclick = ev => {
      const a = ev.target.dataset.a, x = ENLEVEMENTS[+c.dataset.id];
      if (a) { ev.stopPropagation(); if (a === "Demander la confirmation") { demConf(x); toast("Confirmation demandée à " + x.carrier); return renderEnl(); } if (a === "Reprogrammer") return openEnl(x.id); return toast(a); }
      openEnl(+c.dataset.id);
    });
  }
  function badge(x) {
    if (x.etat === "a_reserver") return `<span class="badge late">Pas encore réservé</span>`;
    if (x.etat === "echec") return `<span class="badge late">Non effectué</span>`;
    if (x.estime) return x.demConf ? `<span class="badge est">Estimé · confirmation demandée</span>` : `<span class="badge est">Estimé</span>`;
    return `<span class="badge conf">Confirmé</span>`;
  }
  function card(x) {
    const late = isLate(x);
    const acts = { a_reserver: ["Réserver chez " + x.carrier], reserve: x.estime ? (x.demConf ? ["Relancer"] : ["Demander la confirmation"]) : ["Relancer"], ramasse: ["Voir les envois"], echec: ["Reprogrammer", "Prévenir le client"] }[x.etat];
    return `<div class="card ${x.estime && x.etat === "reserve" ? "est" : ""}" data-id="${x.id}" style="--cc:${cColor(x.carrier)}">
      <div class="r1"><span class="cn">${esc(x.client)}${x.auto ? ` <span class="badge auto" title="Passé automatiquement en Non effectué">auto</span>` : ""}</span><span class="slot">${sameDay(x.date, NOW) ? "Auj." : fmtD(x.date)} · ${x.slot}</span></div>
      <div class="addr">${esc(x.lieu.nom)} — ${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div>
      ${x.motif ? `<div class="al crit" style="margin-top:6px"><i></i><span>${esc(x.motif)}</span></div>` : late && x.etat !== "echec" ? `<div class="al crit" style="margin-top:6px"><i></i><span>Date dépassée, pas de scan</span></div>` : ""}
      <div class="r3"><span class="carrier" style="font-weight:500">${cb(x.carrier)} ${x.colis} colis${unreadOf(ctxL(x)) ? ` <span class="mbadge new">✉ ${unreadOf(ctxL(x))}</span>` : ""}</span>${x.etat === "ramasse" || x.etat === "echec" ? pill(x) : x.etat === "a_reserver" ? "" : badge(x)}</div>
      <div class="act">${acts.map(a => `<button class="btn sm" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div>
    </div>`;
  }
  function openEnl(id, tab = "apercu") {
    const x = ENLEVEMENTS[id];
    if (state.enl !== id) { mstate.sel = null; mstate.compose = null; mstate.linking = false; }
    state.dkind = "enl"; state.enl = id; state.etab = tab; $("#d-nav").hidden = true; $("#d-sum").hidden = true;
    const order = ["a_reserver", "reserve", "ramasse"];
    const n = x.etat === "echec" ? 2 : order.indexOf(x.etat) + 1;
    $("#d-ref").innerHTML = `Enlèvement ${eref(x)} ${pill(x)} ${x.etat !== "ramasse" && x.etat !== "echec" ? badge(x) : ""}`;
    $("#d-sub").innerHTML = `${esc(x.client)} · ${cb(x.carrier, "sm")} · ${sameDay(x.date, NOW) ? "aujourd'hui" : x.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ${x.slot}`;
    actions(x.etat === "a_reserver" ? [["Réserver chez " + x.carrier, "primary"], ["Modifier"], ["Annuler", "danger"]]
      : x.etat === "echec" ? [["Prévenir le client"], ["Ouvrir une réclamation"]]
        : x.etat === "ramasse" ? [["Voir les envois liés"], ["Imprimer le récapitulatif"]]
          : [x.estime ? ["Saisir la confirmation", "primary"] : ["Relancer le transporteur"], ...(x.estime && !x.demConf ? [["Demander la confirmation"]] : []), ["Modifier le créneau"], ["Annuler", "danger"]]);
    $$("#d-actions .btn").forEach(b => { const t = b.textContent; if (/^Relancer|^Prévenir le client/.test(t)) b.onclick = () => { autoMail(ctx(), t.startsWith("Relancer") ? "relance" : "client"); toast("Mail envoyé — rattaché à l'enlèvement"); renderEnl(); openEnl(id, tab); }; });
    $$("#d-actions .btn").forEach(b => { if (b.textContent === "Demander la confirmation") b.onclick = () => { demConf(x); toast("Confirmation demandée à " + x.carrier); renderEnl(); openEnl(id, tab); }; });
    drawerTabs([{ id: "apercu", l: "Aperçu" }, { id: "bords", l: "Bordereaux", n: x.bords.length }, { id: "hist", l: "Historique" }], tab, t => openEnl(id, t));
    const B = $("#d-body");
    const steps = ["Demandé", "Planifié", "Enlèvement réalisé"];
    if (tab === "apercu") B.innerHTML = `<div class="stepper">${steps.map((s, i) => `<div class="step ${i < n ? "d" : ""} ${i === n - 1 ? "cur" : ""} ${x.etat === "echec" && i === 2 ? "x" : ""}"><b></b>${x.etat === "echec" && i === 2 ? "Non effectué" : s}</div>`).join("")}</div>
      ${x.motif ? `<div class="alert-box"><b>${esc(x.motif)}</b>${x.auto ? "Passé automatiquement en « Non effectué » : réservé, créneau terminé, aucun scan du transporteur." : "À replanifier avec le client et le transporteur."}<div class="acts"><button class="btn sm">Appeler ${esc(x.lieu.contact)}</button></div></div>
      <div class="box resched"><h3>Reprogrammer l'enlèvement</h3><div class="two"><label class="fl">Nouvelle date<input type="date" id="rs-d" class="fld" value="2026-11-24"></label><label class="fl">Créneau<select id="rs-s" class="fld">${SLOTS.map(s => `<option ${s === x.slot ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><label class="ck" style="margin:8px 0;display:flex;gap:6px;font-size:13px"><input type="checkbox" id="rs-m" checked> Prévenir ${esc(x.lieu.contact)} par mail</label><button class="btn sm primary" id="rs-go">Reprogrammer chez ${x.carrier}</button></div>` : ""}
      ${x.estime && x.etat === "reserve" ? `<div class="alert-box warn"><b>Date estimée — pas de numéro de confirmation du transporteur</b>Saisir la confirmation dès réception pour sécuriser le passage.<div class="acts"><button class="btn sm primary">Saisir la confirmation</button><button class="btn sm">Relancer ${x.carrier}</button></div></div>` : ""}
      <div class="box"><h3>Lieu d'enlèvement</h3><b>${esc(x.lieu.nom)}</b><div class="muted">${esc(x.lieu.adr)}<br>${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div><dl class="kv" style="margin-top:10px"><dt>Contact sur place</dt><dd>${esc(x.lieu.contact)} · ${esc(x.lieu.tel)}</dd><dt>Créneau</dt><dd>${x.slot}</dd></dl></div>
      <div class="box"><h3>Enlèvement</h3><dl class="kv"><dt>Transporteur</dt><dd>${x.carrier}</dd><dt>N° d'enlèvement</dt><dd class="mono">${x.conf || "—"}</dd><dt>Colis / poids</dt><dd>${x.colis} colis · ${x.poids}</dd><dt>Destination</dt><dd>${esc(x.dest.cp)} ${esc(x.dest.ville)}</dd><dt>Compte payeur</dt><dd>${esc(x.client)}</dd><dt>Demandé via</dt><dd>${x.demandePar}</dd></dl></div>`;
    if (tab === "bords") B.innerHTML = `<div class="box"><h3>Bordereaux rattachés</h3><table class="grid"><thead><tr><th>Bordereau</th><th>Statut</th><th></th></tr></thead><tbody>${x.bords.map(b => `<tr><td class="mono">${b}</td><td>${x.etat === "ramasse" ? "Pris en charge" : "En attente du chauffeur"}</td><td><button class="link">Ouvrir dans le suivi</button></td></tr>`).join("")}</tbody></table>${x.colis > x.bords.length ? `<div class="al warn" style="margin-top:10px"><i></i><span>${x.colis - x.bords.length} colis sans bordereau rattaché</span></div>` : ""}<div style="margin-top:10px"><button class="btn sm">+ Rattacher un bordereau</button></div></div>`;
    if (tab === "hist") B.innerHTML = `<div class="box"><h3>Historique</h3><ul class="tl">${[...x.hist.slice().reverse(), x.auto ? ["Passé automatiquement en Non effectué — aucun scan après " + x.slot.split("–")[1], "Règle automatique"] : null, x.etat === "ramasse" ? ["Premier scan transporteur reçu", "auto"] : null, x.etat === "echec" ? [x.motif, "transporteur"] : null, x.conf && !x.estime ? ["Confirmation " + x.conf + " reçue", x.carrier] : null, x.etat !== "a_reserver" ? ["Réservé chez " + x.carrier, "Opérateur MTI"] : null, ["Demande créée", x.demandePar]].filter(Boolean).map((h, i) => `<li class="${i === 0 ? "first" : ""}"><span class="t">${fmtD(x.date)}</span><span class="b"></span><span>${esc(h[0])}<div class="loc">${esc(h[1])}</div></span></li>`).join("")}</ul></div>`;
    $$("#d-body .btn, #d-body .link").forEach(b => b.onclick = () => toast(b.textContent));
    if ($("#rs-go")) $("#rs-go").onclick = () => {
      const v = $("#rs-d").value; if (!v) return toast("Choisir une date");
      x.date = new Date(v + "T00:00"); x.slot = $("#rs-s").value; x.etat = "reserve"; x.estime = true; x.demConf = null; x.motif = null; x.auto = false;
      x.hist.push([`Reprogrammé au ${fmtD(x.date)} ${x.slot}${$("#rs-m").checked ? " · client prévenu" : ""}`, ME]);
      if ($("#rs-m").checked) { const c = ctx(); pushMail(c, `${c.ct} <${c.cmail}>`, `Enlèvement reprogrammé le ${fmtD(x.date)}`, `Bonjour ${c.ct},\n\nL'enlèvement n'a pas pu avoir lieu. Il est reprogrammé le ${fmtD(x.date)}, créneau ${x.slot}. Merci de tenir les colis prêts.\n\nMTI Express — Exploitation`, "Envoyé à la reprogrammation"); }
      toast(`Reprogrammé le ${fmtD(x.date)} · ${x.slot}`); renderEnl(); openEnl(id);
    };
    openDrawer();
  }
  $("#qe").addEventListener("input", e => { est.q = e.target.value; renderEnl(); });
  $$("#mode button").forEach(b => b.onclick = () => { est.mode = b.dataset.m; $$("#mode button").forEach(x => x.classList.toggle("on", x === b)); renderEnl(); });
  $("#cal-btn").onclick = ev => { ev.stopPropagation(); if (est.pop === "cal") return closePop(); openPop("cal", $("#cal-btn")); };
  $("#btn-new-enl").onclick = () => toast("Formulaire de nouvel enlèvement — hors maquette");

  render(); renderEnl(); go(location.hash === "#enlev" ? "enlev" : "suivi");
})();
