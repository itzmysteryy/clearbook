// Clearbook Dashboard Module
import { Storage } from "./storage.js";
import { DEFAULT_CATEGORIES } from "./transactions.js";

let categories = [];

export const Dashboard = {
  render(transactions, budgets, savings, debts, alerts, recurringTxList, settings = []) {
    const currency = Storage.getCurrency();

    // 1. Resolve custom categories settings
    const userSettings = settings.find(s => s.id === "userSettings");
    categories = userSettings && userSettings.categories ? userSettings.categories : [...DEFAULT_CATEGORIES];

    // 2. Overview totals (calculated relative to selected range. Let's filter by the last 30 days for dashboard net balance)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0,0,0,0);

    let rangeIncome = 0;
    let rangeExpense = 0;

    // Month metrics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthIncome = 0;
    let monthSpending = 0;

    transactions.forEach(t => {
      const d = new Date(t.date);
      const val = parseFloat(t.amount);

      // Range Totals
      if (d >= thirtyDaysAgo) {
        if (t.type === "income") rangeIncome += val;
        else rangeExpense += val;
      }

      // Month Totals
      if (d >= startOfMonth) {
        if (t.type === "income") monthIncome += val;
        else monthSpending += val;
      }
    });

    const netVal = rangeIncome - rangeExpense;
    
    // Set text contents
    const netEl = document.getElementById("dashboard-net-balance");
    netEl.textContent = `${netVal >= 0 ? "+" : ""}${currency}${netVal.toFixed(2)}`;
    netEl.className = `metric-value net ${netVal >= 0 ? "positive" : "negative"}`;

    document.getElementById("dashboard-month-spending").textContent = `${currency}${monthSpending.toFixed(2)}`;
    document.getElementById("dashboard-month-income").textContent = `${currency}${monthIncome.toFixed(2)}`;

    // 3. Render SVG Charts
    this.render30DayTrend(transactions, currency);
    this.renderCategoryDonut(transactions, currency);

    // 4. Recent Transactions List (Last 10)
    this.renderRecentTransactions(transactions, currency);

    // 5. Render Budget Progress List
    this.renderBudgetProgress(budgets, transactions, currency);

    // 6. Savings Goals List
    this.renderSavingsGoals(savings, currency);

    // 7. Upcoming Bills List
    this.renderUpcomingBills(recurringTxList, currency);
  },

  renderRecentTransactions(transactions, currency) {
    const tbody = document.getElementById("dashboard-recent-transactions-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    // Sort newest first
    const sorted = [...transactions].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px 0;">No transactions. Go to Transactions tab to add some!</td></tr>`;
      return;
    }

    sorted.forEach(t => {
      const tr = document.createElement("tr");
      const catObj = categories.find(c => c.name === t.category) || { emoji: "🏷️", color: "#64748b" };
      const amtVal = parseFloat(t.amount);
      
      const valStr = `${currency}${amtVal.toFixed(2)}`;
      const classAmt = t.type === "income" ? "amount-income" : "amount-expense";
      const displayAmt = t.type === "income" ? `+ ${valStr}` : `- ${valStr}`;

      tr.innerHTML = `
        <td style="font-weight: 600;">${t.title}</td>
        <td>
          <span class="badge-row-category" style="background-color: ${catObj.color}15; color: ${catObj.color};">
            <span>${catObj.emoji}</span> ${t.category}
          </span>
        </td>
        <td style="color: var(--text-secondary);">${t.date}</td>
        <td style="text-align: right;" class="${classAmt}">${displayAmt}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  render30DayTrend(transactions, currency) {
    const container = document.getElementById("dashboard-trend-chart-container");
    if (!container) return;

    container.innerHTML = "";

    // Generate dates for the last 30 days
    const dates = [];
    const expensesMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().split("T")[0];
      dates.push(str);
      expensesMap[str] = 0;
    }

    // Sum expenses per date
    transactions.forEach(t => {
      if (t.type === "expense" && expensesMap[t.date] !== undefined) {
        expensesMap[t.date] += parseFloat(t.amount);
      }
    });

    const maxVal = Math.max(...Object.values(expensesMap), 10); // Minimum scale floor of 10

    // Draw SVG Line Chart
    const svgWidth = 500;
    const svgHeight = 180;
    const padding = 20;
    const chartW = svgWidth - padding * 2;
    const chartH = svgHeight - padding * 2;

    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" style="font-family: inherit;">`;

    // Horizontal Y Grid lines
    for (let i = 0; i <= 3; i++) {
      const y = padding + (chartH / 3) * i;
      svg += `<line x1="${padding}" y1="${y}" x2="${svgWidth - padding}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="2" />`;
    }

    // Calculate coordinates points
    const stepX = chartW / 29;
    const points = [];

    dates.forEach((date, i) => {
      const x = padding + stepX * i;
      const y = padding + chartH - (expensesMap[date] / maxVal) * chartH;
      points.push({ x, y, val: expensesMap[date], date });
    });

    // Make path strings
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathStr += ` L ${points[i].x} ${points[i].y}`;
    }

    // Area path below line
    const areaPath = `${pathStr} L ${points[points.length - 1].x} ${padding + chartH} L ${points[0].x} ${padding + chartH} Z`;

    svg += `
      <!-- Shading area -->
      <path d="${areaPath}" fill="var(--accent-light)" opacity="0.4" />
      
      <!-- Trend Line -->
      <path d="${pathStr}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
    `;

    // Hover dots (Only draw circles at points with actual spending to avoid clutter)
    points.forEach(pt => {
      if (pt.val > 0) {
        svg += `
          <circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="var(--surface-color)" stroke="var(--accent)" stroke-width="1.5" class="dash-trend-dot" data-date="${pt.date}" data-val="${pt.val}" style="cursor: pointer;" />
        `;
      }
    });

    // Label coordinates
    svg += `
      <text x="${padding}" y="${padding + chartH + 14}" font-size="8" fill="var(--text-muted)">30 days ago</text>
      <text x="${svgWidth - padding}" y="${padding + chartH + 14}" font-size="8" fill="var(--text-muted)" text-anchor="end">Today</text>
    </svg>`;

    container.innerHTML = svg;

    // Hook tooltips
    const tooltip = document.getElementById("global-chart-tooltip");
    container.querySelectorAll(".dash-trend-dot").forEach(dot => {
      dot.addEventListener("mouseenter", (e) => {
        const val = parseFloat(e.target.getAttribute("data-val"));
        const date = e.target.getAttribute("data-date");
        dot.setAttribute("r", "5");
        tooltip.innerHTML = `<strong>Spend on ${date}</strong><br>${currency}${val.toFixed(2)}`;
        tooltip.style.display = "block";
      });

      dot.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 50}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });

      dot.addEventListener("mouseleave", () => {
        dot.setAttribute("r", "3.5");
        tooltip.style.display = "none";
      });
    });
  },

  renderCategoryDonut(transactions, currency) {
    const container = document.getElementById("dashboard-donut-chart-container");
    const legend = document.getElementById("dashboard-donut-legend");
    if (!container || !legend) return;

    container.innerHTML = "";
    legend.innerHTML = "";

    const expenses = transactions.filter(t => t.type === "expense");
    const categorySpend = {};
    expenses.forEach(t => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
    });

    const total = Object.values(categorySpend).reduce((a,b) => a + b, 0);

    const slicesData = categories.map(cat => {
      const amount = categorySpend[cat.name] || 0;
      const percentage = total > 0 ? amount / total : 0;
      return { ...cat, amount, percentage };
    }).filter(c => c.amount > 0).sort((a,b) => b.amount - a.amount).slice(0, 4); // Limit to top 4 categories on dashboard for spacing

    if (slicesData.length === 0) {
      container.innerHTML = `<p class="text-secondary" style="font-size: 0.85rem; text-align: center; padding: 20px 0;">No spending records yet.</p>`;
      return;
    }

    const r = 50;
    const C = 2 * Math.PI * r;
    const center = 100;
    let accumPercent = 0;

    let svg = `<svg width="180" height="180" viewBox="0 0 200 200" style="transform: rotate(-90deg);">`;

    slicesData.forEach((slice, idx) => {
      const strokeDash = slice.percentage * C;
      const strokeOffset = -accumPercent * C;
      accumPercent += slice.percentage;

      svg += `
        <circle 
          cx="${center}" 
          cy="${center}" 
          r="${r}" 
          fill="transparent" 
          stroke="${slice.color}" 
          stroke-width="20"
          stroke-dasharray="${strokeDash} ${C}"
          stroke-dashoffset="${strokeOffset}"
          class="dash-donut-slice"
          data-index="${idx}"
          style="transition: stroke-width 0.2s; cursor: pointer;"
        />
      `;

      // Legend row
      const leg = document.createElement("div");
      leg.className = "legend-item";
      leg.style.fontSize = "0.75rem";
      leg.style.gap = "4px";
      leg.innerHTML = `
        <span class="legend-dot" style="background-color: ${slice.color}; width: 8px; height: 8px;"></span>
        <span>${slice.emoji} ${slice.name}</span>
      `;
      legend.appendChild(leg);
    });

    // Center total label
    svg += `
      <circle cx="${center}" cy="${center}" r="38" fill="var(--surface-color)" />
      <g style="transform: rotate(90deg) translate(0px, -200px); transform-origin: center;">
        <text x="${center}" y="${center - 5}" text-anchor="middle" fill="var(--text-secondary)" font-size="8" font-weight="600">TOTAL</text>
        <text x="${center}" y="${center + 12}" text-anchor="middle" fill="var(--text-primary)" font-size="13" font-weight="800">${currency}${total.toFixed(0)}</text>
      </g>
    </svg>`;

    container.innerHTML = svg;

    // Hover tooltips on dashboard slices
    const tooltip = document.getElementById("global-chart-tooltip");
    container.querySelectorAll(".dash-donut-slice").forEach(slice => {
      slice.addEventListener("mouseenter", (e) => {
        const idx = e.target.getAttribute("data-index");
        const data = slicesData[idx];
        slice.setAttribute("stroke-width", "25");
        tooltip.innerHTML = `<strong>${data.emoji} ${data.name}</strong><br>${currency}${data.amount.toFixed(0)} (${(data.percentage * 100).toFixed(0)}%)`;
        tooltip.style.display = "block";
      });
      slice.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 50}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });
      slice.addEventListener("mouseleave", () => {
        slice.setAttribute("stroke-width", "20");
        tooltip.style.display = "none";
      });
    });
  },

  renderBudgetProgress(budgets, transactions, currency) {
    const listContainer = document.getElementById("dashboard-budgets-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (budgets.length === 0) {
      listContainer.innerHTML = `<p class="text-secondary" style="font-size: 0.8rem; font-style: italic;">No active budget plans.</p>`;
      return;
    }

    // Get the most active budget (newest start date)
    const activeBudget = [...budgets].sort((a,b) => new Date(b.startDate) - new Date(a.startDate))[0];

    const start = new Date(activeBudget.startDate);
    const end = new Date(activeBudget.endDate);

    const budgetTx = transactions.filter(t => {
      const d = new Date(t.date);
      return t.type === "expense" && d >= start && d <= end;
    });

    const categorySpend = {};
    budgetTx.forEach(t => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
    });

    if (activeBudget.limits && Object.keys(activeBudget.limits).length > 0) {
      // Get top 3 categories by limit or size
      Object.entries(activeBudget.limits).slice(0, 3).forEach(([catName, limitStr]) => {
        const limit = parseFloat(limitStr);
        const spent = categorySpend[catName] || 0;
        const ratio = limit > 0 ? spent / limit : 0;
        const percentage = Math.min(ratio * 100, 100);

        const colorClass = ratio >= 1.0 ? "danger" : (ratio >= 0.75 ? "warning" : "success");
        const catObj = categories.find(c => c.name === catName) || { emoji: "🏷️" };

        const row = document.createElement("div");
        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 2px;">
            <span style="font-weight: 500;">${catObj.emoji} ${catName}</span>
            <span style="color: var(--text-secondary);">${currency}${spent.toFixed(0)} of ${currency}${limit.toFixed(0)}</span>
          </div>
          <div class="progress-bar-container" style="height: 5px;">
            <div class="progress-bar-fill ${colorClass}" style="width: ${percentage}%;"></div>
          </div>
        `;
        listContainer.appendChild(row);
      });
    } else {
      listContainer.innerHTML = `<p class="text-secondary" style="font-size: 0.8rem; font-style: italic;">No limits defined in active budget "${activeBudget.name}".</p>`;
    }
  },

  renderSavingsGoals(savings, currency) {
    const listContainer = document.getElementById("dashboard-savings-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (savings.length === 0) {
      listContainer.innerHTML = `<p class="text-secondary" style="font-size: 0.8rem; font-style: italic;">No savings goals set.</p>`;
      return;
    }

    // Render up to 2 goals
    savings.slice(0, 2).forEach(goal => {
      const target = parseFloat(goal.targetAmount);
      const current = parseFloat(goal.currentAmount);
      const ratio = target > 0 ? current / target : 0;
      const percentage = Math.min(ratio * 100, 100);

      const row = document.createElement("div");
      row.style.border = "1px solid var(--border-color)";
      row.style.borderRadius = "8px";
      row.style.padding = "10px";
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "4px";

      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
          <span>${goal.emoji || "🐖"} ${goal.name}</span>
          <span>${percentage.toFixed(0)}%</span>
        </div>
        <div class="progress-bar-container" style="height: 6px;">
          <div class="progress-bar-fill accent" style="width: ${percentage}%;"></div>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-secondary); text-align: right;">
          ${currency}${current.toFixed(0)} of ${currency}${target.toFixed(0)}
        </div>
      `;
      listContainer.appendChild(row);
    });
  },

  renderUpcomingBills(recurringTxList, currency) {
    const listContainer = document.getElementById("dashboard-upcoming-bills-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    const today = new Date();
    today.setHours(0,0,0,0);

    const upcoming = [];
    recurringTxList.forEach(item => {
      if (item.type === "expense" && !item.paused) {
        const nextDate = new Date(item.nextOccurrence);
        const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          upcoming.push({ ...item, diffDays });
        }
      }
    });

    if (upcoming.length === 0) {
      listContainer.innerHTML = `<p class="text-secondary" style="font-size: 0.8rem; font-style: italic; text-align: center; padding: 4px 0;">No bills due in the next 7 days.</p>`;
      return;
    }

    // Sort closest due date first
    upcoming.sort((a,b) => a.diffDays - b.diffDays);

    upcoming.forEach(bill => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.fontSize = "0.8rem";
      row.style.padding = "4px 0";

      const catObj = categories.find(c => c.name === bill.category) || { emoji: "🏷️" };
      const dueText = bill.diffDays === 0 ? "Due Today 🚨" : (bill.diffDays === 1 ? "Due Tomorrow ⚠️" : `Due in ${bill.diffDays} days`);

      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-weight: 600;">${catObj.emoji} ${bill.title}</span>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${dueText}</span>
        </div>
        <strong class="amount-expense">-${currency}${parseFloat(bill.amount).toFixed(2)}</strong>
      `;
      listContainer.appendChild(row);
    });
  }
};
