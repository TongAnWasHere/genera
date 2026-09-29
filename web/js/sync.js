import {
    get_meta,
    set_meta,
    get_catalog_card,
    get_own_card,
    get_dirty_own_cards,
    get_dirty_progress_rows,
    get_dirty_settings,
    count_dirty_rows,
    apply_sync_batch,
    merge_local_into_account,
    load_catalog_if_needed
} from "./localdb.js";

let is_syncing = false;

export function set_sync_status(text, color_class) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.className = `status-pill ${color_class} account-btn`;
    const text_el = document.getElementById("account-pill-text");
    if (text_el) {
        text_el.textContent = text;
    } else {
        el.textContent = text;
    }
}

export async function update_sync_status_ui() {
    const mode = await get_meta("mode");
    const username = await get_meta("username");

    if (!navigator.onLine) {
        const offline_label = mode === "account" && username ? `${username} (offline)` : "Offline";
        set_sync_status(offline_label, "status-gray");
        return;
    }

    if (mode !== "account") {
        set_sync_status("Local mode (not backed up)", "status-gray");
        return;
    }

    const dirty_count = await count_dirty_rows();
    if (dirty_count > 0) {
        set_sync_status(`${username || "Account"} (${dirty_count} unsynced)`, "status-blue");
    } else {
        set_sync_status(username || "Account", "status-green");
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

export async function show_conflict_banner(conflicts) {
    if (!conflicts || conflicts.length === 0) {
        return;
    }

    const banner = document.getElementById("conflict-banner");
    const message_el = document.getElementById("conflict-banner-message");
    const dismiss_btn = document.getElementById("btn-dismiss-conflict");
    if (!banner || !message_el) {
        return;
    }

    const names = [];
    for (const c of conflicts) {
        if (c.type === "card") {
            names.push(c.question ? `Card "${c.question}"` : `Card ${c.id}`);
        } else if (c.type === "progress") {
            let q = "";
            try {
                if (c.card_kind === "catalog") {
                    const card = await get_catalog_card(c.card_id);
                    if (card) q = card.question;
                } else if (c.card_kind === "own") {
                    const card = await get_own_card(c.card_id);
                    if (card) q = card.question;
                }
            } catch (_) {}
            names.push(q ? `Progress for "${q}"` : `Progress for card ${c.card_id}`);
        } else if (c.type === "settings") {
            names.push("Study settings");
        }
    }

    const unique_names = [...new Set(names)];
    if (unique_names.length === 0) {
        return;
    }

    const text = unique_names.length === 1
        ? `Sync conflict: A newer version from the server replaced your local changes to ${unique_names[0]}.`
        : `Sync conflict: Newer versions from the server replaced your local changes to: ${unique_names.join(", ")}.`;

    message_el.textContent = text;
    banner.style.display = "flex";

    if (dismiss_btn) {
        dismiss_btn.onclick = () => {
            banner.style.display = "none";
        };
    }
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
    const all_conflicts = [];

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

            const batch_result = await apply_sync_batch({
                server_cards,
                server_progress,
                server_settings,
                pushed_cards: batch_cards,
                pushed_progress: batch_progress,
                pushed_settings: batch_settings,
                server_version
            });

            if (batch_result && batch_result.conflicts && batch_result.conflicts.length > 0) {
                all_conflicts.push(...batch_result.conflicts);
            }

            total_applied += server_cards.length + server_progress.length + (server_settings ? 1 : 0);

            const remaining_dirty = await count_dirty_rows();
            has_more = data.has_more === true || remaining_dirty > 0;
        }

        if (all_conflicts.length > 0) {
            await show_conflict_banner(all_conflicts);
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
    window.addEventListener("online", async () => {
        const cat_result = await load_catalog_if_needed();
        if (cat_result && cat_result.downloaded && on_update) {
            await on_update();
        }
        await sync_now(on_update);
    });

    window.addEventListener("offline", () => {
        set_sync_status("Offline", "status-gray");
    });



    const dismiss_btn = document.getElementById("btn-dismiss-conflict");
    const banner = document.getElementById("conflict-banner");
    if (dismiss_btn && banner) {
        dismiss_btn.addEventListener("click", () => {
            banner.style.display = "none";
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