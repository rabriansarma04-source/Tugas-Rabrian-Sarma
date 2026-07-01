/**
 * main.js
 * --------
 * Mengambil data dari API Flask (lihat app.py) dan menampilkannya sebagai
 * peta choropleth (Leaflet), grafik (Chart.js), daftar peringkat, dan
 * tabel data. Semua data kasus diambil lewat fetch() — tidak ada angka
 * yang ditulis manual di file ini.
 */

(() => {
  "use strict";

  /* --------------------------- state & cache --------------------------- */
  const state = {
    tahun:
      Number(
        document.querySelector(".year-toggle__btn.is-active")?.dataset.tahun,
      ) || 2024,
    maxKasus: 1,
    semuaData: null,
    statistikCache: {},
    petaCache: {},
    sort: { key: "2024", dir: "desc" },
  };

  const WARNA_SKALA = ["#F1E4BE", "#E7B65A", "#D9874C", "#C0533C", "#7E2A24"];
  const WARNA_KOSONG = "#E3E6E1";
  const WARNA_OK = "#5C7F58";
  const WARNA_ALERT = "#B24433";

  const fmt = (n) =>
    n === null || n === undefined ? "–" : n.toLocaleString("id-ID");

  async function ambilJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal memuat ${url}`);
    return res.json();
  }

  function warnaUntuk(nilai) {
    if (nilai === null || nilai === undefined) return WARNA_KOSONG;
    const rasio = state.maxKasus > 0 ? nilai / state.maxKasus : 0;
    if (rasio > 0.8) return WARNA_SKALA[4];
    if (rasio > 0.6) return WARNA_SKALA[3];
    if (rasio > 0.4) return WARNA_SKALA[2];
    if (rasio > 0.2) return WARNA_SKALA[1];
    return WARNA_SKALA[0];
  }

  /* ------------------------------- peta ------------------------------- */
  let map, layerKecamatan, layerAktif;

  function initMap() {
    map = L.map("peta", {
      zoomControl: true,
      attributionControl: false,
      minZoom: 11,
      maxZoom: 15,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
      },
    ).addTo(map);
  }
  function styleFitur(feature) {
    return {
      fillColor: warnaUntuk(feature.properties.jumlah_kasus),
      color: "#16201D",
      weight: 1,
      opacity: 0.35,
      fillOpacity: 0.88,
    };
  }

  function isiTooltip(props) {
    const n = props.jumlah_kasus;
    return `<span class="kec-tip__name">${props.nama_kecamatan}</span>${
      n === null
        ? "Data tidak tersedia"
        : `<span class="kec-tip__n">${fmt(n)}</span> kasus`
    }`;
  }

  async function muatPeta(tahun) {
    if (!state.petaCache[tahun]) {
      state.petaCache[tahun] = await ambilJSON(`/api/peta?tahun=${tahun}`);
    }
    const geo = state.petaCache[tahun];

    if (layerKecamatan) map.removeLayer(layerKecamatan);

    layerKecamatan = L.geoJSON(geo, {
      style: styleFitur,
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(isiTooltip(feature.properties), {
          className: "kec-tip",
          sticky: true,
          direction: "top",
          offset: [0, -6],
        });
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({ weight: 2.5, opacity: 1, fillOpacity: 1 });
            e.target.bringToFront();
          },
          mouseout: (e) => {
            if (e.target !== layerAktif) layerKecamatan.resetStyle(e.target);
          },
          click: (e) =>
            sorotKecamatan(feature.properties.nama_kecamatan, e.target),
        });
      },
    }).addTo(map);

    if (!map._sudahFit) {
      map.fitBounds(layerKecamatan.getBounds(), { padding: [12, 12] });
      map._sudahFit = true;
    }
  }

  function sorotKecamatan(nama, layer) {
    if (layerAktif) layerKecamatan.resetStyle(layerAktif);
    layerAktif = layer || null;
    if (layer) layer.setStyle({ weight: 2.5, opacity: 1, fillOpacity: 1 });

    document
      .querySelectorAll(".is-highlight, .ranking-item.is-active")
      .forEach((el) => el.classList.remove("is-highlight", "is-active"));

    const baris = document.querySelector(`tr[data-kecamatan="${nama}"]`);
    if (baris) {
      baris.classList.add("is-highlight");
      baris.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const item = document.querySelector(
      `.ranking-item[data-kecamatan="${nama}"]`,
    );
    if (item) item.classList.add("is-active");
  }

  function renderLegenda() {
    const labelRange = [
      "Sangat rendah",
      "Rendah",
      "Sedang",
      "Tinggi",
      "Sangat tinggi",
    ];
    const max = state.maxKasus;
    const html = WARNA_SKALA.map((warna, i) => {
      const dari = Math.round((i / 5) * max);
      const sampai = i === 4 ? max : Math.round(((i + 1) / 5) * max);
      return `<div class="map-legend__row">
                <span class="map-legend__swatch" style="background:${warna}"></span>
                <span>${labelRange[i]} (${dari}–${sampai})</span>
              </div>`;
    }).join("");
    document.getElementById("legenda-peta").innerHTML =
      `<div class="map-legend__title">Jumlah kasus</div>${html}
       <div class="map-legend__row" style="margin-top:2px">
         <span class="map-legend__swatch" style="background:${WARNA_KOSONG}"></span>
         <span>Tidak ada data</span>
       </div>`;
  }

  /* ----------------------------- statistik ----------------------------- */
  async function muatStatistik(tahun) {
    if (!state.statistikCache[tahun]) {
      state.statistikCache[tahun] = await ambilJSON(
        `/api/statistik?tahun=${tahun}`,
      );
    }
    const s = state.statistikCache[tahun];

    document.getElementById("stat-total").textContent = fmt(s.total_kasus);
    document.getElementById("stat-rata").textContent = fmt(s.rata_rata);
    document.getElementById("stat-tertinggi").textContent =
      s.tertinggi.kecamatan;
    document.getElementById("stat-tertinggi-n").textContent =
      `${fmt(s.tertinggi.kasus)} kasus`;
    document.getElementById("stat-terendah").textContent = s.terendah.kecamatan;
    document.getElementById("stat-terendah-n").textContent =
      `${fmt(s.terendah.kasus)} kasus`;

    const subTotal = document.getElementById("stat-total-delta");
    const sebelumnya = state.statistikCache[tahun - 1];
    if (sebelumnya) {
      const diff = s.total_kasus - sebelumnya.total_kasus;
      const persen = sebelumnya.total_kasus
        ? Math.round((diff / sebelumnya.total_kasus) * 1000) / 10
        : 0;
      const naik = diff > 0;
      subTotal.innerHTML = `<span class="${naik ? "delta-up" : "delta-down"}">${naik ? "▲" : "▼"} ${fmt(
        Math.abs(diff),
      )} (${Math.abs(persen)}%)</span> dari ${tahun - 1} · ${s.jumlah_kecamatan_terdata} kecamatan terdata`;
    } else {
      subTotal.textContent = `dari ${s.jumlah_kecamatan_terdata} kecamatan terdata`;
    }
  }

  /* ------------------------------ ranking ------------------------------ */
  async function muatRanking(tahun) {
    const data = await ambilJSON(`/api/ranking?tahun=${tahun}`);
    const list = document.getElementById("ranking-list");
    list.innerHTML = data
      .map(
        (d) => `
      <li class="ranking-item" data-kecamatan="${d.kecamatan}" tabindex="0">
        <span class="ranking-item__rank">${String(d.peringkat).padStart(2, "0")}</span>
        <div class="ranking-item__main">
          <span class="ranking-item__name">${d.kecamatan}</span>
          <div class="ranking-item__bar-track">
            <div class="ranking-item__bar-fill" style="width:${(d.kasus / state.maxKasus) * 100}%; background:${warnaUntuk(d.kasus)}"></div>
          </div>
        </div>
        <span class="ranking-item__value">${fmt(d.kasus)}</span>
      </li>`,
      )
      .join("");

    list.querySelectorAll(".ranking-item").forEach((el) => {
      el.addEventListener("click", () => {
        const nama = el.dataset.kecamatan;
        const target = Object.values(layerKecamatan._layers).find(
          (l) => l.feature.properties.nama_kecamatan === nama,
        );
        sorotKecamatan(nama, target);
        if (target) map.panTo(target.getBounds().getCenter());
      });
    });
  }

  /* ------------------------------- grafik ------------------------------- */
  let chartTop10, chartDelta;

  function chartTersedia() {
    if (typeof Chart === "undefined") {
      console.warn(
        "Chart.js gagal dimuat (cek koneksi internet / pemblokir CDN). Grafik dilewati.",
      );
      return false;
    }
    return true;
  }

  async function muatChartTop10(tahun) {
    if (!chartTersedia()) return;
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.color = "#E8E5DC";
    const data = await ambilJSON(`/api/top?tahun=${tahun}&n=10`);
    const labels = data.map((d) => d.kecamatan);
    const nilai = data.map((d) => d.kasus);
    const warna = nilai.map(warnaUntuk);

    if (chartTop10) chartTop10.destroy();
    chartTop10 = new Chart(document.getElementById("chart-top10"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: nilai,
            backgroundColor: warna,
            borderRadius: 2,
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${fmt(c.raw)} kasus` } },
        },
        scales: {
          x: {
            grid: { color: "rgba(232,229,220,0.12)" },
            ticks: { font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
  }

  async function muatChartDelta() {
    if (!chartTersedia()) return;
    const data = await ambilJSON("/api/perubahan");
    const labels = data.map((d) => d.kecamatan);
    const nilai = data.map((d) => d.delta);
    const warna = nilai.map((v) => (v > 0 ? WARNA_ALERT : WARNA_OK));

    chartDelta = new Chart(document.getElementById("chart-delta"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: nilai,
            backgroundColor: warna,
            borderRadius: 2,
            barThickness: 9,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.raw > 0 ? "Naik" : "Turun"} ${fmt(Math.abs(c.raw))} kasus`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(22,32,29,0.07)" },
            ticks: { font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          },
          y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
        },
      },
    });
  }

  /* -------------------------------- tabel -------------------------------- */
  function renderTabel() {
    const filter = document
      .getElementById("cari-kecamatan")
      .value.trim()
      .toLowerCase();
    const { key, dir } = state.sort;

    let baris = state.semuaData.filter((d) =>
      d.kecamatan.toLowerCase().includes(filter),
    );

    baris.sort((a, b) => {
      const ambil = (d) =>
        key === "kecamatan"
          ? d.kecamatan
          : key === "2023" || key === "2024"
            ? d.kasus[key]
            : key === "delta"
              ? d.delta
              : d.persen_perubahan;
      let va = ambil(a),
        vb = ambil(b);
      if (va === null) va = key === "kecamatan" ? "" : -Infinity;
      if (vb === null) vb = key === "kecamatan" ? "" : -Infinity;
      if (typeof va === "string")
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return dir === "asc" ? va - vb : vb - va;
    });

    document.getElementById("tabel-body").innerHTML = baris
      .map((d) => {
        const pill =
          d.delta === null
            ? `<span class="pill pill--flat">–</span>`
            : d.delta === 0
              ? `<span class="pill pill--flat">Tetap</span>`
              : d.delta > 0
                ? `<span class="pill pill--up">▲ ${fmt(d.delta)}</span>`
                : `<span class="pill pill--down">▼ ${fmt(Math.abs(d.delta))}</span>`;
        return `<tr data-kecamatan="${d.kecamatan}">
          <td>${d.kecamatan}</td>
          <td class="is-num">${fmt(d.kasus[2023])}</td>
          <td class="is-num">${fmt(d.kasus[2024])}</td>
          <td class="is-num">${pill}</td>
          <td class="is-num">${d.persen_perubahan === null ? "–" : d.persen_perubahan.toFixed(1) + "%"}</td>
        </tr>`;
      })
      .join("");

    document.querySelectorAll(".data-table th.is-sortable").forEach((th) => {
      th.classList.remove("is-sorted", "is-sorted-asc");
      if (th.dataset.key === key)
        th.classList.add(dir === "asc" ? "is-sorted-asc" : "is-sorted");
    });
  }

  async function muatTabel() {
    state.semuaData = await ambilJSON("/api/semua");
    state.maxKasus = Math.max(
      ...state.semuaData.flatMap((d) => [
        d.kasus[2023] ?? 0,
        d.kasus[2024] ?? 0,
      ]),
    );
    renderTabel();
  }

  /* ------------------------------ orkestrasi ------------------------------ */
  async function setTahun(tahun) {
    state.tahun = tahun;
    document.querySelectorAll(".year-toggle__btn").forEach((btn) => {
      const aktif = Number(btn.dataset.tahun) === tahun;
      btn.classList.toggle("is-active", aktif);
      btn.setAttribute("aria-selected", aktif);
    });
    await Promise.all([
      muatStatistik(tahun),
      muatPeta(tahun),
      muatRanking(tahun),
      muatChartTop10(tahun),
    ]);
    renderLegenda();
  }

  function pasangEvent() {
    document.querySelectorAll(".year-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => setTahun(Number(btn.dataset.tahun)));
    });
    document
      .getElementById("cari-kecamatan")
      .addEventListener("input", renderTabel);
    document.querySelectorAll(".data-table th.is-sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        } else {
          state.sort = { key, dir: "desc" };
        }
        renderTabel();
      });
    });
  }

  async function mulai() {
    initMap();
    pasangEvent();
    await muatTabel(); // wajib pertama: menentukan state.maxKasus untuk skala warna
    await Promise.all([muatChartDelta(), setTahun(state.tahun)]);
  }

  document.addEventListener("DOMContentLoaded", mulai);
})();
