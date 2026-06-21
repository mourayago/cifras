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
  prefs: {}           // { cifraId: { transpose: n } }
}, loadStore());

const app = document.getElementById("app");
let currentTab = "todas";
let searchTerm = "";

// ---------- Helpers ----------
function getCifra(id) { return CIFRAS.find(c => c.id === id); }
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
    let items = CIFRAS.slice();
    if (currentTab === "favoritas") items = items.filter(c => isFav(c.id));
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      items = items.filter(c =>
        c.title.toLowerCase().includes(t) || c.artist.toLowerCase().includes(t));
    }
    items.sort((a,b) => a.title.localeCompare(b.title));
    body = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">${currentTab==='favoritas' ? 'Nenhuma cifra favoritada ainda.' : 'Nenhuma cifra encontrada.'}</div>`;
  }

  app.innerHTML = `<div class="container">${tabs}${body}</div>`;

  app.querySelectorAll(".tab").forEach(b =>
    b.onclick = () => { currentTab = b.dataset.tab; render(); });
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
function openModal(html) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  return overlay;
}

function openListModal(cifraId) {
  const lists = Object.entries(store.lists);
  const listHTML = lists.length
    ? lists.map(([id, l]) => `
        <div class="list-pick" data-pick="${id}">
          <span>${esc(l.name)}</span>
          <span class="check">${l.cifras.includes(cifraId) ? "✓" : ""}</span>
        </div>`).join("")
    : `<p style="color:var(--text-dim);margin-bottom:14px">Nenhuma lista ainda.</p>`;

  const overlay = openModal(`
    <h3>Adicionar à lista</h3>
    ${listHTML}
    <div style="margin-top:16px">
      <input id="newListName" placeholder="Nome da nova lista...">
      <div class="modal-actions">
        <button class="btn ghost" id="closeModal">Fechar</button>
        <button class="btn" id="createList">Criar e adicionar</button>
      </div>
    </div>`);

  overlay.querySelectorAll("[data-pick]").forEach(el =>
    el.onclick = () => {
      const l = store.lists[el.dataset.pick];
      if (l.cifras.includes(cifraId)) l.cifras = l.cifras.filter(x => x !== cifraId);
      else l.cifras.push(cifraId);
      saveStore();
      overlay.remove();
      openListModal(cifraId);
    });

  overlay.querySelector("#closeModal").onclick = () => overlay.remove();
  overlay.querySelector("#createList").onclick = () => {
    const name = overlay.querySelector("#newListName").value.trim();
    if (!name) return;
    const id = uid();
    store.lists[id] = { name, cifras: [cifraId] };
    saveStore();
    overlay.remove();
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
