
(function initPromoPopup() {
  const popup = document.getElementById("promoPopup");
  const close = document.getElementById("closePromo");
  if (!popup || !close) return;
  popup.showModal();
  close.addEventListener("click", () => popup.close());
  popup.addEventListener("click", event => {
    if (event.target === popup) popup.close();
  });
})();

;

/* ==========================================
   BOLAUTAMA — AUTO FIXTURE, LIVE SCORE,
   PREDIKSI SKOR & ODDS ESTIMASI
   Sumber jadwal: ESPN public scoreboard
   Zona waktu: WIB
   Update: setiap 60 detik
========================================== */

const ESPN_API =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const UPDATE_INTERVAL = 20 * 60 * 1000;

const leagues = [
  // INGGRIS
  { id: "eng.1", name: "Premier League" },
  { id: "eng.fa", name: "FA Cup" },
  { id: "eng.league_cup", name: "EFL Cup" },

  // SPANYOL
  { id: "esp.1", name: "La Liga" },
  { id: "esp.copa_del_rey", name: "Copa del Rey" },

  // ITALIA
  { id: "ita.1", name: "Serie A" },

  // JERMAN
  { id: "ger.1", name: "Bundesliga" },

  // PRANCIS
  { id: "fra.1", name: "Ligue 1" },

  // EROPA
  { id: "uefa.champions", name: "Champions League" },
  { id: "uefa.europa", name: "Europa League" },
  { id: "uefa.europa.conf", name: "Conference League" },
  { id: "uefa.nations", name: "Nations League" },

  // BELANDA
  { id: "ned.1", name: "Eredivisie" },

  // AMERIKA
  { id: "usa.1", name: "MLS" },

  // ASIA
  { id: "afc.champions", name: "AFC Champions League Elite" },
  { id: "afc.cup", name: "AFC Champions League Two" },
  { id: "afc.asian.cup", name: "AFC Asian Cup" },
  { id: "ksa.1", name: "Saudi Pro League" },
  { id: "idn.1", name: "Indonesia Super League" },

  // FIFA & INTERNASIONAL
  { id: "fifa.world", name: "FIFA World Cup" },
  { id: "fifa.wwc", name: "FIFA Women's World Cup" },
  { id: "fifa.cwc", name: "FIFA Club World Cup" },
  { id: "fifa.world.u20", name: "FIFA U-20 World Cup" },
  { id: "fifa.world.u17", name: "FIFA U-17 World Cup" },
  { id: "fifa.worldq", name: "World Cup Qualifiers" },
  { id: "fifa.worldq.afc", name: "FIFA Asian Qualifiers" },
  { id: "fifa.worldq.uefa", name: "FIFA European Qualifiers" },
  { id: "fifa.worldq.concacaf", name: "FIFA CONCACAF Qualifiers" },
  { id: "fifa.worldq.conmebol", name: "FIFA South American Qualifiers" },
  { id: "fifa.worldq.caf", name: "FIFA African Qualifiers" },
  { id: "fifa.friendly", name: "International Friendlies" },
  { id: "fifa.olympics", name: "Olympic Football" }
];

let games = [];
let slideIndex = 0;
let leagueFilter = "all";
let refreshTimer = null;
let loading = false;

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

/* ==========================================
   TANGGAL & WAKTU WIB
========================================== */

function getJakartaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const part = type =>
    parts.find(x => x.type === type).value;

  return `${part("year")}${part("month")}${part("day")}`;
}

