// Airports, cities, countries, regions and the location picker (search by city, airport, country or code).

const codes = v => String(v || "").toUpperCase().replace(/[^A-Z,]/g, "").replace(/,+/g, ",").replace(/^,|,$/g, "");

const AIRPORTS = "AMS|Amsterdam|Schiphol|NL;RTM|Rotterdam|Rotterdam The Hague|NL;EIN|Eindhoven|Eindhoven|NL;GRQ|Groningen|Eelde|NL;MST|Maastricht|Maastricht Aachen|NL;BRU|Brussels|Brussels|BE;CRL|Brussels|Charleroi|BE;ANR|Antwerp|Antwerp|BE;LGG|Liège|Liège|BE;LUX|Luxembourg|Luxembourg|LU;DUS|Düsseldorf|Düsseldorf|DE;NRN|Düsseldorf|Weeze|DE;CGN|Cologne|Cologne Bonn|DE;FRA|Frankfurt|Frankfurt|DE;HHN|Frankfurt|Hahn|DE;MUC|Munich|Munich|DE;BER|Berlin|Brandenburg|DE;HAM|Hamburg|Hamburg|DE;STR|Stuttgart|Stuttgart|DE;HAJ|Hanover|Hanover|DE;DTM|Dortmund|Dortmund|DE;NUE|Nuremberg|Nuremberg|DE;BRE|Bremen|Bremen|DE;LEJ|Leipzig|Leipzig/Halle|DE;LHR|London|Heathrow|GB;LGW|London|Gatwick|GB;STN|London|Stansted|GB;LTN|London|Luton|GB;LCY|London|City|GB;SEN|London|Southend|GB;MAN|Manchester|Manchester|GB;BHX|Birmingham|Birmingham|GB;BRS|Bristol|Bristol|GB;EDI|Edinburgh|Edinburgh|GB;GLA|Glasgow|Glasgow|GB;BFS|Belfast|Belfast International|GB;DUB|Dublin|Dublin|IE;ORK|Cork|Cork|IE;SNN|Shannon|Shannon|IE;CDG|Paris|Charles de Gaulle|FR;ORY|Paris|Orly|FR;BVA|Paris|Beauvais|FR;NCE|Nice|Côte d'Azur|FR;LYS|Lyon|Saint-Exupéry|FR;MRS|Marseille|Provence|FR;TLS|Toulouse|Blagnac|FR;BOD|Bordeaux|Mérignac|FR;NTE|Nantes|Atlantique|FR;ZRH|Zurich|Zurich|CH;GVA|Geneva|Geneva|CH;BSL|Basel|EuroAirport|CH;VIE|Vienna|Vienna|AT;SZG|Salzburg|Salzburg|AT;INN|Innsbruck|Innsbruck|AT;CPH|Copenhagen|Kastrup|DK;BLL|Billund|Billund|DK;ARN|Stockholm|Arlanda|SE;BMA|Stockholm|Bromma|SE;GOT|Gothenburg|Landvetter|SE;OSL|Oslo|Gardermoen|NO;BGO|Bergen|Flesland|NO;TOS|Tromsø|Tromsø|NO;HEL|Helsinki|Helsinki-Vantaa|FI;RVN|Rovaniemi|Rovaniemi|FI;KEF|Reykjavik|Keflavík|IS;MAD|Madrid|Barajas|ES;BCN|Barcelona|El Prat|ES;AGP|Málaga|Málaga|ES;PMI|Palma de Mallorca|Palma|ES;ALC|Alicante|Alicante|ES;VLC|Valencia|Valencia|ES;SVQ|Seville|Seville|ES;IBZ|Ibiza|Ibiza|ES;TFS|Tenerife|Tenerife South|ES;LPA|Gran Canaria|Gran Canaria|ES;ACE|Lanzarote|Lanzarote|ES;FUE|Fuerteventura|Fuerteventura|ES;BIO|Bilbao|Bilbao|ES;LIS|Lisbon|Humberto Delgado|PT;OPO|Porto|Francisco Sá Carneiro|PT;FAO|Faro|Faro|PT;FNC|Madeira|Funchal|PT;PDL|Azores|Ponta Delgada|PT;FCO|Rome|Fiumicino|IT;CIA|Rome|Ciampino|IT;MXP|Milan|Malpensa|IT;LIN|Milan|Linate|IT;BGY|Milan|Bergamo|IT;VCE|Venice|Marco Polo|IT;TSF|Venice|Treviso|IT;NAP|Naples|Naples|IT;FLR|Florence|Peretola|IT;PSA|Pisa|Galileo Galilei|IT;BLQ|Bologna|Bologna|IT;CTA|Catania|Catania|IT;PMO|Palermo|Palermo|IT;CAG|Cagliari|Cagliari|IT;OLB|Olbia|Costa Smeralda|IT;BRI|Bari|Bari|IT;ATH|Athens|Eleftherios Venizelos|GR;SKG|Thessaloniki|Macedonia|GR;HER|Crete|Heraklion|GR;CHQ|Crete|Chania|GR;RHO|Rhodes|Rhodes|GR;JTR|Santorini|Santorini|GR;JMK|Mykonos|Mykonos|GR;CFU|Corfu|Corfu|GR;KGS|Kos|Kos|GR;ZTH|Zakynthos|Zakynthos|GR;IST|Istanbul|Istanbul|TR;SAW|Istanbul|Sabiha Gökçen|TR;AYT|Antalya|Antalya|TR;DLM|Dalaman|Dalaman|TR;BJV|Bodrum|Milas-Bodrum|TR;ADB|Izmir|Adnan Menderes|TR;ESB|Ankara|Esenboğa|TR;LCA|Larnaca|Larnaca|CY;PFO|Paphos|Paphos|CY;MLA|Malta|Malta|MT;WAW|Warsaw|Chopin|PL;KRK|Kraków|John Paul II|PL;GDN|Gdańsk|Lech Wałęsa|PL;PRG|Prague|Václav Havel|CZ;BUD|Budapest|Ferenc Liszt|HU;OTP|Bucharest|Henri Coandă|RO;SOF|Sofia|Sofia|BG;VAR|Varna|Varna|BG;ZAG|Zagreb|Zagreb|HR;SPU|Split|Split|HR;DBV|Dubrovnik|Dubrovnik|HR;LJU|Ljubljana|Jože Pučnik|SI;BEG|Belgrade|Nikola Tesla|RS;TIA|Tirana|Tirana|AL;RIX|Riga|Riga|LV;TLL|Tallinn|Tallinn|EE;VNO|Vilnius|Vilnius|LT;DXB|Dubai|Dubai International|AE;DWC|Dubai|Al Maktoum|AE;AUH|Abu Dhabi|Zayed|AE;DOH|Doha|Hamad|QA;BAH|Bahrain|Bahrain|BH;MCT|Muscat|Muscat|OM;RUH|Riyadh|King Khalid|SA;JED|Jeddah|King Abdulaziz|SA;AMM|Amman|Queen Alia|JO;TLV|Tel Aviv|Ben Gurion|IL;CAI|Cairo|Cairo|EG;HRG|Hurghada|Hurghada|EG;SSH|Sharm El Sheikh|Sharm El Sheikh|EG;RAK|Marrakesh|Menara|MA;CMN|Casablanca|Mohammed V|MA;AGA|Agadir|Al Massira|MA;TUN|Tunis|Carthage|TN;JNB|Johannesburg|O. R. Tambo|ZA;CPT|Cape Town|Cape Town|ZA;NBO|Nairobi|Jomo Kenyatta|KE;ZNZ|Zanzibar|Abeid Amani Karume|TZ;JRO|Kilimanjaro|Kilimanjaro|TZ;ADD|Addis Ababa|Bole|ET;LOS|Lagos|Murtala Muhammed|NG;ACC|Accra|Kotoka|GH;MRU|Mauritius|Sir Seewoosagur Ramgoolam|MU;SEZ|Seychelles|Mahé|SC;JFK|New York|John F. Kennedy|US;EWR|New York|Newark|US;LGA|New York|LaGuardia|US;BOS|Boston|Logan|US;IAD|Washington|Dulles|US;DCA|Washington|Reagan National|US;PHL|Philadelphia|Philadelphia|US;ORD|Chicago|O'Hare|US;MDW|Chicago|Midway|US;ATL|Atlanta|Hartsfield-Jackson|US;MIA|Miami|Miami|US;FLL|Miami|Fort Lauderdale|US;MCO|Orlando|Orlando|US;TPA|Tampa|Tampa|US;DFW|Dallas|Dallas/Fort Worth|US;IAH|Houston|George Bush|US;AUS|Austin|Austin-Bergstrom|US;DEN|Denver|Denver|US;PHX|Phoenix|Sky Harbor|US;LAS|Las Vegas|Harry Reid|US;LAX|Los Angeles|Los Angeles|US;SFO|San Francisco|San Francisco|US;SJC|San Francisco|San José|US;OAK|San Francisco|Oakland|US;SAN|San Diego|San Diego|US;SEA|Seattle|Seattle-Tacoma|US;PDX|Portland|Portland|US;MSP|Minneapolis|Minneapolis–Saint Paul|US;DTW|Detroit|Detroit|US;CLT|Charlotte|Charlotte|US;MSY|New Orleans|Louis Armstrong|US;SLC|Salt Lake City|Salt Lake City|US;HNL|Honolulu|Daniel K. Inouye|US;OGG|Maui|Kahului|US;ANC|Anchorage|Ted Stevens|US;YYZ|Toronto|Pearson|CA;YVR|Vancouver|Vancouver|CA;YUL|Montreal|Trudeau|CA;YYC|Calgary|Calgary|CA;YOW|Ottawa|Macdonald-Cartier|CA;MEX|Mexico City|Benito Juárez|MX;CUN|Cancún|Cancún|MX;SJD|Los Cabos|Los Cabos|MX;PVR|Puerto Vallarta|Puerto Vallarta|MX;HAV|Havana|José Martí|CU;VRA|Varadero|Juan Gualberto Gómez|CU;PUJ|Punta Cana|Punta Cana|DO;SDQ|Santo Domingo|Las Américas|DO;MBJ|Montego Bay|Sangster|JM;NAS|Nassau|Lynden Pindling|BS;AUA|Aruba|Queen Beatrix|AW;CUR|Curaçao|Hato|CW;BON|Bonaire|Flamingo|BQ;SXM|Sint Maarten|Princess Juliana|SX;PBM|Paramaribo|Johan Adolf Pengel|SR;SJO|San José|Juan Santamaría|CR;LIR|Liberia|Guanacaste|CR;PTY|Panama City|Tocumen|PA;BOG|Bogotá|El Dorado|CO;CTG|Cartagena|Rafael Núñez|CO;MDE|Medellín|José María Córdova|CO;LIM|Lima|Jorge Chávez|PE;CUZ|Cusco|Alejandro Velasco Astete|PE;UIO|Quito|Mariscal Sucre|EC;GRU|São Paulo|Guarulhos|BR;GIG|Rio de Janeiro|Galeão|BR;EZE|Buenos Aires|Ezeiza|AR;AEP|Buenos Aires|Aeroparque|AR;SCL|Santiago|Arturo Merino Benítez|CL;NRT|Tokyo|Narita|JP;HND|Tokyo|Haneda|JP;KIX|Osaka|Kansai|JP;ITM|Osaka|Itami|JP;NGO|Nagoya|Chubu Centrair|JP;FUK|Fukuoka|Fukuoka|JP;CTS|Sapporo|New Chitose|JP;OKA|Okinawa|Naha|JP;ICN|Seoul|Incheon|KR;GMP|Seoul|Gimpo|KR;PUS|Busan|Gimhae|KR;CJU|Jeju|Jeju|KR;PEK|Beijing|Capital|CN;PKX|Beijing|Daxing|CN;PVG|Shanghai|Pudong|CN;SHA|Shanghai|Hongqiao|CN;CAN|Guangzhou|Baiyun|CN;SZX|Shenzhen|Bao'an|CN;CTU|Chengdu|Tianfu|CN;HKG|Hong Kong|Hong Kong|HK;MFM|Macau|Macau|MO;TPE|Taipei|Taoyuan|TW;SIN|Singapore|Changi|SG;BKK|Bangkok|Suvarnabhumi|TH;DMK|Bangkok|Don Mueang|TH;HKT|Phuket|Phuket|TH;CNX|Chiang Mai|Chiang Mai|TH;USM|Koh Samui|Samui|TH;KBV|Krabi|Krabi|TH;KUL|Kuala Lumpur|KLIA|MY;PEN|Penang|Penang|MY;LGK|Langkawi|Langkawi|MY;CGK|Jakarta|Soekarno-Hatta|ID;DPS|Bali|Ngurah Rai|ID;MNL|Manila|Ninoy Aquino|PH;CEB|Cebu|Mactan-Cebu|PH;SGN|Ho Chi Minh City|Tan Son Nhat|VN;HAN|Hanoi|Noi Bai|VN;DAD|Da Nang|Da Nang|VN;PNH|Phnom Penh|Techo|KH;REP|Siem Reap|Angkor|KH;DEL|Delhi|Indira Gandhi|IN;BOM|Mumbai|Chhatrapati Shivaji|IN;BLR|Bangalore|Kempegowda|IN;GOI|Goa|Dabolim|IN;MAA|Chennai|Chennai|IN;KTM|Kathmandu|Tribhuvan|NP;MLE|Malé|Velana|MV;CMB|Colombo|Bandaranaike|LK;SYD|Sydney|Kingsford Smith|AU;MEL|Melbourne|Tullamarine|AU;BNE|Brisbane|Brisbane|AU;PER|Perth|Perth|AU;ADL|Adelaide|Adelaide|AU;OOL|Gold Coast|Gold Coast|AU;CNS|Cairns|Cairns|AU;AKL|Auckland|Auckland|NZ;CHC|Christchurch|Christchurch|NZ;ZQN|Queenstown|Queenstown|NZ;NAN|Fiji|Nadi|FJ;PPT|Tahiti|Faa'a|PF".split(";").map(s => { const [code, city, name, cc] = s.split("|"); return { code, city, name, cc }; });
const AP = Object.fromEntries(AIRPORTS.map(a => [a.code, a]));
const regionName = (() => { try { const dn = new Intl.DisplayNames(["en"], { type: "region" }); return cc => dn.of(cc) || cc; } catch { return cc => cc; } })();
const COUNTRY_ALIAS = { usa: "US", america: "US", "united states": "US", us: "US", uk: "GB", england: "GB", britain: "GB", scotland: "GB", holland: "NL", uae: "AE", emirates: "AE", korea: "KR" };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CITIES = Object.values(AIRPORTS.reduce((m, a) => { (m[a.city + "|" + a.cc] ||= { city: a.city, cc: a.cc, codes: [] }).codes.push(a.code); return m; }, {}));
const COUNTRIES = Object.values(AIRPORTS.reduce((m, a) => { (m[a.cc] ||= { cc: a.cc, name: regionName(a.cc), codes: [] }).codes.push(a.code); return m; }, {}));
const MAX_AIRPORTS = 7; // Google Flights searches at most 7 airports per side

