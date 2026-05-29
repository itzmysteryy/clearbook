// Clearbook Dynamic Alerts Engine
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";

// Helper to format currency
function formatVal(amount) {
  const sym = Storage.getCurrency();
  return `${sym}${parseFloat(amount).toFixed(2)}`;
}

export const AlertsEngine = {
  activeBanners: new Set(),

  // Run scans and update database alerts
  async scanAndSyncAlerts(username, transactions, budgets, savings, recurringTxList) {
    if (!username) return;

    // Fetch current alerts in Firestore
    const existingAlerts = await Database.getAll(username, "alerts");
    const existingMap = new Map(existingAlerts.map(a => [a.id, a]));

    const newAlerts = [];

    // 1. Scan Budgets
    for (const budget of budgets) {
      const start = new Date(budget.startDate);
      const end = new Date(budget.endDate);

      // Filter transactions within budget range
      const budgetTx = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === "expense" && d >= start && d <= end;
      });

      // Aggregate spend per category
      const categorySpend = {};
      for (const t of budgetTx) {
        categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
      }

      // Check limits
      if (budget.limits) {
        for (const [category, limitStr] of Object.entries(budget.limits)) {
          const limit = parseFloat(limitStr);
          if (limit <= 0) continue;

          const spent = categorySpend[category] || 0;
          const ratio = spent / limit;
          
          if (ratio >= 1.0) {
            const alertId = `budget_100_${budget.id}_${category}`;
            newAlerts.push({
              id: alertId,
              type: "budget",
              title: "Budget Exceeded! 🚨",
              description: `You spent ${formatVal(spent)} of your ${formatVal(limit)} budget limit for ${category} in "${budget.name}".`,
              level: "danger",
              createdAt: new Date().toISOString(),
              targetId: budget.id
            });
          } else if (ratio >= 0.80) {
            const alertId = `budget_80_${budget.id}_${category}`;
            newAlerts.push({
              id: alertId,
              type: "budget",
              title: "Budget Warning (80%) ⚠️",
              description: `You spent ${formatVal(spent)} of your ${formatVal(limit)} budget limit for ${category} in "${budget.name}".`,
              level: "warning",
              createdAt: new Date().toISOString(),
              targetId: budget.id
            });
          }
        }
      }
    }

    // 2. Scan Savings Milestones
    for (const goal of savings) {
      const target = parseFloat(goal.targetAmount);
      const current = parseFloat(goal.currentAmount);
      if (target <= 0) continue;

      const ratio = current / target;
      const milestones = [1.0, 0.75, 0.50, 0.25];

      for (const ms of milestones) {
        if (ratio >= ms) {
          const pct = ms * 100;
          const alertId = `saving_${pct}_${goal.id}`;
          newAlerts.push({
            id: alertId,
            type: "savings",
            title: `Savings Milestone reached! 🎉`,
            description: `You've saved ${pct}% (${formatVal(current)}) of your target for "${goal.emoji} ${goal.name}".`,
            level: pct === 100 ? "success" : "info",
            createdAt: new Date().toISOString(),
            targetId: goal.id,
            pct: pct // Keep milestone percentage
          });
          // Break to only trigger the highest milestone alert
          break;
        }
      }
    }

    // 3. Scan Upcoming Bills (recurring items due in the next 7 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of recurringTxList) {
      if (item.type !== "expense" || item.paused) continue;
      
      const nextDate = new Date(item.nextOccurrence);
      if (isNaN(nextDate.getTime())) continue;

      const diffTime = nextDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // If bill is due within 7 days (or overdue)
      if (diffDays >= 0 && diffDays <= 7) {
        const nextDateStr = item.nextOccurrence.split("T")[0];
        const alertId = `bill_${item.id}_${nextDateStr}`;
        newAlerts.push({
          id: alertId,
          type: "bill",
          title: `Upcoming Bill: ${item.title} 📅`,
          description: `Your recurring payment is due in ${diffDays} day${diffDays === 1 ? "" : "s"} (${nextDateStr}) for ${formatVal(item.amount)}.`,
          level: diffDays <= 3 ? "danger" : "warning",
          createdAt: new Date().toISOString(),
          targetId: item.id
        });
      }
    }

    // Update Firestore for any alerts that don't exist yet
    for (const alert of newAlerts) {
      if (!existingMap.has(alert.id)) {
        // Create as active
        alert.dismissed = false;
        await Database.set(username, "alerts", alert.id, alert);
        
        // If this is a brand new savings milestone milestone, trigger a celebration modal
        if (alert.type === "savings") {
          this.triggerSavingsCelebration(alert.pct, alert.description);
        }
      }
    }
  },

  // Display celebration modal
  triggerSavingsCelebration(percentage, description) {
    const celebration = document.getElementById("milestone-celebration");
    if (!celebration) return;

    document.getElementById("celebration-emoji").textContent = percentage === 100 ? "🏆" : "🎉";
    document.getElementById("celebration-title").textContent = percentage === 100 ? "Goal Fully Met!" : `${percentage}% Milestone Met!`;
    document.getElementById("celebration-desc").textContent = description;
    celebration.classList.add("active");

    window.dismissCelebration = () => {
      celebration.classList.remove("active");
    };
  },

  // Check database and update UI lists & badges
  renderAlertsList(alerts) {
    const activeList = document.getElementById("alerts-active-list");
    const historyList = document.getElementById("alerts-history-list");
    const badge = document.getElementById("unread-alert-badge");

    if (!activeList || !historyList) return;

    activeList.innerHTML = "";
    historyList.innerHTML = "";

    const activeAlerts = alerts.filter(a => !a.dismissed);
    const dismissedAlerts = alerts.filter(a => a.dismissed);

    // Update Badge
    if (activeAlerts.length > 0) {
      badge.textContent = activeAlerts.length;
      badge.style.display = "block";
    } else {
      badge.style.display = "none";
    }

    // Render Active
    if (activeAlerts.length === 0) {
      activeList.innerHTML = `<p class="text-secondary" style="font-size: 0.9rem; text-align: center; padding: 12px 0;">No active notifications.</p>`;
    } else {
      // Sort newest first
      activeAlerts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      activeAlerts.forEach(alert => {
        const item = this.createAlertRow(alert, true);
        activeList.appendChild(item);
        
        // Show banner notification if not already shown in session
        this.showSlideInBanner(alert);
      });
    }

    // Render History
    if (dismissedAlerts.length === 0) {
      historyList.innerHTML = `<p class="text-secondary" style="font-size: 0.9rem; text-align: center; padding: 12px 0;">No dismissed notification records.</p>`;
    } else {
      dismissedAlerts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      dismissedAlerts.forEach(alert => {
        const item = this.createAlertRow(alert, false);
        historyList.appendChild(item);
      });
    }
  },

  createAlertRow(alert, isActive) {
    const row = document.createElement("div");
    row.className = `alert-banner ${alert.level || "info"}`;
    row.style.position = "static";
    row.style.width = "100%";
    row.style.maxWidth = "none";
    row.style.boxShadow = "none";
    row.style.border = "1px solid var(--border-color)";
    row.style.borderLeftWidth = "4px";

    const emoji = alert.level === "danger" ? "🚨" : (alert.level === "warning" ? "⚠️" : "ℹ️");

    row.innerHTML = `
      <span class="alert-banner-icon">${emoji}</span>
      <div class="alert-banner-content">
        <span class="alert-banner-title" style="color: var(--text-primary);">${alert.title}</span>
        <span class="alert-banner-desc">${alert.description}</span>
        <span style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
          ${new Date(alert.createdAt).toLocaleString()}
        </span>
      </div>
      ${isActive ? `<button class="alert-banner-close" data-id="${alert.id}">✓ Dismiss</button>` : ""}
    `;

    if (isActive) {
      row.querySelector(".alert-banner-close").addEventListener("click", () => {
        const user = Storage.getCurrentUser();
        Database.update(user, "alerts", alert.id, { dismissed: true });
      });
    }

    return row;
  },

  showSlideInBanner(alert) {
    if (this.activeBanners.has(alert.id)) return;
    this.activeBanners.add(alert.id);

    const container = document.getElementById("alert-banner-container");
    if (!container) return;

    const banner = document.createElement("div");
    banner.className = `alert-banner ${alert.level || "info"}`;
    const emoji = alert.level === "danger" ? "🚨" : (alert.level === "warning" ? "⚠️" : "ℹ️");

    banner.innerHTML = `
      <span class="alert-banner-icon">${emoji}</span>
      <div class="alert-banner-content">
        <span class="alert-banner-title">${alert.title}</span>
        <span class="alert-banner-desc">${alert.description}</span>
      </div>
      <button class="alert-banner-close">&times;</button>
    `;

    banner.querySelector(".alert-banner-close").addEventListener("click", () => {
      this.dismissBanner(banner, alert.id);
    });

    // Auto dismiss banner after 5 seconds
    setTimeout(() => {
      this.dismissBanner(banner, alert.id);
    }, 5000);

    container.appendChild(banner);
  },

  dismissBanner(banner, id) {
    if (!banner.parentNode) return;
    banner.classList.add("dismissing");
    banner.addEventListener("animationend", () => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    });
    // Fallback if animation fails
    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 300);
  }
};
