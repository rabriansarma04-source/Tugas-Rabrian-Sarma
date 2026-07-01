"""
data_processor.py
------------------
Modul ini bertugas memuat dan mengolah data mentah (file Excel kasus TB Paru
dan file GeoJSON batas kecamatan Kota Bandung), lalu menyediakan data yang
sudah bersih dan siap pakai untuk endpoint API di app.py.

Dipisah dari app.py agar logika pengolahan data dan logika web server
tidak campur aduk (separation of concerns) — salah satu prinsip dasar
rekayasa perangkat lunak yang baik.
"""

import json
import os
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "TB_PARU23-24.xlsx")
GEOJSON_PATH = os.path.join(BASE_DIR, "data", "kecamatan_bandung.json")

TAHUN_TERSEDIA = [2023, 2024]


class TBDataProcessor:
    """Mengelola seluruh data sebaran TB Paru Kota Bandung per kecamatan."""

    def __init__(self, excel_path=EXCEL_PATH, geojson_path=GEOJSON_PATH):
        self._geojson = self._load_geojson(geojson_path)
        self._df = self._load_excel(excel_path)
        # Tabel pivot: index = kecamatan, kolom = tahun, nilai = jumlah kasus
        self._pivot = self._df.pivot_table(
            index="kecamatan", columns="tahun", values="jumlah_kasus", aggfunc="sum"
        )

    # ------------------------------------------------------------------
    # Pemuatan data mentah
    # ------------------------------------------------------------------
    @staticmethod
    def _load_excel(path):
        df = pd.read_excel(path)
        df = df.rename(
            columns={
                "Kecamatan": "kecamatan",
                "Jumlah Kasus": "jumlah_kasus",
                "Tahun": "tahun",
            }
        )
        df["kecamatan"] = df["kecamatan"].str.strip()
        df = df[["kecamatan", "jumlah_kasus", "tahun"]].dropna(subset=["kecamatan"])
        df["jumlah_kasus"] = df["jumlah_kasus"].astype(int)
        df["tahun"] = df["tahun"].astype(int)
        return df

    @staticmethod
    def _load_geojson(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    # ------------------------------------------------------------------
    # Data dasar
    # ------------------------------------------------------------------
    def daftar_kecamatan(self):
        return sorted(self._pivot.index.tolist())

    def kasus_per_tahun(self, tahun):
        """Mengembalikan dict {kecamatan: jumlah_kasus} untuk satu tahun.
        Kecamatan yang tidak memiliki data tahun tersebut diberi nilai None."""
        if tahun not in self._pivot.columns:
            return {k: None for k in self.daftar_kecamatan()}
        kolom = self._pivot[tahun]
        hasil = {}
        for kec, nilai in kolom.items():
            hasil[kec] = int(nilai) if pd.notna(nilai) else None
        return hasil

    def semua_data(self):
        """Mengembalikan data lengkap semua kecamatan untuk semua tahun,
        lengkap dengan selisih (delta) dan persentase perubahan."""
        hasil = []
        for kec in self.daftar_kecamatan():
            baris = {"kecamatan": kec}
            nilai_tahun = {}
            for tahun in TAHUN_TERSEDIA:
                v = self._pivot.loc[kec, tahun] if tahun in self._pivot.columns else None
                nilai_tahun[tahun] = int(v) if pd.notna(v) else None
            baris["kasus"] = nilai_tahun

            v2023, v2024 = nilai_tahun.get(2023), nilai_tahun.get(2024)
            if v2023 is not None and v2024 is not None:
                baris["delta"] = v2024 - v2023
                baris["persen_perubahan"] = (
                    round((v2024 - v2023) / v2023 * 100, 1) if v2023 != 0 else None
                )
            else:
                baris["delta"] = None
                baris["persen_perubahan"] = None
            hasil.append(baris)
        return hasil

    # ------------------------------------------------------------------
    # Statistik ringkasan
    # ------------------------------------------------------------------
    def statistik(self, tahun):
        data = self.kasus_per_tahun(tahun)
        valid = {k: v for k, v in data.items() if v is not None}
        if not valid:
            return None

        kec_tertinggi = max(valid, key=valid.get)
        kec_terendah = min(valid, key=valid.get)
        total = sum(valid.values())

        return {
            "tahun": tahun,
            "total_kasus": total,
            "rata_rata": round(total / len(valid), 1),
            "jumlah_kecamatan_terdata": len(valid),
            "tertinggi": {"kecamatan": kec_tertinggi, "kasus": valid[kec_tertinggi]},
            "terendah": {"kecamatan": kec_terendah, "kasus": valid[kec_terendah]},
        }

    def ranking(self, tahun):
        """Daftar kecamatan diurutkan dari kasus terbanyak ke tersedikit."""
        data = self.kasus_per_tahun(tahun)
        valid = [(k, v) for k, v in data.items() if v is not None]
        valid.sort(key=lambda x: x[1], reverse=True)
        return [{"kecamatan": k, "kasus": v, "peringkat": i + 1} for i, (k, v) in enumerate(valid)]

    def top_n(self, tahun, n=10):
        return self.ranking(tahun)[:n]

    def perubahan_tahunan(self):
        """Daftar kecamatan yang punya data lengkap 2023 & 2024, diurutkan
        berdasarkan besar perubahan (delta) — untuk grafik kenaikan/penurunan."""
        data = [d for d in self.semua_data() if d["delta"] is not None]
        data.sort(key=lambda x: x["delta"], reverse=True)
        return data

    # ------------------------------------------------------------------
    # Data untuk peta (GeoJSON + jumlah kasus disisipkan ke properties)
    # ------------------------------------------------------------------
    def geojson_dasar(self):
        """GeoJSON murni batas wilayah, tanpa data kasus (dimuat sekali di awal)."""
        return self._geojson

    def geojson_dengan_kasus(self, tahun):
        """Menyisipkan jumlah_kasus ke dalam properties setiap fitur GeoJSON
        sesuai tahun yang dipilih, supaya front-end tinggal pakai 1 endpoint
        untuk menggambar choropleth."""
        data_tahun = self.kasus_per_tahun(tahun)
        geo = json.loads(json.dumps(self._geojson))  # deep copy ringan
        for feat in geo["features"]:
            nama = feat["properties"]["nama_kecamatan"]
            feat["properties"]["jumlah_kasus"] = data_tahun.get(nama)
            feat["properties"]["tahun"] = tahun
        return geo