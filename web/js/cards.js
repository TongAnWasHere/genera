import {
    add_own_card,
    update_own_card,
    delete_own_card,
    get_all_own_cards,
    get_all_catalog_cards,
    get_all_progress_rows,
    get_all_categories,
    set_card_hidden
} from "./localdb.js";

let current_filter = "all";
let current_category = "all";
let current_search = "";
let current_page = 1;
const page_size = 50;

export function create_card_element(card, is_official, is_hidden, on_change) {
    const row = document.createElement("div");
    row.className = "card-row";
    row.dataset.id = card.id;

    const content_div = document.createElement("div");
    content_div.className = "card-content";

    const badge_row = document.createElement("div");
    badge_row.className = "badge-row";

    const cat_badge = document.createElement("span");
    cat_badge.className = "badge";
    cat_badge.textContent = card.category;
    badge_row.appendChild(cat_badge);

    if (is_official) {
        const source_badge = document.createElement("span");
        source_badge.className = "badge badge-official";
        source_badge.textContent = "Official";
        badge_row.appendChild(source_badge);
    } else {
        const source_badge = document.createElement("span");
        source_badge.className = "badge badge-mine";
        source_badge.textContent = "Mine";
        badge_row.appendChild(source_badge);
    }

    if (is_hidden) {
        const hidden_badge = document.createElement("span");
        hidden_badge.className = "badge badge-hidden";
        hidden_badge.textContent = "Hidden";
        badge_row.appendChild(hidden_badge);
    }

    const q_el = document.createElement("div");
    q_el.className = "card-question";
    q_el.textContent = card.question;

    const a_el = document.createElement("div");
    a_el.className = "card-answer";
    a_el.textContent = card.answer;

    content_div.appendChild(badge_row);
    content_div.appendChild(q_el);
    content_div.appendChild(a_el);
    row.appendChild(content_div);

    const actions_div = document.createElement("div");
    actions_div.className = "card-actions";

    if (is_official) {
        const hide_btn = document.createElement("button");
        hide_btn.className = "btn btn-sm";
        hide_btn.textContent = is_hidden ? "Unhide" : "Hide";
        hide_btn.addEventListener("click", async () => {
            await set_card_hidden("catalog", card.id, !is_hidden);
            if (on_change) on_change();
        });
        actions_div.appendChild(hide_btn);
    } else {
        if (is_hidden) {
            const unhide_btn = document.createElement("button");
            unhide_btn.className = "btn btn-sm";
            unhide_btn.textContent = "Unhide";
            unhide_btn.addEventListener("click", async () => {
                await set_card_hidden("own", card.id, false);
                if (on_change) on_change();
            });
            actions_div.appendChild(unhide_btn);
        }

        const edit_btn = document.createElement("button");
        edit_btn.className = "btn btn-sm";
        edit_btn.textContent = "Edit";
        edit_btn.addEventListener("click", () => {
            open_edit_modal(card, on_change);
        });

        const delete_btn = document.createElement("button");
        delete_btn.className = "btn btn-sm btn-danger";
        delete_btn.textContent = "Delete";
        delete_btn.addEventListener("click", async () => {
            if (confirm("Delete this card?")) {
                await delete_own_card(card.id);
                if (on_change) on_change();
            }
        });

        actions_div.appendChild(edit_btn);
        actions_div.appendChild(delete_btn);
    }

    row.appendChild(actions_div);
    return row;
}

export function open_add_modal(on_saved) {
    const modal = document.getElementById("card-modal");
    const title = document.getElementById("modal-title");
    const edit_id = document.getElementById("card-edit-id");
    const q_input = document.getElementById("card-question-input");
    const a_input = document.getElementById("card-answer-input");
    const c_input = document.getElementById("card-category-input");

    title.textContent = "Add Card";
    edit_id.value = "";
    q_input.value = "";
    a_input.value = "";
    c_input.value = "";

    modal.showModal();

    const form = document.getElementById("card-form");
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await add_own_card(q_input.value, a_input.value, c_input.value);
            modal.close();
            if (on_saved) on_saved();
        } catch (err) {
            alert(err.message);
        }
    };
}

export function open_edit_modal(card, on_saved) {
    const modal = document.getElementById("card-modal");
    const title = document.getElementById("modal-title");
    const edit_id = document.getElementById("card-edit-id");
    const q_input = document.getElementById("card-question-input");
    const a_input = document.getElementById("card-answer-input");
    const c_input = document.getElementById("card-category-input");

    title.textContent = "Edit Card";
    edit_id.value = card.id;
    q_input.value = card.question;
    a_input.value = card.answer;
    c_input.value = card.category;

    modal.showModal();

    const form = document.getElementById("card-form");
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await update_own_card(card.id, q_input.value, a_input.value, c_input.value);
            modal.close();
            if (on_saved) on_saved();
        } catch (err) {
            alert(err.message);
        }
    };
}

