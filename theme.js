// Texal - a list of tables down the right, and the selected table's backglass, art and
// features in the middle.
//
// This file does five things, in this order: read the options, draw the backglass, draw
// the selection, draw the list, and hand every message to core. Input, audio, preloading,
// layout, the loading indicator, attract mode and the backglass and score view pages are
// core's.

const vpin = new VPinFECore();
window.vpin = vpin;                  // core and its overlays look for this name
window.receiveEvent = receiveEvent;  // core delivers every message through this one

const stage = document.querySelector(".stage");

async function start() {
  vpin.init();
  await vpin.ready;                  // the tables, the options and the layout are in

  // Input. Core moves the selection, pages it and opens the menu and the collection
  // picker. Select is the one action it leaves to a theme.
  vpin.registerInputHandler((action) => {
    if (action === "select") vpin.launchTable(vpin.getCurrentTableIndex());
  });

  stage.dataset.flyer = option("showFlyer", false) ? "on" : "off";
  startAmbientMotion();
  draw({ reason: "enter" });
  document.body.dataset.ready = "true";
}

// --- 1. Options ---------------------------------------------------------------------
// options.json declares them and carries their defaults; core merges in what the person
// chose.

function option(key, fallback) {
  const value = vpin.themeConfig ? vpin.themeConfig[key] : undefined;
  return value === undefined ? fallback : value;
}

// --- 2. The backglass ---------------------------------------------------------------
// Two pictures stacked. The new table's backglass is loaded into the one at the back,
// then faded in over the other.

const backdrops = Array.from(document.querySelectorAll(".backdrop-art"));
let frontBackdrop = 0;

function drawBackdrop(url) {
  const previous = backdrops[frontBackdrop];
  const next = backdrops[1 - frontBackdrop];
  next.onload = null;                // a slow picture for a table no longer selected must not fade in

  if (!url) {
    previous.classList.remove("on");
    return;
  }
  if (previous.getAttribute("src") === url) {
    previous.classList.add("on");
    return;
  }
  next.onload = () => {
    next.classList.add("on");
    previous.classList.remove("on");
    frontBackdrop = 1 - frontBackdrop;
  };
  next.src = url;
}

// --- 3. The selection ---------------------------------------------------------------
// Everything about the selected table is on its entry. A collection in the picker is a
// row with a name, a count and pictures.

const themeEl = document.getElementById("selection");
const wheelEl = document.getElementById("wheel");
const nameEl = document.getElementById("name");
const ratingEl = document.getElementById("rating");
const authorsEl = document.getElementById("authors");
const metaEl = document.getElementById("meta");
const previewEl = document.getElementById("preview");
const flyerEl = document.getElementById("flyer");
const markEl = document.getElementById("mark");
const featuresEl = document.getElementById("features");
const addonsEl = document.getElementById("addons");
const statsEl = document.getElementById("stats");
const emptyEl = document.getElementById("empty");

const LONG_NAME = 20;
const VIDEO_DELAY_MS = 260;
const FADE_MS = 220;

function drawSelection(list) {
  const empty = list.length === 0;
  emptyEl.hidden = !empty;
  emptyEl.textContent = vpin.t("frontend.theme.no_tables_found", "No tables found");
  themeEl.hidden = empty;
  if (empty) {
    drawBackdrop("");
    return;
  }

  document.getElementById("features-heading").textContent =
    vpin.t("frontend.theme.detected_features", "Detected Features");
  document.getElementById("addons-heading").textContent = vpin.t("theme.add_ons", "Add-ons");
  document.getElementById("stats-heading").textContent = vpin.t("theme.stats", "Stats");

  const picking = list.kind === "collection";
  stage.dataset.view = picking ? "collections" : "tables";
  if (picking) drawCollection(list.current);
  else drawTable(list.current, list.cursor);
}

