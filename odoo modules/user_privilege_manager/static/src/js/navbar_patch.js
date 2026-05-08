/** @odoo-module **/
/**
 * Navbar patch — hides special client-side menus (Apps, Discuss, etc.)
 * for restricted users based on their special.menu.privilege records.
 */
import { patch } from "@web/core/utils/patch";
import { NavBar } from "@web/webclient/navbar/navbar";
import { useService } from "@web/core/utils/hooks";
import { onWillStart, onMounted } from "@odoo/owl";
import { session } from "@web/session";

let _hiddenMenusPromise = null;

function _getHiddenMenusPromise(orm) {
    if (_hiddenMenusPromise) return _hiddenMenusPromise;
    if (!session.uid || session.uid <= 2) {
        _hiddenMenusPromise = Promise.resolve([]);
        return _hiddenMenusPromise;
    }
    _hiddenMenusPromise = orm.call(
        "special.menu.privilege", "get_hidden_special_menus", []
    ).then(h => h || []).catch(() => []);
    return _hiddenMenusPromise;
}

function _injectCSS(id, css) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = css;
}

function _hideAppsMenu() {
    const hideAll = () => {
        // Match ANY element whose full trimmed text is exactly "Apps"
        // This catches the item regardless of CSS class or container
        document.querySelectorAll(
            'a, button, li, [role="menuitem"], [role="option"], .o_nav_entry, .o_menu_item'
        ).forEach(el => {
            const txt = (el.textContent || "").trim();
            if (txt === "Apps") {
                el.style.setProperty("display", "none", "important");
            }
        });

        _injectCSS("priv-hide-apps", `
            .o_navbar_apps_menu { display: none !important; }
            .o_menu_toggle { display: none !important; }
            [title="Home Menu"] { display: none !important; }
        `);
    };

    hideAll();
    [50, 200, 500, 1000, 2000].forEach(ms => setTimeout(hideAll, ms));

    if (typeof MutationObserver !== "undefined") {
        let debounce;
        const observer = new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(hideAll, 20);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 600000);
    }
}

patch(NavBar.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this._hiddenSpecialMenus = [];

        onWillStart(async () => {
            if (!session.uid || session.uid <= 2) return;
            try {
                this._hiddenSpecialMenus = await _getHiddenMenusPromise(this.orm);
            } catch (e) { /* never break navbar */ }
        });

        onMounted(() => {
            const hidden = this._hiddenSpecialMenus;
            if (!hidden || !hidden.length) return;

            if (hidden.includes("apps")) {
                _hideAppsMenu();
            }
            if (hidden.includes("discuss")) {
                _injectCSS("priv-hide-discuss",
                    `.o_discuss_icon, .o_MessagingMenu { display:none!important; }`);
            }
            if (hidden.includes("dashboards")) {
                _injectCSS("priv-hide-dashboards",
                    `.o_nav_entry[data-action*="dashboard"] { display:none!important; }`);
            }
        });
    },
});