/**
 * Dropdown rows for a search, grouped like Google Flights: a city ("all airports") with its airports
 * indented under it. Countries come first when the query names one, followed by their cities.
 * Returns { opts, hi } where hi is the row to highlight (the airport itself when a code is typed).
 */
function locationOptions(q) {
  const n = norm(q), code = q.trim().toUpperCase();
  if (!n) return { opts: [], hi: 0 };
  const score = (text, base) => { const t = norm(text); return t === n ? base : t.startsWith(n) ? base + 1 : t.includes(" " + n) || t.includes("-" + n) ? base + 2 : n.length > 3 && t.includes(n) ? base + 4 : null; };
  const cityOfAirport = a => CITIES.find(c => c.city === a.city && c.cc === a.cc);
  const groups = new Map(); // city -> best score
  const hit = (city, sc) => { if (sc != null && (!groups.has(city) || sc < groups.get(city))) groups.set(city, sc); };
  for (const c of CITIES) hit(c, score(c.city, 1));
  for (const a of AIRPORTS) hit(cityOfAirport(a), a.code === code ? 0 : score(a.name, 3));
  const countries = COUNTRIES.filter(c => c.codes.length > 1 && (COUNTRY_ALIAS[n] === c.cc || [0, 2].includes(score(c.name, 0)) || score(c.name, 0) === 1));
  const opts = [];
  for (const c of countries.slice(0, 1)) {
    opts.push({ kind: "country", level: 0, label: c.name, sub: `All airports · ${c.codes.slice(0, MAX_AIRPORTS).join(", ")}${c.codes.length > MAX_AIRPORTS ? " (largest 7)" : ""}`, codes: c.codes.slice(0, MAX_AIRPORTS) });
    CITIES.filter(x => x.cc === c.cc).slice(0, 6).forEach((x, i) => hit(x, 10 + i));
  }
  const cities = [...groups].sort((a, b) => a[1] - b[1] || b[0].codes.length - a[0].codes.length).slice(0, countries.length ? 7 : 6).map(([c]) => c);
  for (const c of cities) {
    const country = regionName(c.cc);
    if (c.codes.length > 1) {
      opts.push({ kind: "city", level: 0, label: c.city, sub: `All airports · ${country}`, codes: c.codes });
      for (const x of c.codes) opts.push({ kind: "airport", level: 1, label: AP[x].name, sub: `${c.city}, ${country}`, codes: [x] });
    } else {
      const a = AP[c.codes[0]];
      opts.push({ kind: "airport", level: 0, label: a.city, sub: `${a.name !== a.city ? a.name + " · " : ""}${country}`, codes: [a.code] });
    }
  }
  // highlight the row that matches what was typed: an airport code, else the first row whose own name starts with it
  const exactAt = opts.findIndex(o => o.kind === "airport" && o.codes[0] === code);
  const nameAt = opts.findIndex(o => norm(o.label).split(/[\s-]+/).some(w => w.startsWith(n)) || norm(o.label).startsWith(n));
  return { opts, hi: exactAt >= 0 ? exactAt : nameAt >= 0 ? nameAt : 0 };
}

