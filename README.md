# VPN Hub

Агрегатор бесплатных VPN-конфигураций из открытых источников GitHub.

- Сайт: https://kuzhakovandrey.github.io/vpn-hub/
- Сбор: GitHub Actions (каждые 2 часа: fetch → TCP-check → пинг из Москвы через check-host.net), деплой на Pages
- Выход (`dist/sub/`):
  - `russia.txt` / `russia_base64.txt` — узлы, доступные из Москвы, отсортированы по RTT
  - `base64.txt`, `all.txt`, по-протокольные `vless/vmess/trojan/ss/hysteria2/tuic/ssr` (+ `_base64`)
  - `clash.yaml` (Clash Meta/mihomo, url-test группа), `sing-box.json` (mixed :2080, selector+urltest)

## Источники

Pawdroid/Free-servers, free-nodes/v2rayfree, igareck/vpn-configs-for-russia, awesome-vpn/awesome-vpn,
mahdibland/V2RayAggregator (merge + Eternity), Epodonios/v2ray-configs, barry-far/V2ray-Config,
Barabama/FreeNodes, snakem982/proxypool, ebrasha/free-v2ray-public-list, MatinGhanbari/v2ray-configs,
ripaojiedian/freenode, zhuhaiuk/free-nodes.

## Локальный запуск

```bash
node fetch-configs.js              # полный прогон
SKIP_PING=1 node fetch-configs.js  # без пинга из Москвы
PING_CAP=100 node fetch-configs.js # ограничить число пингов
OUT_DIR=/tmp/x node fetch-configs.js
```

Требуется Node 18+ (встроенный fetch). Зависимостей нет.