function getDateOffset(offset) {
  const now = new Date();

  const jakartaDate = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now)
  );

  jakartaDate.setDate(jakartaDate.getDate() + offset);

  return getJakartaDate(jakartaDate);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)} WIB`;
}

/* ==========================================
   PARSE DATA PERTANDINGAN ESPN
========================================== */

function parseEvent(event, league) {
  const competition = event.competitions?.[0];
  const teams = competition?.competitors || [];

  const home = teams.find(t => t.homeAway === "home");
  const away = teams.find(t => t.homeAway === "away");

  if (!home || !away || !event.date) return null;

  const status = event.status?.type || {};

  let state = "MENDATANG";

  if (status.state === "in") {
    state = "LIVE";
  } else if (status.completed) {
    state = "SELESAI";
  }

  return {
    id: String(event.id),
    lid: league.id,
    league: league.name,
    date: event.date,
    state,
    status: status.detail || status.description || "",

    home: {
      name: home.team?.displayName ||
        home.team?.name || "Home",
      logo: home.team?.logo ||
        home.team?.logos?.[0]?.href || "",
      score: home.score ?? null
    },

    away: {
      name: away.team?.displayName ||
        away.team?.name || "Away",
      logo: away.team?.logo ||
        away.team?.logos?.[0]?.href || "",
      score: away.score ?? null
    }
  };
}

async function fetchLeagueDate(league, date) {
  const url =
    `${ESPN_API}/${encodeURIComponent(league.id)}/scoreboard` +
    `?dates=${date}`;

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${league.name}: HTTP ${response.status}`);
  }

  const data = await response.json();

  return (data.events || [])
    .map(event => parseEvent(event, league))
    .filter(Boolean);
}

