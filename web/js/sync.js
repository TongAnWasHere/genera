import {
    get_meta,
    set_meta,
    get_dirty_own_cards,
    get_dirty_progress_rows,
    get_dirty_settings,
    count_dirty_rows,
    apply_sync_batch,
    merge_local_into_account
} from "./localdb.js";

let is_syncing = false;

export function set_sync_status(text, color_class) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.textContent = text;
    el.className = `status-pill ${color_class}`;
}

export async function update_sync_status_ui() {
    if (!navigator.onLine) {
        set_sync_status("Offline", "status-gray");
        return;
    }

    const mode = await get_meta("mode");
    if (mode !== "account") {
        set_sync_status("Local mode (not backed up)", "status-gray");
        return;
    }

    const dirty_count = await count_dirty_rows();
    if (dirty_count > 0) {
        set_sync_status(`${dirty_count} changes not synced`, "status-blue");
    } else {
        set_sync_status("Synced", "status-green");
    }
}

function sanitize_card_for_sync(card) {
    return {
        id: card.id,
        question: card.question,
        answer: card.answer,
        category: card.category,
        created_at: card.created_at,
        updated_at: card.updated_at,
        deleted: card.deleted ? 1 : 0
    };
}

function sanitize_progress_for_sync(p) {
    return {
        card_kind: p.card_kind,
        card_id: p.card_id,
        box: typeof p.box === "number" ? p.box : 1,
        due_date: p.due_date,
        last_reviewed: p.last_reviewed || null,
        introduced_on: p.introduced_on || null,
        times_right: p.times_right || 0,
        times_wrong: p.times_wrong || 0,
        hidden: p.hidden ? 1 : 0,
        updated_at: p.updated_at
    };
}

function sanitize_settings_for_sync(s) {
    if (!s) return null;
    return {
        daily_new_limit: s.daily_new_limit ?? 10,
        enabled_categories: Array.isArray(s.enabled_categories) ? s.enabled_categories : [],
        updated_at: s.updated_at
    };
}

export async function sync_now(on_update) {
    if (is_syncing) {
        return false;
    }

    if (!navigator.onLine) {
        set_sync_status("Offline", "status-gray");
        return false;
    }

    const mode = await get_meta("mode");
    if (mode !== "account") {
        try {
            const me_res = await fetch("/api/me");
            if (me_res.ok) {
                await set_meta("mode", "account");
            } else {
                set_sync_status("Local mode (not backed up)", "status-gray");
                return false;
            }
        } catch (_) {
            set_sync_status("Local mode (not backed up)", "status-gray");
            return false;
        }
    }

    is_syncing = true;
    let total_applied = 0;

    try {
        let has_more = true;

        while (has_more) {
            const last_sync_version = (await get_meta("lastSyncVersion")) || 0;
            const dirty_cards = await get_dirty_own_cards();
            const dirty_progress = await get_dirty_progress_rows();
            const dirty_settings = await get_dirty_settings();
            const dirty_total = dirty_cards.length + dirty_progress.length + (dirty_settings ? 1 : 0);

            if (dirty_total > 0) {
                set_sync_status(`${dirty_total} changes not synced`, "status-blue");
            }

            const batch_cards = dirty_cards.slice(0, 500);
            const remaining_slots = 500 - batch_cards.length;
            const batch_progress = dirty_progress.slice(0, remaining_slots);
            const batch_settings = dirty_settings;

            const payload = {
                since: last_sync_version,
                own_cards: batch_cards.map(sanitize_card_for_sync),
                progress: batch_progress.map(sanitize_progress_for_sync),
                settings: sanitize_settings_for_sync(batch_settings)
            };

            const response = await fetch("/api/sync", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                await set_meta("mode", "local");
                set_sync_status("Local mode (not backed up)", "status-gray");
                is_syncing = false;
                return false;
            }

            if (!response.ok) {
                let err_msg = response.statusText;
                try {
                    const err_data = await response.json();
                    if (err_data.error) err_msg = err_data.error;
                } catch (_) {}
                set_sync_status(`Sync failed (${err_msg})`, "status-red");
                is_syncing = false;
                return false;
            }

            const data = await response.json();
            const server_cards = data.own_cards || [];
            const server_progress = data.progress || [];
            const server_settings = data.settings || null;
            const server_version = data.version || 0;

            await apply_sync_batch({
                server_cards,
                server_progress,
                server_settings,
                pushed_cards: batch_cards,
                pushed_progress: batch_progress,
                pushed_settings: batch_settings,
                server_version
            });

            total_applied += server_cards.length + server_progress.length + (server_settings ? 1 : 0);

            const remaining_dirty = await count_dirty_rows();
            has_more = data.has_more === true || remaining_dirty > 0;
        }

        const remaining = await count_dirty_rows();
        if (remaining === 0) {
            set_sync_status("Synced", "status-green");
        } else {
            set_sync_status(`${remaining} changes not synced`, "status-blue");
        }

        if (on_update && total_applied > 0) {
            await on_update();
        }

        return true;
    } catch (err) {
        if (!navigator.onLine) {
            set_sync_status("Offline", "status-gray");
        } else {
            set_sync_status(`Sync failed (${err.message})`, "status-red");
        }
        return false;
    } finally {
        is_syncing = false;
    }
}

export async function init_sync_engine(on_update) {
    window.addEventListener("online", () => {
        sync_now(on_update);
    });

    window.addEventListener("offline", () => {
        set_sync_status("Offline", "status-gray");
    });

    const status_pill = document.getElementById("sync-status");
    if (status_pill) {
        status_pill.style.cursor = "pointer";
        status_pill.title = "Click to sync now";
        status_pill.addEventListener("click", () => {
            sync_now(on_update);
        });
    }

    await update_sync_status_ui();
    await sync_now(on_update);
}

export async function perform_account_login({ username, password, is_register = false, on_update = null }) {
    const endpoint = is_register ? "/api/register" : "/api/login";
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
        let err_msg = "Authentication failed.";
        try {
            const err_data = await res.json();
            if (err_data.error) err_msg = err_data.error;
        } catch (_) {}
        throw new Error(err_msg);
    }

    const user_data = await res.json();
    const current_mode = await get_meta("mode");

    if (current_mode === "local") {
        const pull_res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                since: 0,
                own_cards: [],
                progress: [],
                settings: null
            })
        });

        if (pull_res.ok) {
            const pull_data = await pull_res.json();
            await merge_local_into_account({
                server_cards: pull_data.own_cards || [],
                server_progress: pull_data.progress || [],
                server_settings: pull_data.settings || null,
                server_version: pull_data.version || 0,
                username: user_data.username
            });
        } else {
            await set_meta("mode", "account");
            await set_meta("username", user_data.username);
        }
    } else {
        await set_meta("mode", "account");
        await set_meta("username", user_data.username);
    }

    await sync_now(on_update);
    return user_data;
}

export async function perform_account_logout(on_update = null) {
    try {
        await fetch("/api/logout", { method: "POST" });
    } catch (_) {}

    await set_meta("mode", "local");
    await set_meta("username", null);
    await update_sync_status_ui();

    if (on_update) {
        await on_update();
    }
}