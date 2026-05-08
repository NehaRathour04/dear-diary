// ══════════════════════════════════════════════
// DEAR DIARY — Main App Logic
// ══════════════════════════════════════════════

let user          = null;
let rsaPublicKey  = null;
let rsaPrivateKey = null;
let filter        = "all";
let editMode      = false;
let editId        = null;
let allEntries    = [];
let searchQuery   = "";
let priv          = "private";
let toastTimer    = null;
let pendingDeleteId = null;
let activePage    = "diary";     // nav page: "diary" | "friends"
let activeDiaryTab = "write";    // diary sub-tab: "write" | "all" | "mine" | "friends"
let entryPage     = 1;           // current pagination page
let sortValue     = "date-desc";
const PER_PAGE    = 12;

const GREETINGS = [
  "how are you feeling today?",
  "what's on your mind, darling?",
  "tell me everything ♡",
  "a moment worth remembering?",
  "pour your heart out ✿",
  "write it all down, sweetie~",
  "what's on your mind today?",
  "write whatever you feel like…",
  "how was your day?",
  "anything you want to remember today?",
  "just start writing… ✿",
  "this space is yours ♡",
  "capture a moment, a thought, or a feeling",
  "write freely, no pressure",
  "your thoughts, your space ✨",
];

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════

(async function init() {
  spawnPetals();

  // Init theme
  const sel = document.getElementById("theme-select");
  const saved = localStorage.getItem("diary_theme") || "ocean";
  if ([...sel.options].some(o => o.value === saved)) sel.value = saved;
  document.documentElement.setAttribute("data-theme", sel.value);

  // Load keys
  const privKeyB64 = sessionStorage.getItem("diary_privkey");
  const pubKeyB64  = sessionStorage.getItem("diary_pubkey");
  const uid        = sessionStorage.getItem("diary_uid");

  if (!privKeyB64 || !pubKeyB64 || !uid) {
    window.location.href = "auth.html";
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    sessionStorage.clear();
    window.location.href = "auth.html";
    return;
  }

  try {
    rsaPrivateKey = await importPrivateKey(privKeyB64);
    rsaPublicKey  = await importPublicKey(pubKeyB64);
  } catch {
    sessionStorage.clear();
    window.location.href = "auth.html";
    return;
  }

  user = {
    id:    uid,
    email: sessionStorage.getItem("diary_email") || session.user.email,
  };

  const displayName = sessionStorage.getItem("diary_name") || user.email.split("@")[0];
  document.getElementById("user-pill").textContent = "🌸 " + displayName;
  document.getElementById("greeting").textContent  = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  document.getElementById("date-chip").textContent = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });

  await loadRequests();
  await loadSentRequests();
  await loadFriends();
})();

// ── Petals ──────────────────────────────────
function spawnPetals() {
  const symbols = ["✿","❀","✾","♡","·","˖","°","✦","❋","✼"];
  const frag = document.createDocumentFragment();
  symbols.forEach(s => {
    for (let j = 0; j < 4; j++) {
      const d = document.createElement("div");
      d.className = "petal";
      d.textContent = s;
      const dur = 14 + Math.random() * 16;
      const op  = (0.2 + Math.random() * 0.35).toFixed(2);
      // Negative delay = petal is already mid-flight when page loads
      d.style.cssText = `left:${Math.random()*100}vw;bottom:-10px;font-size:${0.5+Math.random()*1.1}rem;animation-duration:${dur}s;animation-delay:${-(Math.random()*dur)}s;--petal-op:${op}`;
      frag.appendChild(d);
    }
  });
  document.getElementById("petals").appendChild(frag);
}

// ══════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════

function navTo(page) {
  activePage = page;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  document.querySelectorAll(".app-nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  if (page === "friends") {
    loadRequests();
    loadSentRequests();
    loadFriends();
  }
}

// ══════════════════════════════════════════════
// DIARY SUB-TABS
// ══════════════════════════════════════════════

