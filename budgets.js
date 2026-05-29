// Clearbook Budgets Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { renderDashboard } from "./app.js";
import { DEFAULT_CATEGORIES } from "./transactions.js";

let categories = [];

export const Budgets = {
  async init(username) {
    // Fill category inputs dynamically on page load/modals opening
    await this.loadCategories(username);

    // Form submission
    document.getElementById("budget-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveBudget(username);
    });

    document.getElementById("btn-add-budget").addEventListener("click", () => {
      this.openAddBudgetModal();
    });
  },

  async loadCategories(username) {
    const custom = await Database.getAll(username, "settings");
    const userSettings = custom.find(c => c.id === "userSettings");
    
    if (userSettings && userSettings.categories) {
      categories = userSettings.categories;
    } else {
      categories = [...DEFAULT_CATEGORIES];
    }
  },

  openAddBudgetModal() {
    document.getElementById("budget-modal-title").textContent = "Create Budget Plan";
    document.getElementById("budget-edit-id").value = "";
    document.getElementById("budget-name").value = "";
    document.getElementById("budget-start").value = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    document.getElementById("budget-end").value = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];

    this.renderCategoryLimitInputs({});

    document.getElementById("modal-budget").classList.add("active");
  },

  renderCategoryLimitInputs(existingLimits) {
    const container = document.getElementById("budget-category-limits");
    container.innerHTML = "";

    categories.forEach(cat => {
      const limitVal = existingLimits[cat.name] || "";
      const row = document.createElement("div");
      row.className = "form-group";
      row.style.flexDirection = "row";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "8px";

      row.innerHTML = `
        <span style="font-weight: 500; font-size: 0.9rem;">${cat.emoji} ${cat.name}</span>
        <div style="position: relative; max-width: 140px;">
          <span style="position: absolute; left: 10px; top: 10px; font-size: 0.85rem; color: var(--text-secondary); font-weight: bold;">${Storage.getCurrency()}</span>
          <input type="number" class="input-control budget-limit-field" data-category="${cat.name}" value="${limitVal}" placeholder="No limit" style="padding-left: 24px; text-align: right; height: 36px;">
        </div>
      `;
      container.appendChild(row);
    });
  },

  async saveBudget(username) {
    const budgetId = document.getElementById("budget-edit-id").value;
    const name = document.getElementById("budget-name").value.trim();
    const startDate = document.getElementById("budget-start").value;
    const endDate = document.getElementById("budget-end").value;

    if (!name || !startDate || !endDate) {
      alert("Please fill in all details.");
      return;
    }

    // Compile limit objects
    const limits = {};
    const limitInputs = document.querySelectorAll(".budget-limit-field");
    limitInputs.forEach(input => {
      const category = input.getAttribute("data-category");
      const val = parseFloat(input.value);
      if (val > 0) {
        limits[category] = val;
      }
    });

    const budgetData = {
      name,
      startDate,
      endDate,
      limits,
      updatedAt: new Date().toISOString()
    };

    try {
      if (budgetId) {
        await Database.update(username, "budgets", budgetId, budgetData);
      } else {
        await Database.add(username, "budgets", budgetData);
      }

      closeModal("modal-budget");
      renderDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to save budget plan.");
    }
  },

  async editBudget(username, budgetId) {
    const budget = await Database.get(username, "budgets", budgetId);
    if (!budget) return;

    document.getElementById("budget-modal-title").textContent = "Edit Budget Plan";
    document.getElementById("budget-edit-id").value = budget.id;
    document.getElementById("budget-name").value = budget.name;
    document.getElementById("budget-start").value = budget.startDate;
    document.getElementById("budget-end").value = budget.endDate;

    this.renderCategoryLimitInputs(budget.limits || {});

    document.getElementById("modal-budget").classList.add("active");
  },

  async deleteBudget(username, budgetId) {
    if (confirm("Are you sure you want to delete this budget plan?")) {
      await Database.delete(username, "budgets", budgetId);
      renderDashboard();
    }
  },

  // Compile calculations and render cards
  renderBudgetsList(budgets, transactions) {
    const container = document.getElementById("budgets-list-container");
    if (!container) return;

    container.innerHTML = "";
    const user = Storage.getCurrentUser();
    const currency = Storage.getCurrency();

    if (budgets.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 32px 16px; color: var(--text-secondary);">
          <p>No budgets created yet. Budgets help you keep track of category spending limits over custom timeframes.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-add-budget').click()" style="margin-top: 16px;">Create Budget</button>
        </div>
      `;
      return;
    }

    // Sort newest start date first
    budgets.sort((a,b) => new Date(b.startDate) - new Date(a.startDate));

    budgets.forEach(budget => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.gap = "12px";

      const start = new Date(budget.startDate);
      const end = new Date(budget.endDate);

      // Filter transactions within budget bounds
      const budgetTx = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === "expense" && d >= start && d <= end;
      });

      // Sum spent per category
      const categorySpend = {};
      let totalSpent = 0;
      budgetTx.forEach(t => {
        categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
        totalSpent += parseFloat(t.amount);
      });

      // Sum total limits budgeted
      let totalLimit = 0;
      if (budget.limits) {
        Object.values(budget.limits).forEach(v => {
          totalLimit += parseFloat(v);
        });
      }

      const totalProgress = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
      const progressColor = totalProgress >= 100 ? "danger" : (totalProgress >= 75 ? "warning" : "success");

      // Draw expandable category progress bars
      let categoriesRowsHtml = "";
      if (budget.limits && Object.keys(budget.limits).length > 0) {
        Object.entries(budget.limits).forEach(([catName, limitStr]) => {
          const limit = parseFloat(limitStr);
          const spent = categorySpend[catName] || 0;
          const ratio = spent / limit;
          const percentage = Math.min(ratio * 100, 100);
          
          const barColor = ratio >= 1.0 ? "danger" : (ratio >= 0.75 ? "warning" : "success");
          
          const diff = limit - spent;
          const statusText = diff >= 0 
            ? `${formatVal(diff)} remaining` 
            : `${formatVal(Math.abs(diff))} overspent`;
          const statusClass = diff >= 0 ? "amount-income" : "amount-expense";

          const catObj = categories.find(c => c.name === catName) || { emoji: "🏷️", color: "#64748b" };

          categoriesRowsHtml += `
            <div style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                <span style="font-weight: 500;">${catObj.emoji} ${catName}</span>
                <span style="color: var(--text-secondary);">${formatVal(spent)} of ${formatVal(limit)}</span>
              </div>
              <div class="progress-bar-container" style="height: 6px;">
                <div class="progress-bar-fill ${barColor}" style="width: ${percentage}%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 2px;">
                <span class="${statusClass}">${statusText}</span>
                <span style="color: var(--text-muted);">${(ratio * 100).toFixed(0)}%</span>
              </div>
            </div>
          `;
        });
      } else {
        categoriesRowsHtml = `<p class="text-secondary" style="font-size: 0.8rem; font-style: italic;">No specific category limits set.</p>`;
      }

      card.innerHTML = `
        <div class="card-header-row">
          <div>
            <h4 style="font-size: 1.15rem; font-weight: 700;">${budget.name}</h4>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${budget.startDate} to ${budget.endDate}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm edit-budget-btn" style="padding: 4px 8px;">Edit</button>
            <button class="btn btn-danger btn-sm delete-budget-btn" style="padding: 4px 8px;">Delete</button>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px; font-weight: 600;">
            <span>Overall Spending Progress</span>
            <span>${formatVal(totalSpent)} ${totalLimit > 0 ? `of ${formatVal(totalLimit)}` : ""}</span>
          </div>
          ${totalLimit > 0 ? `
            <div class="progress-bar-container" style="height: 10px;">
              <div class="progress-bar-fill ${progressColor}" style="width: ${Math.min(totalProgress, 100)}%;"></div>
            </div>
            <div style="text-align: right; font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
              ${totalProgress.toFixed(0)}% spent
            </div>
          ` : ""}
        </div>

        <button class="btn btn-secondary btn-sm toggle-details-btn" style="width: 100%; justify-content: center; gap: 4px; font-size: 0.8rem;">
          👁️ Toggle Categories Breakdown
        </button>

        <div class="budget-drill-down" style="display: none; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 4px; animation: fadeIn 0.2s;">
          ${categoriesRowsHtml}
        </div>
      `;

      // Event hookups
      card.querySelector(".edit-budget-btn").addEventListener("click", () => this.editBudget(user, budget.id));
      card.querySelector(".delete-budget-btn").addEventListener("click", () => this.deleteBudget(user, budget.id));
      
      const detailsBtn = card.querySelector(".toggle-details-btn");
      const detailsSection = card.querySelector(".budget-drill-down");
      detailsBtn.addEventListener("click", () => {
        const isHidden = detailsSection.style.display === "none";
        detailsSection.style.display = isHidden ? "block" : "none";
        detailsBtn.textContent = isHidden ? "👁️ Hide Categories Breakdown" : "👁️ Toggle Categories Breakdown";
      });

      container.appendChild(card);
    });
  }
};

function formatVal(amount) {
  const sym = Storage.getCurrency();
  return `${sym}${parseFloat(amount).toFixed(2)}`;
}
