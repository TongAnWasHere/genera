# Genera

Genera is an offline-first flashcard web app for learning trivia using the Leitner spaced-repetition system. It comes pre-loaded with about 4,500 trivia questions across 24 categories from Open Trivia DB, but you can also create your own cards or import decks from CSV and JSON files.

---

## How It Works

### 1. Spaced Repetition (The Leitner System)

Genera uses a 5-box Leitner scheduling system with expanding review intervals:

- **Box 1**: 1 day
- **Box 2**: 2 days
- **Box 3**: 4 days
- **Box 4**: 8 days
- **Box 5**: 16 days

When you answer a card correctly, it moves up a box (graduating after Box 5). If you miss a card, it resets back to Box 1 so you review it again the next day. All scheduling calculations use pure UTC date strings (`YYYY-MM-DD`) to avoid timezone shifts when studying late at night or traveling.

You can set a daily limit on how many new official trivia cards appear (default is 10 per day), while your own custom cards are always available immediately.

### 2. Offline-First Architecture

- **Local Mode First**: You can use Genera immediately without creating an account. Everything is saved locally to your browser's IndexedDB database across five stores (`catalog`, `own_cards`, `progress`, `settings`, and `meta`).
- **Service Worker (`sw.js`)**: Caches the app shell (`index.html`, `style.css`, JS modules, and the trivia catalog). The site loads instantly even in airplane mode.
- **Background Catalog Updates**: When the app opens online, it checks `catalog-manifest.json`. If a new question catalog is released, it downloads and updates the cards in IndexedDB while preserving all your study progress and review history.

### 3. Sync & Conflict Detection

When you want to sync between your phone and laptop, you can log in to your account:

- **Dirty Flag Tracking**: Changes made offline are marked with a `dirty` flag and pushed in 500-item batches to `/api/sync`.
- **Last-Write-Wins (LWW)**: Conflicts are resolved using ISO UTC timestamps (`updated_at`). Ties break in favor of the server.
- **Dismissible Conflict Banner**: If an older edit from this device was rejected because a newer edit already existed on the server, Genera shows an amber banner naming the overwritten card or progress entry rather than silently discarding your work.
- **Account Merging**: If you start studying in Local Mode and later register or log in, Genera reconciles cards by question and category, preserves your newer edits, and repoints local progress to canonical server UUIDs without creating duplicates.