function drawTable(entry, index) {
  const { game, table, assets } = entry;
  setName(game.name);

  wheelEl.replaceChildren(...(entry.media.includes("wheel") ? [image(vpin.getMediaURL(index, "wheel"))] : []));
  drawRating(entry);

  authorsEl.textContent = table.authors.join(", ");
  authorsEl.hidden = table.authors.length === 0;
  metaEl.textContent = [game.year, game.manufacturer, game.type].filter(Boolean).join(" / ");

  drawPreview(entry, index);
  drawFlyer(entry, index);
  drawMark(entry, index);
  drawBackdrop(entry.media.includes("backglass") ? vpin.getImageURL(index, "backglass") : "");

  drawTags(featuresEl, [
    ["Nfozzy", table.detects.nfozzy],
    ["Fleep", table.detects.fleep],
    ["SSF", table.detects.ssf],
    ["FastFlips", table.detects.fastflips],
    ["LUT", table.detects.lut],
    ["Scorbit", table.detects.scorbit],
    ["FlexDMD", table.detects.flex],
  ]);
  drawTags(addonsEl, [
    ["AltSound", assets.alt_sound],
    ["AltColor", assets.alt_color],
    ["PuP-Pack", assets.pup_pack],
  ]);
  drawStats(game.user || {});
}

function drawCollection(row) {
  setName(row.label);
  wheelEl.replaceChildren();
  ratingEl.hidden = true;
  authorsEl.textContent = "";
  // A collection that did not resolve, or a remote library, has no count.
  const count = row.table_count;
  metaEl.textContent = Number.isFinite(count)
    ? vpin.t("theme.tables", { one: "{count} Table", other: "{count} Tables" }, { count })
    : "";

  const art = row.image_url || (row.game_wheel_urls || [])[0] || "";
  newPreviewToken();
  showLayer(art ? image(art) : fallbackNode(), art ? "load" : "now");
  flyerEl.hidden = true;
  markEl.replaceChildren();
  drawBackdrop("");
}

// A long name is set smaller so two lines still hold it.
function setName(text) {
  nameEl.textContent = text;
  nameEl.dataset.long = String(text.length > LONG_NAME);
}

function image(url) {
  const node = document.createElement("img");
  node.alt = "";
  node.src = url;
  return node;
}

// VPinPlay's community rating, which core keeps on the entry: out of five, with the number
// of ratings behind it.
function drawRating(entry) {
  const found = entry.ext && entry.ext.vpinplay;
  const count = found ? Number(found.ratingCount) : 0;
  const score = found ? Number(found.cumulativeRating) : 0;
  if (!(count > 0) || !(score > 0)) {
    ratingEl.hidden = true;
    return;
  }
  const stars = "★".repeat(Math.round(score)) + "☆".repeat(5 - Math.round(score));
  ratingEl.replaceChildren(textNode("span", "VPinPlay"), textNode("span", stars, "rating-stars"));
  ratingEl.title = `${score.toFixed(1)} / 5 (${count})`;
  ratingEl.hidden = false;
}

function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

// Every tag is drawn and the ones the table lacks are dimmed, so the row reads the same
// from table to table.
function drawTags(listEl, tags) {
  listEl.replaceChildren(...tags.map(([label, on]) => {
    const tag = document.createElement("li");
    tag.textContent = label;
    tag.classList.toggle("on", Boolean(on));
    return tag;
  }));
}

function drawStats(user) {
  const rating = Number(user.rating) || 0;
  const minutes = Math.round((Number(user.play_time_seconds) || 0) / 60);
  const last = user.last_played ? new Date(user.last_played) : null;
  const rows = [
    [vpin.t("frontend.theme.my_rating", "My Rating"),
      rating > 0 ? "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating)) : "-"],
    [vpin.t("theme.plays", "Plays"), String(Number(user.play_count) || 0)],
    [vpin.t("theme.minutes", "Minutes"), String(minutes)],
    [vpin.t("theme.last_played", "Last Played"), last && !Number.isNaN(last.getTime()) ? last.toLocaleDateString() : "-"],
  ];
  statsEl.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.append(textNode("dt", label), textNode("dd", value));
    return row;
  }));
}

