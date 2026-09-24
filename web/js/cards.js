import {
    add_own_card,
    update_own_card,
    delete_own_card,
    get_all_own_cards,
    set_card_hidden,
    is_card_hidden
} from "./localdb.js";

export function create_card_element(card, is_official, is_hidden, on_change) {
    const row = document.createElement("div");
    row.className = "card-row";
    row.dataset.id = card.id;

    const content_div = document.createElement("div");
    content_div.className = "card-content";

    const cat_badge = document.createElement("span");
    cat_badge.className = "badge";
    cat_badge.textContent = card.category;

    const q_el = document.createElement("div");
    q_el.className = "card-question";
    q_el.textContent = card.question;

    const a_el = document.createElement("div");
    a_el.className = "card-answer";
    a_el.textContent = card.answer;

    content_div.appendChild(cat_badge);
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

export async function render_own_cards_list(container, on_change) {
    container.innerHTML = "";
    const cards = await get_all_own_cards(false);

    if (cards.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No own cards yet. Click '+ Add Card' to create one.";
        container.appendChild(empty);
        return;
    }

    for (const card of cards) {
        const el = create_card_element(card, false, false, on_change);
        container.appendChild(el);
    }
}