/** Codes string -> chips: whole cities/countries collapse into one chip. */
function chipsFromCodes(str) {
  const left = codes(str).split(",").filter(Boolean), chips = [];
  for (const c of COUNTRIES) { const g = c.codes.slice(0, MAX_AIRPORTS); if (g.length > 2 && g.every(x => left.includes(x))) { chips.push({ label: c.name, codes: g }); g.forEach(x => left.splice(left.indexOf(x), 1)); } }
  for (const c of CITIES) if (c.codes.length > 1 && c.codes.every(x => left.includes(x))) { chips.push({ label: `${c.city} (all)`, codes: c.codes }); c.codes.forEach(x => left.splice(left.indexOf(x), 1)); }
  for (const x of left) chips.push({ label: AP[x] ? `${AP[x].city} ${x}` : x, codes: [x] });
  return chips;
}
const cityOf = str => { const cs = [...new Set(codes(str).split(",").filter(Boolean).map(c => AP[c]?.city || c))]; return cs.length > 3 ? `${cs.slice(0, 2).join(" / ")} +${cs.length - 2}` : cs.join(" / "); };

function locPicker(name, label, value, placeholder) {
  return `<div class="field"><span id="lbl-${name}">${label}</span>
    <div class="loc" data-loc="${name}">
      <div class="loc-box"><span class="loc-chips"></span><input class="loc-input" placeholder="${placeholder}" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-labelledby="lbl-${name}" autocomplete="off" spellcheck="false"></div>
      <input type="hidden" name="${name}" value="${esc(value || "")}">
      <div class="loc-menu" role="listbox" hidden></div>
    </div></div>`;
}
function initLoc(root) {
  const hidden = root.querySelector("input[type=hidden]"), input = root.querySelector(".loc-input"), menu = root.querySelector(".loc-menu"), chipsEl = root.querySelector(".loc-chips");
  let chips = chipsFromCodes(hidden.value), opts = [], hi = 0;
  const sync = () => {
    hidden.value = [...new Set(chips.flatMap(c => c.codes))].join(",");
    chipsEl.innerHTML = chips.map((c, i) => `<span class="loc-chip">${esc(c.label)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(c.label)}">${icon("close", "i xs")}</button></span>`).join("");
    input.placeholder = chips.length ? "Add another" : input.dataset.ph;
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
  };
  input.dataset.ph = input.placeholder;
  const close = () => { menu.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const show = () => {
    ({ opts, hi } = locationOptions(input.value));
    if (!input.value.trim()) return close();
    const taken = new Set(chips.flatMap(c => c.codes));
    menu.innerHTML = opts.length ? opts.map((o, i) => `<div class="loc-opt ${o.level ? "sub" : ""} ${i === hi ? "hi" : ""} ${o.codes.every(c => taken.has(c)) ? "taken" : ""}" role="option" tabindex="-1" data-i="${i}" aria-selected="${i === hi}">
        <span class="loc-ic">${o.kind === "airport" ? icon("plane", "i sm") : o.kind === "city" ? icon("city") : icon("globe")}</span>
        <span class="grow"><b>${esc(o.label)}</b><br><span class="tiny ink2">${esc(o.sub)}</span></span>
        <span class="loc-code">${o.codes.length === 1 ? o.codes[0] : o.codes.length + " airports"}</span></div>`).join("")
      : /^[a-z]{3}$/i.test(input.value.trim()) ? `<div class="loc-opt hi" role="option" tabindex="-1" data-raw="1"><span class="loc-ic">${icon("plane", "i sm")}</span><span class="grow"><b>Use airport code ${esc(input.value.trim().toUpperCase())}</b></span></div>`
      : `<div class="loc-empty small ink2">No match. Type a city, airport, country or 3-letter code.</div>`;
    menu.hidden = false; input.setAttribute("aria-expanded", "true");
  };
  const pick = o => {
    if (!o) { const raw = input.value.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(raw)) return; o = { label: AP[raw] ? `${AP[raw].city} ${raw}` : raw, codes: [raw] }; }
    const total = new Set([...chips.flatMap(c => c.codes), ...o.codes]).size;
    if (total > MAX_AIRPORTS) return toast(`Google Flights searches up to ${MAX_AIRPORTS} airports at once.`);
    // picking a whole city replaces chips for its single airports, and vice versa
    chips = chips.filter(c => !c.codes.every(x => o.codes.includes(x)) && !o.codes.every(x => c.codes.includes(x)));
    chips.push({ label: o.kind === "city" ? `${o.label} (all)` : o.kind === "airport" && AP[o.codes[0]] ? `${AP[o.codes[0]].city} ${o.codes[0]}` : o.label, codes: o.codes });
    input.value = ""; close(); sync(); input.focus();
  };
  const move = d => { if (!opts.length) return; hi = (hi + d + opts.length) % opts.length; menu.querySelectorAll(".loc-opt").forEach((el, i) => { el.classList.toggle("hi", i === hi); el.setAttribute("aria-selected", i === hi); if (i === hi) el.scrollIntoView({ block: "nearest" }); }); };
  input.addEventListener("input", e => { e.stopPropagation(); show(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); menu.hidden ? show() : move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" || e.key === "," || e.key === "Tab" && input.value.trim()) { if (input.value.trim()) { e.preventDefault(); pick(opts[hi]); } }
    else if (e.key === "Escape") close();
    else if (e.key === "Backspace" && !input.value && chips.length) { chips.pop(); sync(); }
  });
  menu.addEventListener("mousedown", e => e.preventDefault()); // keep focus (and the keyboard) in the input
  menu.addEventListener("click", e => { const el = e.target.closest(".loc-opt"); if (el) pick(el.dataset.raw ? null : opts[+el.dataset.i]); });
  menu.addEventListener("pointermove", e => { const el = e.target.closest(".loc-opt"); if (el && !el.dataset.raw && +el.dataset.i !== hi) move(+el.dataset.i - hi); });
  chipsEl.addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { chips.splice(+b.dataset.rm, 1); sync(); input.focus(); } });
  root.querySelector(".loc-box").addEventListener("click", e => { if (e.target === e.currentTarget || e.target === chipsEl) input.focus(); });
  input.addEventListener("blur", () => setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 150));
  document.addEventListener("pointerdown", e => { if (!root.contains(e.target)) close(); });
  // on phones, lift the field to just below the top bar so the list has room under it
  input.addEventListener("focus", () => { if (innerWidth < 760 && !root.closest("dialog")) setTimeout(() => scrollBy({ top: root.getBoundingClientRect().top - 96, behavior: "smooth" }), 250); });
  root._set = v => { chips = chipsFromCodes(v); sync(); };
  sync();
}

