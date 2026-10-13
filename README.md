# Kondisi Laut Teluk Pemedas

Rekonstruksi mandiri aplikasi prakiraan laut di Teluk Pemedas. Aplikasi berjalan langsung di browser dan mengambil data terbaru dari Open-Meteo.

## Menjalankan aplikasi

### Versi statis

Jalankan perintah berikut dari folder ini (tanpa instalasi tambahan):

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

Kemudian buka <http://127.0.0.1:4173>.

Tidak ada proses instalasi atau build. Koneksi internet diperlukan untuk data prakiraan, pustaka Leaflet, dan peta dasar.

### Versi Streamlit

Jika Python tersedia, jalankan:

```powershell
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

Kemudian buka <http://localhost:8501>.

## Deploy ke Streamlit Community Cloud

1. Unggah seluruh isi folder ini ke sebuah repository GitHub.
2. Buka <https://share.streamlit.io> dan pilih **Create app**.
3. Pilih repository serta branch yang digunakan.
4. Isi **Main file path** dengan `app.py`.
5. Tekan **Deploy**. Aplikasi ini tidak memerlukan secrets atau database.

Streamlit akan membaca `requirements.txt` secara otomatis. Berkas `index.html`, `style.css`, dan `app.js` harus tetap berada di folder yang sama dengan `app.py`.

## Fitur

- Peta batimetri, satelit, jalan, dan rambu OpenSeaMap.
- Klik peta untuk mengambil prakiraan titik lain.
- Timeline enam hari dengan mode putar otomatis.
- Ringkasan gelombang, arus, pasang surut, angin, dan cuaca.
- Perbandingan empat model gelombang dan empat model angin.
- Penilaian kondisi konservatif berdasarkan nilai tertinggi antar model.
- Tabel tiga-jam dan grafik enam hari.
- Tampilan responsif serta tema terang/gelap mengikuti perangkat.

## Berkas utama

- `index.html` — struktur halaman.
- `style.css` — tampilan responsif dan tema.
- `app.js` — pengambilan data, peta, perhitungan, tabel, dan grafik.
- `app.py` — entry point deployment Streamlit.
- `requirements.txt` — dependensi Python untuk Streamlit Cloud.

> Data prakiraan bukan pengukuran langsung. Untuk keputusan pelayaran, tetap gunakan peringatan resmi BMKG dan tabel pasang surut resmi.
