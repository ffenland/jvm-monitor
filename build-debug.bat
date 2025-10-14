@echo off
set DEBUG=electron-builder
set WIN_CSC_LINK=none
npm run dist 2>&1 | find /i "icon"