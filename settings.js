// Clearbook Settings Management Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { Auth } from "./auth.js";
import { renderDashboard, reloadAllData } from "./app.js";
import { DEFAULT_CATEGORIES, Transactions } from "./transactions.js";
import { Budgets } from "./budgets.js";
import { WelcomeTour } from "./tour.js";

let categoriesList = [];

export const Settings = {
  async init(username) {
    // 1. Currency setup
    const currInput = document.getElementById("settings-currency");
    currInput.value = Storage.getCurrency();
    currInput.addEventListener("input", (e) => {
      Storage.setCurrency(e.target.value);
      // Force update currency indicator labels on modals
      const labels = ["tx-currency-label"];
      labels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = e.target.value;
      });
      renderDashboard();
    });

    // 2. Fetch categories
    await this.loadCategoriesList(username);

    // Add category triggers
    document.getElementById("btn-add-category").addEventListener("click", () => {
      this.openAddCategoryModal();
    });
    document.getElementById("category-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveCategory(username);
    });

    // 3. Render recurring schedulers
    await this.renderRecurringList(username);

    // 4. Data utilities
    document.getElementById("btn-export-backup").addEventListener("click", () => this.exportBackup(username));
    
    const importBackupBtn = document.getElementById("btn-import-backup");
    const backupInput = document.getElementById("import-backup-file-input");
    importBackupBtn.addEventListener("click", () => backupInput.click());
    backupInput.addEventListener("change", (e) => this.handleBackupFile(e, username));

    document.getElementById("btn-wipe-data-trigger").addEventListener("click", () => this.wipeAccountData(username));

    // 5. Onboarding & logout triggers
    document.getElementById("btn-settings-replay-tour").addEventListener("click", () => {
      Storage.setTourCompleted(false);
      WelcomeTour.startTourSequence();
    });

    document.getElementById("btn-settings-logout").addEventListener("click", () => {
      Auth.logOut();
      window.location.reload();
    });
  },

  async loadCategoriesList(username) {
    const custom = await Database.getAll(username, "settings");
    const userSettings = custom.find(c => c.id === "userSettings");
    
    if (userSettings && userSettings.categories) {
      categoriesList = userSettings.categories;
    } else {
      categoriesList = [...DEFAULT_CATEGORIES];
    }

    this.renderCategoriesTable(username);
  },

  renderCategoriesTable(username) {
    const listEl = document.getElementById("settings-categories-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    categoriesList.forEach((cat, index) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "8px 12px";
      item.style.background = "var(--bg-color)";
      item.style.borderRadius = "8px";
      item.style.border = "1px solid var(--border-color)";

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${cat.color};"></span>
          <span style="font-weight: 500; font-size: 0.9rem;">${cat.emoji} ${cat.name}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm edit-cat-btn" data-index="${index}" style="padding: 2px 6px; font-size: 0.75rem;">Edit</button>
          ${cat.id === 'other' ? '' : `<button class="btn btn-danger btn-sm delete-cat-btn" data-index="${index}" style="padding: 2px 6px; font-size: 0.75rem;">Delete</button>`}
        </div>
      `;

      item.querySelector(".edit-cat-btn").addEventListener("click", () => this.openEditCategoryModal(index));
      const delBtn = item.querySelector(".delete-cat-btn");
      if (delBtn) {
        delBtn.addEventListener("click", () => this.deleteCategory(username, index));
      }

      listEl.appendChild(item);
    });
  },

  openAddCategoryModal() {
    document.getElementById("category-modal-title").textContent = "Add Category";
    document.getElementById("category-edit-id").value = "";
    document.getElementById("category-name").value = "";
    document.getElementById("category-emoji").value = "";
    document.getElementById("category-color").value = "#3b82f6";
    
    document.getElementById("modal-category").classList.add("active");
  },

  openEditCategoryModal(index) {
    const cat = categoriesList[index];
    document.getElementById("category-modal-title").textContent = "Edit Category";
    document.getElementById("category-edit-id").value = index;
    document.getElementById("category-name").value = cat.name;
    document.getElementById("category-emoji").value = cat.emoji;
    document.getElementById("category-color").value = cat.color;

    document.getElementById("modal-category").classList.add("active");
  },

  async saveCategory(username) {
    const editId = document.getElementById("category-edit-id").value;
    const name = document.getElementById("category-name").value.trim();
    const emoji = document.getElementById("category-emoji").value.trim();
    const color = document.getElementById("category-color").value;

    if (!name || !emoji) {
      alert("Name and Emoji are required.");
      return;
    }

    const catData = {
      id: editId !== "" ? categoriesList[editId].id : name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      name,
      emoji,
      color
    };

    if (editId !== "") {
      categoriesList[editId] = catData;
    } else {
      categoriesList.push(catData);
    }

    try {
      // Save full array to Firestore under settings/userSettings
      await Database.set(username, "settings", "userSettings", {
        categories: categoriesList,
        updatedAt: new Date().toISOString()
      });

      closeModal("modal-category");
      await this.loadCategoriesList(username);
      
      // Update form options elsewhere in app
      await Transactions.loadCategoriesList(username);
      await Budgets.loadCategories(username);
      renderDashboard();
    } catch (e) {
      console.error(e);
      alert("Failed to save categories configurations.");
    }
  },

  async deleteCategory(username, index) {
    if (confirm(`Are you sure you want to delete category "${categoriesList[index].name}"?`)) {
      categoriesList.splice(index, 1);
      
      try {
        await Database.set(username, "settings", "userSettings", {
          categories: categoriesList,
          updatedAt: new Date().toISOString()
        });

        await this.loadCategoriesList(username);
        await Transactions.loadCategoriesList(username);
        await Budgets.loadCategories(username);
        renderDashboard();
      } catch (e) {
        console.error(e);
        alert("Failed to delete category.");
      }
    }
  },

  // Recurring Template Listing
  async renderRecurringList(username) {
    const listEl = document.getElementById("settings-recurring-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    const list = await Database.getAll(username, "recurring");
    const currency = Storage.getCurrency();

    if (list.length === 0) {
      listEl.innerHTML = `<p class="text-secondary" style="font-size:0.8rem; font-style:italic;">No recurring triggers scheduled.</p>`;
      return;
    }

    list.forEach(item => {
      const row = document.createElement("div");
      row.style.border = "1px solid var(--border-color)";
      row.style.borderRadius = "8px";
      row.style.padding = "10px";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.background = "var(--surface-color)";

      const labelAmtClass = item.type === "income" ? "amount-income" : "amount-expense";
      const suffixVal = item.type === "income" ? "+" : "-";

      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:600; font-size:0.85rem;">${item.title}</span>
          <span style="font-size:0.7rem; color:var(--text-secondary); text-transform:capitalize;">
            Every ${item.frequency} | Next due: ${item.nextOccurrence ? item.nextOccurrence.split('T')[0] : 'N/A'}
          </span>
          ${item.paused ? `<span style="font-size:0.7rem; color:var(--danger); font-weight:bold;">Paused</span>` : ""}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="${labelAmtClass}" style="font-size:0.85rem; font-weight:bold;">${suffixVal}${currency}${parseFloat(item.amount).toFixed(2)}</span>
          <button class="btn btn-secondary btn-sm toggle-recur-btn" style="padding:2px 6px; font-size:0.75rem;">
            ${item.paused ? "Resume" : "Pause"}
          </button>
          <button class="btn btn-danger btn-sm delete-recur-btn" style="padding:2px 6px; font-size:0.75rem;">Cancel</button>
        </div>
      `;

      row.querySelector(".toggle-recur-btn").addEventListener("click", () => this.toggleRecurring(username, item));
      row.querySelector(".delete-recur-btn").addEventListener("click", () => this.deleteRecurring(username, item.id));

      listEl.appendChild(row);
    });
  },

  async toggleRecurring(username, item) {
    try {
      await Database.update(username, "recurring", item.id, {
        paused: !item.paused
      });
      await this.renderRecurringList(username);
      renderDashboard();
    } catch (e) {
      console.error(e);
      alert("Failed to toggle recurring item status.");
    }
  },

  async deleteRecurring(username, id) {
    if (confirm("Are you sure you want to cancel this recurring sequence? This deletes future schedule calculations, but keeps past instances already logged in your ledger.")) {
      try {
        await Database.delete(username, "recurring", id);
        await this.renderRecurringList(username);
        renderDashboard();
      } catch (e) {
        console.error(e);
        alert("Failed to delete recurring schedule.");
      }
    }
  },

  // Backup Import & Export
  async exportBackup(username) {
    try {
      const backupData = {
        clearbookBackup: true,
        version: "1.0",
        username,
        exportedAt: new Date().toISOString(),
        transactions: await Database.getAll(username, "transactions"),
        budgets: await Database.getAll(username, "budgets"),
        savings: await Database.getAll(username, "savings"),
        debts: await Database.getAll(username, "debts"),
        recurring: await Database.getAll(username, "recurring"),
        settings: await Database.getAll(username, "settings"),
        alerts: await Database.getAll(username, "alerts")
      };

      const json = JSON.stringify(backupData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `clearbook_backup_${username}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      alert("Failed to export JSON backup.");
    }
  },

  handleBackupFile(e, username) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.clearbookBackup) {
          throw new Error("Invalid Clearbook Backup JSON file format.");
        }
        
        if (confirm("Restoring this backup file will replace existing records. Would you like to proceed?")) {
          await this.restoreBackup(username, data);
        }
      } catch (err) {
        alert(err.message || "Failed to read backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  },

  async restoreBackup(username, backup) {
    try {
      // 1. Wipe current
      await Database.wipeAllData(username);

      // 2. Restore Subcollections
      const collectionsMap = {
        transactions: backup.transactions || [],
        budgets: backup.budgets || [],
        savings: backup.savings || [],
        debts: backup.debts || [],
        recurring: backup.recurring || [],
        settings: backup.settings || [],
        alerts: backup.alerts || []
      };

      for (const [colName, list] of Object.entries(collectionsMap)) {
        for (const item of list) {
          const id = item.id;
          const cleanItem = { ...item };
          delete cleanItem.id; // Avoid duplicate ID keys in body
          await Database.set(username, colName, id, cleanItem);
        }
      }

      alert("Backup restored successfully! The app will reload now.");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error occurred during backup restoration.");
    }
  },

  // Account Wipes
  async wipeAccountData(username) {
    const confirmation = prompt("⚠️ WARNING: This wipes your entire transactions, budgets, goals, and debts history! This action is permanent and cannot be undone.\n\nType 'DELETE' to confirm deletion:");
    if (confirmation === "DELETE") {
      try {
        await Database.wipeAllData(username);
        Storage.clearDismissedAlerts();
        
        alert("Account records cleared successfully. Re-routing you back to the Dashboard.");
        window.location.reload();
      } catch (e) {
        console.error(e);
        alert("Failed to delete database records.");
      }
    } else {
      alert("Confirmation mismatch. Wiping aborted.");
    }
  }
};
