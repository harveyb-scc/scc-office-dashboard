#!/bin/bash
set -e

echo "[post-merge] Installing backend dependencies..."
cd backend && npm install --prefer-offline 2>&1
echo "[post-merge] Building backend..."
npm run build 2>&1
cd ..

echo "[post-merge] Installing frontend dependencies..."
cd frontend && npm install --prefer-offline 2>&1
cd ..

echo "[post-merge] Done."
