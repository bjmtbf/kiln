# Nabertherm Kiln Analyzer 9.6

Version 9.6 inkluderar uppdaterad bränningssida och en webbaserad utvecklingsmiljö med code-server.

## Korrigering i 9.6

Python-miljön skapas och valideras automatiskt när code-server startar. Om `.venv` är trasig, skapad på en annan arkitektur eller saknar en körbar interpreter tas den bort och återskapas. Debuggern använder den verifierade sökvägen `/workspace/.venv/bin/python3`.

## Start

1. Ändra `CODE_SERVER_PASSWORD` i `.env`.
2. Kör:

```bash
docker compose down
docker compose up -d --build
```

3. Följ första starten:

```bash
docker compose logs -f code-server
```

4. Öppna:

- App: http://localhost:8066
- code-server: http://localhost:8443

Vänta tills loggen visar att Python-beroendena är installerade och code-server har startat innan du startar `Backend: FastAPI`.

## Om en gammal `.venv` ligger kvar

Startskriptet reparerar den automatiskt. Det finns också en VS Code-task:

```text
Terminal > Run Task > Repair Python environment
```

## Säkerhet

Port 8443 och utvecklingsportarna är bundna till localhost. Docker-socketen ger utvecklingscontainern omfattande åtkomst till värddatorns Docker-daemon. Ta bort socket-mounten om den inte behövs.

## Kodstruktur och fortsatt utveckling

Projektet är formaterat för att kunna underhållas i VS Code utan att först behöva läsa kompakterad kod.

### Backend

- `backend/app/main.py` innehåller API-rutter och samordnar övriga moduler.
- `backend/app/calculation.py` innehåller energi- och kostnadsberäkningar.
- `backend/app/parser.py` läser Nabertherms CSV-format.
- `backend/app/pricing.py` hämtar och cachelagrar elpriser.
- `backend/app/storage.py` ansvarar för säker JSON-lagring.
- `backend/app/config.py` innehåller sökvägar, ugnsmodeller och standardvärden.

Pythonkoden formateras och kontrolleras med Ruff:

```bash
cd backend
ruff format .
ruff check .
pytest
```

### Frontend

- `frontend/src/main.tsx` innehåller applikationens tillstånd, navigation och API-anrop.
- `frontend/src/components/FiringComponents.tsx` innehåller återanvändbara vy- och diagramkomponenter.
- `frontend/src/styles.css` innehåller den applikationsspecifika formgivningen.
- `frontend/src/translations.json` innehåller samtliga översättningar.

Frontendkoden formateras med Prettier:

```bash
cd frontend
npm install
npm run format
npm test
npm run build
```

### Kontroll före incheckning

Kör både backendtester och frontendtester. CI-flödet i `.github/workflows/ci.yml` gör dessutom ett Docker Compose-bygge.
