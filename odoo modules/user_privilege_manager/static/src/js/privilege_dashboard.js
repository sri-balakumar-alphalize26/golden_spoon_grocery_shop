/** @odoo-module **/

// Special menus in Odoo 19 that are client-side rendered (NOT in ir.ui.menu)
const SPECIAL_MENUS = [
    { id: "__special_apps__",      key: "apps",       name: "Apps",       special: true },
    { id: "__special_home__",      key: "home",       name: "Home",       special: true },
    { id: "__special_discuss__",   key: "discuss",    name: "Discuss",    special: true },
    { id: "__special_dashboards__",key: "dashboards", name: "Dashboards", special: true },
];

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useState, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";

class PrivilegeDashboard extends Component {
    static template = "user_privilege_manager.PrivilegeDashboard";

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");

        this.state = useState({
            isAdmin: true,
            activeTab: "users",
            allUsers: [], selectedUserId: null, selectedUserName: "", selectedUserLogin: "",
            searchUser: "", installedModules: [], allMenus: [],
            modules: [], userRoles: [], loading: false,
            expandedModules: {}, expandedUserRoles: {}, showAddModule: false, moduleSearch: "",
            // Hide Menu (user)
            menuPrivileges: [], specialMenuPrivileges: [], showAddMenu: false, menuSearch: "",
            // Hide Module/App (user)
            moduleVisibility: [], showAddModuleVis: false, moduleVisSearch: "",
            // Groups tab
            roles: [], selectedRoleId: null, selectedRoleName: "",
            searchRole: "", roleLines: [], roleModulePrivileges: [], roleMaster: {}, roleLoading: false,
            expandedRoleModules: {}, showAddRoleModulePriv: false, roleModulePrivSearch: "",
            // Group Hide Menu
            roleMenuVisibility: [], showAddRoleMenu: false, roleMenuSearch: "",
            // Group Hide Module
            roleModuleVisibility: [], showAddRoleModule: false, roleModuleSearch: "",
            // Collapsible sections (default collapsed)
            collapsedSections: { hiddenMenus: true, moduleMenus: true, manualMenus: true, specialMenus: true, moduleVis: true, roleMenus: true, roleModuleVis: true },
            // Pending changes tracking: key = "model:id", value = {field: newVal, ...}
            pendingChanges: {},
            pendingCount: 0,
            updating: false,
        });

        this._onClickOutside = this._onClickOutside.bind(this);

