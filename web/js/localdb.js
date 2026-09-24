const db_name = "genera";
const db_version = 1;
let db_instance = null;

export function open_db() {
    if (db_instance) {
        return Promise.resolve(db_instance);
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(db_name, db_version);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("catalog")) {
                db.createObjectStore("catalog", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("own_cards")) {
                db.createObjectStore("own_cards", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("progress")) {
                db.createObjectStore("progress", { keyPath: ["card_kind", "card_id"] });
            }
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", { keyPath: "key" });
            }
        };

        request.onsuccess = (event) => {
            db_instance = event.target.result;
            resolve(db_instance);
        };

        request.onerror = (event) => {
            reject(new Error("Failed to open IndexedDB: " + event.target.error));
        };
    });
}

export async function get_meta(key) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readonly");
        const store = tx.objectStore("meta");
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
    });
}

export async function set_meta(key, value) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readwrite");
        const store = tx.objectStore("meta");
        const req = store.put({ key: key, value: value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function count_store(store_name) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store_name, "readonly");
        const store = tx.objectStore(store_name);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function init_defaults() {
    const mode = await get_meta("mode");
    if (mode === null) {
        await set_meta("mode", "local");
    }
    const sync_ver = await get_meta("lastSyncVersion");
    if (sync_ver === null) {
        await set_meta("lastSyncVersion", 0);
    }
    const cat_ver = await get_meta("catalogVersion");
    if (cat_ver === null) {
        await set_meta("catalogVersion", 0);
    }
}

export async function load_catalog_if_needed() {
    const db = await open_db();
    await init_defaults();

    const current_version = await get_meta("catalogVersion");
    const existing_count = await count_store("catalog");

    if (current_version > 0 && existing_count > 0) {
        return { downloaded: false, count: existing_count, version: current_version };
    }

    const response = await fetch("/data/catalog.json");
    if (!response.ok) {
        throw new Error("Failed to download catalog: " + response.statusText);
    }

    const data = await response.json();
    const cards = data.cards || [];

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["catalog", "meta"], "readwrite");
        const catalog_store = tx.objectStore("catalog");
        const meta_store = tx.objectStore("meta");

        for (const card of cards) {
            catalog_store.put(card);
        }

        meta_store.put({ key: "catalogVersion", value: data.version || 1 });

        tx.oncomplete = () => {
            resolve({ downloaded: true, count: cards.length, version: data.version || 1 });
        };

        tx.onerror = () => {
            reject(new Error("Failed to save catalog to IndexedDB: " + tx.error));
        };
    });
}

export function get_today_date() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function get_utc_now() {
    const d = new Date();
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function add_own_card(question, answer, category) {
    const db = await open_db();
    const clean_q = question.trim();
    const clean_a = answer.trim();
    const clean_c = category.trim() || "Uncategorized";

    const all_existing = await get_all_own_cards(false);
    const is_dupe = all_existing.some((c) => {
        return c.question.toLowerCase() === clean_q.toLowerCase() && c.category.toLowerCase() === clean_c.toLowerCase();
    });

    if (is_dupe) {
        throw new Error("A card with this question and category already exists.");
    }

    const card = {
        id: crypto.randomUUID(),
        question: clean_q,
        answer: clean_a,
        category: clean_c,
        created_at: get_today_date(),
        updated_at: get_utc_now(),
        deleted: 0,
        dirty: 1
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readwrite");
        const store = tx.objectStore("own_cards");
        const req = store.put(card);
        req.onsuccess = () => resolve(card);
        req.onerror = () => reject(req.error);
    });
}

export async function update_own_card(id, question, answer, category) {
    const db = await open_db();
    const clean_q = question.trim();
    const clean_a = answer.trim();
    const clean_c = category.trim() || "Uncategorized";

    const existing = await get_own_card(id);
    if (!existing || existing.deleted === 1) {
        throw new Error("Card not found.");
    }

    existing.question = clean_q;
    existing.answer = clean_a;
    existing.category = clean_c;
    existing.updated_at = get_utc_now();
    existing.dirty = 1;

    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readwrite");
        const store = tx.objectStore("own_cards");
        const req = store.put(existing);
        req.onsuccess = () => resolve(existing);
        req.onerror = () => reject(req.error);
    });
}

export async function delete_own_card(id) {
    const db = await open_db();
    const existing = await get_own_card(id);
    if (!existing) {
        return;
    }

    existing.deleted = 1;
    existing.updated_at = get_utc_now();
    existing.dirty = 1;

    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readwrite");
        const store = tx.objectStore("own_cards");
        const req = store.put(existing);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function get_own_card(id) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readonly");
        const store = tx.objectStore("own_cards");
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function get_all_own_cards(include_deleted = false) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readonly");
        const store = tx.objectStore("own_cards");
        const req = store.getAll();
        req.onsuccess = () => {
            const all = req.result || [];
            if (include_deleted) {
                resolve(all);
            } else {
                resolve(all.filter((c) => c.deleted !== 1));
            }
        };
        req.onerror = () => reject(req.error);
    });
}

export async function get_progress(card_kind, card_id) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("progress", "readonly");
        const store = tx.objectStore("progress");
        const req = store.get([card_kind, card_id]);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function set_card_hidden(card_kind, card_id, hidden) {
    const db = await open_db();
    const existing = await get_progress(card_kind, card_id);

    return new Promise((resolve, reject) => {
        const tx = db.transaction("progress", "readwrite");
        const store = tx.objectStore("progress");

        if (existing) {
            existing.hidden = hidden ? 1 : 0;
            existing.updated_at = get_utc_now();
            existing.dirty = 1;
            const req = store.put(existing);
            req.onsuccess = () => resolve(existing);
            req.onerror = () => reject(req.error);
        } else {
            const row = {
                card_kind: card_kind,
                card_id: card_id,
                box: 1,
                due_date: get_today_date(),
                last_reviewed: null,
                introduced_on: null,
                times_right: 0,
                times_wrong: 0,
                hidden: hidden ? 1 : 0,
                updated_at: get_utc_now(),
                dirty: 1
            };
            const req = store.put(row);
            req.onsuccess = () => resolve(row);
            req.onerror = () => reject(req.error);
        }
    });
}

export async function is_card_hidden(card_kind, card_id) {
    const row = await get_progress(card_kind, card_id);
    return row !== null && row.hidden === 1;
}