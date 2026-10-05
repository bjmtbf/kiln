# Nabertherm Kiln Analyzer 9.7

Version 9.7 introducerar stöd för Docker Compose-profiler så att samma installation kan användas både som produktionsmiljö och utvecklingsmiljö. `code-server` är nu valfri och startas endast när utvecklingsprofilen används.

## Nytt i 9.7

### Docker Compose-profiler

Projektet använder nu Docker Compose-profiler:

- **Produktion**: backend + frontend.
- **Utveckling**: backend + frontend + code-server.

Det innebär att produktionsmiljön inte längre behöver köra eller ens bygga utvecklingsmiljön.

### Python-miljö i code-server

Python-miljön skapas och valideras automatiskt när code-server startar. Om `.venv` är trasig, skapad på en annan arkitektur eller saknar en körbar interpreter tas den bort och återskapas. Debuggern använder den verifierade sökvägen:

```text
/workspace/.venv/bin/python3
```

---

# Installation

## Förberedelser

1. Kopiera eller skapa en `.env`-fil.
2. Ange önskat lösenord:

```env
CODE_SERVER_PASSWORD=byt-till-ett-starkt-losenord
```

---

# Produktionsdrift

Startar endast frontend och backend.

```bash
docker compose down
docker compose up -d --build
```

Öppna applikationen:

```text
http://localhost:8066
```

---

# Utvecklingsmiljö

Startar frontend, backend och code-server.

```bash
docker compose down
docker compose --profile dev up -d --build
```

```bash
docker compose logs -f code-server
```

---

# Vanliga kommandon

```bash
docker compose up -d
docker compose --profile dev up -d
docker compose build
docker compose --profile dev build
docker compose down
```
