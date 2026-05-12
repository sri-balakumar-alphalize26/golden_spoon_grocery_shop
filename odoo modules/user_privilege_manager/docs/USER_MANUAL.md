# User Privilege Manager — User Manual

Version: 19.0.5.4.0
Audience: Odoo administrators who manage per-user and per-group access.

---

## 1. Overview

The Privilege Manager gives you one place to control:

- **CRUD permissions** (Read / Create / Edit / Cancel / Delete) per user, per Odoo model.
- **Hidden Menus** — hide specific top-level or sub-menus from a user.
- **Hidden Apps** — hide whole app icons (modules) from a user.
- **Access Levels** — toggle membership in `res.groups` for each module.
- **Groups (privilege roles)** — apply the same controls to a named group, then assign the group to many users.

Precedence (highest first): **User-level override > Group-level > Default Odoo access**. If you set nothing, standard Odoo permissions apply.

---

## 2. Opening the Dashboard

1. Top apps menu → **Privilege Manager**.
2. Click **Dashboard** (default landing).
3. The left panel lists all users. Click a user to load their privileges.
4. Switch tabs at the left: **Users** vs **Groups**.

---

## 3. Users tab vs Groups tab

| Tab | What it controls |
|---|---|
| **Users** | Privileges for one specific user (overrides any group rules) |
| **Groups** | Privileges for a privilege role; assign the role to users and they inherit |

Use **Groups** when several users need the same access. Use **Users** for one-off overrides.

---

## 4. Module-Based Privileges

Each card in the dashboard represents one installed module (e.g. *Sales*, *369 Cheque Scanner*).

### Master toggles

The row directly under the module title:

| Toggle | Maps to | Effect |
|---|---|---|
| **Read** | `read` | View records |
| **Create** | `create` | Add new records |
| **Edit** | `write` | Modify existing records |
| **Cancel** | (soft) | Use the module's Cancel actions where applicable |
| **Delete** | `unlink` | Remove records |

Toggling a master cascades down to **every model in that module**. Toggle off **Read** and the user loses all access — Create/Edit/Delete are meaningless without it.

### Per-model toggles

Click the `>` arrow on the module card to expand. Each row is one Odoo model with its own R/C/E/Cancel/Delete switches. These are precise overrides for the cascade — toggle them after the master if you want a model to differ.

### Per-card buttons

- **Grant All** — set all five permissions to true on every model in this module.
- **Read Only** — set Read to true on every model and everything else to false.

Both are buffered: they activate the **Update** button. Click Update to save.

---

## 5. Access Levels

Some modules expose Odoo `res.groups` (e.g. *Cheque Scanner User*, *Sales / Administrator*). They appear as chips under the **ACCESS LEVEL** row when the module card is expanded.

- Click a chip to toggle group membership for the selected user.
- **Toggling now activates the Update button.** Nothing is saved until you click Update.
- Click the chip again before saving to revert (the pending change drops).
- **Discard** undoes any unsaved chip toggles.

> *Behavior change in 19.0.5.4.0:* previously these chips saved instantly. They now go through the same Update / Discard workflow as the rest of the form.

The **Grant all groups** button on the card grants every group for the module immediately and asks for confirmation if you have other unsaved changes.

---

## 6. Hidden Menus & Hidden Apps

### Hidden Menus

Use **Add Menu** to pick any menu (top-level, sub-menu, or special menus like *Apps*, *Home*, *Discuss*, *Dashboards*) and hide it from the selected user. Each entry has a visibility toggle — turning it ON makes the menu visible again, OFF hides it. The user must reload Odoo for the change to appear.

### Hidden Apps

Use **Add Module** under the *Hidden Apps* section to hide an entire installed module's app icon. Same toggle behavior as Hidden Menus.

Both lists are buffered. Toggle, then **Update**.

---

## 7. Update vs Discard

The two buttons on the right of the toolbar:

- **Update** — active (green, pulsing) only when you have at least one pending change. It writes everything queued, then refreshes the screen from the database.
- **Discard** — drops every pending change and reloads the screen.

### Which actions activate Update?

Not every click queues a pending change. Some actions save the moment you do them — there is nothing to "Update" because the record was already created or deleted.