        onWillStart(async () => {
            await Promise.all([this._loadAllUsers(), this._loadRoles(), this._loadInstalledModules(), this._loadAllMenus()]);
            if (this.state.allUsers.length > 0) await this.onSelectUser(this.state.allUsers[0].id);
        });
        onMounted(() => { document.addEventListener("click", this._onClickOutside, true); });
        onWillUnmount(() => { document.removeEventListener("click", this._onClickOutside, true); });
    }

    // ══ PENDING CHANGES TRACKING ══
    _addPending(model, id, field, value) {
        const key = `${model}:${id}`;
        if (!this.state.pendingChanges[key]) {
            this.state.pendingChanges[key] = {};
        }
        this.state.pendingChanges[key][field] = value;
        // Force reactivity via a simple counter (deep object mutations may not trigger OWL re-render)
        this.state.pendingCount = Object.keys(this.state.pendingChanges).length;
    }

    _clearPending() {
        this.state.pendingChanges = {};
        this.state.pendingCount = 0;
    }

    _removePending(key) {
        delete this.state.pendingChanges[key];
        this.state.pendingCount = Object.keys(this.state.pendingChanges).length;
    }

    get hasPendingChanges() {
        return this.state.pendingCount > 0;
    }

    async onUpdatePrivileges() {
        this.state.updating = true;
        try {
            const changes = { ...this.state.pendingChanges };

            // Group by model
            const byModel = {};
            for (const [key, fields] of Object.entries(changes)) {
                const sep = key.indexOf(':');
                const model = key.substring(0, sep);
                const id = parseInt(key.substring(sep + 1));
                if (!byModel[model]) byModel[model] = [];
                byModel[model].push({ id, fields });
            }

            // Write order: parent models first so cascades happen, then children override
            const ORDER = [
                'privilege.role', 'module.privilege',
                'role.privilege.line', 'module.privilege.line',
                'menu.privilege', 'special.menu.privilege', 'module.visibility',
                'role.menu.visibility', 'role.module.visibility',
            ];

            for (const model of ORDER) {
                if (!byModel[model]) continue;
                for (const { id, fields } of byModel[model]) {
                    await this.orm.write(model, [id], fields);
                }
            }

            // Call action_apply_privileges for module privileges that had line changes
            if (byModel['module.privilege.line']) {
                const mpIds = new Set();
                for (const mp of this.state.modules) {
                    for (const line of (mp.lines || [])) {
                        if (byModel['module.privilege.line'].some(c => c.id === line.id)) {
                            mpIds.add(mp.id);
                        }
                    }
                }
                for (const mpId of mpIds) {
                    await this.orm.call("module.privilege", "action_apply_privileges", [[mpId]]);
                }
            }

            // Also apply for module.privilege master toggle changes
            if (byModel['module.privilege']) {
                for (const { id } of byModel['module.privilege']) {
                    await this.orm.call("module.privilege", "action_apply_privileges", [[id]]);
                }
            }

            // Sync Odoo groups when role privileges change (ensures dependent module access)
            if ((byModel['role.privilege.line'] || byModel['privilege.role']) && this.state.selectedRoleId) {
                await this.orm.call("privilege.role", "action_sync_groups_now", [[this.state.selectedRoleId]]);
            }

            this._clearPending();

            // Refresh data from server
            if (this.state.activeTab === 'users' && this.state.selectedUserId) {
                const [mps, menuPrivs, specialMenuPrivs, modVis] = await Promise.all([
                    this._fetchModulePrivileges(this.state.selectedUserId),
                    this._fetchMenuPrivileges(this.state.selectedUserId),
                    this._fetchSpecialMenuPrivileges(this.state.selectedUserId),
                    this._fetchModuleVisibility(this.state.selectedUserId),
                ]);
                this.state.modules = mps;
                this.state.menuPrivileges = menuPrivs;
                this.state.specialMenuPrivileges = specialMenuPrivs;
                this.state.moduleVisibility = modVis;
            } else if (this.state.activeTab === 'roles' && this.state.selectedRoleId) {
                await this._loadRoleLines(this.state.selectedRoleId);
            }

            this.notification.add("Privileges updated successfully.", { type: "success" });
        } catch (e) {
            this.notification.add("Error saving: " + (e.message || e), { type: "danger" });
        }
        this.state.updating = false;
    }

    async onDiscardChanges() {
        this._clearPending();
        // Re-fetch data to restore original values
        if (this.state.activeTab === 'users' && this.state.selectedUserId) {
            const [mps, menuPrivs, specialMenuPrivs, modVis] = await Promise.all([
                this._fetchModulePrivileges(this.state.selectedUserId),
                this._fetchMenuPrivileges(this.state.selectedUserId),
                this._fetchSpecialMenuPrivileges(this.state.selectedUserId),
                this._fetchModuleVisibility(this.state.selectedUserId),
            ]);
            this.state.modules = mps;
            this.state.menuPrivileges = menuPrivs;
            this.state.specialMenuPrivileges = specialMenuPrivs;
            this.state.moduleVisibility = modVis;
        } else if (this.state.activeTab === 'roles' && this.state.selectedRoleId) {
            await this._loadRoleLines(this.state.selectedRoleId);
        }
        this.notification.add("Changes discarded.", { type: "warning" });
    }

    _onClickOutside(ev) {
        const insideDropdown = ev.target.closest(".priv-dropdown");
        const insideBtn = ev.target.closest(".priv-add-btn, .priv-add-btn-sm");
        if (!insideDropdown && !insideBtn) {
            this.state.showAddModule = false;
            this.state.showAddMenu = false;
            this.state.showAddModuleVis = false;
            this.state.showAddRoleMenu = false;
            this.state.showAddRoleModule = false;
            this.state.showAddRoleModulePriv = false;
        }
    }

    async onSwitchTab(tab) {
        if (this.state.activeTab === tab) return;
        this._clearPending();
        this.state.activeTab = tab;
        if (tab === "users") {
            await this._loadAllUsers();
            if (this.state.selectedUserId) await this.onSelectUser(this.state.selectedUserId);
            else if (this.state.allUsers.length > 0) await this.onSelectUser(this.state.allUsers[0].id);
        } else if (tab === "roles") {
            await this._loadRoles();
            if (this.state.selectedRoleId) await this.onSelectRole(this.state.selectedRoleId);
            else if (this.state.roles.length > 0) await this.onSelectRole(this.state.roles[0].id);
        }
    }

    // ══ DATA LOADERS ══
    async _loadAllUsers() {
        this.state.allUsers = await this.orm.searchRead("res.users", [["share", "=", false]], ["id", "name", "login"], { order: "name" });
    }
    async _loadInstalledModules() {
        this.state.installedModules = await this.orm.searchRead("ir.module.module", [["state", "=", "installed"]], ["id", "name", "shortdesc"], { order: "shortdesc" });
        // Fetch root menu names from server (uses sudo to bypass access restrictions)
        // so modules can be found by their app icon label (e.g. base → "Apps")
        try {
            const moduleToMenuName = await this.orm.call("privilege.role", "get_module_menu_labels", []);
            for (const mod of this.state.installedModules) {
                mod.menu_label = moduleToMenuName[mod.name] || "";
            }
        } catch (e) { /* ignore */ }
    }
    async _loadAllMenus() {
        try {
            const menus = await this.orm.searchRead("ir.ui.menu", [], ["id", "name", "complete_name", "parent_id"], { order: "complete_name", limit: 2000 });
            menus.forEach(m => {
                if (m.name && typeof m.name === "object") {
                    m.name = m.name.en_US || Object.values(m.name)[0] || "";
                }
                if (m.complete_name && typeof m.complete_name === "object") {
                    m.complete_name = m.complete_name.en_US || Object.values(m.complete_name)[0] || "";
                }
                if (!m.complete_name) m.complete_name = m.name;
            });
            this.state.allMenus = menus;
        } catch (e) { this.state.allMenus = []; }
    }

    // ══ COMPUTED GETTERS ══
    get filteredUsers() {
        const s = this.state.searchUser.toLowerCase();
        return s ? this.state.allUsers.filter(u => u.name.toLowerCase().includes(s) || u.login.toLowerCase().includes(s)) : this.state.allUsers;
    }
    get filteredModules() {
        const used = this.state.modules.map(m => m.module_id[0]);
        let avail = this.state.installedModules.filter(m => !used.includes(m.id));
        const s = this.state.moduleSearch.toLowerCase();
        return s ? avail.filter(m => (m.shortdesc || "").toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || (m.menu_label || "").toLowerCase().includes(s)) : avail;
    }
    get filteredMenusForAdd() {
        const usedRegular = this.state.menuPrivileges.map(mp => mp.menu_id[0]);
        const usedSpecial = this.state.specialMenuPrivileges.map(sp => sp.menu_key);
        const specialAvail = SPECIAL_MENUS.filter(sm => !usedSpecial.includes(sm.key));
        let avail = this.state.allMenus.filter(m => !usedRegular.includes(m.id));
        const s = this.state.menuSearch.toLowerCase().trim();
        if (s) {
            avail = avail.filter(m => {
                const name = (m.name || "").toLowerCase();
                const full = (m.complete_name || m.name || "").toLowerCase();
                return name.includes(s) || full.includes(s);
            });
            avail.sort((a, b) => {
                const aExact = (a.name || "").toLowerCase() === s ? 0 : 1;
                const bExact = (b.name || "").toLowerCase() === s ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                const aRoot = !a.parent_id ? 0 : 1;
                const bRoot = !b.parent_id ? 0 : 1;
                return aRoot - bRoot;
            });
        } else {
            avail.sort((a, b) => {
                const aRoot = !a.parent_id ? 0 : 1;
                const bRoot = !b.parent_id ? 0 : 1;
                if (aRoot !== bRoot) return aRoot - bRoot;
                return (a.name || "").localeCompare(b.name || "");
            });
        }
        const filteredSpecial = s
            ? specialAvail.filter(sm => sm.name.toLowerCase().includes(s))
            : specialAvail;
        return [...filteredSpecial, ...avail.slice(0, 80)];
    }
    get filteredModulesForVisAdd() {
        const used = this.state.moduleVisibility.map(mv => mv.module_id[0]);
        let avail = this.state.installedModules.filter(m => !used.includes(m.id));
        const s = this.state.moduleVisSearch.toLowerCase();
        return s ? avail.filter(m => (m.shortdesc || "").toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || (m.menu_label || "").toLowerCase().includes(s)) : avail;
    }
    get filteredMenusForRoleAdd() {
        const used = this.state.roleMenuVisibility.map(m => m.menu_id[0]);
        let avail = this.state.allMenus.filter(m => !used.includes(m.id));
        const s = this.state.roleMenuSearch.toLowerCase().trim();
        if (s) {
            avail = avail.filter(m => {
                const name = (m.name || "").toLowerCase();
                const full = (m.complete_name || m.name || "").toLowerCase();
                return name.includes(s) || full.includes(s);
            });
            avail.sort((a, b) => {
                const aExact = (a.name || "").toLowerCase() === s ? 0 : 1;
                const bExact = (b.name || "").toLowerCase() === s ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                const aRoot = !a.parent_id ? 0 : 1;
                const bRoot = !b.parent_id ? 0 : 1;
                return aRoot - bRoot;
            });
        }
        return avail.slice(0, 80);
    }
    get filteredModulesForRoleVisAdd() {
        const used = this.state.roleModuleVisibility.map(m => m.module_id[0]);
        let avail = this.state.installedModules.filter(m => !used.includes(m.id));
        const s = this.state.roleModuleSearch.toLowerCase();
        return s ? avail.filter(m => (m.shortdesc || "").toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || (m.menu_label || "").toLowerCase().includes(s)) : avail;
    }
    get totalModels() { return this.state.modules.reduce((s, m) => s + (m.lines || []).length, 0); }
    get totalUserRoleModels() { return this.state.userRoles.reduce((s, r) => s + (r.lines || []).length, 0); }
    get totalRoleModels() { return this.state.roleLines.length; }
    get totalRoleModuleCount() { return this.state.roleModulePrivileges.filter(m => m.module_id > 0).length; }

    onSearchUser(ev) { this.state.searchUser = ev.target.value; }
    onSearchRole(ev) { this.state.searchRole = ev.target.value; }

    // ══ USER SELECTION ══
    async onSelectUser(userId) {
        this._clearPending();
        const user = this.state.allUsers.find(u => u.id === userId);
        this.state.selectedUserId = userId;
        this.state.selectedUserName = user ? user.name : "";
        this.state.selectedUserLogin = user ? user.login : "";
        this.state.loading = true;
        this.state.showAddModule = this.state.showAddMenu = this.state.showAddModuleVis = false;
        this._currentLoadId = userId;

        const [mps, userRoles, menuPrivs, specialMenuPrivs, modVis] = await Promise.all([
            this._fetchModulePrivileges(userId),
            this._fetchUserRoles(userId),
            this._fetchMenuPrivileges(userId),
            this._fetchSpecialMenuPrivileges(userId),
            this._fetchModuleVisibility(userId),
        ]);
        if (this._currentLoadId === userId) {
            this.state.modules = mps;
            this.state.userRoles = userRoles;
            this.state.menuPrivileges = menuPrivs;
            this.state.specialMenuPrivileges = specialMenuPrivs;
            this.state.moduleVisibility = modVis;
            this.state.loading = false;
        }
    }

    async _fetchUserRoles(userId) {
        try {
            const roles = await this.orm.searchRead("privilege.role", [["user_ids", "in", [userId]], ["active", "=", true]], ["id", "name", "line_ids"], { order: "name" });
            for (const r of roles) {
                r.lines = r.line_ids && r.line_ids.length > 0
                    ? await this.orm.searchRead("role.privilege.line", [["id", "in", r.line_ids]], ["id", "model_id", "model_name", "perm_read", "perm_create", "perm_write", "perm_cancel", "perm_unlink"], { order: "model_id" })
                    : [];
            }
            return roles;
        } catch (e) { return []; }
    }

    async _fetchModulePrivileges(userId) {
        const mps = await this.orm.searchRead("module.privilege", [["user_id", "=", userId], ["active", "=", true]],
            ["id", "module_id", "module_name", "module_shortdesc", "master_read", "master_create", "master_write", "master_cancel", "master_unlink", "line_ids"], { order: "module_shortdesc" });
        for (const mp of mps) {
            mp.lines = mp.line_ids && mp.line_ids.length > 0
                ? await this.orm.searchRead("module.privilege.line", [["id", "in", mp.line_ids]], ["id", "model_id", "model_name", "perm_read", "perm_create", "perm_write", "perm_cancel", "perm_unlink"], { order: "model_id" })
                : [];
        }
        return mps;
    }

    async _fetchMenuPrivileges(userId) {
        return this.orm.searchRead("menu.privilege", [["user_id", "=", userId], ["active", "=", true]], ["id", "menu_id", "menu_full_name", "is_visible", "source_module_id"], { order: "menu_full_name" });
    }
    async _fetchSpecialMenuPrivileges(userId) {
        try {
            return await this.orm.searchRead("special.menu.privilege", [["user_id", "=", userId]], ["id", "menu_key", "is_visible"]);
        } catch(e) { return []; }
    }

    async _fetchModuleVisibility(userId) {
        return this.orm.searchRead("module.visibility", [["user_id", "=", userId], ["active", "=", true]], ["id", "module_id", "module_shortdesc", "is_visible"], { order: "module_shortdesc" });
    }

    // ══ COLLAPSIBLE SECTIONS ══
    toggleSection(section) { this.state.collapsedSections[section] = !this.state.collapsedSections[section]; }
    isSectionCollapsed(section) { return !!this.state.collapsedSections[section]; }

    // ══ MODULE PRIVILEGES (local toggles — no RPC until Update) ══
    toggleExpand(id) { this.state.expandedModules[id] = !this.state.expandedModules[id]; }
    isExpanded(id) { return !!this.state.expandedModules[id]; }
    toggleUserRoleExpand(id) { this.state.expandedUserRoles[id] = !this.state.expandedUserRoles[id]; }
    isUserRoleExpanded(id) { return !!this.state.expandedUserRoles[id]; }

    // ══ USER: ADD MODULE (immediate — creates records) ══
    toggleAddModule() {
        const opening = !this.state.showAddModule;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        if (opening) { this.state.showAddModule = true; this.state.moduleSearch = ""; }
    }
    onModuleSearch(ev) { this.state.moduleSearch = ev.target.value; }

    async onPickModule(moduleId) {
        this.state.showAddModule = false;
        try {
            const result = await this.orm.create("module.privilege", [{ user_id: this.state.selectedUserId, module_id: moduleId }]);
            const mpId = Array.isArray(result) ? result[0] : result;
            await this.orm.call("module.privilege", "action_load_models", [[mpId]]);
            await this.orm.call("module.privilege", "action_apply_privileges", [[mpId]]);
            this.state.modules = await this._fetchModulePrivileges(this.state.selectedUserId);

            const created = await this.orm.call(
                "module.privilege", "create_module_menu_privileges", [],
                { module_id: moduleId, user_id: this.state.selectedUserId }
            );

            this.state.menuPrivileges = await this._fetchMenuPrivileges(this.state.selectedUserId);
            if (created > 0) {
                this.notification.add(
                    `Module added. ${created} menu(s) now listed under HIDE MENU BUTTON — toggle OFF to hide specific menus.`,
                    { type: "success" }
                );
            } else {
                this.notification.add("Module added successfully.", { type: "success" });
            }

        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // ══ MODULE TOGGLE METHODS (local state only — buffered) ══
    onMasterToggle(mpId, field, cur) {
        const mp = this.state.modules.find(m => m.id === mpId);
        if (!mp) return;
        const newVal = !cur;
        mp[field] = newVal;
        this._addPending('module.privilege', mpId, field, newVal);

        // Cascade master toggle to all lines (replicates server behavior)
        const lineField = field.replace('master_', 'perm_');
        for (const line of (mp.lines || [])) {
            line[lineField] = newVal;
            this._addPending('module.privilege.line', line.id, lineField, newVal);
        }
    }

    onLineToggle(lineId, field, cur) {
        // Find the line in modules and update locally
        for (const mp of this.state.modules) {
            const line = (mp.lines || []).find(l => l.id === lineId);
            if (line) {
                line[field] = !cur;
                this._addPending('module.privilege.line', lineId, field, !cur);
                break;
            }
        }
    }

    onGrantAll(mpId) {
        const mp = this.state.modules.find(m => m.id === mpId);
        if (!mp) return;
        const masterFields = ['master_read', 'master_create', 'master_write', 'master_cancel', 'master_unlink'];
        const lineFields = ['perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'];
        for (const field of masterFields) {
            mp[field] = true;
            this._addPending('module.privilege', mpId, field, true);
        }
        for (const line of (mp.lines || [])) {
            for (const field of lineFields) {
                line[field] = true;
                this._addPending('module.privilege.line', line.id, field, true);
            }
        }
    }

    onRevokeAll(mpId) {
        const mp = this.state.modules.find(m => m.id === mpId);
        if (!mp) return;
        // Read Only: read=true, everything else=false
        mp.master_read = true;
        mp.master_create = false;
        mp.master_write = false;
        mp.master_cancel = false;
        mp.master_unlink = false;
        this._addPending('module.privilege', mpId, 'master_read', true);
        this._addPending('module.privilege', mpId, 'master_create', false);
        this._addPending('module.privilege', mpId, 'master_write', false);
        this._addPending('module.privilege', mpId, 'master_cancel', false);
        this._addPending('module.privilege', mpId, 'master_unlink', false);
        for (const line of (mp.lines || [])) {
            line.perm_read = true;
            line.perm_create = false;
            line.perm_write = false;
            line.perm_cancel = false;
            line.perm_unlink = false;
            this._addPending('module.privilege.line', line.id, 'perm_read', true);
            this._addPending('module.privilege.line', line.id, 'perm_create', false);
            this._addPending('module.privilege.line', line.id, 'perm_write', false);
            this._addPending('module.privilege.line', line.id, 'perm_cancel', false);
            this._addPending('module.privilege.line', line.id, 'perm_unlink', false);
        }
    }

    async onFullPermission() {
        if (!this.state.selectedUserId) return;
        this.state.updating = true;
        try {
            const userId = this.state.selectedUserId;

            // Step 1: Add ALL installed modules that are not yet added
            const existingModuleIds = this.state.modules.map(m => m.source_module_id);
            const toAdd = this.state.installedModules.filter(m => !existingModuleIds.includes(m.id));
            for (const mod of toAdd) {
                const result = await this.orm.create("module.privilege", [{ user_id: userId, module_id: mod.id }]);
                const mpId = Array.isArray(result) ? result[0] : result;
                await this.orm.call("module.privilege", "action_load_models", [[mpId]]);
                await this.orm.call("module.privilege", "action_apply_privileges", [[mpId]]);
                await this.orm.call("module.privilege", "create_module_menu_privileges", [], { module_id: mod.id, user_id: userId });
            }

            // Step 2: Reload modules after adding
            this.state.modules = await this._fetchModulePrivileges(userId);

            // Step 3: Set ALL permissions to true on ALL modules and lines
            const masterFields = ['master_read', 'master_create', 'master_write', 'master_cancel', 'master_unlink'];
            const lineFields = ['perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'];
            for (const mp of this.state.modules) {
                const masterVals = {};
                for (const f of masterFields) { mp[f] = true; masterVals[f] = true; }
                await this.orm.write("module.privilege", [mp.id], masterVals);
                for (const line of (mp.lines || [])) {
                    const lineVals = {};
                    for (const f of lineFields) { line[f] = true; lineVals[f] = true; }
                    await this.orm.write("module.privilege.line", [line.id], lineVals);
                }
            }

            // Step 4: Set all menu privileges to visible
            this.state.menuPrivileges = await this._fetchMenuPrivileges(userId);
            for (const mp of this.state.menuPrivileges) {
                if (!mp.is_visible) {
                    mp.is_visible = true;
                    await this.orm.write("menu.privilege", [mp.id], { is_visible: true });
                }
            }

            // Step 5: Set all special menu privileges to visible
            this.state.specialMenuPrivileges = await this._fetchSpecialMenuPrivileges(userId);
            for (const sp of this.state.specialMenuPrivileges) {
                if (!sp.is_visible) {
                    sp.is_visible = true;
                    await this.orm.write("special.menu.privilege", [sp.id], { is_visible: true });
                }
            }

            // Step 6: Set all module visibility to visible
            this.state.moduleVisibility = await this._fetchModuleVisibility(userId);
            for (const mv of this.state.moduleVisibility) {
                if (!mv.is_visible) {
                    mv.is_visible = true;
                    await this.orm.write("module.visibility", [mv.id], { is_visible: true });
                }
            }

            // Reload everything fresh
            const [mps, menuPrivs, specialMenuPrivs, modVis] = await Promise.all([
                this._fetchModulePrivileges(userId),
                this._fetchMenuPrivileges(userId),
                this._fetchSpecialMenuPrivileges(userId),
                this._fetchModuleVisibility(userId),
            ]);
            this.state.modules = mps;
            this.state.menuPrivileges = menuPrivs;
            this.state.specialMenuPrivileges = specialMenuPrivs;
            this.state.moduleVisibility = modVis;
            this._clearPending();

            this.notification.add("Full permissions granted for all modules.", { type: "success" });
        } catch (e) {
            this.notification.add("Error: " + (e.message || e), { type: "danger" });
        }
        this.state.updating = false;
    }

    async onResetAllPrivileges() {
        this.state.updating = true;
        try {
            const userId = this.state.selectedUserId;
            // Delete ALL menu privileges for this user (including ones created by _ensure_module_menus_visible)
            const allMenuPrivs = await this.orm.searchRead("menu.privilege", [["user_id", "=", userId]], ["id"]);
            if (allMenuPrivs.length > 0) {
                await this.orm.unlink("menu.privilege", allMenuPrivs.map(m => m.id));
            }
            // Delete all special menu privileges
            if (this.state.specialMenuPrivileges.length > 0) {
                await this.orm.unlink("special.menu.privilege", this.state.specialMenuPrivileges.map(s => s.id));
            }
            // Delete all module visibility
            if (this.state.moduleVisibility.length > 0) {
                await this.orm.unlink("module.visibility", this.state.moduleVisibility.map(m => m.id));
            }
            // Delete all module privileges and their user.privilege records
            if (this.state.modules.length > 0) {
                const ups = await this.orm.searchRead("user.privilege", [["user_id", "=", userId], ["source_module_id", "!=", false]], ["id"]);
                if (ups.length > 0) await this.orm.unlink("user.privilege", ups.map(p => p.id));
                await this.orm.unlink("module.privilege", this.state.modules.map(m => m.id));
            }
            this._clearPending();
            // Refresh all data
            const [mps, menuPrivs, specialMenuPrivs, modVis] = await Promise.all([
                this._fetchModulePrivileges(userId),
                this._fetchMenuPrivileges(userId),
                this._fetchSpecialMenuPrivileges(userId),
                this._fetchModuleVisibility(userId),
            ]);
            this.state.modules = mps;
            this.state.menuPrivileges = menuPrivs;
            this.state.specialMenuPrivileges = specialMenuPrivs;
            this.state.moduleVisibility = modVis;
            this.notification.add("All privileges reset to default.", { type: "success" });
        } catch (e) {
            this.notification.add("Error resetting: " + (e.message || e), { type: "danger" });
        }
        this.state.updating = false;
    }

    async onRemoveModule(mpId) {
        try {
            const mp = this.state.modules.find(m => m.id === mpId);
            if (mp) {
                const ups = await this.orm.searchRead("user.privilege", [["user_id", "=", this.state.selectedUserId], ["source_module_id", "=", mp.module_id[0]]], ["id"]);
                if (ups.length > 0) await this.orm.unlink("user.privilege", ups.map(p => p.id));
                // Also remove menu_privilege records created for this module
                const menuPrivs = await this.orm.searchRead("menu.privilege", [["user_id", "=", this.state.selectedUserId], ["source_module_id", "=", mp.module_id[0]]], ["id"]);
                if (menuPrivs.length > 0) await this.orm.unlink("menu.privilege", menuPrivs.map(p => p.id));
            }
            await this.orm.unlink("module.privilege", [mpId]);
            // Remove any pending changes for this module and its lines
            const linesToRemove = (mp && mp.lines || []).map(l => l.id);
            const keysToRemove = [`module.privilege:${mpId}`, ...linesToRemove.map(id => `module.privilege.line:${id}`)];
            for (const key of keysToRemove) {
                this._removePending(key);
            }
            this.state.modules = await this._fetchModulePrivileges(this.state.selectedUserId);
            this.state.menuPrivileges = await this._fetchMenuPrivileges(this.state.selectedUserId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    async onCleanupModulePrivileges() {
        try {
            const ups = await this.orm.searchRead("user.privilege", [["user_id", "=", this.state.selectedUserId], ["source_module_id", "!=", false]], ["id"]);
            if (ups.length > 0) await this.orm.unlink("user.privilege", ups.map(p => p.id));
            const mps = await this.orm.searchRead("module.privilege", [["user_id", "=", this.state.selectedUserId]], ["id"]);
            if (mps.length > 0) await this.orm.unlink("module.privilege", mps.map(p => p.id));
            this._clearPending();
            this.state.modules = await this._fetchModulePrivileges(this.state.selectedUserId);
            this.notification.add("Module-based privileges cleared. Group-based access is now active.", { type: "success" });
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // ══ USER: HIDE MENU BUTTON ══
    toggleAddMenu() {
        const opening = !this.state.showAddMenu;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        if (opening) { this.state.showAddMenu = true; this.state.menuSearch = ""; }
    }
    onMenuSearch(ev) { this.state.menuSearch = ev.target.value; }

    async onPickMenu(menuId) {
        this.state.showAddMenu = false;
        try {
            if (typeof menuId === "string" && menuId.startsWith("__special_")) {
                const sm = SPECIAL_MENUS.find(m => m.id === menuId);
                if (sm) {
                    await this.orm.create("special.menu.privilege", [{ user_id: this.state.selectedUserId, menu_key: sm.key, is_visible: false }]);
                    this.state.specialMenuPrivileges = await this._fetchSpecialMenuPrivileges(this.state.selectedUserId);
                    this.notification.add(`"${sm.name}" hidden. User must refresh to see change.`, { type: "success" });
                }
            } else {
                await this.orm.create("menu.privilege", [{ user_id: this.state.selectedUserId, menu_id: menuId, is_visible: false }]);
                this.state.menuPrivileges = await this._fetchMenuPrivileges(this.state.selectedUserId);
                this.notification.add("Menu hidden for this user.", { type: "success" });
            }
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // Menu visibility toggles (local state only — buffered)
    onSpecialMenuVisToggle(spId, cur) {
        const sp = this.state.specialMenuPrivileges.find(s => s.id === spId);
        if (sp) {
            sp.is_visible = !cur;
            this._addPending('special.menu.privilege', spId, 'is_visible', !cur);
        }
    }

    async onRemoveSpecialMenuPriv(spId) {
        try {
            await this.orm.unlink("special.menu.privilege", [spId]);
            this._removePending(`special.menu.privilege:${spId}`);
            this.state.specialMenuPrivileges = await this._fetchSpecialMenuPrivileges(this.state.selectedUserId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    onMenuVisToggle(mpId, cur) {
        const mp = this.state.menuPrivileges.find(m => m.id === mpId);
        if (mp) {
            mp.is_visible = !cur;
            this._addPending('menu.privilege', mpId, 'is_visible', !cur);
        }
    }

    async onRemoveMenuPriv(mpId) {
        try {
            await this.orm.unlink("menu.privilege", [mpId]);
            this._removePending(`menu.privilege:${mpId}`);
            this.state.menuPrivileges = await this._fetchMenuPrivileges(this.state.selectedUserId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // ══ USER: HIDE MODULE BUTTON ══
    toggleAddModuleVis() {
        const opening = !this.state.showAddModuleVis;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        if (opening) { this.state.showAddModuleVis = true; this.state.moduleVisSearch = ""; }
    }
    onModuleVisSearch(ev) { this.state.moduleVisSearch = ev.target.value; }

    async onPickModuleVis(moduleId) {
        this.state.showAddModuleVis = false;
        try {
            await this.orm.create("module.visibility", [{ user_id: this.state.selectedUserId, module_id: moduleId, is_visible: false }]);
            this.state.moduleVisibility = await this._fetchModuleVisibility(this.state.selectedUserId);
            this.notification.add("App icon hidden for this user.", { type: "success" });
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    onModuleVisToggle(mvId, cur) {
        const mv = this.state.moduleVisibility.find(m => m.id === mvId);
        if (mv) {
            mv.is_visible = !cur;
            this._addPending('module.visibility', mvId, 'is_visible', !cur);
        }
    }

    async onRemoveModuleVis(mvId) {
        try {
            await this.orm.unlink("module.visibility", [mvId]);
            this._removePending(`module.visibility:${mvId}`);
            this.state.moduleVisibility = await this._fetchModuleVisibility(this.state.selectedUserId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // ══ GROUP SELECTION ══
    async onSelectRole(roleId) {
        this._clearPending();
        const role = this.state.roles.find(r => r.id === roleId);
        if (!role) return;
        this.state.selectedRoleId = roleId;
        this.state.selectedRoleName = role.name;
        this.state.showAddRoleMenu = this.state.showAddRoleModule = false;
        await this._loadRoleLines(roleId);
    }

    async _loadRoleLines(roleId) {
        this.state.roleLoading = true;
        try {
            const roleData = await this.orm.read("privilege.role", [roleId], [
                "master_read", "master_create", "master_write", "master_cancel", "master_unlink",
                "line_ids", "user_count", "menu_visibility_ids", "module_visibility_ids"
            ]);
            if (roleData && roleData.length > 0) {
                const rd = roleData[0];
                this.state.roleMaster = { master_read: rd.master_read, master_create: rd.master_create, master_write: rd.master_write, master_cancel: rd.master_cancel, master_unlink: rd.master_unlink };
                const role = this.state.roles.find(r => r.id === roleId);
                if (role) role.user_count = rd.user_count || 0;

                this.state.roleLines = rd.line_ids && rd.line_ids.length > 0
                    ? await this.orm.searchRead("role.privilege.line", [["id", "in", rd.line_ids]], ["id", "model_id", "model_name", "source_module_id", "source_module_shortdesc", "perm_read", "perm_create", "perm_write", "perm_cancel", "perm_unlink"], { order: "source_module_id, model_id" })
                    : [];

                // Group role lines by source module for module-based display
                this.state.roleModulePrivileges = this._groupRoleLinesByModule(this.state.roleLines);

                this.state.roleMenuVisibility = rd.menu_visibility_ids && rd.menu_visibility_ids.length > 0
                    ? await this.orm.searchRead("role.menu.visibility", [["id", "in", rd.menu_visibility_ids]], ["id", "menu_id", "menu_full_name", "is_visible"], { order: "menu_full_name" })
                    : [];

                this.state.roleModuleVisibility = rd.module_visibility_ids && rd.module_visibility_ids.length > 0
                    ? await this.orm.searchRead("role.module.visibility", [["id", "in", rd.module_visibility_ids]], ["id", "module_id", "module_shortdesc", "is_visible"], { order: "module_shortdesc" })
                    : [];
            }
        } catch (e) { this.notification.add("Error loading group: " + (e.message || e), { type: "danger" }); }
        this.state.roleLoading = false;
    }

    _groupRoleLinesByModule(lines) {
        const moduleMap = {};
        const ungrouped = [];
        for (const line of lines) {
            if (line.source_module_id) {
                const modId = line.source_module_id[0];
                const modName = line.source_module_shortdesc || line.source_module_id[1] || 'Unknown Module';
                if (!moduleMap[modId]) {
                    moduleMap[modId] = { module_id: modId, module_name: modName, lines: [] };
                }
                moduleMap[modId].lines.push(line);
            } else {
                ungrouped.push(line);
            }
        }
        const result = Object.values(moduleMap).sort((a, b) => a.module_name.localeCompare(b.module_name));
        if (ungrouped.length > 0) {
            result.push({ module_id: 0, module_name: 'Other Models', lines: ungrouped });
        }
        return result;
    }

    // ══ GROUP TOGGLE METHODS (local state only — buffered) ══
    onRoleMasterToggle(field, cur) {
        const roleId = this.state.selectedRoleId;
        if (!roleId) return;
        const newVal = !cur;
        this.state.roleMaster[field] = newVal;
        this._addPending('privilege.role', roleId, field, newVal);

        // Cascade to all role lines
        const lineField = field.replace('master_', 'perm_');
        for (const line of this.state.roleLines) {
            line[lineField] = newVal;
            this._addPending('role.privilege.line', line.id, lineField, newVal);
        }
    }

    onRoleLineToggle(lineId, field, cur) {
        const line = this.state.roleLines.find(l => l.id === lineId);
        if (line) {
            line[field] = !cur;
            this._addPending('role.privilege.line', lineId, field, !cur);
        }
    }

    onRoleModuleGrantAll(moduleId) {
        const mod = this.state.roleModulePrivileges.find(m => m.module_id === moduleId);
        if (!mod) return;
        const lineFields = ['perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'];
        for (const line of mod.lines) {
            for (const field of lineFields) {
                line[field] = true;
                this._addPending('role.privilege.line', line.id, field, true);
            }
        }
    }

    onRoleModuleRevokeAll(moduleId) {
        const mod = this.state.roleModulePrivileges.find(m => m.module_id === moduleId);
        if (!mod) return;
        for (const line of mod.lines) {
            line.perm_read = true;
            line.perm_create = false;
            line.perm_write = false;
            line.perm_cancel = false;
            line.perm_unlink = false;
            this._addPending('role.privilege.line', line.id, 'perm_read', true);
            this._addPending('role.privilege.line', line.id, 'perm_create', false);
            this._addPending('role.privilege.line', line.id, 'perm_write', false);
            this._addPending('role.privilege.line', line.id, 'perm_cancel', false);
            this._addPending('role.privilege.line', line.id, 'perm_unlink', false);
        }
    }

    async onRemoveRoleModulePriv(moduleId) {
        if (!this.state.selectedRoleId || !moduleId) return;
        try {
            await this.orm.call("privilege.role", "action_remove_module_from_role", [[this.state.selectedRoleId], moduleId]);
            await this._loadRoleLines(this.state.selectedRoleId);
            this.notification.add("Module removed from group.", { type: "success" });
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    toggleRoleModuleExpand(moduleId) { this.state.expandedRoleModules[moduleId] = !this.state.expandedRoleModules[moduleId]; }
    isRoleModuleExpanded(moduleId) { return !!this.state.expandedRoleModules[moduleId]; }

    // ══ GROUP: ADD MODULE (for model privileges) ══
    toggleAddRoleModulePriv() {
        const opening = !this.state.showAddRoleModulePriv;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        this.state.showAddRoleModulePriv = false;
        if (opening) { this.state.showAddRoleModulePriv = true; this.state.roleModulePrivSearch = ""; }
    }
    onRoleModulePrivSearch(ev) { this.state.roleModulePrivSearch = ev.target.value; }

    get filteredModulesForRolePrivAdd() {
        const usedModuleIds = this.state.roleModulePrivileges.filter(m => m.module_id > 0).map(m => m.module_id);
        let mods = this.state.installedModules.filter(m => !usedModuleIds.includes(m.id));
        const s = (this.state.roleModulePrivSearch || "").toLowerCase();
        if (s) mods = mods.filter(m => (m.shortdesc || "").toLowerCase().includes(s) || (m.name || "").toLowerCase().includes(s) || (m.menu_label || "").toLowerCase().includes(s));
        return mods;
    }

    async onPickRoleModulePriv(moduleId) {
        this.state.showAddRoleModulePriv = false;
        if (!this.state.selectedRoleId) return;
        try {
            // 1. Add module models (like user flow's action_load_models)
            const result = await this.orm.call("privilege.role", "action_add_module_models", [[this.state.selectedRoleId], moduleId]);
            // 2. Add module menus to role menu visibility (like user flow's create_module_menu_privileges)
            const menusCreated = await this.orm.call("privilege.role", "action_add_module_menus", [[this.state.selectedRoleId], moduleId]);
            // 3. Refresh all role data
            await this._loadRoleLines(this.state.selectedRoleId);

            const created = result && result.created || 0;
            const updated = result && result.updated || 0;
            const modName = result && result.module_name || "Module";
            if (created + updated > 0) {
                const parts = [];
                if (created) parts.push(created + " model(s) added");
                if (updated) parts.push(updated + " existing model(s) linked");
                if (menusCreated) parts.push(menusCreated + " menu(s) listed under Hide Menu");
                this.notification.add(modName + ": " + parts.join(", ") + ".", { type: "success" });
            } else {
                this.notification.add(modName + ": No models found for this module.", { type: "warning" });
            }
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    onRoleGrantAll() {
        const roleId = this.state.selectedRoleId;
        if (!roleId) return;
        const masterFields = ['master_read', 'master_create', 'master_write', 'master_cancel', 'master_unlink'];
        const lineFields = ['perm_read', 'perm_create', 'perm_write', 'perm_cancel', 'perm_unlink'];
        for (const field of masterFields) {
            this.state.roleMaster[field] = true;
            this._addPending('privilege.role', roleId, field, true);
        }
        for (const line of this.state.roleLines) {
            for (const field of lineFields) {
                line[field] = true;
                this._addPending('role.privilege.line', line.id, field, true);
            }
        }
    }

    onRoleRevokeAll() {
        const roleId = this.state.selectedRoleId;
        if (!roleId) return;
        // Read Only: read=true, everything else=false
        this.state.roleMaster.master_read = true;
        this.state.roleMaster.master_create = false;
        this.state.roleMaster.master_write = false;
        this.state.roleMaster.master_cancel = false;
        this.state.roleMaster.master_unlink = false;
        this._addPending('privilege.role', roleId, 'master_read', true);
        this._addPending('privilege.role', roleId, 'master_create', false);
        this._addPending('privilege.role', roleId, 'master_write', false);
        this._addPending('privilege.role', roleId, 'master_cancel', false);
        this._addPending('privilege.role', roleId, 'master_unlink', false);
        for (const line of this.state.roleLines) {
            line.perm_read = true;
            line.perm_create = false;
            line.perm_write = false;
            line.perm_cancel = false;
            line.perm_unlink = false;
            this._addPending('role.privilege.line', line.id, 'perm_read', true);
            this._addPending('role.privilege.line', line.id, 'perm_create', false);
            this._addPending('role.privilege.line', line.id, 'perm_write', false);
            this._addPending('role.privilege.line', line.id, 'perm_cancel', false);
            this._addPending('role.privilege.line', line.id, 'perm_unlink', false);
        }
    }

    async onResetRolePrivileges() {
        this.state.updating = true;
        try {
            const roleId = this.state.selectedRoleId;
            // Delete all role menu visibility
            if (this.state.roleMenuVisibility.length > 0) {
                await this.orm.unlink("role.menu.visibility", this.state.roleMenuVisibility.map(m => m.id));
            }
            // Delete all role module visibility
            if (this.state.roleModuleVisibility.length > 0) {
                await this.orm.unlink("role.module.visibility", this.state.roleModuleVisibility.map(m => m.id));
            }
            // Delete all role privilege lines (model privileges)
            if (this.state.roleLines.length > 0) {
                await this.orm.unlink("role.privilege.line", this.state.roleLines.map(l => l.id));
            }
            this._clearPending();
            await this._loadRoleLines(roleId);
            this.notification.add("Group privileges reset.", { type: "success" });
        } catch (e) {
            this.notification.add("Error resetting: " + (e.message || e), { type: "danger" });
        }
        this.state.updating = false;
    }

    async _loadRoles() {
        const roles = await this.orm.searchRead("privilege.role", [["active", "=", true]], ["id", "name", "user_count", "user_ids"], { order: "name" });
        const allUserIds = new Set();
        for (const r of roles) for (const uid of (r.user_ids || [])) allUserIds.add(uid);
        let userMap = {};
        if (allUserIds.size > 0) {
            const users = await this.orm.searchRead("res.users", [["id", "in", [...allUserIds]]], ["id", "name"], {});
            for (const u of users) userMap[u.id] = u.name;
        }
        this.state.roles = roles.map(r => ({
            id: r.id, name: r.name, user_count: r.user_count || 0,
            user_names_display: (r.user_ids || []).map(uid => userMap[uid] || "").filter(Boolean).join(", ") || "No users",
        }));
    }

    get filteredRoles() {
        const s = this.state.searchRole.toLowerCase();
        return s ? this.state.roles.filter(r => r.name.toLowerCase().includes(s)) : this.state.roles;
    }

    // ══ GROUP: HIDE MENU BUTTON ══
    toggleAddRoleMenu() {
        const opening = !this.state.showAddRoleMenu;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        if (opening) { this.state.showAddRoleMenu = true; this.state.roleMenuSearch = ""; }
    }
    onRoleMenuSearch(ev) { this.state.roleMenuSearch = ev.target.value; }

    async onPickRoleMenu(menuId) {
        this.state.showAddRoleMenu = false;
        try {
            await this.orm.create("role.menu.visibility", [{ role_id: this.state.selectedRoleId, menu_id: menuId, is_visible: false }]);
            await this._loadRoleLines(this.state.selectedRoleId);
            this.notification.add("Menu hidden for this group.", { type: "success" });
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    onRoleMenuVisToggle(id, cur) {
        const rm = this.state.roleMenuVisibility.find(m => m.id === id);
        if (rm) {
            rm.is_visible = !cur;
            this._addPending('role.menu.visibility', id, 'is_visible', !cur);
        }
    }

    async onRemoveRoleMenu(id) {
        try {
            await this.orm.unlink("role.menu.visibility", [id]);
            this._removePending(`role.menu.visibility:${id}`);
            await this._loadRoleLines(this.state.selectedRoleId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    // ══ GROUP: HIDE MODULE BUTTON ══
    toggleAddRoleModule() {
        const opening = !this.state.showAddRoleModule;
        this.state.showAddModule = false;
        this.state.showAddMenu = false;
        this.state.showAddModuleVis = false;
        this.state.showAddRoleMenu = false;
        this.state.showAddRoleModule = false;
        if (opening) { this.state.showAddRoleModule = true; this.state.roleModuleSearch = ""; }
    }
    onRoleModuleSearch(ev) { this.state.roleModuleSearch = ev.target.value; }

    async onPickRoleModule(moduleId) {
        this.state.showAddRoleModule = false;
        try {
            await this.orm.create("role.module.visibility", [{ role_id: this.state.selectedRoleId, module_id: moduleId, is_visible: false }]);
            await this._loadRoleLines(this.state.selectedRoleId);
            this.notification.add("App hidden for this group.", { type: "success" });
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }

    onRoleModuleVisToggle(id, cur) {
        const rmod = this.state.roleModuleVisibility.find(m => m.id === id);
        if (rmod) {
            rmod.is_visible = !cur;
            this._addPending('role.module.visibility', id, 'is_visible', !cur);
        }
    }

    async onRemoveRoleModule(id) {
        try {
            await this.orm.unlink("role.module.visibility", [id]);
            this._removePending(`role.module.visibility:${id}`);
            await this._loadRoleLines(this.state.selectedRoleId);
        } catch (e) { this.notification.add("Error: " + (e.message || e), { type: "danger" }); }
    }
}

registry.category("actions").add("privilege_dashboard", PrivilegeDashboard);
