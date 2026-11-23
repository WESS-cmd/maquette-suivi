// Données fictives inspirées de l'écran actuel — pour la maquette uniquement
window.NOW = new Date(2026, 10, 23, 16, 40);

window.CARRIERS = {
  "Chronopost": "var(--chrono)", "TNT": "var(--tnt)", "DHL Express": "var(--dhl)", "FedEx": "var(--fedex)",
  "DPD": "var(--dpd)", "UPS": "var(--ups)", "MTI Express": "var(--mti)"
};

(function () {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pad = n => String(n).padStart(2, "0");

  const clients = [
    ["NYSOS", "", "ANAMA PARFUMERIE", "25600", "Sochaux"],
    ["UTILIS FRANCE", "Service expédition", "UTILIS FRANCE", "67000", "Strasbourg"],
    ["SIKA COMMUNICATION", "DSI SIKA", "MTI EXPRESS", "78140", "Vélizy-Villacoublay"],
    ["OP Mobility Gestion", "Achats", "PLASTIC OMNIUM SYSTEMES", "92300", "Levallois-Perret"],
    ["Q PARK France", "Services", "ADS PROTECTION", "26800", "Portes-lès-Valence"],
    ["ERM France - Lyon", "0033784/MATERI", "ERM France", "69410", "Champagne-au-Mont-d'Or"],
    ["FFGOLF", "Bonnassies", "GOLF CABOT BORDEAUX", "33290", "Le Pian-Médoc"],
    ["LAFARGE FRANCE", "PIVOTEAU Océane", "MTI EXPRESS", "78140", "Vélizy-Villacoublay"],
    ["ESAT Les ateliers d'Ornon", "Retour blanchisserie", "ESAT Les ateliers d'Ornon", "33140", "Villenave-d'Ornon"],
    ["LGM", "Song Nam TRAN", "LGM (Grenoble)", "38000", "Grenoble"],
    ["TRICO", "Logistique", "Société Trico", "33100", "Bordeaux"],
    ["MADISON PERFUME", "Préparation", "MADISON PERFUME", "92100", "Boulogne-Billancourt"],
    ["CLIENT DIVERS", "Gauthier Legrix", "Gauthier Legrix", "67560", "Rosheim"],
    ["MTI", "MTI-261027-108", "MTI EXPRESS", "78140", "Vélizy-Villacoublay"]
  ];
  const dests = [
    ["MTI EXPRESS", "78140", "Vélizy-Villacoublay", "France"], ["Biomet", "26009", "Valence", "France"],
    ["SIKA COMMUNICATION", "69780", "Saint-Bonnet-de-Mûre", "France"], ["OP mobility", "92593", "Levallois-Perret", "France"],
    ["AWI", "92160", "Antony", "France"], ["Hanna Instruments France", "67382", "Lingolsheim", "France"],
    ["Fédération Française de Golf", "92300", "Levallois-Perret", "France"], ["HOLGER FOCKENRATH", "68199", "Mannheim", "Allemagne"],
    ["Société Trico", "33100", "Bordeaux", "France"], ["Greenpeace France", "75018", "Paris", "France"],
    ["Ets Robert SAS", "49125", "Tiercé", "France"], ["Hôtel Le Marois", "75008", "Paris", "France"],
    ["Boots UK", "NG90", "Nottingham", "Royaume-Uni"], ["Clinique Saint-Jean", "34000", "Montpellier", "France"]
  ];
  const prestas = {
    "TNT": ["13:00 Express", "Express (journée)", "Express National"], "UPS": ["F éco", "Express Saver", "F 13 h"],
    "Chronopost": ["Chrono 13", "Chrono 18", "Chrono Relais"], "DHL Express": ["Express Worldwide"],
    "FedEx": ["International Priority"], "DPD": ["Predict"], "MTI Express": ["Course express", "Coursier 2 h"]
  };
  const carrierW = ["TNT", "TNT", "TNT", "UPS", "UPS", "Chronopost", "Chronopost", "DHL Express", "FedEx", "DPD", "MTI Express"];

  // statut: attente | transit | livraison | livre | relais | anomalie
  const out = [];
  for (let i = 0; i < 64; i++) {
    const c = clients[i % clients.length];
    const d = dests[Math.floor(rnd() * dests.length)];
    const carrier = i < 2 ? (i ? "UPS" : "TNT") : pick(carrierW);
    const ext = c[2] !== "MTI EXPRESS" && rnd() > .25;
    const daysAgo = Math.floor(rnd() * 26);
    const pick1 = new Date(NOW); pick1.setDate(NOW.getDate() - daysAgo); pick1.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
    let statut;
    const r = rnd();
    if (daysAgo <= 1) statut = r > .5 ? "transit" : "attente";
    else if (r < .52) statut = "livre";
    else if (r < .64) statut = "transit";
    else if (r < .72) statut = "livraison";
    else if (r < .79) statut = "relais";
    else if (r < .88) statut = "anomalie";
    else statut = "attente";
    if (i === 0 || i === 1) statut = "attente";
    if (i === 2) statut = "anomalie";

    let lastScanH;
    if (statut === "livre") lastScanH = Math.max(2, daysAgo * 24 - 30 - Math.floor(rnd() * 20));
    else if (statut === "attente") lastScanH = daysAgo <= 1 ? Math.floor(rnd() * 20) : daysAgo * 24 + 3;
    else lastScanH = Math.floor(rnd() * (daysAgo > 4 ? 140 : 40)) + 1;

    const delivered = statut === "livre";
    const tags = [];
    if (ext) tags.push(["ext", "Départ extérieur"]);
    if (rnd() > .86) tags.push(["li", "Batterie lithium"]);
    if (rnd() > .9) tags.push(["doc", "Document"]);
    const assur = rnd() > .85;
    if (assur) tags.push(["ass", "Assuré " + (Math.floor(rnd() * 12) + 1) * 100 + " €"]);
    const colis = rnd() > .82 ? 2 + Math.floor(rnd() * 3) : 1;

    // alertes / à faire
    const al = [];
    if (!delivered && lastScanH > 48) al.push({ lv: "crit", t: statut === "attente" ? `Pas pris en charge depuis ${Math.round(lastScanH / 24)} j` : `Bloqué : aucun scan depuis ${Math.round(lastScanH / 24)} j`, a: "Relancer" });
    else if (!delivered && lastScanH > 24) al.push({ lv: "warn", t: `Pas de scan depuis ${lastScanH} h`, a: "Rafraîchir" });
    if (statut === "anomalie") al.push({ lv: "crit", t: pick(["Destinataire absent — 2ᵉ passage demandé", "Adresse incomplète", "Colis endommagé signalé", "Refusé par le destinataire"]), a: "Ouvrir une enquête" });
    if (statut === "relais") al.push({ lv: "warn", t: "En point relais — prévenir le destinataire", a: "Prévenir" });
    if (rnd() > .82 && carrier === "UPS") al.push({ lv: "warn", t: "Réservé hors de notre compte UPS", a: "Vérifier" });
    if (delivered && rnd() > .7) al.push({ lv: "info", t: "Preuve de livraison à récupérer", a: "Demander la preuve" });
    if (colis > 1 && delivered && rnd() > .5) al.push({ lv: "warn", t: `${colis - 1}/${colis} colis livrés`, a: "Voir les colis" });

    const prefix = { "TNT": "7" + Math.floor(rnd() * 9) + "17830000", "UPS": "1Z" + pick(["R5J1", "V198", "WV00"]) + "59", "Chronopost": "XN5", "DHL Express": "15", "FedEx": "77", "DPD": "250", "MTI Express": "MTI" }[carrier];
    const bord = prefix + String(Math.floor(rnd() * 1e8)).padStart(8, "0") + (carrier === "Chronopost" ? "FR" : "");
    const ref = `MTI-2610${pad(10 + (i % 20))}-${carrier === "UPS" ? "P" + (6000 + i * 37) : 100 + i * 7}`;
    const prio = al.some(a => a.lv === "crit") ? 2 : al.some(a => a.lv === "warn") ? 1 : 0;
    const dossier = prio ? pick(["Non lu", "Non lu", "En cours", "—"]) : pick(["—", "—", "Terminé"]);

    const rues = ["42 chemin du Moulin Carron", "9 place Marie-Jeanne Bassot", "13 avenue Morane Saulnier", "3 avenue du Général Leclerc", "48 route de Saint-Bonnet-de-Mûre", "7 rue Antoine Coulibaly", "26 rue du Tanin", "1 rue des Vendanges"];
    const contacts = ["Samira RIABI", "Service informatique", "Accueil", "M. Rey", "Réception marchandises", "Océane PIVOTEAU", "Service achats", "Song Nam TRAN"];
    const depAdr = pick(rues), livAdr = pick(rues), depCt = pick(contacts), livCt = pick(contacts);
    const tel = "0" + (1 + Math.floor(rnd() * 5)) + " " + Array.from({ length: 4 }, () => String(Math.floor(rnd() * 100)).padStart(2, "0")).join(" ");
    const sousCompte = pick([depCt, "BC-" + (40000 + Math.floor(rnd() * 9999)), "CDE " + (100 + Math.floor(rnd() * 900)), ""]);
    out.push({
      depAdr, livAdr, depCt, livCt, tel, sousCompte,
      id: i, bord, ref, client: c[0], sub: c[1], dep: { nom: c[2], cp: c[3], ville: c[4] }, ext,
      liv: { nom: d[0], cp: d[1], ville: d[2], pays: d[3] }, carrier, presta: pick(prestas[carrier]),
      ramasse: pick1, lastScanH, statut, tags, colis, al, prio, dossier, ht: +(10 + rnd() * 180).toFixed(2),
      poids: (1 + Math.floor(rnd() * 25)) + " kg", contenu: tags.find(t => t[0] === "li") ? "Batterie lithium" : tags.find(t => t[0] === "doc") ? "Document" : "Marchandise"
    });
  }
  window.ENVOIS = out;

  // ---------- Enlèvements extérieurs ----------
  const lieux = [
    ["ANAMA PARFUMERIE", "3 av. du Général Leclerc", "25600", "Sochaux", "M. Rey", "03 81 00 00 00"],
    ["ERM France", "4 chemin du Tronchon", "69410", "Champagne-au-Mont-d'Or", "Accueil", "04 78 00 00 00"],
    ["GOLF CABOT BORDEAUX", "Chemin de Courmateau", "33290", "Le Pian-Médoc", "Bonnassies", "05 56 00 00 00"],
    ["ADS PROTECTION", "6 rue J.-B. Corot", "26800", "Portes-lès-Valence", "Quai 2", "04 75 00 00 00"],
    ["Gauthier Legrix", "11 rue des Vendanges", "67560", "Rosheim", "G. Legrix", "03 88 00 00 00"],
    ["ESAT Les ateliers d'Ornon", "4 rue Roger Lapébie", "33140", "Villenave-d'Ornon", "Atelier", "05 57 00 00 00"],
    ["LGM (Grenoble)", "34 rue Gustave Eiffel", "38000", "Grenoble", "S. N. Tran", "04 76 00 00 00"],
    ["UTILIS FRANCE", "Zone d'activités Nord", "67000", "Strasbourg", "Expédition", "03 88 11 00 00"],
    ["PLASTIC OMNIUM", "19 bd Jules Carteret", "69007", "Lyon", "Réception", "04 72 00 00 00"],
    ["MADISON PERFUME", "12 rue de Silly", "92100", "Boulogne-Billancourt", "Préparation", "01 46 00 00 00"]
  ];
  const clientsE = ["NYSOS", "ERM France - Lyon", "FFGOLF", "Q PARK France", "CLIENT DIVERS", "ESAT Les ateliers d'Ornon", "LGM", "UTILIS FRANCE", "OP Mobility Gestion", "MADISON PERFUME"];
  const slots = ["09:00–12:00", "10:00–13:00", "13:00–17:00", "14:00–18:00", "08:30–12:30"];
  const enl = [];
  // états : a_reserver | reserve | ramasse | echec
  for (let i = 0; i < 46; i++) {
    const k = i % lieux.length;
    const off = Math.floor(rnd() * 7) - 3; // -3 .. +3 jours
    const dt = new Date(NOW); dt.setDate(NOW.getDate() + off); dt.setHours(0, 0, 0, 0);
    if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1);
    if (dt.getDay() === 6) dt.setDate(dt.getDate() + 2);
    const carrier = pick(["TNT", "TNT", "TNT", "UPS", "UPS", "DHL Express", "Chronopost", "FedEx"]);
    let etat;
    const r = rnd();
    const past = dt < new Date(2026, 10, 23);
    const today = dt.toDateString() === NOW.toDateString();
    if (past) etat = r < .72 ? "ramasse" : "echec";
    else if (today) etat = r < .35 ? "ramasse" : r < .85 ? "reserve" : "a_reserver";
    else etat = r < .35 ? "a_reserver" : "reserve";
    const estime = etat !== "a_reserver" && rnd() < .5;
    const nbBord = 1 + (rnd() > .7 ? Math.floor(rnd() * 3) : 0);
    const bords = Array.from({ length: nbBord }, () => (carrier === "TNT" ? "7" + Math.floor(rnd() * 9) + "17830000" : "1Z") + String(Math.floor(rnd() * 1e8)).padStart(8, "0"));
    enl.push({
      id: i, conf: etat === "a_reserver" ? null : (carrier === "TNT" ? "5" : carrier === "UPS" ? "2" : "9") + String(Math.floor(rnd() * 1e8)).padStart(8, "0"),
      carrier, client: clientsE[k], lieu: { nom: lieux[k][0], adr: lieux[k][1], cp: lieux[k][2], ville: lieux[k][3], contact: lieux[k][4], tel: lieux[k][5] },
      date: dt, slot: pick(slots), colis: bords.length + (rnd() > .8 ? 1 : 0), poids: (2 + Math.floor(rnd() * 40)) + " kg",
      bords, etat, estime: etat === "ramasse" ? estime && rnd() < .5 : estime,
      motif: etat === "echec" ? pick(["Client fermé à l'arrivée du chauffeur", "Colis non prêt", "Chauffeur non passé", "Adresse introuvable"]) : null,
      demandePar: pick(["Portail client", "Téléphone", "Mail", "Opérateur MTI"])
    });
  }
  window.ENLEVEMENTS = enl;
})();