export async function populate_category_dropdown() {
    const select = document.getElementById("cards-category-select");
    if (!select) return;

    const previous_val = select.value;
    const categories = await get_all_categories();

    select.innerHTML = '<option value="all">All Categories</option>';
    for (const cat of categories) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    }

    if (categories.includes(previous_val)) {
        select.value = previous_val;
    } else {
        select.value = "all";
        current_category = "all";
    }
}

export async function fetch_filtered_cards() {
    const catalog_cards = await get_all_catalog_cards();
    const own_cards = await get_all_own_cards(false);
    const progress_rows = await get_all_progress_rows();

    const hidden_set = new Set();
    for (const p of progress_rows) {
        if (p.hidden === 1) {
            hidden_set.add(`${p.card_kind}:${p.card_id}`);
        }
    }

    const merged = [];

    for (const c of catalog_cards) {
        const is_hidden = hidden_set.has(`catalog:${c.id}`);
        merged.push({
            id: c.id,
            question: c.question,
            answer: c.answer,
            category: c.category,
            is_official: true,
            is_hidden: is_hidden
        });
    }

    for (const c of own_cards) {
        const is_hidden = hidden_set.has(`own:${c.id}`);
        merged.push({
            id: c.id,
            question: c.question,
            answer: c.answer,
            category: c.category,
            is_official: false,
            is_hidden: is_hidden
        });
    }

    const filtered = merged.filter((item) => {
        if (current_filter === "all" && item.is_hidden) {
            return false;
        }
        if (current_filter === "official" && (!item.is_official || item.is_hidden)) {
            return false;
        }
        if (current_filter === "mine" && item.is_official) {
            return false;
        }
        if (current_filter === "hidden" && !item.is_hidden) {
            return false;
        }

        if (current_category !== "all" && item.category !== current_category) {
            return false;
        }

        if (current_search) {
            const query = current_search.toLowerCase();
            const matches_q = item.question.toLowerCase().includes(query);
            const matches_a = item.answer.toLowerCase().includes(query);
            if (!matches_q && !matches_a) {
                return false;
            }
        }

        return true;
    });

    return filtered;
}

export async function render_cards_view(on_change) {
    const container = document.getElementById("cards-container");
    const count_bar = document.getElementById("cards-count-bar");
    const pagination_bar = document.getElementById("cards-pagination");
    if (!container) return;

    const cards = await fetch_filtered_cards();
    container.innerHTML = "";
    if (pagination_bar) pagination_bar.innerHTML = "";

    if (cards.length === 0) {
        if (count_bar) count_bar.textContent = "";
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No cards match the selected filter.";
        container.appendChild(empty);
        return;
    }

    const total_matching = cards.length;
    const visible_count = Math.min(current_page * page_size, total_matching);
    const visible_slice = cards.slice(0, visible_count);

    if (count_bar) {
        count_bar.textContent = `Showing ${visible_count} of ${total_matching} cards`;
    }

    for (const card of visible_slice) {
        const el = create_card_element(card, card.is_official, card.is_hidden, async () => {
            await render_cards_view(on_change);
            if (on_change) on_change();
        });
        container.appendChild(el);
    }

    if (visible_count < total_matching && pagination_bar) {
        const load_more_btn = document.createElement("button");
        load_more_btn.className = "btn";
        load_more_btn.textContent = "Load More";
        load_more_btn.addEventListener("click", () => {
            current_page += 1;
            render_cards_view(on_change);
        });
        pagination_bar.appendChild(load_more_btn);
    }
}

export function setup_cards_listeners(on_change) {
    const search_input = document.getElementById("cards-search-input");
    if (search_input) {
        search_input.addEventListener("input", (e) => {
            current_search = e.target.value.trim();
            current_page = 1;
            render_cards_view(on_change);
        });
    }

    const filter_buttons = document.querySelectorAll(".filter-btn");
    filter_buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            filter_buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            current_filter = btn.dataset.filter;
            current_page = 1;
            render_cards_view(on_change);
        });
    });

    const category_select = document.getElementById("cards-category-select");
    if (category_select) {
        category_select.addEventListener("change", (e) => {
            current_category = e.target.value;
            current_page = 1;
            render_cards_view(on_change);
        });
    }
}