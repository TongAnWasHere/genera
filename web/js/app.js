import {
    count_store,
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_today_date,
    get_user_settings,
    load_catalog_if_needed
} from "./localdb.js";
import { open_add_modal, populate_category_dropdown, render_cards_view, setup_cards_listeners } from "./cards.js";
import { process_import_file } from "./importer.js";
import { init_review_view, render_review_view } from "./review.js";
import { init_settings_view, render_settings_view } from "./settings.js";
import { count_session_cards } from "./session.js";

const tabs = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");

tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => (p.hidden = true));

        btn.classList.add("active");
        const panel = document.getElementById(`tab-${btn.dataset.tab}`);
        if (panel) {
            panel.hidden = false;
            if (btn.dataset.tab === "cards") {
                refresh_cards_view();
            } else if (btn.dataset.tab === "review") {
                render_review_view();
            } else if (btn.dataset.tab === "dashboard") {
                update_dashboard_stats();
            } else if (btn.dataset.tab === "settings") {
                render_settings_view();
            }
        }
    });
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}

const add_card_btn = document.getElementById("btn-add-card");
if (add_card_btn) {
    add_card_btn.addEventListener("click", () => {
        open_add_modal(async () => {
            await refresh_cards_view();
            await render_review_view();
            await update_dashboard_stats();
        });
    });
}

const modal_cancel_btn = document.getElementById("modal-cancel-btn");
if (modal_cancel_btn) {
    modal_cancel_btn.addEventListener("click", () => {
        const modal = document.getElementById("card-modal");
        if (modal) modal.close();
    });
}

const import_card_btn = document.getElementById("btn-import-card");
const import_file_input = document.getElementById("import-file-input");
const import_modal = document.getElementById("import-modal");
const import_modal_title = document.getElementById("import-modal-title");
const import_modal_summary = document.getElementById("import-modal-summary");
const import_modal_details = document.getElementById("import-modal-details");
const import_modal_close_btn = document.getElementById("import-modal-close-btn");

if (import_card_btn && import_file_input) {
    import_card_btn.addEventListener("click", () => {
        import_file_input.click();
    });
}

if (import_file_input) {
    import_file_input.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
            const result = await process_import_file(file);
            show_import_report(
                "Import Summary",
                `Imported ${result.imported_count} card(s). ${result.skipped_count} row(s) skipped.`,
                result.skipped_details
            );
            await refresh_cards_view();
            await render_review_view();
            await update_dashboard_stats();
        } catch (err) {
            show_import_report("Import Failed", err.message, []);
        } finally {
            import_file_input.value = "";
        }
    });
}

if (import_modal_close_btn && import_modal) {
    import_modal_close_btn.addEventListener("click", () => {
        import_modal.close();
    });
}

function show_import_report(title, summary, details) {
    if (!import_modal) return;
    import_modal_title.textContent = title;
    import_modal_summary.textContent = summary;
    if (details && details.length > 0) {
        import_modal_details.textContent = details.join("\n");
        import_modal_details.style.display = "block";
    } else {
        import_modal_details.textContent = "";
        import_modal_details.style.display = "none";
    }
    import_modal.showModal();
}

async function refresh_cards_view() {
    await populate_category_dropdown();
    await render_cards_view(update_dashboard_stats);
}

async function update_dashboard_stats() {
    try {
        const catalog_cards = await get_all_catalog_cards();
        const own_cards = await get_all_own_cards(false);
        const progress_rows = await get_all_progress_rows();
        const settings = await get_user_settings();
        const today = get_today_date();

        const counts = count_session_cards({
            catalog_cards,
            own_cards,
            progress_rows,
            settings,
            today
        });

        const due_el = document.querySelector(".due-count");
        const new_el = document.querySelector(".new-count");
        const total_el = document.querySelector(".total-count");
        const unseen_el = document.querySelector(".unseen-count");

        if (due_el) due_el.textContent = counts.due_count;
        if (new_el) new_el.textContent = counts.new_left_count;
        if (total_el) total_el.textContent = counts.total_visible;
        if (unseen_el) unseen_el.textContent = counts.unseen_count;

        const box_items = document.querySelectorAll(".box-item strong");
        if (box_items.length === 5) {
            for (let i = 1; i <= 5; i++) {
                box_items[i - 1].textContent = counts.box_counts[i] || 0;
            }
        }

        render_dashboard_message(counts);
    } catch (err) {
        console.error("Failed to update dashboard stats:", err);
    }
}

function render_dashboard_message(counts) {
    const container = document.getElementById("dashboard-message");
    if (!container) return;

    container.innerHTML = "";

    const active_ready_count = counts.due_count + counts.new_left_count + counts.unseen_own_count;

    if (counts.total_visible === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.textContent = "No cards available in your collection. Check back once catalog is loaded or add your own cards in the Cards tab.";
        empty.appendChild(p);
        container.appendChild(empty);
    } else if (active_ready_count === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.textContent = "You're all caught up for today! No cards are due for review.";
        empty.appendChild(p);
        container.appendChild(empty);
    } else {
        const action_card = document.createElement("div");
        action_card.className = "dashboard-action-card";

        const p = document.createElement("p");
        p.textContent = `${counts.due_count} card(s) due, ${counts.new_left_count + counts.unseen_own_count} new card(s) ready for study today.`;

        const btn = document.createElement("button");
        btn.id = "btn-dashboard-start-review";
        btn.className = "btn btn-primary";
        btn.textContent = "Start Review";
        btn.addEventListener("click", () => {
            const review_tab_btn = document.querySelector('.tab-btn[data-tab="review"]');
            if (review_tab_btn) {
                review_tab_btn.click();
            }
        });

        action_card.appendChild(p);
        action_card.appendChild(btn);
        container.appendChild(action_card);
    }
}

async function init_app() {
    try {
        setup_cards_listeners(update_dashboard_stats);
        init_review_view(update_dashboard_stats);
        init_settings_view(async () => {
            await render_review_view();
            await update_dashboard_stats();
        });
        await load_catalog_if_needed();
        await update_dashboard_stats();
        await refresh_cards_view();
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

init_app();