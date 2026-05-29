// Clearbook Debt & Loan Tracker Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { renderDashboard } from "./app.js";

export const Debts = {
  async init(username) {
    // Form submission for creating/editing debt
    document.getElementById("debt-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveDebt(username);
    });

    // Form submission for logging a payment
    document.getElementById("debt-payment-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.savePayment(username);
    });

    document.getElementById("btn-add-debt").addEventListener("click", () => {
      this.openAddDebtModal();
    });
  },

  openAddDebtModal() {
    document.getElementById("debt-modal-title").textContent = "Track Debt / Loan";
    document.getElementById("debt-edit-id").value = "";
    document.getElementById("debt-name").value = "";
    document.getElementById("debt-type").value = "owe";
    document.getElementById("debt-total").value = "";
    document.getElementById("debt-remaining").value = "";
    document.getElementById("debt-rate").value = "";
    document.getElementById("debt-payment").value = "";
    document.getElementById("debt-due-date").value = new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()).toISOString().split("T")[0];

    document.getElementById("modal-debt").classList.add("active");
  },

  async saveDebt(username) {
    const debtId = document.getElementById("debt-edit-id").value;
    const name = document.getElementById("debt-name").value.trim();
    const type = document.getElementById("debt-type").value;
    const totalAmount = parseFloat(document.getElementById("debt-total").value);
    const remainingAmount = parseFloat(document.getElementById("debt-remaining").value);
    const interestRate = parseFloat(document.getElementById("debt-rate").value) || 0;
    const monthlyPayment = parseFloat(document.getElementById("debt-payment").value);
    const dueDate = document.getElementById("debt-due-date").value;

    if (!name || isNaN(totalAmount) || isNaN(remainingAmount) || isNaN(monthlyPayment) || !dueDate) {
      alert("Please fill in all required debt fields.");
      return;
    }

    // Retain totalInterestPaid if editing
    let oldDebt = null;
    if (debtId) {
      oldDebt = await Database.get(username, "debts", debtId);
    }

    const debtData = {
      name,
      type, // 'owe' or 'owed'
      totalAmount,
      remainingAmount,
      interestRate,
      monthlyPayment,
      dueDate,
      totalInterestPaid: oldDebt ? (oldDebt.totalInterestPaid || 0) : 0,
      lastPaymentDate: oldDebt ? (oldDebt.lastPaymentDate || null) : null,
      updatedAt: new Date().toISOString()
    };

    try {
      if (debtId) {
        await Database.update(username, "debts", debtId, debtData);
      } else {
        await Database.add(username, "debts", debtData);
      }

      closeModal("modal-debt");
      renderDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to save debt.");
    }
  },

  openLogPaymentModal(debtId) {
    document.getElementById("debt-payment-id").value = debtId;
    document.getElementById("debt-payment-amount").value = "";
    document.getElementById("debt-payment-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("modal-debt-payment").classList.add("active");
  },

  async savePayment(username) {
    const debtId = document.getElementById("debt-payment-id").value;
    const payAmount = parseFloat(document.getElementById("debt-payment-amount").value);
    const payDate = document.getElementById("debt-payment-date").value;

    if (isNaN(payAmount) || payAmount <= 0 || !payDate) {
      alert("Please input a valid payment amount and date.");
      return;
    }

    try {
      const debt = await Database.get(username, "debts", debtId);
      if (!debt) {
        alert("Debt record not found.");
        return;
      }

      // Calculate interest portion if rate is set
      let interestPortion = 0;
      let principalPortion = payAmount;

      if (debt.interestRate > 0) {
        // Approximate monthly interest accrued since last payment (or just 1 month default)
        const lastPay = debt.lastPaymentDate ? new Date(debt.lastPaymentDate) : new Date();
        const currentPay = new Date(payDate);
        const diffTime = Math.max(0, currentPay.getTime() - lastPay.getTime());
        const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.4) || 1; // Default to 1 month if same day

        const monthlyRate = (debt.interestRate / 100) / 12;
        interestPortion = debt.remainingAmount * monthlyRate * diffMonths;
        // Interest portion shouldn't exceed payment amount
        interestPortion = Math.min(interestPortion, payAmount);
        principalPortion = payAmount - interestPortion;
      }

      const newRemaining = Math.max(0, debt.remainingAmount - principalPortion);
      const totalInterest = (debt.totalInterestPaid || 0) + interestPortion;

      // Update debt document
      await Database.update(username, "debts", debtId, {
        remainingAmount: newRemaining,
        totalInterestPaid: totalInterest,
        lastPaymentDate: payDate,
        updatedAt: new Date().toISOString()
      });

      // Automatically log transaction in ledger
      const txData = {
        title: `Payment: ${debt.name}`,
        amount: payAmount,
        category: "Debt Payment",
        date: payDate,
        type: debt.type === "owe" ? "expense" : "income", // I owe (paying is expense), Owed to me (receiving payment is income)
        isRecurring: false,
        updatedAt: new Date().toISOString()
      };
      await Database.add(username, "transactions", txData);

      closeModal("modal-debt-payment");
      renderDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to log payment.");
    }
  },

  async editDebt(username, debtId) {
    const debt = await Database.get(username, "debts", debtId);
    if (!debt) return;

    document.getElementById("debt-modal-title").textContent = "Edit Debt / Loan";
    document.getElementById("debt-edit-id").value = debt.id;
    document.getElementById("debt-name").value = debt.name;
    document.getElementById("debt-type").value = debt.type;
    document.getElementById("debt-total").value = debt.totalAmount;
    document.getElementById("debt-remaining").value = debt.remainingAmount;
    document.getElementById("debt-rate").value = debt.interestRate || "";
    document.getElementById("debt-payment").value = debt.monthlyPayment;
    document.getElementById("debt-due-date").value = debt.dueDate;

    document.getElementById("modal-debt").classList.add("active");
  },

  async deleteDebt(username, debtId) {
    if (confirm("Are you sure you want to delete this debt tracker?")) {
      await Database.delete(username, "debts", debtId);
      renderDashboard();
    }
  },

  renderDebtsList(debts) {
    const container = document.getElementById("debts-list-container");
    if (!container) return;

    container.innerHTML = "";
    const user = Storage.getCurrentUser();
    const currency = Storage.getCurrency();

    if (debts.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 32px 16px; color: var(--text-secondary);">
          <p>No debts or loans tracked yet. Track lenders, interest rates, and see payoff schedules.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-add-debt').click()" style="margin-top: 16px;">Add Loan / Debt</button>
        </div>
      `;
      return;
    }

    // Default sort: highest remaining balance first
    debts.sort((a, b) => parseFloat(b.remainingAmount) - parseFloat(a.remainingAmount));

    debts.forEach(debt => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.gap = "12px";

      const total = parseFloat(debt.totalAmount);
      const remaining = parseFloat(debt.remainingAmount);
      const monthly = parseFloat(debt.monthlyPayment);
      const rate = parseFloat(debt.interestRate);

      const ratio = total > 0 ? (total - remaining) / total : 0;
      const progressPercentage = Math.min(Math.max(ratio * 100, 0), 100);

      // payoff math
      let payoffDateText = "N/A";
      let statusAlert = "";

      if (remaining <= 0) {
        payoffDateText = "Debt Fully Paid! 🎉";
      } else if (monthly > 0) {
        if (rate > 0) {
          const r = (rate / 100) / 12;
          if (monthly <= remaining * r) {
            payoffDateText = "Never paid off at this rate (Interest > Payment)";
            statusAlert = "color: var(--danger); font-weight: bold;";
          } else {
            const months = -Math.log(1 - (remaining * r) / monthly) / Math.log(1 + r);
            if (!isNaN(months)) {
              const payoffDate = new Date();
              payoffDate.setMonth(payoffDate.getMonth() + Math.ceil(months));
              payoffDateText = `Est. Payoff: ${payoffDate.toLocaleDateString()}`;
            } else {
              const monthsFallback = remaining / monthly;
              const payoffDate = new Date();
              payoffDate.setMonth(payoffDate.getMonth() + Math.ceil(monthsFallback));
              payoffDateText = `Est. Payoff: ${payoffDate.toLocaleDateString()} (estimate)`;
            }
          }
        } else {
          const months = remaining / monthly;
          const payoffDate = new Date();
          payoffDate.setMonth(payoffDate.getMonth() + Math.ceil(months));
          payoffDateText = `Est. Payoff: ${payoffDate.toLocaleDateString()}`;
        }
      }

      const badgeType = debt.type === "owe" ? "I Owe" : "Owed to Me";
      const badgeClass = debt.type === "owe" ? "amount-expense" : "amount-income";

      card.innerHTML = `
        <div class="card-header-row" style="align-items: flex-start;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="font-weight: 700; font-size: 1.1rem;">${debt.name}</h4>
              <span class="badge-row-category ${badgeClass}" style="background-color: currentColor; color: white; padding: 2px 8px; font-size: 0.7rem; border-radius: 4px;">
                ${badgeType}
              </span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted); ${statusAlert}">
              ${payoffDateText} ${rate > 0 ? `| Interest Rate: ${rate}%` : ""}
            </span>
          </div>
          <div style="display: flex; gap: 8px;">
            ${remaining > 0 ? `<button class="btn btn-primary btn-sm log-pay-btn" style="padding: 4px 8px;">💵 Log Payment</button>` : ""}
            <button class="btn btn-secondary btn-sm edit-debt-btn" style="padding: 4px 8px;">Edit</button>
            <button class="btn btn-danger btn-sm delete-debt-btn" style="padding: 4px 8px;">Delete</button>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 4px;">
          <span>Remaining: <strong style="color: var(--text-primary); font-size: 0.95rem;">${currency}${remaining.toFixed(2)}</strong></span>
          <span style="color: var(--text-secondary);">Total Limit: ${currency}${total.toFixed(2)}</span>
        </div>

        <div class="progress-bar-container" style="height: 10px;">
          <div class="progress-bar-fill ${debt.type === 'owe' ? 'danger' : 'success'}" style="width: ${progressPercentage}%;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-top: -2px;">
          <span>${progressPercentage.toFixed(0)}% paid back</span>
          <span>Interest Paid: ${currency}${(debt.totalInterestPaid || 0).toFixed(2)}</span>
        </div>
      `;

      if (remaining > 0) {
        card.querySelector(".log-pay-btn").addEventListener("click", () => this.openLogPaymentModal(debt.id));
      }
      card.querySelector(".edit-debt-btn").addEventListener("click", () => this.editDebt(user, debt.id));
      card.querySelector(".delete-debt-btn").addEventListener("click", () => this.deleteDebt(user, debt.id));

      container.appendChild(card);
    });
  }
};
