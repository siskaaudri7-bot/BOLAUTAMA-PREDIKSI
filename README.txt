Paket pemisahan kode BOLAUTAMA

File:
- index.html: struktur halaman
- styles.css: CSS yang diekstrak dari <style> asli
- app.js: isi ketiga script inline asli, digabung dalam urutan yang sama

Cara uji:
1. Ekstrak ZIP ke satu folder.
2. Buka index.html melalui server/hosting yang sama seperti sebelumnya.
3. Uji seluruh fitur dan bandingkan tampilan di desktop/mobile.

Catatan keamanan:
Memisahkan file tidak menyembunyikan source dari DevTools/Network. Pengunjung tetap dapat mengunduh CSS/JS yang diperlukan browser. Jangan letakkan secret/API key privat di frontend.
