// Photos of places: Google's own photo when the deal data has one, otherwise the lead image of the place's
// Wikipedia article (looked up once per place and remembered in this browser). Without either, the card's
// colored background stays.

const imgLookups = new Map();

/** The Wikipedia lead image for a place, or "" when there is none. */
function wikiImage(name, country) {
  const k = `${name}|${country || ""}`;
  if (!imgLookups.has(k)) imgLookups.set(k, (async () => {
    const known = store.get("img:" + k, null);
    if (known !== null) return known;
    let failed = false;
    for (const title of [name, country && `${name}, ${country}`].filter(Boolean)) {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
        if (!r.ok) { failed ||= r.status !== 404; continue; }
        const j = await r.json();
        if (j.type === "disambiguation") continue;
        const src = j.originalimage?.width <= 1280 ? j.originalimage.source : j.thumbnail?.source?.replace(/\/\d+px-/, "/640px-");
        if (src) { store.set("img:" + k, src); return src; }
      } catch { failed = true; }
    }
    if (!failed) store.set("img:" + k, ""); // only remember "no photo" when Wikipedia actually said so
    return "";
  })());
  return imgLookups.get(k);
}

/** A photo of a place for inside a `.pic` box; d = { name, country, image }. */
const placeImg = (d, cls = "") =>
  `<img class="${cls}" alt="" loading="lazy" decoding="async" ${d.image ? `src="${esc(d.image)}"` : ""} data-place="${esc(d.name)}" data-country="${esc(d.country || "")}" onerror="placeImgFailed(this)">`;

/** A thumbnail for a tracked route's destination: a collected photo for that airport, or a lookup by city. */
function routeImg(r, cls = "thumb") {
  const code = codes(r.to).split(",")[0], a = AP[code];
  let image = "";
  for (const s of Object.values(deals.slices || {})) image ||= s.destinations?.find(d => d.code === code && d.image)?.image || "";
  return `<span class="${cls}" style="background:${placeGradient(a?.city || code)}">${placeImg({ name: a?.city || code, country: a ? regionName(a.cc) : "", image })}</span>`;
}

function placeImgFailed(img) {
  if (img.dataset.tried) return img.remove();
  img.dataset.tried = "1";
  wikiImage(img.dataset.place, img.dataset.country).then(src => src && src !== img.src ? img.src = src : img.remove());
}
function fillImages(root) {
  if (root.matches("img[data-place]:not([src]):not([data-tried])")) return placeImgFailed(root);
  root.querySelectorAll?.("img[data-place]:not([src]):not([data-tried])").forEach(placeImgFailed);
}
new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) fillImages(n); })
  .observe(document.documentElement, { childList: true, subtree: true });