function switchDiaryTab(tab) {
  activeDiaryTab = tab;
  document.querySelectorAll(".inner-tab[data-dtab]").forEach(b => {
    b.classList.toggle("active", b.dataset.dtab === tab);
  });
  document.querySelectorAll(".diary-section").forEach(s => s.classList.remove("active"));
  document.getElementById(tab === "write" ? "diary-compose" : "diary-entries").classList.add("active");
  // write-mode removes the large bottom padding so compose fills the viewport cleanly
  document.getElementById("app-wrap").classList.toggle("write-mode", tab === "write");
  if (tab !== "write") {
    filter = tab;
    searchQuery = "";
    entryPage = 1;
    const si = document.getElementById("search-input");
    if (si) si.value = "";
    loadEntries();
  }
}

// ══════════════════════════════════════════════
// FRIENDS PAGE TABS
// ══════════════════════════════════════════════

function switchFriendsTab(tab) {
  document.querySelectorAll(".friends-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".inner-tab[data-ftab]").forEach(b => b.classList.remove("active"));
  document.getElementById("ftab-" + tab).classList.add("active");
  document.querySelector(`.inner-tab[data-ftab="${tab}"]`).classList.add("active");
  if (tab === "requests")   { loadRequests(); loadSentRequests(); }
  if (tab === "my-friends") loadFriends();
}

// ══════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("diary_theme", theme);
}

// ══════════════════════════════════════════════
// PRIVACY / FILTER / SEARCH / SORT
// ══════════════════════════════════════════════

function setPriv(btn) {
  document.querySelectorAll(".priv-pill").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  priv = btn.dataset.v;
}

function setFilter(f) {
  filter = f;
  searchQuery = "";
  entryPage = 1;
  const si = document.getElementById("search-input");
  if (si) si.value = "";
  loadEntries();
}

function onSearch(val) {
  searchQuery = val.toLowerCase().trim();
  entryPage = 1;
  renderEntries(allEntries);
}

function setSort(val) {
  sortValue = val;
  entryPage = 1;
  renderEntries(allEntries);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (sortValue === "date-desc") return new Date(b.created_at) - new Date(a.created_at);
    if (sortValue === "date-asc")  return new Date(a.created_at) - new Date(b.created_at);
    const ta = (a.content || "").toLowerCase();
    const tb = (b.content || "").toLowerCase();
    if (sortValue === "alpha-asc")  return ta < tb ? -1 : ta > tb ? 1 : 0;
    if (sortValue === "alpha-desc") return ta > tb ? -1 : ta < tb ? 1 : 0;
    return 0;
  });
}

// ══════════════════════════════════════════════
// ENCRYPTION HELPERS
// ══════════════════════════════════════════════

async function encryptForFriends(plaintext) {
  const { data: requests } = await sb
    .from("friend_requests").select("sender_id, receiver_id").eq("status", "accepted");
  const friendIds = (requests || [])
    .map(r => (r.sender_id === user.id ? r.receiver_id : r.sender_id))
    .filter(id => id !== user.id);
  const recipients = [user.id, ...friendIds];
  const { data: profiles } = await sb
    .from("profiles").select("id, public_key").in("id", recipients);
  if (!profiles || !profiles.length) return rsaEncrypt(rsaPublicKey, plaintext);
  const map = {};
  for (const p of profiles) {
    if (!p.public_key) continue;
    const pk = await importPublicKey(p.public_key);
    map[p.id] = await rsaEncrypt(pk, plaintext);
  }
  return "multi:" + btoa(JSON.stringify(map));
}

async function decryptEntry(content) {
  if (!content) return "";
  if (content.startsWith("rsa:"))   return rsaDecrypt(rsaPrivateKey, content);
  if (content.startsWith("multi:")) {
    try {
      const map = JSON.parse(atob(content.slice(6)));
      const mySlice = map[user.id];
      if (!mySlice) return "🔒 (not encrypted for you)";
      return rsaDecrypt(rsaPrivateKey, mySlice);
    } catch { return "🔒 (corrupted entry)"; }
  }
  if (content.startsWith("enc:") || content.startsWith("aes:")) return "🔒 (old format)";
  return content;
}

// ══════════════════════════════════════════════
// SAVE / UPDATE ENTRIES
// ══════════════════════════════════════════════

