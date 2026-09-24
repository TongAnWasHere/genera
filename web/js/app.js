import { count_store, get_all_own_cards, load_catalog_if_needed } from "./localdb.js";
import { open_add_modal, populate_category_dropdown, render_cards_view, setup_cards_listeners } from "./cards.js";
import { process_import_file } from "./importer.js";

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
        const catalog_count = await count_store("catalog");
        const own_cards = await get_all_own_cards(false);
        const total = catalog_count + own_cards.length;

        const total_el = document.querySelector(".total-count");
        const unseen_el = document.querySelector(".unseen-count");
        if (total_el) total_el.textContent = total;
        if (unseen_el) unseen_el.textContent = total;
    } catch (err) {
        console.error("Failed to update dashboard stats:", err);
    }
}

async function init_app() {
    try {
        setup_cards_listeners(update_dashboard_stats);
        await load_catalog_if_needed();
        await update_dashboard_stats();
        await refresh_cards_view();
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

init_app();