// --- The preview --------------------------------------------------------------------
// The playfield picture shows at once and the playfield video replaces it a moment later,
// so stepping quickly through the list never starts a video. Each new layer fades in over
// the ones already there. The pictures and the video are shown as stored: contained, not
// turned.

let previewToken = 0;
let videoTimer = 0;

function newPreviewToken() {
  clearTimeout(videoTimer);
  previewToken += 1;
  for (const layer of previewEl.querySelectorAll(".entering")) discard(layer);
  return previewToken;
}

function drawPreview(entry, index) {
  const token = newPreviewToken();
  // The video follows the person's Playfield Media Priority. The picture always shows first
  // so the preview is never empty while the video loads.
  const art = vpin.getMedia(index, "playfield");
  const video = art.kind === "video";
  // getImageURL has no FSS fallback: a table with only an FSS picture would get the
  // placeholder.
  const still = ["playfield", "playfield_fss"].find((kind) => entry.media.includes(kind));

  if (still) {
    const node = image(vpin.getImageURL(index, still));
    // A picture that will not load must not leave the last table's art on screen.
    node.addEventListener("error", () => {
      if (token === previewToken) showLayer(fallbackNode(), "now", token);
    }, { once: true });
    showLayer(node, "load");
  } else {
    showLayer(fallbackNode(), "now");
  }

  if (!video) return;
  videoTimer = setTimeout(() => {
    if (token !== previewToken) return;
    const node = videoNode(art.url);
    showLayer(node, "loadeddata", token);
  }, VIDEO_DELAY_MS);
}

function videoNode(url) {
  const node = document.createElement("video");
  Object.assign(node, { src: url, autoplay: true, loop: true, muted: true, playsInline: true });
  return node;
}

function fallbackNode() {
  const node = document.createElement("div");
  node.className = "art-fallback";
  node.textContent = vpin.t("theme.no_preview", "No preview");
  return node;
}

// The node waits, invisible, until `event` says it has something to show.
function showLayer(node, event, token = previewToken) {
  const layer = document.createElement("div");
  layer.className = "layer entering";
  layer.appendChild(node);
  previewEl.appendChild(layer);

  // A layer retires only the ones under it. The video is added after the picture, so a
  // picture that loads late never takes down a video that loaded first.
  const reveal = () => {
    if (token !== previewToken || !layer.isConnected) return;
    for (let old = layer.previousElementSibling; old; old = old.previousElementSibling) {
      if (!old.classList.contains("entering") && !old.classList.contains("exiting")) retire(old);
    }
    layer.offsetWidth;               // so the fade starts from the hidden look
    layer.classList.remove("entering");
  };
  if (event === "now") requestAnimationFrame(reveal);
  else node.addEventListener(event, reveal, { once: true });
  node.addEventListener("error", () => discard(layer), { once: true });
}

function retire(layer) {
  layer.classList.add("exiting");
  setTimeout(() => discard(layer), FADE_MS);
}

// A removed video is told to stop downloading, or it would carry on until collected.
function discard(layer) {
  for (const video of layer.querySelectorAll("video")) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  layer.remove();
}

// Beside the preview, when Show the flyer is on and the table has one.
function drawFlyer(entry, index) {
  const wanted = option("showFlyer", false) && entry.media.includes("flyer");
  flyerEl.hidden = !wanted;
  flyerEl.replaceChildren(...(wanted ? [image(vpin.getImageURL(index, "flyer"))] : []));
}

// The backglass video above the list, or its picture. The picture shows first and the
// video follows, as in the preview.
function drawMark(entry, index) {
  const hasImage = entry.media.includes("backglass");
  markEl.replaceChildren(...(hasImage ? [image(vpin.getImageURL(index, "backglass"))] : []));

  // A tall screen hides the header, so it is not worth playing a video there.
  if (getComputedStyle(markEl).display === "none") return;
  const art = vpin.getMedia(index, "backglass");
  if (art.kind !== "video") return;     // the person's Backglass Media Priority picks the video
  const token = previewToken;
  setTimeout(() => {
    if (token !== previewToken) return;
    const node = videoNode(art.url);
    node.addEventListener("loadeddata", () => {
      if (token === previewToken) markEl.replaceChildren(node);
      else {
        node.removeAttribute("src");
        node.load();
      }
    }, { once: true });
  }, VIDEO_DELAY_MS);
}