async function fetchAllMatches() {
  const dates = [
    getDateOffset(0),
    getDateOffset(1)
  ];

  const requests = leagues.flatMap(league =>
    dates.map(date =>
      fetchLeagueDate(league, date).catch(error => {
        console.warn(
          "Gagal mengambil liga:",
          error.message
        );
        return [];
      })
    )
  );

  const results = await Promise.all(requests);
  const unique = new Map();

  results.flat().forEach(match => {
    unique.set(match.id, match);
  });

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return [...unique.values()]
    .filter(match => {
      const kickoff = new Date(match.date).getTime();
      return now < kickoff + ONE_DAY;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ==========================================
   LOGO TIM
========================================== */

function teamLogo(team) {
  if (team.logo) {
    return `<img src="${esc(team.logo)}"
      alt="${esc(team.name)}"
      loading="lazy"
      onerror="this.outerHTML='<span class=&quot;team-fallback&quot; aria-label=&quot;Logo tidak tersedia&quot;>⚽</span>'">`;
  }

  return `<span class="team-fallback" aria-label="Logo tim">⚽</span>`;
}

/* ==========================================
   SKOR AKTUAL
========================================== */

function actualScore(match) {
  if (
    match.home.score == null ||
    match.away.score == null
  ) {
    return "–";
  }

  return `${esc(match.home.score)} - ${esc(match.away.score)}`;
}

/* ==========================================
   TAMBAHAN: PREDIKSI SKOR & ODDS ESTIMASI

   Catatan:
   - Bukan odds resmi bookmaker.
   - Bukan hasil API statistik.
   - Menggunakan model heuristik sederhana.
========================================== */

function stableTeamValue(name) {
  let hash = 0;

  for (const char of String(name || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return (hash % 1000) / 1000;
}

/* ==========================================
   BOLAUTAMA — PREDIKSI SKOR & ODDS MODERN
========================================== */


function getPrediction(match) {
  if (match.state !== "MENDATANG") {
    return null;
  }

  const homeValue = stableTeamValue(match.home.name);
  const awayValue = stableTeamValue(match.away.name);

  // Perkiraan gol dengan variasi yang lebih luas.
  const homeExpected = Math.max(
    0.25,
    Math.min(3.5, 1.35 + (homeValue - 0.5) * 2.0 + 0.20)
  );

  const awayExpected = Math.max(
    0.20,
    Math.min(3.2, 1.15 + (awayValue - 0.5) * 1.9)
  );

  // Variasi deterministik berdasarkan kedua nama tim.
  // Skor pertandingan yang sama tidak berubah setiap refresh.
  const variation = stableTeamValue(
    match.home.name + "|" + match.away.name
  );

  const homeAdjustment = (variation - 0.5) * 0.9;
  const awayAdjustment = (0.5 - variation) * 0.7;

  const homeGoals = Math.max(
    0,
    Math.min(
      5,
      Math.floor(homeExpected + homeAdjustment + 0.5)
    )
  );

  const awayGoals = Math.max(
    0,
    Math.min(
      5,
      Math.floor(awayExpected + awayAdjustment + 0.5)
    )
  );

  // Estimasi peluang hasil pertandingan.
  const diff = homeExpected - awayExpected;

  let homeProb = Math.max(0.12, 0.38 + diff * 0.16);
  let drawProb = Math.max(0.16, 0.28 - Math.abs(diff) * 0.04);
  let awayProb = Math.max(0.12, 1 - homeProb - drawProb);

  const total = homeProb + drawProb + awayProb;

  homeProb /= total;
  drawProb /= total;
  awayProb /= total;

  const home = Math.round(homeProb * 100);
  const draw = Math.round(drawProb * 100);
  const away = 100 - home - draw;

  const decimalOdds = probability =>
    (1 / probability).toFixed(2);

  return {
    score: `${homeGoals} - ${awayGoals}`,
    home,
    draw,
    away,
    homeOdds: decimalOdds(homeProb),
    drawOdds: decimalOdds(drawProb),
    awayOdds: decimalOdds(awayProb)
  };
}

function predictionMarkup(match) {
  const prediction = getPrediction(match);
  if (!prediction) return "";
  return `<div class="prediction">
    <div class="prediction-heading"><span>Estimasi skor</span><strong>${prediction.score}</strong></div>
    <div class="prediction-grid">
      ${[["1 · HOME", prediction.home, prediction.homeOdds], ["X · DRAW", prediction.draw, prediction.drawOdds], ["2 · AWAY", prediction.away, prediction.awayOdds]].map(([label, probability, odds]) => `<div class="prediction-cell"><small>${label}</small><strong>${probability}%</strong><small>Odds ${odds}</small></div>`).join("")}
    </div>
    <p class="prediction-note">Estimasi model sederhana, bukan odds resmi atau jaminan hasil.</p>
  </div>`;
}

/* ==========================================
   STATUS PERTANDINGAN
========================================== */

function statusLabel(match) {
  if (match.state === "LIVE") {
    return `LIVE${
      match.status ? " · " + esc(match.status) : ""
    }`;
  }

  if (match.state === "SELESAI") {
    return "SELESAI";
  }

  return "JADWAL";
}

/* ==========================================
   BANNER HERO
========================================== */

function heroMarkup(match) {
  const score = match.state === "MENDATANG"
    ? "0 - 0"
    : actualScore(match);

  return `
    <div class="league-label">
      ${esc(match.league.toUpperCase())}
    </div>

    <div class="teams">
      <div class="team">
        ${teamLogo(match.home)}
        <b>${esc(match.home.name)}</b>
        <small>HOME</small>
      </div>

      <div>
        <div class="score">
          ${score}
          <small>${statusLabel(match)}</small>
        </div>

        <div class="kickoff">
          ${formatDateTime(match.date)}
        </div>
      </div>

      <div class="team">
        ${teamLogo(match.away)}
        <b>${esc(match.away.name)}</b>
        <small>AWAY</small>
      </div>
    </div>
  `;
}

function renderHero() {
  if (!games.length) return;
  slideIndex = (slideIndex + games.length) % games.length;
  const indices = [(slideIndex - 1 + games.length) % games.length, slideIndex, (slideIndex + 1) % games.length];
  $("heroContent").innerHTML = `<div class="hero-track">${indices.map((index, position) => `<div class="hero-panel" aria-hidden="${position !== 1}">${heroMarkup(games[index])}</div>`).join("")}</div>`;
  $("counter").textContent = `MATCH ${String(slideIndex + 1).padStart(2, "0")} / ${String(games.length).padStart(2, "0")}`;
  $("heroDate").textContent = `${formatDateTime(games[slideIndex].date)} · ${games[slideIndex].state}${games[slideIndex].state === "LIVE" ? " · " + games[slideIndex].status : ""}`;
  const start = Math.floor(slideIndex / 5) * 5;
  $("dots").innerHTML = games.slice(start, start + 5).map((_, offset) => {
    const index = start + offset;
    return `<button class="${index === slideIndex ? "active" : ""}" data-dot="${index}" aria-label="Pertandingan ${index + 1}" aria-current="${index === slideIndex}"></button>`;
  }).join("");
  $("dots").querySelectorAll("[data-dot]").forEach(button => {
    button.onclick = () => { if (sliding) return; slideIndex = Number(button.dataset.dot); renderHero(); restartSlider(); };
  });
}

const SLIDER_INTERVAL = 5000;
let sliderTimer = null;
let sliding = false;
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let touchStart = null;
function moveSlide(direction) {
  if (games.length < 2 || sliding) return;
  const track = document.querySelector(".hero-track");
  if (!track) return;
  sliding = true;
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380;
  track.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1)`;
  track.style.transform = `translateX(${direction > 0 ? -200 : 0}%)`;
  setTimeout(() => {
    slideIndex = (slideIndex + direction + games.length) % games.length;
    sliding = false;
    renderHero();
  }, duration);
}
function restartSlider() {
  clearInterval(sliderTimer);
  sliderTimer = setInterval(() => {
    if (!paused && !document.hidden && touchStart === null) moveSlide(1);
  }, SLIDER_INTERVAL);
}
function updatePauseButton() {
  $("pauseSlider").textContent = paused ? "▷" : "Ⅱ";
  $("pauseSlider").setAttribute("aria-pressed", String(paused));
  $("pauseSlider").setAttribute("aria-label", paused ? "Putar slider" : "Jeda slider");
  $("pauseSlider").title = paused ? "Putar slider" : "Jeda slider";
}
$("pauseSlider").onclick = () => { paused = !paused; updatePauseButton(); restartSlider(); };
$("heroContent").addEventListener("touchstart", event => {
  const touch = event.touches[0];
  if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
$("heroContent").addEventListener("touchend", event => {
  const touch = event.changedTouches[0];
  if (touch && touchStart) {
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { moveSlide(dx < 0 ? 1 : -1); restartSlider(); }
  }
  touchStart = null;
}, { passive: true });
$("heroContent").addEventListener("touchcancel", () => { touchStart = null; });
document.querySelector(".hero").addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault(); moveSlide(event.key === "ArrowRight" ? 1 : -1); restartSlider();
  }
});
updatePauseButton();
restartSlider();

/* ==========================================
   KARTU PERTANDINGAN + PREDIKSI
========================================== */

/* ==========================================
   KARTU PERTANDINGAN + PREDIKSI
========================================== */

function card(match) {
  const score = match.state === "MENDATANG"
    ? "0 - 0"
    : actualScore(match);

  return `
    <article class="match-card" data-event-id="${esc(match.id)}">

      <div class="match-top">
        <b>${esc(match.league.toUpperCase())}</b>
        <span>${formatTime(match.date)} WIB</span>
      </div>

      <div class="match-body">
        <div class="match-teams">

          <div class="mini-team">
            ${teamLogo(match.home)}
            <b>${esc(match.home.name)}</b>
          </div>


          <div class="mini-score">
            VS
            <small>${statusLabel(match)}</small>
          </div>


          <div class="mini-team">
            ${teamLogo(match.away)}
            <b>${esc(match.away.name)}</b>
          </div>

        </div>

        ${predictionMarkup(match)}

        <div class="match-foot">
          <span>${formatDate(match.date)}</span>

          <a class="detail"
             href="https://bolautamanih.com"
             target="_blank"
             rel="noopener noreferrer">
            PASANG TARUHAN
          </a>
        </div>

      </div>
    </article>
  `;
}

/* ==========================================
   DAFTAR FIXTURE
========================================== */

function fixture(match) {
  return `
    <div class="fixture" data-event-id="${esc(match.id)}">

      <span class="time">
        ${formatDate(match.date)}
        <br>${formatTime(match.date)} WIB
      </span>

      <span class="league">
        ${esc(match.league)}
      </span>

      <span class="pair">

        <span class="fixture-team">
          ${teamLogo(match.home)}
          <b>${esc(match.home.name)}</b>
        </span>

        <span class="versus">vs</span>

        <span class="fixture-team">
          ${teamLogo(match.away)}
          <b>${esc(match.away.name)}</b>
        </span>

      </span>

      <span class="actual-score">
        ${actualScore(match)}
      </span>

      <span class="state ${match.state === "LIVE" ? "live" : ""}">
        ${statusLabel(match)}
      </span>

    </div>
  `;
}

/* ==========================================
   RENDER KARTU
========================================== */

function renderCards() {
  const list = games.filter(match =>
    leagueFilter === "all" ||
    match.lid === leagueFilter
  );

  $("matchGrid").innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty-state">
        Tidak ada pertandingan pada liga ini.
      </div>`;
}

function renderFixtures() {
  $("fixtureList").innerHTML = games.length
    ? games.map(fixture).join("")
    : `<div class="empty-state">
        Tidak ada jadwal yang tersedia untuk hari ini dan besok.
      </div>`;
}

/* ==========================================
   LOAD / UPDATE PERTANDINGAN
========================================== */

async function loadMatches() {
  if (loading) return;

  loading = true;

  const button = $("reload");

  if (button) {
    button.textContent = "MEMPERBARUI...";
    button.disabled = true;
  }

  try {
    const freshMatches = await fetchAllMatches();

    games = freshMatches;

    slideIndex = Math.min(
      slideIndex,
      Math.max(0, games.length - 1)
    );

    if (!games.length) {
      $("heroContent").innerHTML =
        `<div class="empty-state">
          Tidak ada data pertandingan. Coba perbarui kembali.
        </div>`;

      $("counter").textContent = "MATCH 00 / 00";
      $("dots").innerHTML = "";
    } else {
      renderHero();
    }

    renderCards();
    renderFixtures();

    if ($("dateLabel")) {
      $("dateLabel").textContent = formatDate(new Date());
    }

    console.log(
      `BOLAUTAMA: ${games.length} pertandingan dimuat.`,
      new Date().toLocaleString("id-ID")
    );

  } catch (error) {
    console.error(
      "BOLAUTAMA gagal memperbarui jadwal:",
      error
    );

    if (!games.length) {
      $("heroContent").innerHTML =
        `<div class="empty-state">
          Gagal mengambil data. Periksa koneksi atau akses sumber data.
        </div>`;
    }

  } finally {
    loading = false;

    if (button) {
      button.textContent = "↻ PERBARUI PERTANDINGAN";
      button.disabled = false;
    }
  }
}

/* ==========================================
   TOMBOL NAVIGASI BANNER
========================================== */

$("prev").onclick = () => { moveSlide(-1); restartSlider(); };
$("next").onclick = () => { moveSlide(1); restartSlider(); };

/* ==========================================
   TOMBOL REFRESH MANUAL
========================================== */

$("reload").onclick = loadMatches;

/* ==========================================
   FILTER LIGA
========================================== */

document.querySelectorAll("[data-league]").forEach(button => {
  button.onclick = () => {
    leagueFilter = button.dataset.league;

    document.querySelectorAll("[data-league]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderCards();
  };
});

/* ==========================================
   TAHUN FOOTER
========================================== */

if ($("year")) {
  $("year").textContent = new Date().getFullYear();
}

/* ==========================================
   MUAT DATA PERTAMA KALI
========================================== */

loadMatches();

/* ==========================================
   AUTO UPDATE SETIAP 60 DETIK
========================================== */

if (refreshTimer) {
  clearInterval(refreshTimer);
}

refreshTimer = setInterval(() => {
  if (!document.hidden) {
    loadMatches();
  }
}, UPDATE_INTERVAL);

/* ==========================================
   UPDATE SAAT KEMBALI KE TAB
========================================== */

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadMatches();
  }
});
  
const menuToggle = document.getElementById("menuToggle");
const navMenu = document.getElementById("navMenu");

function closeNavMenu() {
  navMenu.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.textContent = "☰ MENU";
}

menuToggle.addEventListener("click", function (event) {
  event.stopPropagation();

  const isOpen = navMenu.classList.contains("open");

  if (isOpen) {
    closeNavMenu();
  } else {
    navMenu.classList.add("open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.textContent = "✕ TUTUP MENU";
  }
});

navMenu.addEventListener("click", function (event) {
  const link = event.target.closest("a");
  if (!link) return;

  const href = link.getAttribute("href");

  if (href && href.startsWith("#")) {
    const target = document.getElementById(href.slice(1));

    if (target) {
      event.preventDefault();
      closeNavMenu();

      setTimeout(function () {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        history.replaceState(null, "", href);
      }, 50);
    } else {
      closeNavMenu();
    }
  } else {
    closeNavMenu();
  }
});

document.addEventListener("click", function (event) {
  if (
    !navMenu.contains(event.target) &&
    !menuToggle.contains(event.target)
  ) {
    closeNavMenu();
  }
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeNavMenu();
  }
});
  
(function () {
  const searchInput = document.getElementById("leagueSearch");
  const clearButton = document.getElementById("clearLeagueSearch");
  const leagueFilters = document.getElementById("leagueFilters");
  const matchGrid = document.getElementById("matchGrid");

  if (!searchInput || !leagueFilters || !matchGrid) return;

  const leagueButtons = Array.from(
    leagueFilters.querySelectorAll(".filter")
  );

  function runLeagueSearch() {
    const query = searchInput.value.trim().toLocaleLowerCase("id");

    clearButton.classList.toggle("visible", query.length > 0);

    // Cari liga berdasarkan nama liga atau kode data
    leagueButtons.forEach(function (button) {
      const text = button.textContent.toLocaleLowerCase("id");
      const code = (button.dataset.league || "").toLocaleLowerCase("id");

      button.hidden = query !== "" &&
        button.dataset.league !== "all" &&
        !text.includes(query) &&
        !code.includes(query);

      // Tombol Semua Liga tetap tersedia
      if (button.dataset.league === "all") {
        button.hidden = false;
      }
    });

    // Saat pencarian diisi, tampilkan semua kartu yang cocok
    const cards = Array.from(matchGrid.children);

    cards.forEach(function (card) {
      const text = card.textContent.toLocaleLowerCase("id");
      const matches = query === "" || text.includes(query);

      card.hidden = !matches;
    });

    // Saat search kosong, kembalikan tampilan filter normal
    if (query === "") {
      leagueButtons.forEach(function (button) {
        button.hidden = false;
      });

      matchGrid.querySelectorAll("[hidden]").forEach(function (card) {
        card.hidden = false;
      });
    }
  }

  searchInput.addEventListener("input", runLeagueSearch);

  clearButton.addEventListener("click", function () {
    searchInput.value = "";
    runLeagueSearch();
    searchInput.focus();
  });
})();

  
/* NAVIGASI FILTER LIGA */
document.addEventListener("DOMContentLoaded", () => {
  const filters = document.querySelector(".league-filters");
  const prevBtn = document.querySelector(".league-arrow.prev");
  const nextBtn = document.querySelector(".league-arrow.next");

  if (!filters || !prevBtn || !nextBtn) {
    console.warn("Container liga atau tombol panah tidak ditemukan.");
    return;
  }

  prevBtn.addEventListener("click", () => {
    filters.scrollBy({
      left: -250,
      behavior: "smooth"
    });
  });

  nextBtn.addEventListener("click", () => {
    filters.scrollBy({
      left: 250,
      behavior: "smooth"
    });
  });
});

  
  
;

// Load the original chat service only when requested, avoiding unsolicited overlays.
document.getElementById("openChat").onclick = function () {
  const button = this;
  if (window.zE) { window.zE("webWidget", "open"); return; }
  button.disabled = true;
  window.zESettings = { webWidget: { chat: { connectOnPageLoad: false } } };
  const script = document.createElement("script");
  script.id = "ze-snippet";
  script.src = "https://static.zdassets.com/ekr/snippet.js?key=1ba55e5c-574f-4b1e-9175-cd172f58bdd9";
  script.onload = () => { button.hidden = true; window.zE("webWidget", "open"); };
  script.onerror = () => { button.disabled = false; button.title = "Chat belum tersedia. Coba lagi."; };
  document.body.appendChild(script);
};

/* ===== MODE TERANG / GELAP (tambahan, tidak mengubah fungsi lain) ===== */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (t) => {
    root.setAttribute("data-theme", t);
    if (btn) {
      btn.querySelector(".theme-icon").textContent = t === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-pressed", String(t === "dark"));
      btn.title = t === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap";
    }
    if (meta) meta.setAttribute("content", t === "dark" ? "#1b1a2e" : "#30285d");
  };
  apply(root.getAttribute("data-theme") || "light");
  btn?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });
})();
