import { count_store, get_all_own_cards, load_catalog_if_needed } from "./localdb.js";
import { open_add_modal, render_own_cards_list } from "./cards.js";

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
        open_add_modal(() => {
            refresh_cards_view();
            update_dashboard_stats();
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

async function refresh_cards_view() {
    const container = document.getElementById("cards-container");
    if (container) {
        await render_own_cards_list(container, () => {
            refresh_cards_view();
            update_dashboard_stats();
        });
    }
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
        await load_catalog_if_needed();
        await update_dashboard_stats();
        await refresh_cards_view();
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

init_app();