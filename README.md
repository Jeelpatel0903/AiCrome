# DevFlow AI

AI-powered Chrome Extension for browser automation. DevFlow AI lets you control your browser using natural language commands — fill forms, navigate pages, log in to sites, record workflows, and schedule recurring tasks.

## What is DevFlow AI?

DevFlow AI is a monorepo consisting of:
- **extension/** — Chrome Extension (Manifest V3, React 18, TypeScript, Vite) that runs in the browser
- **backend/** — Node.js API server (Fastify, TypeScript) that handles AI processing and data storage
- **shared/** — Shared TypeScript types used by both the extension and backend

## Prerequisites

- Node.js 20+ (use `.nvmrc`: `nvm use`)
- npm 10+
- A Firebase project (for auth and Firestore)
- An Anthropic API key (for Claude AI)

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd AiCrome
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

**Backend:**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

**Extension:**
```bash
cp extension/.env.example extension/.env
# Edit extension/.env with your Firebase config
```

### 4. Generate placeholder icons (first time only)

```bash
node extension/scripts/generate-placeholder-icons.js
```

### 5. Start development

**Backend:**
```bash
npm run dev:backend
```

**Extension (in another terminal):**
```bash
npm run dev:extension
```

The extension build will watch for changes and rebuild automatically into `extension/dist/`.

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in the top-right corner)
3. Click **Load Unpacked**
4. Select the `extension/dist/` directory

After any code change, the extension rebuilds automatically. Click the refresh icon on the extension card in `chrome://extensions/` to reload it.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment: `development` or `production` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude AI |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account JSON (as single-line string) |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM encryption. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOWED_ORIGINS` | Chrome extension origin: `chrome-extension://<your-extension-id>` |
| `FRONTEND_URL` | Frontend URL for shared workflow links |

### Extension (`extension/.env`)

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_BACKEND_URL` | Backend API URL (default: `http://localhost:3000`) |

## Build for Production

```bash
# Build everything
npm run build

# Build only the extension
npm run build:extension

# Build only the backend
npm run build:backend
```

## Type Checking

```bash
npm run typecheck
```

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code only |
| `dev` | Active development, integration branch |
| `feature/<task-name>` | Individual feature branches, merge into `dev` |

Always branch off `dev` for new features, open a PR to `dev`, and only merge `dev` → `main` for releases.

## Architecture

```
AiCrome/
├── extension/          # Chrome Extension (MV3)
│   ├── src/
│   │   ├── background/ # Service worker
│   │   ├── content/    # Content scripts (injected into pages)
│   │   ├── popup/      # Extension popup UI
│   │   ├── sidepanel/  # Main UI (side panel)
│   │   ├── lib/        # Firebase, utilities
│   │   └── store/      # Zustand state stores
│   ├── public/icons/   # Extension icons
│   └── manifest.json
├── backend/            # Fastify API server
│   └── src/
│       ├── routes/     # API route handlers
│       ├── services/   # Firebase, encryption, AI
│       ├── middleware/  # Auth middleware
│       └── server.ts   # Entry point
└── shared/             # Shared TypeScript types
    └── src/
        └── types.ts
```
