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