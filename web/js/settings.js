import {
    get_user_settings,
    save_user_settings,
    get_all_categories
} from "./localdb.js";

let on_change_callback = null;

export function init_settings_view(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
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