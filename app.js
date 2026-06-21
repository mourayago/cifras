// ============================================================
//  APP — estado, persistência e renderização
// ============================================================

const STORE_KEY = "cifras_app_state_v1";

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (e) { return {}; }
}
function saveStore() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }

const store = Object.assign({
  favorites: {},      // { cifraId: true }
  lists: {},          // { listId: { name, cifras: [ids] } }
  fontSize: 17,
  prefs: {},          // { cifraId: { transpose: n } }
  userCifras: []      // cifras importadas pelo usuário (texto/PDF)
}, loadStore());
if (!store.userCifras) store.userCifras = [];

const app = document.getElementById("app");
let currentTab = "todas";
let searchTerm = "";

// ---------- Helpers ----------
function allCifras() { return CIFRAS.concat(store.userCifras || []); }
function getCifra(id) { return allCifras().find(c => c.id === id); }
function cifraId(title) {
  const base = (title || "cifra").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cifra";
  let id = base, n = 2;
  while (getCifra(id)) { id = base + "-" + n; n++; }
  return id;
}
function detectKey(content) {
  for (const line of content.split("\n")) {
    if (isChordLine(line)) {
      const tok = line.trim().split(/\s+/).find(isChordToken);
      if (tok) { const m = tok.match(/^[A-G][#b]?m?/); if (m) return m[0]; }
    }
  }
  return null;
}
function isFav(id) { return !!store.favorites[id]; }
function toggleFav(id) {
  if (store.favorites[id]) delete store.favorites[id];
  else store.favorites[id] = true;
  saveStore();
}
function uid() { return "l" + Math.floor(performance.now() * 1000).toString(36) + Object.keys(store.lists).length; }

// ---------- Navegação ----------
function go(route) {
  location.hash = route;
}
window.addEventListener("hashchange", render);

function render() {
  const hash = location.hash.slice(1);
  document.body.classList.toggle("reading", hash.startsWith("cifra/"));
  if (hash.startsWith("cifra/")) {
    renderCifra(hash.slice(6));
  } else if (hash.startsWith("lista/")) {
    renderListDetail(hash.slice(6));
  } else {
    renderHome();
  }
  window.scrollTo(0, 0);
}

// ============================================================
//  HOME
// ============================================================
function renderHome() {
  stopScroll();
  const tabs = `
    <div class="tabs">
      <button class="tab ${currentTab==='todas'?'active':''}" data-tab="todas">Todas</button>
      <button class="tab ${currentTab==='favoritas'?'active':''}" data-tab="favoritas">★ Favoritas</button>
      <button class="tab ${currentTab==='listas'?'active':''}" data-tab="listas">Listas</button>
    </div>`;

  let body = "";
  if (currentTab === "listas") {
    body = renderListsTab();
  } else {
    let items = allCifras().slice();
    if (currentTab === "favoritas") items = items.filter(c => isFav(c.id));
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      items = items.filter(c =>
        c.title.toLowerCase().includes(t) || c.artist.toLowerCase().includes(t));
    }
    items.sort((a,b) => a.title.localeCompare(b.title));
    const importBtn = `<button class="btn" id="importBtn" style="width:100%;margin-bottom:14px">＋ Importar cifra (texto ou PDF)</button>`;
    const list = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">${currentTab==='favoritas' ? 'Nenhuma cifra favoritada ainda.' : 'Nenhuma cifra encontrada.'}</div>`;
    body = importBtn + list;
  }

  app.innerHTML = `<div class="container">${tabs}${body}</div>`;

  app.querySelectorAll(".tab").forEach(b =>
    b.onclick = () => { currentTab = b.dataset.tab; render(); });
  const ib = document.getElementById("importBtn");
  if (ib) ib.onclick = () => openImportModal();
  bindCards();
}

function cardHTML(c) {
  return `
    <div class="card" data-id="${c.id}">
      <div class="card-main" data-go="cifra/${c.id}">
        <div class="card-title">${esc(c.title)}</div>
        <div class="card-sub">${esc(c.artist)}${c.tags && c.tags.length ? " · " + c.tags.map(esc).join(", ") : ""}</div>
      </div>
      <span class="key-badge">${esc(c.key)}</span>
      <button class="star ${isFav(c.id)?'on':''}" data-fav="${c.id}" title="Favoritar">★</button>
    </div>`;
}

function bindCards() {
  app.querySelectorAll("[data-go]").forEach(el =>
    el.onclick = () => go(el.dataset.go));
  app.querySelectorAll("[data-fav]").forEach(el =>
    el.onclick = (e) => { e.stopPropagation(); toggleFav(el.dataset.fav); render(); });
}

// ============================================================
//  LISTAS
// ============================================================
function renderListsTab() {
  const lists = Object.entries(store.lists);
  const listCards = lists.length
    ? lists.map(([id, l]) => `
        <div class="card" data-go="lista/${id}">
          <div class="card-main" data-go="lista/${id}">
            <div class="card-title">${esc(l.name)}</div>
            <div class="card-sub">${l.cifras.length} cifra(s)</div>
          </div>
          <button class="star" data-dellist="${id}" title="Excluir lista" style="color:var(--text-dim)">🗑</button>
        </div>`).join("")
    : `<div class="empty">Você ainda não criou nenhuma lista.</div>`;

  setTimeout(() => {
    app.querySelectorAll("[data-dellist]").forEach(el =>
      el.onclick = (e) => {
        e.stopPropagation();
        if (confirm("Excluir esta lista?")) { delete store.lists[el.dataset.dellist]; saveStore(); render(); }
      });
  }, 0);

  return `
    <button class="btn" id="newListBtn" style="margin-bottom:14px">+ Nova lista</button>
    ${listCards}`;
}

function renderListDetail(id) {
  stopScroll();
  const list = store.lists[id];
  if (!list) { go(""); return; }
  const items = list.cifras.map(getCifra).filter(Boolean);
  const body = items.length
    ? items.map(c => `
        <div class="card">
          <div class="card-main" data-go="cifra/${c.id}">
            <div class="card-title">${esc(c.title)}</div>
            <div class="card-sub">${esc(c.artist)}</div>
          </div>
          <span class="key-badge">${esc(c.key)}</span>
          <button class="star" data-remove="${c.id}" title="Remover da lista" style="color:var(--text-dim)">✕</button>
        </div>`).join("")
    : `<div class="empty">Lista vazia. Abra uma cifra e use "Adicionar à lista".</div>`;

  app.innerHTML = `<div class="container">
    <button class="back-link" data-go="">← Voltar</button>
    <h1 style="margin-bottom:18px">${esc(list.name)}</h1>
    ${body}
  </div>`;

  app.querySelectorAll("[data-go]").forEach(el => el.onclick = () => go(el.dataset.go));
  app.querySelectorAll("[data-remove]").forEach(el =>
    el.onclick = () => { list.cifras = list.cifras.filter(x => x !== el.dataset.remove); saveStore(); renderListDetail(id); });
}

// ============================================================
//  DETALHE DA CIFRA
// ============================================================
let scrollTimer = null;
let scrollSpeed = 3;

function getPref(id) {
  if (!store.prefs[id]) store.prefs[id] = { transpose: 0 };
  return store.prefs[id];
}

function renderCifra(id) {
  const c = getCifra(id);
  if (!c) { go(""); return; }
  const pref = getPref(id);

  const keyOptions = allKeys(false).map(k =>
    `<option value="${k}" ${transposeKeyName(c.key,pref.transpose)===k?'selected':''}>${k}</option>`).join("");

  app.innerHTML = `<div class="container">
    <button class="back-link" data-go="">← Voltar</button>
    <div class="cifra-header">
      <h1>${esc(c.title)}</h1>
      <div class="artist">${esc(c.artist)}</div>
    </div>

    <div class="toolbar">
      <div class="tool-group">
        <span class="tool-label">Tom</span>
        <button class="icon-btn" id="tDown" title="Meio tom abaixo">−</button>
        <select class="tool-select" id="tSelect" title="Selecionar tom">${keyOptions}</select>
        <button class="icon-btn" id="tUp" title="Meio tom acima">+</button>
      </div>

      <div class="tool-group">
        <span class="tool-label">Texto</span>
        <button class="icon-btn" id="fDown" title="Diminuir">A−</button>
        <button class="icon-btn" id="fUp" title="Aumentar">A＋</button>
      </div>

      <div class="tool-group">
        <span class="tool-label">Rolagem</span>
        <button class="icon-btn" id="scrollToggle" title="Iniciar/parar rolagem">▶</button>
        <input class="tool-range" id="scrollSpeed" type="range" min="1" max="10" value="${scrollSpeed}" style="width:90px" title="Velocidade">
      </div>

      <div class="tool-group" style="margin-left:auto">
        <button class="icon-btn ${isFav(id)?'active':''}" id="favBtn" title="Favoritar" style="${isFav(id)?'color:var(--gold)':''}">★</button>
        <button class="icon-btn" id="listBtn" title="Adicionar à lista">＋☰</button>
        ${c.custom ? `<button class="icon-btn" id="editBtn" title="Editar cifra">✎</button>
        <button class="icon-btn" id="delBtn" title="Excluir cifra">🗑</button>` : ""}
      </div>
    </div>

    <div class="cifra-content" id="cifraContent"></div>
  </div>

  <div class="float-controls">
    <button class="fab" id="fabScroll" title="Iniciar/parar rolagem">▶</button>
  </div>`;

  document.documentElement.style.setProperty("--cifra-size", store.fontSize + "px");
  renderContent(c, pref);

  // --- binds ---
  app.querySelector("[data-go]").onclick = () => go("");

  document.getElementById("tDown").onclick = () => { pref.transpose -= 1; saveStore(); refreshCifra(c, pref); };
  document.getElementById("tUp").onclick   = () => { pref.transpose += 1; saveStore(); refreshCifra(c, pref); };
  document.getElementById("tSelect").onchange = (e) => {
    const targetIdx = NOTE_INDEX[e.target.value];
    const baseIdx = NOTE_INDEX[c.key.match(/^[A-G][#b]?/)[0]];
    pref.transpose = ((targetIdx - baseIdx) % 12 + 12) % 12;
    if (pref.transpose > 6) pref.transpose -= 12; // mantém perto de zero
    saveStore(); refreshCifra(c, pref);
  };

  document.getElementById("fDown").onclick = () => setFont(-1, c, pref);
  document.getElementById("fUp").onclick   = () => setFont(1, c, pref);

  document.getElementById("favBtn").onclick = () => { toggleFav(id); renderCifra(id); };
  document.getElementById("listBtn").onclick = () => openListModal(id);

  if (c.custom) {
    document.getElementById("editBtn").onclick = () => openImportModal(id);
    document.getElementById("delBtn").onclick = () => {
      if (!confirm("Excluir esta cifra importada?")) return;
      store.userCifras = store.userCifras.filter(x => x.id !== id);
      delete store.favorites[id];
      Object.values(store.lists).forEach(l => l.cifras = l.cifras.filter(x => x !== id));
      saveStore();
      go("");
    };
  }

  document.getElementById("scrollSpeed").oninput = (e) => { scrollSpeed = +e.target.value; };
  document.getElementById("scrollToggle").onclick = toggleScroll;
  document.getElementById("fabScroll").onclick = toggleScroll;

  // Tocar no corpo da cifra pausa a rolagem (gesto rápido no celular)
  document.getElementById("cifraContent").addEventListener("click", () => {
    if (scrollTimer) stopScroll();
  });
}

function renderContent(c, pref) {
  const transposed = transposeCifra(c.content, pref.transpose, false);
  const html = transposed.split("\n").map(line => {
    if (isChordLine(line)) {
      // destaca marcadores [..] em dourado mesmo dentro da linha de acordes
      return `<span class="chord-line">${highlightMarkers(line)}</span>`;
    }
    if (line.trim().startsWith("[")) return `<span class="marker">${esc(line)}</span>`;
    return esc(line);
  }).join("\n");
  document.getElementById("cifraContent").innerHTML = html;
}

function highlightMarkers(line) {
  // escapa e depois reaplica destaque em [..]
  return esc(line).replace(/\[[^\]]*\]/g, m => `<span class="marker">${m}</span>`);
}

function refreshCifra(c, pref) {
  renderContent(c, pref);
  const sel = document.getElementById("tSelect");
  if (sel) sel.value = transposeKeyName(c.key, pref.transpose, false);
}

function setFont(dir, c, pref) {
  store.fontSize = Math.min(30, Math.max(11, store.fontSize + dir));
  saveStore();
  document.documentElement.style.setProperty("--cifra-size", store.fontSize + "px");
}

// ---------- Rolagem automática ----------
let wakeLock = null;
async function requestWake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
// Reativa o wake lock se o usuário voltar pro app (ex.: troca de aba)
document.addEventListener("visibilitychange", () => {
  if (scrollTimer && document.visibilityState === "visible") requestWake();
});

function toggleScroll() { scrollTimer ? stopScroll() : startScroll(); }
function startScroll() {
  stopScroll();
  setScrollIcons("⏸");
  requestWake();
  let acc = 0;
  scrollTimer = setInterval(() => {
    acc += scrollSpeed / 10;
    if (acc >= 1) {
      window.scrollBy(0, Math.floor(acc));
      acc -= Math.floor(acc);
    }
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 2) stopScroll();
  }, 30);
}
function stopScroll() {
  if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
  releaseWake();
  setScrollIcons("▶");
}
function setScrollIcons(sym) {
  const a = document.getElementById("scrollToggle");
  const b = document.getElementById("fabScroll");
  if (a) a.textContent = sym;
  if (b) b.textContent = sym;
}

// ============================================================
//  MODAIS
// ============================================================
function openModal(html, wide) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal${wide ? " wide" : ""}">${html}</div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  return overlay;
}

// ============================================================
//  IMPORTAR CIFRA (texto ou PDF)
// ============================================================
function openImportModal(editId) {
  const editing = editId ? getCifra(editId) : null;
  const overlay = openModal(`
    <h3>${editing ? "Editar cifra" : "Importar cifra"}</h3>
    <input id="impTitle" placeholder="Título da música" value="${editing ? esc(editing.title) : ""}">
    <div style="display:flex; gap:10px">
      <input id="impArtist" placeholder="Artista" value="${editing ? esc(editing.artist) : ""}" style="flex:2">
      <input id="impKey" placeholder="Tom" value="${editing ? esc(editing.key) : ""}" style="flex:1; min-width:0">
    </div>
    <div class="imp-pdf">
      <label class="btn ghost" for="impPdf">📄 Extrair de PDF</label>
      <input type="file" id="impPdf" accept="application/pdf" hidden>
      <span id="impPdfStatus" class="imp-status">ou cole o texto da cifra abaixo</span>
    </div>
    <textarea id="impContent" class="imp-content" placeholder="[Intro] G  D  Em  C&#10;&#10;G            D&#10;Cole aqui a cifra...">${editing ? esc(editing.content) : ""}</textarea>
    <div class="modal-actions">
      <button class="btn ghost" id="impCancel">Cancelar</button>
      <button class="btn" id="impSave">${editing ? "Salvar alterações" : "Salvar cifra"}</button>
    </div>`, true);

  const q = (s) => overlay.querySelector(s);

  q("#impPdf").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = q("#impPdfStatus");
    status.textContent = "Lendo PDF...";
    try {
      const text = await extractPdfText(file);
      q("#impContent").value = text;
      if (!q("#impTitle").value.trim()) q("#impTitle").value = file.name.replace(/\.pdf$/i, "");
      status.textContent = "✓ PDF importado — revise e ajuste o texto abaixo";
    } catch (err) {
      status.textContent = "Erro: " + err.message;
    }
  };

  q("#impCancel").onclick = () => overlay.remove();
  q("#impSave").onclick = () => {
    const title = q("#impTitle").value.trim();
    const content = q("#impContent").value;
    if (!title) { alert("Dê um título à cifra."); return; }
    if (!content.trim()) { alert("Cole ou importe o conteúdo da cifra."); return; }
    const key = q("#impKey").value.trim() || detectKey(content) || "?";
    const artist = q("#impArtist").value.trim() || "—";
    if (editing) {
      Object.assign(editing, { title, artist, key, content });
      saveStore(); overlay.remove(); renderCifra(editing.id);
    } else {
      const id = cifraId(title);
      store.userCifras.push({ id, title, artist, key, content, tags: ["Importada"], custom: true });
      saveStore(); overlay.remove(); go("cifra/" + id);
    }
  };
}

// Extrai texto de um PDF tentando preservar o alinhamento (acordes sobre a letra).
async function extractPdfText(file) {
  if (typeof pdfjsLib === "undefined")
    throw new Error("Biblioteca de PDF não carregou (precisa de internet).");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    pages.push(reconstructPdfPage(tc.items));
  }
  return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

// Reconstrói uma página em texto monoespaçado a partir das posições x/y.
function reconstructPdfPage(items) {
  const real = items.filter(i => i.str && i.str.trim() !== "");
  if (!real.length) return "";
  const widths = real.map(i => i.width / i.str.length).filter(w => w > 0).sort((a, b) => a - b);
  const charW = widths.length ? widths[Math.floor(widths.length / 2)] : 5;
  const minX = Math.min(...real.map(i => i.transform[4]));

  const rows = [];
  for (const it of real) {
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < charW * 0.6);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);

  // altura de linha típica para detectar parágrafos (linhas em branco)
  const gaps = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].y - rows[i].y);
  gaps.sort((a, b) => a - b);
  const lineH = gaps.length ? gaps[Math.floor(gaps.length / 2)] : charW * 2;

  const out = [];
  rows.forEach((r, i) => {
    if (i > 0 && (rows[i - 1].y - r.y) > lineH * 1.6) out.push("");
    r.items.sort((a, b) => a.x - b.x);
    let line = "";
    for (const it of r.items) {
      const col = Math.max(0, Math.round((it.x - minX) / charW));
      if (col > line.length) line += " ".repeat(col - line.length);
      line += it.str;
    }
    out.push(line.replace(/\s+$/, ""));
  });
  return out.join("\n");
}

