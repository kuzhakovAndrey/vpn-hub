# VPN Hub

Агрегатор бесплатных VPN-конфигураций из открытых источников GitHub.

- Сайт: https://kuzhakovandrey.github.io/vpn-hub/
- Сбор: GitHub Actions (каждый час), деплой на Pages
- Выход: `sub/all.txt`, `sub/base64.txt`, по-протокольные подписки (`vless`, `vmess`, `trojan`, `ss`, `hysteria2`, `tuic`, `ssr`)

## Источники

Pawdroid/Free-servers, free-nodes/v2rayfree, igareck/vpn-configs-for-russia, awesome-vpn/awesome-vpn,
mahdibland/V2RayAggregator (merge + Eternity), Epodonios/v2ray-configs, barry-far/V2ray-Config,
Barabama/FreeNodes, snakem982/proxypool.

## Локальный запуск

```bash
node fetch-configs.js        # результат в dist/
OUT_DIR=/tmp/x node fetch-configs.js
```

Требуется Node 18+ (используется встроенный fetch). Зависимостей нет.
