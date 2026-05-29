// Clearbook Savings Goals Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { renderDashboard } from "./app.js";
import { AlertsEngine } from "./alerts.js";

export const Savings = {
  async init(username) {
    // Form submission
    document.getElementById("saving-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveGoal(username);
    });

    document.getElementById("btn-add-saving-goal").addEventListener("click", () => {
      this.openAddGoalModal();
    });
  },

  openAddGoalModal() {
    document.getElementById("saving-modal-title").textContent = "New Savings Goal";
    document.getElementById("saving-edit-id").value = "";
    document.getElementById("saving-name").value = "";
    document.getElementById("saving-target").value = "";
    document.getElementById("saving-current").value = "0.00";
    document.getElementById("saving-date").value = "";
    document.getElementById("saving-emoji").value = "🐖";

    document.getElementById("modal-saving").classList.add("active");
  },

  async saveGoal(username) {
    const goalId = document.getElementById("saving-edit-id").value;
    const emoji = document.getElementById("saving-emoji").value;
    const name = document.getElementById("saving-name").value.trim();
    const targetAmount = parseFloat(document.getElementById("saving-target").value);
    const currentAmount = parseFloat(document.getElementById("saving-current").value) || 0;
    const targetDate = document.getElementById("saving-date").value;

    if (!name || isNaN(targetAmount) || targetAmount <= 0) {
      alert("Please configure a valid goal name and target amount.");
      return;
    }

    // Check if updating or adding
    let oldGoal = null;
    if (goalId) {
      oldGoal = await Database.get(username, "savings", goalId);
    }

    const goalData = {
      emoji,
      name,
      targetAmount,
      currentAmount,
      targetDate: targetDate || null,
      updatedAt: new Date().toISOString(),
      createdAt: oldGoal ? (oldGoal.createdAt || new Date().toISOString()) : new Date().toISOString(),
      highestMilestone: oldGoal ? (oldGoal.highestMilestone || 0) : 0
    };

    // Calculate milestone crossing for celebration
    const ratio = currentAmount / targetAmount;
    let crossedMilestone = 0;
    if (ratio >= 1.0) crossedMilestone = 100;
    else if (ratio >= 0.75) crossedMilestone = 75;
    else if (ratio >= 0.50) crossedMilestone = 50;
    else if (ratio >= 0.25) crossedMilestone = 25;

    // Trigger celebration if it's a new milestone height
    if (crossedMilestone > goalData.highestMilestone) {
      goalData.highestMilestone = crossedMilestone;
      
      const desc = `Congratulations! You've saved ${crossedMilestone}% (${Storage.getCurrency()}${currentAmount.toFixed(2)}) towards your goal for "${emoji} ${name}".`;
      AlertsEngine.triggerSavingsCelebration(crossedMilestone, desc);
      
      // Save alert to database
      const alertId = `saving_${crossedMilestone}_${goalId || Date.now().toString()}`;
      await Database.set(username, "alerts", alertId, {
        id: alertId,
        type: "savings",
        title: `Savings Milestone reached! 🎉`,
        description: desc,
        level: crossedMilestone === 100 ? "success" : "info",
        createdAt: new Date().toISOString(),
        targetId: goalId || null,
        dismissed: false,
        pct: crossedMilestone
      });
    }

    try {
      if (goalId) {
        await Database.update(username, "savings", goalId, goalData);
      } else {
        await Database.add(username, "savings", goalData);
      }

      closeModal("modal-saving");
      renderDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to save savings goal.");
    }
  },

  async editGoal(username, goalId) {
    const goal = await Database.get(username, "savings", goalId);
    if (!goal) return;

    document.getElementById("saving-modal-title").textContent = "Edit Savings Goal";
    document.getElementById("saving-edit-id").value = goal.id;
    document.getElementById("saving-name").value = goal.name;
    document.getElementById("saving-target").value = goal.targetAmount;
    document.getElementById("saving-current").value = goal.currentAmount;
    document.getElementById("saving-date").value = goal.targetDate || "";
    document.getElementById("saving-emoji").value = goal.emoji;

    document.getElementById("modal-saving").classList.add("active");
  },

  async deleteGoal(username, goalId) {
    if (confirm("Are you sure you want to delete this savings goal?")) {
      await Database.delete(username, "savings", goalId);
      renderDashboard();
    }
  },

  renderSavingsList(savings) {
    const container = document.getElementById("savings-goals-grid");
    if (!container) return;

    container.innerHTML = "";
    const user = Storage.getCurrentUser();
    const currency = Storage.getCurrency();

    if (savings.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 32px 16px; color: var(--text-secondary);">
          <p>No savings goals created yet. Set targets, log progress, and visualize projected finish dates.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-add-saving-goal').click()" style="margin-top: 16px;">New Savings Goal</button>
        </div>
      `;
      return;
    }

    savings.forEach(goal => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.gap = "10px";

      const target = parseFloat(goal.targetAmount);
      const current = parseFloat(goal.currentAmount);
      const ratio = target > 0 ? current / target : 0;
      const percentage = Math.min(ratio * 100, 100);

      // Days remaining estimation
      let daysRemainingText = "No target date set";
      if (goal.targetDate) {
        const targetD = new Date(goal.targetDate);
        const today = new Date();
        const diffTime = targetD.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemainingText = diffDays > 0 ? `${diffDays} days remaining` : "Target date reached";
      }

      // Projected completion calculation based on daily contribution rate since goal creation
      const createdTime = goal.createdAt ? new Date(goal.createdAt).getTime() : Date.now() - 24 * 60 * 60 * 1000;
      const daysElapsed = Math.max(1, (Date.now() - createdTime) / (1000 * 60 * 60 * 24));
      const dailyContribution = current / daysElapsed;
      const monthlyContribution = dailyContribution * 30.4;
      
      let projectedFinishText = "Insufficient contribution history";
      if (dailyContribution > 0.01 && current < target) {
        const remainingAmt = target - current;
        const daysToFinish = remainingAmt / dailyContribution;
        const finishDate = new Date(Date.now() + daysToFinish * 24 * 60 * 60 * 1000);
        projectedFinishText = `Proj. finish: ${finishDate.toLocaleDateString()}`;
      } else if (current >= target) {
        projectedFinishText = "Goal completed! 🎉";
      }

      card.innerHTML = `
        <div class="card-header-row" style="align-items: flex-start;">
          <div style="font-size: 2.2rem; line-height: 1; padding: 4px; background: var(--bg-color); border-radius: 8px;">
            ${goal.emoji || "🐖"}
          </div>
          <div style="flex: 1; padding-left: 12px; min-width: 0;">
            <h4 style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${goal.name}</h4>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${daysRemainingText}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 4px;">
          <span style="font-weight: 600; color: var(--text-primary);">${currency}${current.toFixed(2)}</span>
          <span style="color: var(--text-secondary);">Target: ${currency}${target.toFixed(2)}</span>
        </div>

        <div class="progress-bar-container" style="height: 10px;">
          <div class="progress-bar-fill accent" style="width: ${percentage}%;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-top: -2px;">
          <span>${percentage.toFixed(0)}% complete</span>
          <span>${projectedFinishText}</span>
        </div>

        <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 4px;">
          <button class="btn btn-secondary btn-sm edit-saving-btn" style="flex: 1; padding: 4px 8px;">Edit</button>
          <button class="btn btn-danger btn-sm delete-saving-btn" style="padding: 4px 8px;">Delete</button>
        </div>
      `;

      card.querySelector(".edit-saving-btn").addEventListener("click", () => this.editGoal(user, goal.id));
      card.querySelector(".delete-saving-btn").addEventListener("click", () => this.deleteGoal(user, goal.id));

      container.appendChild(card);
    });
  }
};
