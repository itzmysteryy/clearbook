// Clearbook Transactions Management Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { renderDashboard } from "./app.js";

// Pagination variables
let currentPage = 1;
const itemsPerPage = 10;
let filteredTransactionsList = [];
let selectedTxIds = new Set();
let categories = [];

// Categories default fallback presets
export const DEFAULT_CATEGORIES = [
  { id: "salary", name: "Salary", emoji: "💰", color: "#16a34a" },
  { id: "food", name: "Food", emoji: "🍔", color: "#ea580c" },
  { id: "shopping", name: "Shopping", emoji: "🛍️", color: "#2563eb" },
  { id: "utilities", name: "Utilities", emoji: "⚡", color: "#06b6d4" },
  { id: "housing", name: "Housing", emoji: "🏠", color: "#7c3aed" },
  { id: "transport", name: "Transport", emoji: "🚗", color: "#eab308" },
  { id: "debt_payment", name: "Debt Payment", emoji: "💸", color: "#dc2626" },
  { id: "other", name: "Other", emoji: "🏷️", color: "#64748b" }
];

export const Transactions = {
  async init(username) {
    // Set default transaction date input to today
    document.getElementById("tx-date").value = new Date().toISOString().split("T")[0];

    // Load active category options
    await this.loadCategoriesList(username);

    // Form Submissions
    document.getElementById("transaction-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveTransaction(username);
    });

    // Add transaction button modal trigger
    document.getElementById("btn-add-transaction").addEventListener("click", () => {
      this.openAddTxModal();
    });

    // Toggle recurring fields visibility
    document.getElementById("tx-recurring-toggle").addEventListener("change", (e) => {
      document.getElementById("tx-recurring-fields").style.display = e.target.checked ? "block" : "none";
    });

    // CSV Download template download triggers
    document.getElementById("btn-export-csv").addEventListener("click", () => this.exportCSV(username));
    
    // CSV Import inputs triggers
    const fileTrigger = document.getElementById("btn-import-csv-trigger");
    const fileInput = document.getElementById("csv-file-input");
    fileTrigger.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => this.handleCsvFile(e));

    document.getElementById("btn-csv-confirm-import").addEventListener("click", () => this.confirmCsvImport(username));

    // Filter controls change listeners
    const filters = ["tx-search-title", "tx-filter-category", "tx-filter-type", "tx-filter-range", "tx-sort-by"];
    filters.forEach(id => {
      document.getElementById(id).addEventListener("input", () => {
        currentPage = 1;
        this.applyFiltersAndRender(username);
      });
    });

    // Custom date filters change triggers
    document.getElementById("tx-filter-range").addEventListener("change", (e) => {
      const isCustom = e.target.value === "custom";
      document.getElementById("tx-custom-date-row").style.display = isCustom ? "flex" : "none";
    });
    document.getElementById("tx-custom-start").addEventListener("input", () => this.applyFiltersAndRender(username));
    document.getElementById("tx-custom-end").addEventListener("input", () => this.applyFiltersAndRender(username));

    // Pagination Click triggers
    document.getElementById("btn-prev-page").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        this.renderTablePage();
      }
    });
    document.getElementById("btn-next-page").addEventListener("click", () => {
      if (currentPage * itemsPerPage < filteredTransactionsList.length) {
        currentPage++;
        this.renderTablePage();
      }
    });

    // Bulk actions
    document.getElementById("tx-select-all").addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll(".tx-row-checkbox");
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const id = cb.getAttribute("data-id");
        if (e.target.checked) selectedTxIds.add(id);
        else selectedTxIds.delete(id);
      });
      this.updateBulkActionsRow();
    });

    document.getElementById("btn-bulk-delete").addEventListener("click", () => {
      this.bulkDeleteTransactions(username);
    });

    window.setTransactionType = (type) => this.setFormTransactionType(type);
  },

  async loadCategoriesList(username) {
    const custom = await Database.getAll(username, "settings");
    const userSettings = custom.find(c => c.id === "userSettings");
    
    if (userSettings && userSettings.categories) {
      categories = userSettings.categories;
    } else {
      categories = [...DEFAULT_CATEGORIES];
    }

    // Populate dropdown filters
    const categoryDropdown = document.getElementById("tx-filter-category");
    const formDropdown = document.getElementById("tx-category");

    categoryDropdown.innerHTML = '<option value="all">All Categories</option>';
    formDropdown.innerHTML = "";

    categories.forEach(cat => {
      categoryDropdown.innerHTML += `<option value="${cat.name}">${cat.emoji} ${cat.name}</option>`;
      formDropdown.innerHTML += `<option value="${cat.name}">${cat.emoji} ${cat.name}</option>`;
    });
  },

  // Switch form styling
  setFormTransactionType(type) {
    const expenseBtn = document.getElementById("tx-toggle-expense");
    const incomeBtn = document.getElementById("tx-toggle-income");

    if (type === "income") {
      incomeBtn.classList.add("active");
      expenseBtn.classList.remove("active");
      // Add default Income category selector
    } else {
      expenseBtn.classList.add("active");
      incomeBtn.classList.remove("active");
    }
  },

  openAddTxModal() {
    document.getElementById("transaction-modal-title").textContent = "Log Transaction";
    document.getElementById("tx-edit-id").value = "";
    document.getElementById("tx-amount").value = "";
    document.getElementById("tx-title").value = "";
    document.getElementById("tx-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("tx-recurring-toggle").checked = false;
    document.getElementById("tx-recurring-fields").style.display = "none";
    this.setFormTransactionType("expense");

    document.getElementById("tx-currency-label").textContent = Storage.getCurrency();

    document.getElementById("modal-transaction").classList.add("active");
  },

  async saveTransaction(username) {
    const txId = document.getElementById("tx-edit-id").value;
    const amount = Math.abs(parseFloat(document.getElementById("tx-amount").value));
    const title = document.getElementById("tx-title").value.trim();
    const category = document.getElementById("tx-category").value;
    const date = document.getElementById("tx-date").value;
    const isIncome = document.getElementById("tx-toggle-income").classList.contains("active");
    const isRecurring = document.getElementById("tx-recurring-toggle").checked;

    if (!amount || !title || !date) {
      alert("Please fill in all transaction values.");
      return;
    }

    const txData = {
      amount,
      title,
      category,
      date,
      type: isIncome ? "income" : "expense",
      isRecurring,
      updatedAt: new Date().toISOString()
    };

    if (isRecurring) {
      const frequency = document.getElementById("tx-recur-frequency").value;
      const endVal = document.getElementById("tx-recur-end").value;
      txData.recurring = { frequency, endDate: endVal || null };
    }

    try {
      if (txId) {
        // Edit transaction
        await Database.update(username, "transactions", txId, txData);
      } else {
        // Add transaction
        const baseId = await Database.add(username, "transactions", txData);

        // Auto-generate future entries if recurring is checked
        if (isRecurring) {
          const recur = txData.recurring;
          const futureDates = this.calculateFutureDates(date, recur.frequency, recur.endDate);
          
          const promises = futureDates.map(futureDate => {
            const instance = {
              ...txData,
              date: futureDate,
              isRecurring: false, // Instances themselves are stored flat
              recurringParentId: baseId
            };
            return Database.add(username, "transactions", instance);
          });
          
          // Also log the recurring scheduler info to a registry
          const scheduler = {
            id: baseId,
            title,
            amount,
            category,
            type: txData.type,
            frequency: recur.frequency,
            endDate: recur.endDate || null,
            nextOccurrence: futureDates[0] || null,
            paused: false
          };
          await Database.set(username, "recurring", baseId, scheduler);

          await Promise.all(promises);
        }
      }

      closeModal("modal-transaction");
      renderDashboard(); // Force UI rebuilds
    } catch (err) {
      console.error(err);
      alert("Failed to save transaction.");
    }
  },

  calculateFutureDates(startDateStr, frequency, endDateStr) {
    const dates = [];
    const start = new Date(startDateStr);
    // Limit scheduling to 1 year max automatically to keep firestore requests safe
    const limit = endDateStr ? new Date(endDateStr) : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    
    let current = new Date(start);
    // Add time offset safety
    current.setHours(12, 0, 0, 0);
    limit.setHours(12, 0, 0, 0);

    let safetyCount = 0;
    while (safetyCount < 366) {
      safetyCount++;
      if (frequency === "daily") {
        current.setDate(current.getDate() + 1);
      } else if (frequency === "weekly") {
        current.setDate(current.getDate() + 7);
      } else if (frequency === "monthly") {
        current.setMonth(current.getMonth() + 1);
      } else if (frequency === "yearly") {
        current.setFullYear(current.getFullYear() + 1);
      } else {
        break;
      }
      
      if (current > limit) break;
      dates.push(current.toISOString().split("T")[0]);
    }
    return dates;
  },

  async editTransaction(username, txId) {
    const tx = await Database.get(username, "transactions", txId);
    if (!tx) return;

    document.getElementById("transaction-modal-title").textContent = "Edit Transaction";
    document.getElementById("tx-edit-id").value = tx.id;
    document.getElementById("tx-amount").value = tx.amount;
    document.getElementById("tx-title").value = tx.title;
    document.getElementById("tx-date").value = tx.date;
    
    this.setFormTransactionType(tx.type);
    document.getElementById("tx-category").value = tx.category;

    // Recurring forms (we hide recurring modifications on edits to prevent nesting issues)
    document.getElementById("tx-recurring-toggle").checked = false;
    document.getElementById("tx-recurring-fields").style.display = "none";
    document.getElementById("tx-currency-label").textContent = Storage.getCurrency();

    document.getElementById("modal-transaction").classList.add("active");
  },

  async deleteTransaction(username, txId) {
    if (confirm("Are you sure you want to delete this transaction record?")) {
      await Database.delete(username, "transactions", txId);
      renderDashboard();
    }
  },

  // Bulk options
  updateBulkActionsRow() {
    const row = document.getElementById("tx-bulk-actions-row");
    const countText = document.getElementById("tx-selected-count");

    if (selectedTxIds.size > 0) {
      countText.textContent = `${selectedTxIds.size} transactions selected`;
      row.style.display = "flex";
    } else {
      row.style.display = "none";
    }
  },

  async bulkDeleteTransactions(username) {
    if (selectedTxIds.size === 0) return;
    if (confirm(`Are you sure you want to delete all ${selectedTxIds.size} selected transactions?`)) {
      const promises = Array.from(selectedTxIds).map(id => Database.delete(username, "transactions", id));
      await Promise.all(promises);
      selectedTxIds.clear();
      document.getElementById("tx-select-all").checked = false;
      this.updateBulkActionsRow();
      renderDashboard();
    }
  },

  // Filtering implementation
  applyFiltersAndRender(username) {
    Database.getAll(username, "transactions").then(txs => {
      const search = document.getElementById("tx-search-title").value.toLowerCase().trim();
      const cat = document.getElementById("tx-filter-category").value;
      const type = document.getElementById("tx-filter-type").value;
      const range = document.getElementById("tx-filter-range").value;
      const sortBy = document.getElementById("tx-sort-by").value;

      filteredTransactionsList = txs.filter(t => {
        // Title Search
        if (search && !t.title.toLowerCase().includes(search)) return false;
        
        // Category Filter
        if (cat !== "all" && t.category !== cat) return false;
        
        // Type Filter
        if (type !== "all" && t.type !== type) return false;

        // Date Range Filters
        if (range !== "all") {
          const d = new Date(t.date);
          const startOfToday = new Date();
          startOfToday.setHours(0,0,0,0);

          if (range === "this-month") {
            const startMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
            if (d < startMonth) return false;
          } else if (range === "last-month") {
            const startLast = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, 1);
            const endLast = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 0, 23, 59, 59);
            if (d < startLast || d > endLast) return false;
          } else if (range === "last-90") {
            const boundary = new Date(startOfToday.getTime() - 90 * 24 * 60 * 60 * 1000);
            if (d < boundary) return false;
          } else if (range === "custom") {
            const startVal = document.getElementById("tx-custom-start").value;
            const endVal = document.getElementById("tx-custom-end").value;
            if (startVal && d < new Date(startVal)) return false;
            if (endVal && d > new Date(endVal + "T23:59:59")) return false;
          }
        }
        return true;
      });

      // Sorting
      filteredTransactionsList.sort((a, b) => {
        if (sortBy === "date-desc") return new Date(b.date) - new Date(a.date);
        if (sortBy === "date-asc") return new Date(a.date) - new Date(b.date);
        if (sortBy === "amount-desc") return parseFloat(b.amount) - parseFloat(a.amount);
        if (sortBy === "amount-asc") return parseFloat(a.amount) - parseFloat(b.amount);
        if (sortBy === "category-asc") return a.category.localeCompare(b.category);
        return 0;
      });

      this.renderTablePage();
    });
  },

  renderTablePage() {
    const tbody = document.getElementById("transactions-list-tbody");
    const countInfo = document.getElementById("transactions-pagination-info");
    const btnPrev = document.getElementById("btn-prev-page");
    const btnNext = document.getElementById("btn-next-page");
    const user = Storage.getCurrentUser();

    tbody.innerHTML = "";

    const total = filteredTransactionsList.length;
    if (total === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-secondary); padding: 24px 0;">No matching transactions found. Click "Add Transaction" to log one!</td></tr>`;
      countInfo.textContent = "Showing 0-0 of 0";
      btnPrev.disabled = true;
      btnNext.disabled = true;
      return;
    }

    const maxPage = Math.ceil(total / itemsPerPage);
    if (currentPage > maxPage) currentPage = maxPage;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, total);
    const visibleItems = filteredTransactionsList.slice(startIndex, endIndex);

    const currency = Storage.getCurrency();

    visibleItems.forEach(tx => {
      const row = document.createElement("tr");
      
      const catObj = categories.find(c => c.name === tx.category) || { emoji: "🏷️", color: "#64748b" };
      const valStr = `${currency}${parseFloat(tx.amount).toFixed(2)}`;
      const classAmt = tx.type === "income" ? "amount-income" : "amount-expense";
      const displayAmt = tx.type === "income" ? `+ ${valStr}` : `- ${valStr}`;

      const checkedStr = selectedTxIds.has(tx.id) ? "checked" : "";

      row.innerHTML = `
        <td><input type="checkbox" class="tx-row-checkbox" data-id="${tx.id}" ${checkedStr}></td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${tx.title}</div>
          ${tx.isRecurring ? `<span style="font-size:0.75rem; color: var(--accent); font-weight: 500;">🔁 Recurring (${tx.recurring.frequency})</span>` : ""}
        </td>
        <td>
          <span class="badge-row-category" style="background-color: ${catObj.color}15; color: ${catObj.color};">
            <span>${catObj.emoji}</span> ${tx.category}
          </span>
        </td>
        <td style="color: var(--text-secondary);">${tx.date}</td>
        <td style="text-align: right;" class="${classAmt}">${displayAmt}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm edit-tx-btn" data-id="${tx.id}" style="padding: 4px 8px; margin-right: 4px;">Edit</button>
          <button class="btn btn-danger btn-sm delete-tx-btn" data-id="${tx.id}" style="padding: 4px 8px;">Delete</button>
        </td>
      `;

      // Inline triggers
      row.querySelector(".edit-tx-btn").addEventListener("click", () => this.editTransaction(user, tx.id));
      row.querySelector(".delete-tx-btn").addEventListener("click", () => this.deleteTransaction(user, tx.id));

      const checkbox = row.querySelector(".tx-row-checkbox");
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) selectedTxIds.add(tx.id);
        else selectedTxIds.delete(tx.id);
        this.updateBulkActionsRow();
      });

      tbody.appendChild(row);
    });

    countInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${total}`;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = endIndex === total;
  },

  // Export CSV
  async exportCSV(username) {
    const txs = await Database.getAll(username, "transactions");
    if (txs.length === 0) {
      alert("No transaction entries available for export.");
      return;
    }
    
    // Sort by date desc
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));

    let csv = "Title,Type,Category,Date,Amount\n";
    txs.forEach(t => {
      const cleanTitle = t.title.replace(/"/g, '""');
      csv += `"${cleanTitle}",${t.type},"${t.category}",${t.date},${t.amount}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clearbook_${username}_transactions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Import CSV methods
  letImportData: [],
  handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      this.parseCsvContent(text);
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = "";
  },

  parseCsvContent(text) {
    const rows = [];
    const lines = text.split(/\r\n|\n/);
    if (lines.length <= 1) {
      alert("Empty CSV template or sheet uploaded.");
      return;
    }

    const headers = lines[0].split(",");
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle simple comma separation (ignores escaped quotes for standard imports)
      const values = [];
      let currentVal = "";
      let inQuotes = false;
      
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentVal.trim());
          currentVal = "";
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim());

      if (values.length >= 5) {
        const title = values[0].replace(/^"|"$/g, "");
        const type = values[1].toLowerCase().trim() === "income" ? "income" : "expense";
        const category = values[2].replace(/^"|"$/g, "");
        const date = values[3];
        const amount = Math.abs(parseFloat(values[4])) || 0;

        if (title && date && amount > 0) {
          rows.push({ title, type, category, date, amount });
        }
      }
    }

    if (rows.length === 0) {
      alert("Could not parse any valid transaction rows. Make sure the headers match: Title,Type,Category,Date,Amount");
      return;
    }

    this.letImportData = rows;
    this.showCsvImportPreview();
  },

  showCsvImportPreview() {
    const tbody = document.getElementById("csv-preview-tbody");
    tbody.innerHTML = "";

    const currency = Storage.getCurrency();

    this.letImportData.forEach(row => {
      const tr = document.createElement("tr");
      const valStr = `${currency}${row.amount.toFixed(2)}`;
      const classAmt = row.type === "income" ? "amount-income" : "amount-expense";
      
      tr.innerHTML = `
        <td style="font-weight:600;">${row.title}</td>
        <td style="text-transform: capitalize; font-weight:500;">${row.type}</td>
        <td>${row.category}</td>
        <td>${row.date}</td>
        <td style="text-align: right;" class="${classAmt}">${valStr}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("modal-csv-preview").classList.add("active");
  },

  async confirmCsvImport(username) {
    if (this.letImportData.length === 0) return;

    try {
      const promises = this.letImportData.map(row => {
        const data = {
          title: row.title,
          type: row.type,
          category: row.category,
          date: row.date,
          amount: row.amount,
          isRecurring: false,
          updatedAt: new Date().toISOString()
        };
        return Database.add(username, "transactions", data);
      });

      await Promise.all(promises);
      
      closeModal("modal-csv-preview");
      this.letImportData = [];
      alert("Transactions imported successfully!");
      renderDashboard();
    } catch (e) {
      console.error(e);
      alert("Failed to bulk save imported transactions.");
    }
  }
};