| Action | When it saves | Activates Update? |
|---|---|---|
| Toggling Read / Create / Edit / Cancel / Delete | Click Update | ✅ Yes |
| Toggling a visibility switch on an *existing* row (Hidden Menus / Hidden Apps / Special Menus) | Click Update | ✅ Yes |
| Clicking an Access Level chip | Click Update | ✅ Yes (since v19.0.5.4.0) |
| **+ Add Module** (picking a module from the dropdown) | Instantly | ❌ No — record is already created |
| **+ Add Menu** (picking a menu to hide) | Instantly | ❌ No — record is already created |
| **+ Add App** (picking an app to hide) | Instantly | ❌ No — record is already created |
| Trash icon on any row (remove a hidden menu, remove a module, etc.) | Instantly | ❌ No — record is already deleted |
| **Grant All** / **Read Only** chips on a module card | Click Update | ✅ Yes (buffered) |
| **Full Permission** | Instantly (with confirm) | ❌ No |
| **Reset All** | Instantly (with two confirms) | ❌ No |
| **Grant all groups** (inside a module card) | Instantly (with confirm if pending) | ❌ No |

So: if you only added modules / hid menus / hid apps and made no toggle changes, the Update button stays grayed out — **that's correct**. Each pick already wrote a row to the database. You will see a toast like "Menu hidden for this user." confirming the save, and the counters at the top right update.

> **"Update is grayed out even after toggling — is that broken?"**
> If you toggled an existing row's switch (CRUD, visibility, or Access Level chip) and Update stays grayed, that **is** a bug — please report it with steps to reproduce. But if you only did "+ Add" actions, the gray state is normal because the work is already saved.

While Update is running, you'll see "Saving..." on the button and toggles on the page are temporarily inert. This prevents new edits from being lost during the post-save refresh.

---

## 8. Bulk Actions

Top of the dashboard:

| Button | Effect |
|---|---|
| **Full Permission** | Adds every installed module for the user and grants every permission. Use carefully. |
| **Reset All** | Deletes **all** privilege records for the user — they fall back to default Odoo group access. |
| **Reset All** (Groups tab) | Same, but for the selected group. |

Behavior change in 19.0.5.4.0: if you have unsaved pending changes, a confirm dialog now warns that those changes will be discarded before the bulk action runs. Reset All also asks an additional confirm because it's destructive.

---

## 9. Groups (Roles) tab

Switch to **Groups**. The left list shows privilege roles. Pick one to load.

Operations mirror the Users tab:

- Master + per-model CRUD toggles.
- **Add Module** to bring a module's models into the role.
- **Hidden Menus** and **Hidden Apps** sections.
- **Grant All** / **Read Only** / **Reset All** at the role level.

After saving role changes, Odoo group membership is automatically synced for users assigned to the role. Users may need to log out and back in for `res.groups` changes to take full effect.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Update button stays grayed out after picking from + Add Module / + Add Menu / + Add App | These are instant-save actions — no pending change to commit | Working as designed. See §7 for the full breakdown. |
| Update button stays grayed out after toggling a switch | No pending changes detected | If you toggled an Access Level chip, this is fixed in 19.0.5.4.0 — make sure your module is updated and hard-refresh the browser (Ctrl+Shift+R) |
| Clicked *Full Permission* and lost my queued toggles | Old behavior in pre-19.0.5.4.0 | Update the module — there's now a confirm prompt |
| Privileges saved but the user still sees the old menus | Browser session cached | Ask the user to refresh (Ctrl+F5) or log out / back in |
| Group toggle on Access Level didn't persist | Group membership requires session reload | User must log out and back in |
| "Module-based privileges" card empty after picking a user | User has no `module.privilege` records yet | Click **Add Module** to bring modules into scope |
| Errors like *InFailedSqlTransaction* on Auto-Add Models | DB transaction aborted on a single bad record | Check Odoo logs; the savepoint pattern in the engine isolates failures per model |

---

## 11. Version Notes

**19.0.5.4.0** — UX bugfix release for the dashboard:

- Access Level chip toggles now go through the **Update** button (no more silent instant-save).
- *Full Permission*, *Reset All*, and *Grant all groups* now warn before discarding unsaved changes.
- Toggle inputs are visually disabled while a save is in progress, preventing edits from being overwritten by the post-save refresh.

Older releases see the in-module commit history.
