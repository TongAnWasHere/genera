import {
    get_user_settings,
    save_user_settings,
    get_all_categories,
    get_meta,
    count_dirty_rows
} from "./localdb.js";
import {
    perform_account_login,
    perform_account_logout,
    sync_now
} from "./sync.js";

let on_change_callback = null;
let current_auth_mode = "login";

export function init_settings_view(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
    setup_account_listeners();
    setup_account_dropdown();
    render_settings_view();
}

export async function render_settings_view() {
    const limit_input = document.getElementById("setting-daily-limit");
    const categories_container = document.getElementById("settings-categories-list");
    if (!limit_input || !categories_container) return;

    const settings = await get_user_settings();
    const categories = await get_all_categories();

    limit_input.value = settings.daily_new_limit ?? 10;

    categories_container.innerHTML = "";
    const enabled_set = new Set(settings.enabled_categories || []);
    const is_all_enabled = enabled_set.size === 0;

    for (const cat of categories) {
        const item_label = document.createElement("label");
        item_label.className = "settings-category-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "setting-category-cb";
        checkbox.value = cat;
        checkbox.checked = is_all_enabled || enabled_set.has(cat);

        const span = document.createElement("span");
        span.textContent = cat;

        item_label.appendChild(checkbox);
        item_label.appendChild(span);
        categories_container.appendChild(item_label);
    }

    await render_account_section();
}

export async function render_account_section() {
    const badge = document.getElementById("account-status-badge");
    const text = document.getElementById("account-status-text");
    const login_btn = document.getElementById("btn-open-login");
    const register_btn = document.getElementById("btn-open-register");
    const sync_btn = document.getElementById("btn-account-sync");
    const logout_btn = document.getElementById("btn-account-logout");
    const dropdown_user = document.getElementById("dropdown-username");

    if (!badge || !text) return;

    const mode = await get_meta("mode");
    const username = await get_meta("username");

    if (mode === "account") {
        if (dropdown_user) dropdown_user.textContent = username || "Account";

        if (!navigator.onLine) {
            badge.textContent = "Offline";
            badge.className = "badge";
            text.textContent = `Logged in as ${username || "user"}. You are currently offline.`;
        } else {
            const dirty_count = await count_dirty_rows();
            if (dirty_count > 0) {
                badge.textContent = `${dirty_count} unsynced`;
                badge.className = "badge badge-mine";
                text.textContent = `Logged in as ${username || "user"}. ${dirty_count} local change(s) pending sync.`;
            } else {
                badge.textContent = "Synced";
                badge.className = "badge badge-official";
                text.textContent = `Logged in as ${username || "user"}. Syncing enabled across your devices.`;
            }
        }

        if (login_btn) login_btn.style.display = "none";
        if (register_btn) register_btn.style.display = "none";
        if (sync_btn) sync_btn.style.display = "inline-block";
        if (logout_btn) logout_btn.style.display = "inline-block";
    } else {
        if (dropdown_user) dropdown_user.textContent = "Local Mode";
        badge.textContent = "Local";
        badge.className = "badge";
        text.textContent = "Using local storage. Your cards and study progress are stored only on this browser.";

        if (login_btn) login_btn.style.display = "inline-block";
        if (register_btn) register_btn.style.display = "inline-block";
        if (sync_btn) sync_btn.style.display = "none";
        if (logout_btn) logout_btn.style.display = "none";
    }
}

function setup_settings_listeners() {
    const form = document.getElementById("settings-form");
    const select_all_btn = document.getElementById("btn-select-all-categories");
    const deselect_all_btn = document.getElementById("btn-deselect-all-categories");
    const saved_msg = document.getElementById("settings-saved-msg");

    if (select_all_btn) {
        select_all_btn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(".setting-category-cb");
            checkboxes.forEach((cb) => (cb.checked = true));
        });
    }

    if (deselect_all_btn) {
        deselect_all_btn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(".setting-category-cb");
            checkboxes.forEach((cb) => (cb.checked = false));
        });
    }

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const limit_input = document.getElementById("setting-daily-limit");
            const raw_limit = parseInt(limit_input.value, 10);
            if (isNaN(raw_limit) || raw_limit < 0 || raw_limit > 100) {
                alert("Daily new official cards limit must be an integer between 0 and 100.");
                return;
            }

            const checkboxes = document.querySelectorAll(".setting-category-cb");
            const checked_cats = [];
            checkboxes.forEach((cb) => {
                if (cb.checked) {
                    checked_cats.push(cb.value);
                }
            });

            if (checked_cats.length === 0) {
                alert("Please enable at least one category.");
                return;
            }

            const total_cats = checkboxes.length;
            const enabled_categories = checked_cats.length === total_cats ? [] : checked_cats;

            try {
                await save_user_settings({
                    daily_new_limit: raw_limit,
                    enabled_categories: enabled_categories
                });

                if (saved_msg) {
                    saved_msg.style.display = "inline-block";
                    setTimeout(() => {
                        saved_msg.style.display = "none";
                    }, 2000);
                }

                if (on_change_callback) {
                    on_change_callback();
                }
            } catch (err) {
                alert("Failed to save settings: " + err.message);
            }
        });
    }
}

