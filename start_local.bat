@echo off
echo ===================================================
echo 🚀 Memulai Koneksi Lokal ke VPS (AiAgent)
echo ===================================================

echo.
echo [1/2] Membuka jalur aman (SSH Tunnel) ke Redis dan MinIO di VPS...
echo (Tolong biarkan jendela ini tetap terbuka. Jika tertutup, aplikasi lokal tidak bisa connect ke database/redis)
echo.

:: Menjalankan SSH Tunneling ke VPS
:: Ini akan mem-forward port lokal (6379, 9000) ke dalam VPS
start "SSH Tunnel (AiAgent)" cmd /c "ssh -N -L 6379:localhost:6379 -L 9000:localhost:9000 ubuntu@202.155.143.185"

echo [2/2] Menjalankan aplikasi AiAgent secara lokal (Mode Development)...
echo.

:: Menjalankan npm run dev
npm run dev