async function saveEntry() {
  const text = document.getElementById("entry-text").value.trim();
  if (!text) return;
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 1000) return toast("Entry exceeds 1000 words 🌸");
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.innerHTML = "<span>✿</span> Saving…";
  try {
    const savedPrivacy = priv;
    const content = savedPrivacy === "private"
      ? await rsaEncrypt(rsaPublicKey, text)
      : await encryptForFriends(text);
    if (editMode) {
      const { error } = await sb.from("entries")
        .update({ content, privacy: savedPrivacy }).eq("id", editId).eq("user_id", user.id);
      resetEditor();
      btn.disabled = false;
      if (error) return toast("Could not update 🌸");
      toast("Updated ♡");
    } else {
      const { error } = await sb.from("entries").insert({
        user_id: user.id, user_email: user.email, content, privacy: savedPrivacy
      });
      resetEditor();
      btn.disabled = false;
      if (error) return toast("Something went wrong 🌸");
      toast("Entry saved! ♡");
    }
    switchDiaryTab(savedPrivacy === "friends" ? "friends" : "mine");
  } catch (e) {
    btn.disabled = false;
    resetEditor();
    toast("Encryption failed 🌸");
    console.error(e);
  }
}

// ══════════════════════════════════════════════
// EDITOR HELPERS
// ══════════════════════════════════════════════

function resetEditor() {
  editMode = false;
  editId   = null;
  document.getElementById("entry-text").value = "";
  const wc = document.getElementById("word-count");
  wc.textContent = "0 / 1000";
  wc.classList.remove("over-limit");
  document.getElementById("save-btn").innerHTML = "<span>✦</span> Save";
  document.getElementById("cancel-btn").classList.add("hidden");
  priv = "private";
  document.querySelectorAll(".priv-pill").forEach(b => b.classList.remove("on"));
  document.querySelector('.priv-pill[data-v="private"]').classList.add("on");
}

function startEdit(id, content, privacy) {
  navTo("diary");
  switchDiaryTab("write");
  const ta = document.getElementById("entry-text");
  ta.value = content;
  ta.focus();
  ta.scrollIntoView({ behavior: "smooth", block: "center" });
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const wc = document.getElementById("word-count");
  wc.textContent = `${words} / 1000`;
  wc.classList.toggle("over-limit", words > 1000);
  editMode = true;
  editId   = id;
  priv     = privacy || "private";
  document.querySelectorAll(".priv-pill").forEach(b => b.classList.remove("on"));
  document.querySelector(`.priv-pill[data-v="${priv}"]`)?.classList.add("on");
  document.getElementById("save-btn").innerHTML = "<span>✦</span> Update";
  document.getElementById("cancel-btn").classList.remove("hidden");
}

function cancelEdit() {
  const prevTab = filter && filter !== "all" ? filter : "mine";
  resetEditor();
  toast("Edit cancelled");
  switchDiaryTab(prevTab);
}

document.getElementById("entry-text").addEventListener("input", () => {
  const text = document.getElementById("entry-text").value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const wc = document.getElementById("word-count");
  wc.textContent = `${words} / 1000`;
  wc.classList.toggle("over-limit", words > 1000);
  if (!text && editMode) cancelEdit();
});

// ══════════════════════════════════════════════
// LOAD & RENDER ENTRIES
// ══════════════════════════════════════════════

async function loadEntries() {
  const list = document.getElementById("list");
  list.innerHTML = '<div class="loading-wrap">Loading… ✿</div>';
  document.getElementById("pagination").innerHTML = "";

  let q = sb.from("entries").select("*").order("created_at", { ascending: false });
  if (filter === "mine")    q = q.eq("user_id", user.id).eq("privacy", "private");
  else if (filter === "friends") q = q.eq("privacy", "friends");

  const { data, error } = await q;
  if (error) {
    list.innerHTML = '<div class="empty"><div class="ico">🌸</div><p>Couldn\'t load entries…</p></div>';
    return;
  }

  const decryptedRaw = await Promise.all(
    data.map(async e => ({ ...e, content: await decryptEntry(e.content) }))
  );
  const decrypted = decryptedRaw.filter(e =>
    e.content && !e.content.includes("not encrypted for you") && !e.content.includes("cannot decrypt")
  );

  const userIds = [...new Set(decrypted.map(e => e.user_id))];
  const { data: profiles } = await sb
    .from("profiles").select("id, display_name, email").in("id", userIds.length ? userIds : ["none"]);
  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  allEntries = decrypted.map(e => ({
    ...e,
    display_name: profileMap[e.user_id]?.display_name,
    profile_email: profileMap[e.user_id]?.email || e.user_email,
  }));

  entryPage = 1;
  renderEntries(allEntries);
}