function setup_account_listeners() {
    const auth_modal = document.getElementById("auth-modal");
    const auth_form = document.getElementById("auth-form");
    const auth_title = document.getElementById("auth-modal-title");
    const auth_error = document.getElementById("auth-error-msg");
    const auth_user_input = document.getElementById("auth-username-input");
    const auth_pass_input = document.getElementById("auth-password-input");
    const auth_toggle_btn = document.getElementById("auth-toggle-mode-btn");
    const auth_cancel_btn = document.getElementById("auth-cancel-btn");
    const auth_submit_btn = document.getElementById("auth-submit-btn");

    const open_login_btn = document.getElementById("btn-open-login");
    const open_register_btn = document.getElementById("btn-open-register");
    const sync_btn = document.getElementById("btn-account-sync");
    const logout_btn = document.getElementById("btn-account-logout");

    function open_modal(mode) {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");

        current_auth_mode = mode;
        if (auth_error) {
            auth_error.style.display = "none";
            auth_error.textContent = "";
        }
        if (auth_user_input) auth_user_input.value = "";
        if (auth_pass_input) auth_pass_input.value = "";

        if (mode === "login") {
            if (auth_title) auth_title.textContent = "Log In";
            if (auth_submit_btn) auth_submit_btn.textContent = "Log In";
            if (auth_toggle_btn) auth_toggle_btn.textContent = "Need an account? Register";
        } else {
            if (auth_title) auth_title.textContent = "Create Account";
            if (auth_submit_btn) auth_submit_btn.textContent = "Register";
            if (auth_toggle_btn) auth_toggle_btn.textContent = "Already have an account? Log In";
        }

        if (auth_modal) auth_modal.showModal();
    }

    if (open_login_btn) {
        open_login_btn.addEventListener("click", () => open_modal("login"));
    }

    if (open_register_btn) {
        open_register_btn.addEventListener("click", () => open_modal("register"));
    }

    if (auth_toggle_btn) {
        auth_toggle_btn.addEventListener("click", () => {
            const next_mode = current_auth_mode === "login" ? "register" : "login";
            open_modal(next_mode);
        });
    }

    if (auth_cancel_btn && auth_modal) {
        auth_cancel_btn.addEventListener("click", () => {
            auth_modal.close();
        });
    }

    if (sync_btn) {
        sync_btn.addEventListener("click", async () => {
            sync_btn.disabled = true;
            sync_btn.textContent = "Syncing...";
            try {
                await sync_now(on_change_callback);
            } finally {
                sync_btn.disabled = false;
                sync_btn.textContent = "Sync Now";
            }
        });
    }

    if (logout_btn) {
        logout_btn.addEventListener("click", async () => {
            if (confirm("Log out of your account? This device will return to local mode.")) {
                await perform_account_logout(on_change_callback);
                await render_account_section();
            }
        });
    }

    if (auth_form) {
        auth_form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const username = auth_user_input.value.trim();
            const password = auth_pass_input.value;

            if (auth_submit_btn) {
                auth_submit_btn.disabled = true;
                auth_submit_btn.textContent = "Connecting...";
            }

            try {
                await perform_account_login({
                    username: username,
                    password: password,
                    is_register: current_auth_mode === "register",
                    on_update: on_change_callback
                });

                if (auth_modal) auth_modal.close();
                await render_account_section();
                if (on_change_callback) {
                    await on_change_callback();
                }
            } catch (err) {
                if (auth_error) {
                    auth_error.textContent = err.message;
                    auth_error.style.display = "block";
                }
            } finally {
                if (auth_submit_btn) {
                    auth_submit_btn.disabled = false;
                    auth_submit_btn.textContent = current_auth_mode === "login" ? "Log In" : "Register";
                }
            }
        });
    }
}

export function setup_account_dropdown() {
    const container = document.getElementById("account-menu-container");
    const btn = document.getElementById("sync-status");
    const dropdown = document.getElementById("account-dropdown");
    if (!container || !btn || !dropdown) return;

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const is_open = container.classList.toggle("open");
        btn.setAttribute("aria-expanded", is_open ? "true" : "false");
    });

    const close_dropdown = () => {
        container.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
    };

    document.addEventListener("click", (e) => {
        if (!container.contains(e.target)) {
            close_dropdown();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && container.classList.contains("open")) {
            close_dropdown();
            btn.focus();
        }
    });

    const action_btns = dropdown.querySelectorAll("button");
    action_btns.forEach((b) => {
        b.addEventListener("click", () => {
            close_dropdown();
        });
    });
}