"""
app.py
------
Server web (Flask) untuk dashboard "Sebaran TB Paru Kota Bandung".

Menjalankan:
    pip install -r requirements.txt
    python app.py
Lalu buka http://127.0.0.1:5000 di browser.
"""

from flask import Flask, render_template, jsonify, request, abort

from data_processor import TBDataProcessor, TAHUN_TERSEDIA

app = Flask(__name__)
processor = TBDataProcessor()  # data dimuat sekali saat server start


def _ambil_tahun_dari_request():
    """Ambil parameter ?tahun=2023 dari URL, validasi, beri default tahun terbaru."""
    tahun = request.args.get("tahun", default=TAHUN_TERSEDIA[-1], type=int)
    if tahun not in TAHUN_TERSEDIA:
        abort(400, description=f"Tahun harus salah satu dari {TAHUN_TERSEDIA}")
    return tahun


# ----------------------------------------------------------------------
# Halaman
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html", tahun_tersedia=TAHUN_TERSEDIA)


# ----------------------------------------------------------------------
# API
# ----------------------------------------------------------------------
@app.route("/api/peta")
def api_peta():
    """GeoJSON batas kecamatan + jumlah kasus tahun terpilih (untuk choropleth)."""
    tahun = _ambil_tahun_dari_request()
    return jsonify(processor.geojson_dengan_kasus(tahun))


@app.route("/api/statistik")
def api_statistik():
    """Ringkasan: total kasus, rata-rata, kecamatan tertinggi & terendah."""
    tahun = _ambil_tahun_dari_request()
    hasil = processor.statistik(tahun)
    if hasil is None:
        abort(404, description="Tidak ada data untuk tahun tersebut")
    return jsonify(hasil)


@app.route("/api/ranking")
def api_ranking():
    """Daftar lengkap kecamatan diurutkan dari kasus terbanyak."""
    tahun = _ambil_tahun_dari_request()
    return jsonify(processor.ranking(tahun))


@app.route("/api/top")
def api_top():
    """Top-N kecamatan dengan kasus terbanyak (default 10)."""
    tahun = _ambil_tahun_dari_request()
    n = request.args.get("n", default=10, type=int)
    return jsonify(processor.top_n(tahun, n))


@app.route("/api/perubahan")
def api_perubahan():
    """Perubahan jumlah kasus 2023 -> 2024 per kecamatan (untuk grafik tren)."""
    return jsonify(processor.perubahan_tahunan())


@app.route("/api/semua")
def api_semua():
    """Data lengkap semua kecamatan & semua tahun (untuk tabel data)."""
    return jsonify(processor.semua_data())


import os
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)