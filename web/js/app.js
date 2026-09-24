import { count_store, load_catalog_if_needed } from "./localdb.js";

const tabs = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");

tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => (p.hidden = true));

        btn.classList.add("active");
        const panel = document.getElementById(`tab-${btn.dataset.tab}`);
        if (panel) panel.hidden = false;
    });
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}

async function init_app() {
    try {
        const result = await load_catalog_if_needed();
        const total_el = document.querySelector(".total-count");
        const unseen_el = document.querySelector(".unseen-count");
        if (total_el) total_el.textContent = result.count;
        if (unseen_el) unseen_el.textContent = result.count;
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

init_app();