function renderEntries(entries) {
  const list = document.getElementById("list");

  // Apply search filter
  const filtered = searchQuery
    ? entries.filter(e => (e.content || "").toLowerCase().includes(searchQuery))
    : entries;

  if (!filtered.length) {
    const msgs = {
      mine:    "Nothing yet — write your first entry! ✿",
      friends: "Your friends haven't shared anything yet 💌",
      all:     "No entries to show yet ♡",
    };
    const msg = searchQuery ? `No results for "${searchQuery}" ✿` : msgs[filter];
    list.innerHTML = `<div class="empty"><div class="ico">📓</div><p>${msg}</p></div>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  // Apply sort
  const sorted = sortEntries(filtered);

  // Paginate
  const total = sorted.length;
  const totalPages = Math.ceil(total / PER_PAGE) || 1;
  entryPage = Math.max(1, Math.min(entryPage, totalPages));
  const start = (entryPage - 1) * PER_PAGE;
  const paged = sorted.slice(start, start + PER_PAGE);

  list.innerHTML = paged.map(e => renderCard(e)).join("");
  requestAnimationFrame(updateExpandBtns);
  renderPagination(totalPages, total);
}

function renderPagination(totalPages, total) {
  const pg = document.getElementById("pagination");
  if (!pg) return;
  if (totalPages <= 1) {
    pg.innerHTML = total > 0
      ? `<p class="pg-count">${total} entr${total === 1 ? "y" : "ies"}</p>`
      : "";
    return;
  }

  const show = new Set(
    [1, totalPages, entryPage, entryPage - 1, entryPage + 1]
      .filter(p => p >= 1 && p <= totalPages)
  );
  const pageNums = [...show].sort((a, b) => a - b);

  let btns = "";
  let prev = 0;
  pageNums.forEach(p => {
    if (p - prev > 1) btns += `<span class="pg-ellipsis">…</span>`;
    btns += `<button class="pg-btn${p === entryPage ? " active" : ""}" onclick="goToPage(${p})">${p}</button>`;
    prev = p;
  });

  pg.innerHTML = `
    <div class="pg-row">
      <span class="pg-count">${total} entr${total === 1 ? "y" : "ies"} · Page ${entryPage} of ${totalPages}</span>
      <div class="pg-btns">
        <button class="pg-btn pg-arrow" onclick="goToPage(${entryPage - 1})" ${entryPage === 1 ? "disabled" : ""}>←</button>
        ${btns}
        <button class="pg-btn pg-arrow" onclick="goToPage(${entryPage + 1})" ${entryPage === totalPages ? "disabled" : ""}>→</button>
      </div>
    </div>`;
}

function goToPage(n) {
  entryPage = n;
  renderEntries(allEntries);
  document.getElementById("list").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCard(e) {
  const own  = e.user_id === user.id;
  const date = new Date(e.created_at).toLocaleDateString("en-US", {
    weekday: "short", month: "long", day: "numeric", year: "numeric"
  });
  const lbl    = e.privacy === "private" ? "🔒 Private" : "💌 Friends";
  const bdgCls = e.privacy === "private" ? "bdg private" : "bdg friends";
  const author = e.display_name || e.profile_email || "unknown";
  const acts = own ? `
    <div class="card-acts">
      <button class="btn-act btn-edit"
        data-id="${e.id}"
        data-content="${encodeURIComponent(e.content)}"
        data-privacy="${e.privacy}"
        onclick="handleEdit(this)">Edit</button>
      <button class="btn-act btn-del" onclick="confirmDeleteEntry('${e.id}')">✕ Delete</button>
    </div>` : "";
  return `<div class="card">
    <div class="card-meta">
      <span class="card-date">${date}</span>
      <div class="card-meta-right">
        <span class="${bdgCls}">${lbl}</span>
        <span class="card-author">${own ? "🌸 You" : "💌 " + esc(author)}</span>
      </div>
    </div>
    <div class="card-body col" id="b${e.id}">${esc(e.content)}</div>
    <button class="btn-exp" id="x${e.id}" onclick="expandCard('${e.id}')">read more ♡</button>
    ${acts}
  </div>`;
}

function updateExpandBtns() {
  document.querySelectorAll(".card-body.col").forEach(el => {
    const btn = document.getElementById("x" + el.id.slice(1));
    if (btn) btn.style.display = el.scrollHeight <= el.clientHeight + 2 ? "none" : "";
  });
}

function handleEdit(btn) {
  startEdit(btn.dataset.id, decodeURIComponent(btn.dataset.content), btn.dataset.privacy);
}

function expandCard(id) {
  const b = document.getElementById("b" + id);
  const x = document.getElementById("x" + id);
  const collapsed = b.classList.toggle("col");
  x.textContent = collapsed ? "read more ♡" : "collapse ↑";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ══════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════

function confirmDeleteEntry(id) {
  pendingDeleteId = id;
  document.getElementById("modal-msg").textContent = "Delete this entry forever?";
  document.getElementById("modal-ok").onclick = doDelete;
  document.getElementById("delete-backdrop").classList.remove("hidden");
}

async function doDelete() {
  closeDeleteModal();
  const { error } = await sb.from("entries")
    .delete().eq("id", pendingDeleteId).eq("user_id", user.id);
  pendingDeleteId = null;
  if (error) return toast("Couldn't delete 🌸");
  toast("Deleted ♡");
  loadEntries();
}

function closeDeleteModal() {
  document.getElementById("delete-backdrop").classList.add("hidden");
}

function handleBackdropClick(e, backdropId) {
  if (e.target.id === backdropId) document.getElementById(backdropId).classList.add("hidden");
}

// ══════════════════════════════════════════════
// FRIENDS — SEND REQUEST
// ══════════════════════════════════════════════

async function sendFriendRequest() {
  const input = document.getElementById("friend-email");
  const email = input.value.trim();
  if (!email) return toast("Enter an email address ✿");
  const { data, error } = await sb.from("profiles").select("id").eq("email", email).single();
  if (error || !data) return toast("User not found 🌸");
  if (data.id === user.id) return toast("That's you 😄");
  const { error: err2 } = await sb.from("friend_requests").insert({
    sender_id: user.id, receiver_id: data.id
  });
  if (err2) return toast("Already sent or error 🌸");
  toast("Request sent 💌");
  input.value = "";
  switchFriendsTab("requests");
  await loadSentRequests();
}

// ══════════════════════════════════════════════
// FRIENDS — REQUESTS
// ══════════════════════════════════════════════

async function loadRequests() {
  const { data, error } = await sb.from("friend_requests")
    .select("*").eq("receiver_id", user.id).eq("status", "pending");
  if (error) return;
  const enriched = await Promise.all(data.map(async r => {
    const { data: u } = await sb.from("profiles").select("email, display_name").eq("id", r.sender_id).single();
    return { ...r, senderName: u?.display_name || u?.email || r.sender_id };
  }));
  const count = enriched.length;
  const b1 = document.getElementById("req-count");
  const b2 = document.getElementById("req-tab-badge");
  if (b1) { b1.textContent = count; b1.classList.toggle("hidden", count === 0); }
  if (b2) { b2.textContent = count; b2.classList.toggle("hidden", count === 0); }
  const list = document.getElementById("requests-list");
  if (!list) return;
  list.innerHTML = enriched.length
    ? enriched.map(r => `
      <div class="req-item">
        <div class="req-info">
          <span class="req-avatar">🌸</span>
          <span class="req-name">${esc(r.senderName)}</span>
        </div>
        <div class="req-btns">
          <button class="req-btn accept" onclick="acceptRequest('${r.id}')">Accept ♡</button>
          <button class="req-btn reject" onclick="rejectRequest('${r.id}')">Decline</button>
        </div>
      </div>`).join("")
    : "<p class='empty-note'>No incoming requests ✿</p>";
}

async function acceptRequest(id) {
  await sb.from("friend_requests").update({ status: "accepted" }).eq("id", id);
  toast("Friend added ♡");
  loadRequests(); loadFriends(); loadEntries();
}

async function rejectRequest(id) {
  await sb.from("friend_requests").update({ status: "rejected" }).eq("id", id);
  toast("Request declined");
  loadRequests();
}

async function loadSentRequests() {
  const { data, error } = await sb.from("friend_requests")
    .select("*").eq("sender_id", user.id).eq("status", "pending");
  if (error) return;
  const enriched = await Promise.all(data.map(async r => {
    const { data: u } = await sb.from("profiles").select("email, display_name").eq("id", r.receiver_id).single();
    return { ...r, name: u?.display_name || u?.email };
  }));
  const list = document.getElementById("sent-requests-list");
  if (!list) return;
  list.innerHTML = enriched.length
    ? enriched.map(r => `
      <div class="req-item">
        <div class="req-info">
          <span class="req-avatar">💌</span>
          <span class="req-name">${esc(r.name || r.receiver_id)}</span>
        </div>
        <span class="req-status">Pending…</span>
      </div>`).join("")
    : "<p class='empty-note'>No sent requests ✿</p>";
}

// ══════════════════════════════════════════════
// FRIENDS — FRIENDS LIST
// ══════════════════════════════════════════════

async function loadFriends() {
  const { data, error } = await sb.from("friend_requests")
    .select("sender_id, receiver_id").eq("status", "accepted");
  if (error) return;
  const friendIds = (data || [])
    .map(r => r.sender_id === user.id ? r.receiver_id : r.sender_id)
    .filter(id => id !== user.id);
  const list = document.getElementById("friends-list");
  if (!list) return;
  if (!friendIds.length) {
    list.innerHTML = "<p class='empty-note'>No friends yet — send a request! ✿</p>";
    return;
  }
  const { data: profiles } = await sb.from("profiles")
    .select("id, display_name, email").in("id", friendIds);
  list.innerHTML = (profiles || []).map(f => `
    <div class="friend-item" id="fi${f.id}">
      <div class="req-info">
        <span class="req-avatar">🌸</span>
        <span class="req-name">${esc(f.display_name || f.email)}</span>
      </div>
      <button class="req-btn reject" onclick="removeFriend('${f.id}', '${esc(f.display_name || f.email)}')">Remove</button>
    </div>`).join("");
}

function removeFriend(friendId, name) {
  const item = document.getElementById("fi" + friendId);
  if (!item) return;
  item.innerHTML = `
    <div class="req-info">
      <span class="req-avatar">🌸</span>
      <span class="req-name">Remove <strong>${esc(name)}</strong>?</span>
    </div>
    <div class="req-btns">
      <button class="req-btn accept" onclick="confirmRemoveFriend('${friendId}')">Yes, Remove</button>
      <button class="req-btn reject" onclick="loadFriends()">Cancel</button>
    </div>`;
}

async function confirmRemoveFriend(friendId) {
  await sb.from("friend_requests").delete().eq("status","accepted").eq("sender_id",user.id).eq("receiver_id",friendId);
  await sb.from("friend_requests").delete().eq("status","accepted").eq("sender_id",friendId).eq("receiver_id",user.id);
  toast("Friend removed ✿");
  loadFriends(); loadEntries();
}

// ══════════════════════════════════════════════
// SIGN OUT
// ══════════════════════════════════════════════

async function doSignOut() {
  await sb.auth.signOut();
  sessionStorage.clear();
  window.location.href = "auth.html";
}

// ══════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ══════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeDeleteModal();
    if (editMode) cancelEdit();
  }
  if (e.target.id === "entry-text" && (e.ctrlKey || e.metaKey) && e.key === "Enter") saveEntry();
  if (e.target.id === "friend-email" && e.key === "Enter") sendFriendRequest();
});