// --- 4. The list --------------------------------------------------------------------
// Nineteen rows with the selection in the middle one. A list shorter than that leaves the
// outer rows empty and keeps the selection in the middle.

const ROWS = 19;
const MIDDLE = 9;

const listEl = document.getElementById("list");
const scanEl = document.createElement("div");
scanEl.className = "scan";

const rows = Array.from({ length: ROWS }, () => {
  const row = document.createElement("li");
  const text = document.createElement("span");
  row.appendChild(text);
  listEl.appendChild(row);
  return { row, text };
});

function drawList(list) {
  const shown = Math.min(ROWS, list.length);
  const before = Math.min(MIDDLE, Math.floor((shown - 1) / 2));
  const after = shown - 1 - before;

  rows.forEach(({ row, text }, slot) => {
    const offset = slot - MIDDLE;
    const used = offset >= -before && offset <= after;
    row.className = used ? (offset === 0 ? "active" : Math.abs(offset) <= 2 ? "near" : "") : "";
    text.textContent = used ? labelOf(list, list.indexAfter(offset)) : "";
  });
  rows[MIDDLE].row.appendChild(scanEl);
}

function labelOf(list, index) {
  const item = list.items[index];
  return list.kind === "collection" ? item.label : item.game.name;
}

// --- 5. Motion ----------------------------------------------------------------------
// GSAP moves the page on a step or a jump, and two ambient loops run for as long as the
// page does. Without GSAP the page still draws.

function startAmbientMotion() {
  if (!window.gsap) return;
  gsap.to(".side-glow", { xPercent: 8, yPercent: -4, duration: 6, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.fromTo(
    ".ripple",
    { scale: 0.2, opacity: 0.7 },
    { scale: 1.6, opacity: 0, duration: 4.8, ease: "power1.out", repeat: -1, stagger: 0.8 },
  );
}

function animateStep(direction) {
  if (!window.gsap) return;
  const sign = direction === "previous" ? -1 : 1;
  const row = listEl.clientHeight / ROWS;
  gsap.fromTo(listEl, { y: sign * row }, { y: 0, duration: 0.18, ease: "power2.out" });
  gsap.fromTo(scanEl, { xPercent: -120, opacity: 0.9 }, { xPercent: 120, opacity: 0, duration: 0.45, ease: "power1.out" });
  animateIn();
}

function animateIn() {
  if (!window.gsap) return;
  gsap.fromTo(".heading-copy", { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out", overwrite: true });
  gsap.fromTo(".preview-stack", { opacity: 0.6, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out", overwrite: true });
  gsap.fromTo(".tag-panel", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out", stagger: 0.05, overwrite: true });
}

function animateEnter() {
  if (!window.gsap) return;
  gsap.fromTo(themeEl, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" });
}

// --- Messages -----------------------------------------------------------------------
// Core needs to see every message first: it keeps the selection, the audio and the
// loading indicator in step with them. After that the theme draws.
//
// reason says why the selection moved: "step" is one press, "page" a jump, "enter" a
// first draw.

async function receiveEvent(message) {
  await vpin.handleEvent(message);

  if (message.type === "TableIndexUpdate") {
    draw(message);
  } else if (message.type === "TableDataChange") {
    draw({ reason: "enter" });
  }
}

function draw(message) {
  const list = vpin.activeList();
  drawSelection(list);
  drawList(list);
  if (list.length === 0) return;
  if (message.reason === "step") animateStep(message.direction);
  else if (message.reason === "page") animateIn();
  else if (message.reason === "enter") animateEnter();
}

// Last, so every const above is set before start() reads it.
start();