function openListModal(cifraId) {
  const renderPicks = () => {
    const lists = Object.entries(store.lists);
    if (!lists.length)
      return `<p style="color:var(--text-dim);padding:6px 0">Você ainda não tem listas. Crie uma abaixo 👇</p>`;
    return lists.map(([id, l]) => {
      const inList = l.cifras.includes(cifraId);
      return `
        <div class="list-pick ${inList ? "picked" : ""}" data-pick="${id}">
          <span>${esc(l.name)}</span>
          <span class="check">${inList ? "✓ adicionada" : "+ adicionar"}</span>
        </div>`;
    }).join("");
  };

  const overlay = openModal(`
    <h3>Adicionar à lista</h3>
    <div id="listPickWrap">${renderPicks()}</div>
    <div style="margin-top:18px">
      <input id="newListName" placeholder="Nome da nova lista...">
      <div class="modal-actions">
        <button class="btn ghost" id="closeModal">Concluir</button>
        <button class="btn" id="createList">Criar e adicionar</button>
      </div>
    </div>`);

  const wrap = overlay.querySelector("#listPickWrap");
  const refresh = () => { wrap.innerHTML = renderPicks(); bindPicks(); };
  function bindPicks() {
    wrap.querySelectorAll("[data-pick]").forEach(el =>
      el.onclick = () => {
        const l = store.lists[el.dataset.pick];
        if (l.cifras.includes(cifraId)) l.cifras = l.cifras.filter(x => x !== cifraId);
        else l.cifras.push(cifraId);
        saveStore();
        refresh();
      });
  }
  bindPicks();

  overlay.querySelector("#closeModal").onclick = () => overlay.remove();
  overlay.querySelector("#createList").onclick = () => {
    const input = overlay.querySelector("#newListName");
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    store.lists[uid()] = { name, cifras: [cifraId] };
    saveStore();
    input.value = "";
    refresh();
  };
}

// Botão "Nova lista" da aba Listas (delegação global)
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "newListBtn") {
    const overlay = openModal(`
      <h3>Nova lista</h3>
      <input id="newListName2" placeholder="Ex.: Culto de Domingo">
      <div class="modal-actions">
        <button class="btn ghost" id="cancelList">Cancelar</button>
        <button class="btn" id="okList">Criar</button>
      </div>`);
    overlay.querySelector("#cancelList").onclick = () => overlay.remove();
    overlay.querySelector("#okList").onclick = () => {
      const name = overlay.querySelector("#newListName2").value.trim();
      if (!name) return;
      store.lists[uid()] = { name, cifras: [] };
      saveStore(); overlay.remove(); render();
    };
  }
});

// ---------- util ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m]));
}

// busca
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  if (!location.hash || location.hash === "#") render();
  else { currentTab = "todas"; go(""); }
});
document.getElementById("brand").onclick = () => { searchTerm = ""; document.getElementById("searchInput").value=""; currentTab="todas"; go(""); };

// start
render();
