export function get_saved_theme_choice() {
    return localStorage.getItem("genera_theme") || "system";
}

export function get_effective_theme(choice) {
    if (choice === "dark" || choice === "light") {
        return choice;
    }
    const prefers_dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefers_dark ? "dark" : "light";
}

export function apply_theme(choice) {
    const effective = get_effective_theme(choice);
    document.documentElement.setAttribute("data-theme", effective);

    if (choice === "system") {
        localStorage.removeItem("genera_theme");
    } else {
        localStorage.setItem("genera_theme", choice);
    }

    update_theme_ui(choice, effective);
}

export function update_theme_ui(choice, effective) {
    const toggle_btn = document.getElementById("btn-theme-toggle");
    if (toggle_btn) {
        const is_dark = effective === "dark";
        toggle_btn.textContent = is_dark ? "\u2600" : "\u263D";
        toggle_btn.setAttribute("aria-label", is_dark ? "Switch to light mode" : "Switch to dark mode");
        toggle_btn.title = is_dark ? "Switch to light mode" : "Switch to dark mode";
    }

    const badge = document.getElementById("settings-theme-badge");
    if (badge) {
        if (choice === "system") {
            badge.textContent = `System (${effective === "dark" ? "Dark" : "Light"})`;
        } else {
            badge.textContent = choice === "dark" ? "Dark" : "Light";
        }
    }

    const btn_light = document.getElementById("btn-theme-light");
    const btn_dark = document.getElementById("btn-theme-dark");
    const btn_system = document.getElementById("btn-theme-system");

    if (btn_light) btn_light.classList.toggle("active", choice === "light");
    if (btn_dark) btn_dark.classList.toggle("active", choice === "dark");
    if (btn_system) btn_system.classList.toggle("active", choice === "system");
}

export function init_theme() {
    const choice = get_saved_theme_choice();
    apply_theme(choice);

    const toggle_btn = document.getElementById("btn-theme-toggle");
    if (toggle_btn) {
        toggle_btn.addEventListener("click", () => {
            const current_effective = document.documentElement.getAttribute("data-theme") || "light";
            const new_choice = current_effective === "dark" ? "light" : "dark";
            apply_theme(new_choice);
        });
    }

    const btn_light = document.getElementById("btn-theme-light");
    if (btn_light) {
        btn_light.addEventListener("click", () => apply_theme("light"));
    }

    const btn_dark = document.getElementById("btn-theme-dark");
    if (btn_dark) {
        btn_dark.addEventListener("click", () => apply_theme("dark"));
    }

    const btn_system = document.getElementById("btn-theme-system");
    if (btn_system) {
        btn_system.addEventListener("click", () => apply_theme("system"));
    }

    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (get_saved_theme_choice() === "system") {
                apply_theme("system");
            }
        });
    }
}