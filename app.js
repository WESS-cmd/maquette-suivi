(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtD = d => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const fmtDT = d => fmtD(d) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const cColor = c => CARRIERS[c] || "var(--autre)";
  const ago = h => h < 1 ? "à l'instant" : h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
  const toast = m => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2200); };

  $("#clock").textContent = NOW.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + " — " + NOW.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

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
  const state = { q: "", carriers: new Set(), view: "todo", kpi: null, sort: "urgence", sel: new Set(), open: null };

  const KPIS = [
    { id: "prio", l: "À traiter en priorité", h: "alerte rouge", cls: "crit", f: e => e.prio === 2 },
    { id: "noscan", l: "Aucun scan > 48 h", h: "hors livrés", cls: "warn", f: e => e.statut !== "livre" && e.lastScanH > 48 },
    { id: "anom", l: "Anomalies", h: "absent, adresse, casse…", cls: "crit", f: e => e.statut === "anomalie" },
    { id: "relais", l: "En point relais", h: "à prévenir", cls: "warn", f: e => e.statut === "relais" },
    { id: "nonlivre", l: "Non livrés", h: "tous transporteurs", cls: "blue", f: e => e.statut !== "livre" },
    { id: "ext", l: "Enlèvements extérieurs", h: "ouvrir la page dédiée →", cls: "", f: null, go: "enlev" }
  ];
  const VIEWS = [
    { id: "todo", l: "À traiter", f: e => e.prio > 0 },
    { id: "cours", l: "En cours", f: e => e.statut !== "livre" },
    { id: "livre", l: "Livrés", f: e => e.statut === "livre" },
    { id: "all", l: "Tous", f: () => true }
  ];

  function baseFilter(e) {
    const q = state.q.trim().toLowerCase();
    if (q) {
      const hay = [e.bord, e.ref, e.client, e.sub, e.dep.nom, e.dep.ville, e.dep.cp, e.liv.nom, e.liv.ville, e.liv.cp].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const fc = $("#f-client").value, fd = $("#f-dossier").value, fco = $("#f-contenu").value;
    if (fc && e.client !== fc) return false;
    if (fd && e.dossier !== fd) return false;
    if (fco && e.contenu !== fco) return false;
    if ($("#f-ext").checked && !e.ext) return false;
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
    $("#carrier-chips").innerHTML = cs.map(c => `<button class="chip ${state.carriers.has(c) ? "on" : ""}" data-c="${c}"><i class="cdot" style="background:${cColor(c)}"></i>${c}<span class="n">${base.filter(e => e.carrier === c).length}</span></button>`).join("");
    $$("#carrier-chips .chip").forEach(b => b.onclick = () => { const c = b.dataset.c; state.carriers.has(c) ? state.carriers.delete(c) : state.carriers.add(c); render(); });
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
  function row(e) {
    const s = ST[e.statut];
    const since = e.statut === "livre" ? "" : e.lastScanH > 48 ? "crit" : e.lastScanH > 24 ? "warn" : "";
    const todo = e.al.length ? e.al.slice(0, 2).map(a => `<div class="al ${a.lv}"><i></i><span>${esc(a.t)}</span></div>`).join("")
      + `<div class="qa">${e.al.slice(0, 2).map(a => `<button data-a="${esc(a.a)}">${esc(a.a)}</button>`).join("")}</div>`
      : `<span class="muted">Rien à faire</span>`;
    return `<tr class="u-${["ok", "warn", "crit"][e.prio]} ${state.sel.has(e.id) ? "sel" : ""} ${state.open === e.id ? "open" : ""}" data-id="${e.id}">
      <td><input type="checkbox" class="ck" ${state.sel.has(e.id) ? "checked" : ""} aria-label="Sélectionner"></td>
      <td><div class="bord">${esc(e.bord)}</div><div class="ref">${esc(e.ref)}${e.colis > 1 ? ` · ${e.colis} colis` : ""}</div></td>
      <td><div class="cl">${esc(e.client)}</div><div class="cl-sub">${esc(e.sub || "—")}</div>${e.tags.filter(t => t[0] !== "ext").map(t => `<span class="tag ${t[0]}">${t[1]}</span>`).join("")}</td>
      <td><div class="trajet">
        <div class="pt"><span class="lbl">Dép.</span><span class="nm">${esc(e.dep.nom)}</span><span class="vl">${esc(e.dep.cp)} ${esc(e.dep.ville)}</span>${e.ext ? `<span class="tag ext" style="margin:0">Extérieur</span>` : ""}</div>
        <div class="pt"><span class="lbl">Liv.</span><span class="nm">${esc(e.liv.nom)}</span><span class="vl">${esc(e.liv.cp)} ${esc(e.liv.ville)}${e.liv.pays !== "France" ? ` · <b>${esc(e.liv.pays)}</b>` : ""}</span></div>
      </div></td>
      <td><div class="carrier"><i class="cdot" style="background:${cColor(e.carrier)}"></i>${esc(e.carrier)}</div><div class="presta">${esc(e.presta)}</div></td>
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
        if (ev.target.dataset.a) { ev.stopPropagation(); toast(`${ev.target.dataset.a} — ${ENVOIS[id].bord}`); return; }
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
    const n = ["#f-client", "#f-dossier", "#f-contenu", "#f-du", "#f-au"].filter(s => $(s).value).length + ["#f-ext", "#f-payeur", "#f-annule"].filter(s => $(s).checked).length;
    $("#mf-count").hidden = !n; $("#mf-count").textContent = n;
  }
  function render() { renderKpis(); renderChips(); renderViews(); renderRows(); renderBulk(); moreCount(); }

  // filtres
  [...new Set(ENVOIS.map(e => e.client))].sort().forEach(c => $("#f-client").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`));
  $("#q").addEventListener("input", e => { state.q = e.target.value; render(); });
  $("#gsearch").addEventListener("input", e => { go("suivi"); $("#q").value = e.target.value; state.q = e.target.value; state.view = "all"; state.kpi = null; render(); });
  $("#more-filters").onclick = () => $("#more").hidden = !$("#more").hidden;
  $$("#more select, #more input").forEach(i => i.addEventListener("change", render));
  const reset = () => { $$("#more select, #more input[type=date]").forEach(i => i.value = ""); $$("#more input[type=checkbox]").forEach(i => i.checked = false); state.q = ""; $("#q").value = ""; state.carriers.clear(); state.kpi = null; render(); };
  $("#reset").onclick = reset; $("#empty-reset").onclick = reset;
  $("#sort").onchange = e => { state.sort = e.target.value; renderRows(); };
  $("#ck-all").onchange = e => { list().forEach(x => e.target.checked ? state.sel.add(x.id) : state.sel.delete(x.id)); renderRows(); renderBulk(); };
  $("#bulk-clear").onclick = () => { state.sel.clear(); renderRows(); renderBulk(); };
  $("#btn-export").onclick = () => toast(`Export CSV — ${list().length} envois`);
  $$("#bulk .btn").forEach(b => b.onclick = () => toast(`${b.textContent} — ${state.sel.size} envoi(s)`));

  // ================= PANNEAU DE DÉTAIL =================
  function openDrawer() { $("#drawer").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false"); $("#scrim").hidden = false; }
  function closeDrawer() { $("#drawer").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); $("#scrim").hidden = true; if (state.open !== null) { state.open = null; $$("#rows tr.open").forEach(t => t.classList.remove("open")); } }
  $("#d-close").onclick = closeDrawer; $("#scrim").onclick = closeDrawer;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  function drawerTabs(tabs, cur, cb) {
    $("#d-tabs").innerHTML = tabs.map(t => `<button class="tab ${t.id === cur ? "on" : ""}" data-t="${t.id}">${t.l}${t.n ? `<span class="n">${t.n}</span>` : ""}</button>`).join("");
    $$("#d-tabs .tab").forEach(b => b.onclick = () => cb(b.dataset.t));
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

  function openEnvoi(id, tab = "apercu") {
    const e = ENVOIS[id]; state.open = id;
    $$("#rows tr").forEach(t => t.classList.toggle("open", +t.dataset.id === id));
    const s = ST[e.statut];
    $("#d-ref").innerHTML = `<span class="mono" style="font-size:16px">${esc(e.bord)}</span><span class="st ${s.c}">${s.l}</span>`;
    $("#d-sub").innerHTML = `${esc(e.ref)} · ${esc(e.client)} · <i class="cdot" style="background:${cColor(e.carrier)}"></i> ${esc(e.carrier)} ${esc(e.presta)}`;
    actions([["↻ Rafraîchir le suivi"], ["Demander la preuve"], ["Ouvrir une enquête", e.prio === 2 ? "primary" : ""], ["Déplacer dans un dossier"], ["Masquer"]]);
    const ev = events(e);
    drawerTabs([
      { id: "apercu", l: "Aperçu" }, { id: "suivi", l: "Suivi transporteur", n: ev.length }, { id: "colis", l: "Colis & couverture", n: e.colis > 1 ? e.colis : 0 },
      { id: "fact", l: "Facturation" }, { id: "docs", l: "Documents" }, { id: "cmt", l: "Commentaires" }
    ], tab, t => openEnvoi(id, t));
    const B = $("#d-body");
    const stepper = `<div class="stepper">${STEPS.map((st, i) => `<div class="step ${i < s.n ? "d" : ""} ${i === s.n - 1 ? "cur" : ""} ${e.statut === "anomalie" && i === s.n - 1 ? "x" : ""}"><b></b>${st}</div>`).join("")}</div>`;
    const alerts = e.al.filter(a => a.lv !== "info").map(a => `<div class="alert-box ${a.lv === "warn" ? "warn" : ""}"><b>${esc(a.t)}</b>Dernier événement : ${ago(e.lastScanH)}.<div class="acts"><button class="btn sm primary">${esc(a.a)}</button><button class="btn sm">Prévenir le client</button><button class="btn sm">Ajouter un commentaire</button></div></div>`).join("");
    if (tab === "apercu") B.innerHTML = `${stepper}${alerts}
      <div class="two">
        <div class="box"><h3>Enlèvement</h3><b>${esc(e.dep.nom)}</b><div class="muted">${esc(e.dep.cp)} ${esc(e.dep.ville)}</div>${e.ext ? `<span class="tag ext">Départ extérieur — chez le client</span>` : `<span class="tag">Départ MTI</span>`}<div class="muted" style="margin-top:8px">${e.statut === "attente" ? "Bordereau créé le" : "Ramassé le"} ${fmtDT(e.ramasse)}</div></div>
        <div class="box"><h3>Livraison</h3><b>${esc(e.liv.nom)}</b><div class="muted">${esc(e.liv.cp)} ${esc(e.liv.ville)} · ${esc(e.liv.pays)}</div><div class="muted" style="margin-top:8px">${e.statut === "livre" ? "Livré" : (() => { const d = new Date(e.ramasse.getTime() + 2 * 864e5); return d < NOW ? `<span class="st crit">Livraison prévue le ${fmtD(d)} — dépassée</span>` : "Livraison prévue : " + fmtD(d); })()}</div></div>
      </div>
      <div class="box"><h3>En bref</h3><dl class="kv">
        <dt>Compte payeur</dt><dd>${esc(e.client)}</dd><dt>Colis</dt><dd>${e.colis} · ${e.poids}</dd><dt>Contenu</dt><dd>${esc(e.contenu)}</dd>
        <dt>Assurance</dt><dd>${e.tags.find(t => t[0] === "ass")?.[1] || "Non assuré"}</dd><dt>Facturation</dt><dd>${e.ht.toFixed(2)} € HT</dd><dt>Dossier</dt><dd>${esc(e.dossier)}</dd>
      </dl></div>`;
    if (tab === "suivi") B.innerHTML = `<div class="box"><h3>Réponses du transporteur</h3><ul class="tl">${ev.map((x, i) => `<li class="${i === 0 ? "first" : ""} ${x.bad ? "bad" : ""}"><span class="t">${fmtDT(x.d)}</span><span class="b"></span><span>${esc(x.txt)}<div class="loc">${esc(x.loc)}</div></span></li>`).join("")}</ul></div>
      <div class="box"><h3>Repasser / instruction au transporteur</h3><div class="two"><label>Date <input type="date" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:6px"></label><label>Créneau <select style="width:100%;border:1px solid var(--line);border-radius:7px;padding:6px"><option>Matin</option><option>Après-midi</option></select></label></div><div style="margin-top:10px"><button class="btn sm primary">Envoyer l'instruction</button></div></div>`;
    if (tab === "colis") B.innerHTML = `<div class="box"><h3>Colis (${e.colis})</h3><table class="grid"><thead><tr><th>N° colis</th><th>Poids déclaré</th><th>Mesuré transporteur</th><th>Statut</th></tr></thead><tbody>${Array.from({ length: e.colis }, (_, i) => `<tr><td class="mono">${esc(e.bord)}${e.colis > 1 ? "-" + (i + 1) : ""}</td><td>${e.poids}</td><td class="muted">Non communiqué</td><td>${i === 0 || e.statut !== "livre" ? ST[e.statut].l : "En transit"}</td></tr>`).join("")}</tbody></table><div style="margin-top:10px"><button class="btn sm">Corriger le poids / les dimensions</button></div></div>
      <div class="box"><h3>Couverture</h3><dl class="kv"><dt>Indemnité transporteur</dt><dd>${(parseInt(e.poids) * 33)} € (33 €/kg)</dd><dt>Nature</dt><dd>${esc(e.contenu)}</dd><dt>Assurance</dt><dd>${e.tags.find(t => t[0] === "ass")?.[1] || "Non assuré — seule l'indemnité du transporteur s'applique"}</dd></dl></div>`;
    if (tab === "fact") B.innerHTML = `<div class="box"><h3>Facturation</h3><dl class="kv"><dt>Prix de vente</dt><dd><b>${e.ht.toFixed(2)} € HT</b></dd><dt>Date de ramassage</dt><dd>${fmtD(e.ramasse)} (mois de facturation)</dd><dt>Payeur</dt><dd>${esc(e.client)}</dd></dl><div style="margin-top:10px;display:flex;gap:6px"><button class="btn sm">À facturer</button><button class="btn sm">À contester</button></div></div>
      <div class="box"><h3>Demande liée</h3><dl class="kv"><dt>Origine</dt><dd>Portail client</dd><dt>Statut</dt><dd>Confirmée</dd></dl></div>`;
    if (tab === "docs") B.innerHTML = `<div class="files"><div class="file"><b>Bordereau / étiquette</b>PDF · imprimer</div><div class="file"><b>Photos du colis</b>Ajouter</div><div class="file"><b>Preuve de livraison</b>${e.statut === "livre" ? "Disponible" : "—"}</div><div class="file"><b>Pièces conservées</b>Facture client</div><div class="file"><b>Signature</b>${e.statut === "livre" ? "Signé" : "—"}</div><div class="file"><b>Mails</b>0 échange</div></div>`;
    if (tab === "cmt") B.innerHTML = `<div class="box"><h3>Commentaires internes</h3><div class="cmt"><div class="w">Suivi · hier 15:12</div>Relance faite par mail au transporteur, en attente de retour.</div><textarea placeholder="Ajouter un commentaire visible par l'équipe…"></textarea><div style="margin-top:8px;display:flex;gap:10px;align-items:center"><button class="btn sm primary">Ajouter</button><label class="muted" style="font-size:12px"><input type="checkbox"> Visible par le client</label></div></div>`;
    $$("#d-body .btn").forEach(b => b.onclick = () => toast(b.textContent));
    openDrawer();
  }

  // ================= ENLÈVEMENTS EXTÉRIEURS =================
  const ES = {
    a_reserver: { l: "À réserver", h: "Demande reçue, pas encore réservée chez le transporteur" },
    reserve: { l: "Réservé", h: "Enlèvement réservé, chauffeur pas encore passé" },
    ramasse: { l: "Ramassé", h: "Premier scan reçu du transporteur" },
    echec: { l: "Non ramassé", h: "Chauffeur non passé ou échec — à replanifier" }
  };
  const est = { q: "", carriers: new Set(), day: "all", mode: "board", kpi: null };
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const today0 = new Date(NOW); today0.setHours(0, 0, 0, 0);
  const isLate = x => x.etat === "echec" || (x.etat !== "ramasse" && x.date < today0);

  const EK = [
    { id: "today", l: "Aujourd'hui", h: "à ramasser", cls: "blue", f: x => sameDay(x.date, NOW) && x.etat !== "ramasse" },
    { id: "reserver", l: "À réserver", h: "chez le transporteur", cls: "warn", f: x => x.etat === "a_reserver" },
    { id: "estime", l: "Non confirmés", h: "date estimée, sans n° de confirmation", cls: "warn", f: x => x.estime && x.etat !== "ramasse" },
    { id: "late", l: "Non ramassés", h: "échec ou en retard", cls: "crit", f: isLate },
    { id: "done", l: "Ramassés", h: "sur la période", cls: "ok", f: x => x.etat === "ramasse" },
    { id: "colis", l: "Colis attendus", h: "aujourd'hui", cls: "", f: null }
  ];
  function ebase(x) {
    const q = est.q.trim().toLowerCase();
    if (q && ![x.conf, x.client, x.lieu.nom, x.lieu.ville, x.lieu.cp, ...x.bords].join(" ").toLowerCase().includes(q)) return false;
    if (est.carriers.size && !est.carriers.has(x.carrier)) return false;
    return true;
  }
  function elist() {
    let l = ENLEVEMENTS.filter(ebase);
    if (est.day !== "all") l = l.filter(x => x.date.toDateString() === est.day);
    if (est.kpi) l = l.filter(EK.find(k => k.id === est.kpi).f);
    return l.sort((a, b) => a.date - b.date || a.slot.localeCompare(b.slot));
  }
  function renderEnl() {
    const base = ENLEVEMENTS.filter(ebase);
    $("#kpis-enl").innerHTML = EK.map(k => {
      const v = k.f ? base.filter(k.f).length : base.filter(x => sameDay(x.date, NOW) && x.etat !== "ramasse").reduce((s, x) => s + x.colis, 0);
      return `<button class="kpi ${k.cls} ${est.kpi === k.id ? "on" : ""}" data-k="${k.id}"><div class="v">${v}</div><div class="l">${k.l}</div><div class="h">${k.h}</div></button>`;
    }).join("");
    $$("#kpis-enl .kpi").forEach(b => b.onclick = () => { if (b.dataset.k === "colis") { est.day = NOW.toDateString(); est.kpi = null; } else est.kpi = est.kpi === b.dataset.k ? null : b.dataset.k; renderEnl(); });
    $("#nav-enlev-nb").textContent = ENLEVEMENTS.filter(x => x.etat !== "ramasse").length;

    const cs = [...new Set(ENLEVEMENTS.map(x => x.carrier))];
    $("#carrier-chips-e").innerHTML = cs.map(c => `<button class="chip ${est.carriers.has(c) ? "on" : ""}" data-c="${c}"><i class="cdot" style="background:${cColor(c)}"></i>${c}<span class="n">${ENLEVEMENTS.filter(x => x.carrier === c).length}</span></button>`).join("");
    $$("#carrier-chips-e .chip").forEach(b => b.onclick = () => { const c = b.dataset.c; est.carriers.has(c) ? est.carriers.delete(c) : est.carriers.add(c); renderEnl(); });

    // jours
    const days = [...new Set(ENLEVEMENTS.map(x => x.date.toDateString()))].map(s => new Date(s)).sort((a, b) => a - b);
    $("#days").innerHTML = `<button class="day ${est.day === "all" ? "on" : ""}" data-d="all"><div class="d1">Période</div><div class="d2">Tous</div><div class="d3">${base.length} enlèv.</div></button>` + days.map(d => {
      const its = base.filter(x => sameDay(x.date, d));
      const late = its.filter(isLate).length;
      const lbl = sameDay(d, NOW) ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "long" });
      return `<button class="day ${est.day === d.toDateString() ? "on" : ""} ${late ? "late" : ""}" data-d="${d.toDateString()}"><div class="d1">${lbl}</div><div class="d2">${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "short" })}</div><div class="d3">${late ? late + " non ramassé" + (late > 1 ? "s" : "") : its.length + " enlèv."}</div></button>`;
    }).join("");
    $$("#days .day").forEach(b => b.onclick = () => { est.day = b.dataset.d; renderEnl(); });

    const l = elist();
    $("#board").hidden = est.mode !== "board"; $("#elist").hidden = est.mode !== "list";
    $("#board").innerHTML = Object.entries(ES).map(([k, s]) => {
      const its = l.filter(x => x.etat === k);
      return `<div class="col"><div class="col-h"><div>${s.l}<small>${s.h}</small></div><span class="n">${its.length}</span></div>${its.map(card).join("") || `<div class="muted" style="font-size:12px;padding:8px 4px">Aucun enlèvement</div>`}</div>`;
    }).join("");
    $("#erows").innerHTML = l.map(x => `<tr data-id="${x.id}" class="u-${isLate(x) ? "crit" : x.estime || x.etat === "a_reserver" ? "warn" : "ok"}"><td><b>${sameDay(x.date, NOW) ? "Aujourd'hui" : fmtD(x.date)}</b><div class="since-sub">${x.slot}</div></td><td class="mono">${x.conf || "—"}</td><td><div class="cl">${esc(x.client)}</div></td><td><div class="nm">${esc(x.lieu.nom)}</div><div class="vl muted" style="font-size:12px">${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div></td><td><div class="carrier"><i class="cdot" style="background:${cColor(x.carrier)}"></i>${x.carrier}</div></td><td>${x.colis} · ${x.poids}</td><td>${badge(x)}</td><td><span class="st ${isLate(x) ? "crit" : x.etat === "ramasse" ? "ok" : ""}">${ES[x.etat].l}</span></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Aucun enlèvement</td></tr>`;
    $$("#board .card, #erows tr[data-id]").forEach(c => c.onclick = ev => { if (ev.target.dataset.a) { ev.stopPropagation(); return toast(ev.target.dataset.a); } openEnl(+c.dataset.id); });
  }
  function badge(x) {
    if (x.etat === "a_reserver") return `<span class="badge late">Pas encore réservé</span>`;
    if (x.estime) return `<span class="badge est">Estimé</span>`;
    return `<span class="badge conf">Confirmé</span>`;
  }
  function card(x) {
    const late = isLate(x);
    const acts = { a_reserver: ["Réserver chez " + x.carrier], reserve: x.estime ? ["Confirmer", "Relancer"] : ["Relancer"], ramasse: ["Voir les envois"], echec: ["Replanifier", "Prévenir le client"] }[x.etat];
    return `<div class="card" data-id="${x.id}" style="--cc:${cColor(x.carrier)}">
      <div class="r1"><span class="cn">${esc(x.client)}</span><span class="slot">${sameDay(x.date, NOW) ? "Auj." : fmtD(x.date)} · ${x.slot}</span></div>
      <div class="addr">${esc(x.lieu.nom)} — ${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div>
      ${x.motif ? `<div class="al crit" style="margin-top:6px"><i></i><span>${esc(x.motif)}</span></div>` : late && x.etat !== "echec" ? `<div class="al crit" style="margin-top:6px"><i></i><span>Date dépassée, pas de scan</span></div>` : ""}
      <div class="r3"><span class="carrier" style="font-weight:500"><i class="cdot" style="background:${cColor(x.carrier)}"></i>${x.carrier} · ${x.colis} colis</span>${x.etat === "a_reserver" ? "" : badge(x)}</div>
      <div class="act">${acts.map(a => `<button class="btn sm" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div>
    </div>`;
  }
  function openEnl(id, tab = "apercu") {
    const x = ENLEVEMENTS[id];
    const order = ["a_reserver", "reserve", "ramasse"];
    const n = x.etat === "echec" ? 2 : order.indexOf(x.etat) + 1;
    $("#d-ref").innerHTML = `Enlèvement ${x.conf ? `<span class="mono" style="font-size:15px">${x.conf}</span>` : ""} ${badge(x)}`;
    $("#d-sub").innerHTML = `${esc(x.client)} · <i class="cdot" style="background:${cColor(x.carrier)}"></i> ${x.carrier} · ${sameDay(x.date, NOW) ? "aujourd'hui" : x.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ${x.slot}`;
    actions(x.etat === "a_reserver" ? [["Réserver chez " + x.carrier, "primary"], ["Modifier"], ["Annuler", "danger"]]
      : x.etat === "echec" ? [["Replanifier", "primary"], ["Prévenir le client"], ["Ouvrir une réclamation"]]
        : x.etat === "ramasse" ? [["Voir les envois liés"], ["Imprimer le récapitulatif"]]
          : [x.estime ? ["Saisir la confirmation", "primary"] : ["Relancer le transporteur"], ["Modifier le créneau"], ["Annuler", "danger"]]);
    drawerTabs([{ id: "apercu", l: "Aperçu" }, { id: "bords", l: "Bordereaux", n: x.bords.length }, { id: "hist", l: "Historique" }], tab, t => openEnl(id, t));
    const B = $("#d-body");
    const steps = ["Demandé", "Réservé", "Ramassé"];
    if (tab === "apercu") B.innerHTML = `<div class="stepper">${steps.map((s, i) => `<div class="step ${i < n ? "d" : ""} ${i === n - 1 ? "cur" : ""} ${x.etat === "echec" && i === 2 ? "x" : ""}"><b></b>${x.etat === "echec" && i === 2 ? "Non ramassé" : s}</div>`).join("")}</div>
      ${x.motif ? `<div class="alert-box"><b>${esc(x.motif)}</b>À replanifier avec le client et le transporteur.<div class="acts"><button class="btn sm primary">Replanifier</button><button class="btn sm">Appeler ${esc(x.lieu.contact)}</button></div></div>` : ""}
      ${x.estime && x.etat !== "ramasse" ? `<div class="alert-box warn"><b>Date estimée — pas de numéro de confirmation du transporteur</b>Saisir la confirmation dès réception pour sécuriser le passage.<div class="acts"><button class="btn sm primary">Saisir la confirmation</button><button class="btn sm">Relancer ${x.carrier}</button></div></div>` : ""}
      <div class="box"><h3>Lieu d'enlèvement</h3><b>${esc(x.lieu.nom)}</b><div class="muted">${esc(x.lieu.adr)}<br>${esc(x.lieu.cp)} ${esc(x.lieu.ville)}</div><dl class="kv" style="margin-top:10px"><dt>Contact sur place</dt><dd>${esc(x.lieu.contact)} · ${esc(x.lieu.tel)}</dd><dt>Créneau</dt><dd>${x.slot}</dd></dl></div>
      <div class="box"><h3>Enlèvement</h3><dl class="kv"><dt>Transporteur</dt><dd>${x.carrier}</dd><dt>N° d'enlèvement</dt><dd class="mono">${x.conf || "—"}</dd><dt>Colis / poids</dt><dd>${x.colis} colis · ${x.poids}</dd><dt>Compte payeur</dt><dd>${esc(x.client)}</dd><dt>Demandé via</dt><dd>${x.demandePar}</dd></dl></div>`;
    if (tab === "bords") B.innerHTML = `<div class="box"><h3>Bordereaux rattachés</h3><table class="grid"><thead><tr><th>Bordereau</th><th>Statut</th><th></th></tr></thead><tbody>${x.bords.map(b => `<tr><td class="mono">${b}</td><td>${x.etat === "ramasse" ? "Pris en charge" : "En attente du chauffeur"}</td><td><button class="link">Ouvrir dans le suivi</button></td></tr>`).join("")}</tbody></table>${x.colis > x.bords.length ? `<div class="al warn" style="margin-top:10px"><i></i><span>${x.colis - x.bords.length} colis sans bordereau rattaché</span></div>` : ""}<div style="margin-top:10px"><button class="btn sm">+ Rattacher un bordereau</button></div></div>`;
    if (tab === "hist") B.innerHTML = `<div class="box"><h3>Historique</h3><ul class="tl">${[x.etat === "ramasse" ? ["Premier scan transporteur reçu", "auto"] : null, x.etat === "echec" ? [x.motif, "transporteur"] : null, x.conf && !x.estime ? ["Confirmation " + x.conf + " reçue", x.carrier] : null, x.etat !== "a_reserver" ? ["Réservé chez " + x.carrier, "Opérateur MTI"] : null, ["Demande créée", x.demandePar]].filter(Boolean).map((h, i) => `<li class="${i === 0 ? "first" : ""}"><span class="t">${fmtD(x.date)}</span><span class="b"></span><span>${esc(h[0])}<div class="loc">${esc(h[1])}</div></span></li>`).join("")}</ul></div>`;
    $$("#d-body .btn, #d-body .link").forEach(b => b.onclick = () => toast(b.textContent));
    openDrawer();
  }
  $("#qe").addEventListener("input", e => { est.q = e.target.value; renderEnl(); });
  $$("#mode button").forEach(b => b.onclick = () => { est.mode = b.dataset.m; $$("#mode button").forEach(x => x.classList.toggle("on", x === b)); renderEnl(); });
  $("#btn-new-enl").onclick = () => toast("Formulaire de nouvel enlèvement — hors maquette");

  render(); renderEnl(); go(location.hash === "#enlev" ? "enlev" : "suivi");
})();