// ---------- countries, regions, flags ----------
const REGIONS = {
  "Europe": "AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA TR GE AM AZ",
  "Middle East & North Africa": "AE BH EG IL IQ IR JO KW LB OM PS QA SA SY YE MA DZ TN LY",
  "Africa": "AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ GQ ER SZ ET GA GM GH GN GW KE LS LR MG MW ML MR MU MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG UG ZM ZW RE YT",
  "Asia": "AF BD BT BN KH CN HK IN ID JP KZ KG LA MO MY MV MN MM NP KP KR PK PH SG LK TW TJ TH TL TM UZ VN",
  "North America": "US CA",
  "Caribbean & Central America": "MX BZ CR SV GT HN NI PA AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR KN LC MF VC SX TT TC VI",
  "South America": "AR BO BR CL CO EC GY PY PE SR UY VE GF",
  "Oceania": "AU NZ FJ PF NC PG WS TO VU GU",
};
const REGION_OF = Object.fromEntries(Object.entries(REGIONS).flatMap(([r, cs]) => cs.split(" ").map(c => [c, r])));
const COUNTRY_CODE = (() => {
  const out = { usa: "US", "united states of america": "US", uk: "GB", "great britain": "GB", turkey: "TR", "czech republic": "CZ", holland: "NL", "south korea": "KR", "korea": "KR" };
  const A = 65;
  for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) {
    const cc = String.fromCharCode(A + i, A + j), name = regionName(cc);
    if (name && name !== cc) out[norm(name)] ||= cc;
  }
  return out;
})();
const countryCode = name => COUNTRY_CODE[norm(name)] || "";
const regionOf = cc => REGION_OF[cc] || "Other";
const flag = cc => /^[A-Z]{2}$/.test(cc || "") ? String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0))) : "🌍";
/** A soft two-color background for destinations without a photo, stable per name. */
function placeGradient(name) {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 40) % 360;
  return `linear-gradient(135deg, hsl(${a} 55% 55%), hsl(${b} 60% 38%))`;
}
const airportLabel = code => AP[code] ? `${AP[code].city} (${code})` : code;
