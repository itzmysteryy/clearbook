// Clearbook Spending Insights Module
import { Database } from "./firebase.js";
import { Storage } from "./storage.js";
import { DEFAULT_CATEGORIES } from "./transactions.js";

let activeDateRange = "last-6-months";
let showZeroCategories = false;
let momMode = "category"; // 'category' or 'total'
let categoriesList = [];

export const Insights = {
  async init(username) {
    await this.loadCategories(username);

    // Date range picker listener
    document.getElementById("insights-date-range").addEventListener("change", (e) => {
      activeDateRange = e.target.value;
      const isCustom = activeDateRange === "custom";
      document.getElementById("insights-custom-date-row").style.display = isCustom ? "flex" : "none";
      this.recalculateAndRender(username);
    });

    // Custom date changes
    document.getElementById("insights-custom-start").addEventListener("input", () => this.recalculateAndRender(username));
    document.getElementById("insights-custom-end").addEventListener("input", () => this.recalculateAndRender(username));

    // Zero categories toggle
    document.getElementById("insights-show-zero-categories").addEventListener("change", (e) => {
      showZeroCategories = e.target.checked;
      this.recalculateAndRender(username);
    });

    // Month-over-month toggles
    const momByCatBtn = document.getElementById("insights-mom-by-cat-btn");
    const momTotalBtn = document.getElementById("insights-mom-total-btn");

    momByCatBtn.addEventListener("click", () => {
      momMode = "category";
      momByCatBtn.classList.add("active");
      momTotalBtn.classList.remove("active");
      this.recalculateAndRender(username);
    });

    momTotalBtn.addEventListener("click", () => {
      momMode = "total";
      momTotalBtn.classList.add("active");
      momByCatBtn.classList.remove("active");
      this.recalculateAndRender(username);
    });
  },

  async loadCategories(username) {
    const custom = await Database.getAll(username, "settings");
    const userSettings = custom.find(c => c.id === "userSettings");
    
    if (userSettings && userSettings.categories) {
      categoriesList = userSettings.categories;
    } else {
      categoriesList = [...DEFAULT_CATEGORIES];
    }
  },

  async recalculateAndRender(username) {
    const transactions = await Database.getAll(username, "transactions");
    this.renderPage(transactions);
  },

  renderPage(transactions) {
    const filtered = this.filterBySelectedRange(transactions);
    
    // SECTION 1: Overview Strip
    this.renderOverviewStrip(filtered);

    // SECTION 2: Category Breakdown Bar Chart
    this.renderCategoryBarChart(filtered);

    // SECTION 3: Donut Chart
    this.renderDonutChart(filtered);

    // SECTION 4: Month by Month Grouped Chart
    this.renderMonthOverMonth(filtered);

    // SECTION 5: Top 3 Categories Podium
    this.renderPodium(filtered);

    // SECTION 6: Income vs Expense Trend
    this.renderIncomeExpenseTrend(filtered);
  },

  filterBySelectedRange(transactions) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate = null;
    let endDate = null;

    if (activeDateRange === "this-month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (activeDateRange === "last-month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (activeDateRange === "last-3-months") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (activeDateRange === "last-6-months") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    } else if (activeDateRange === "this-year") {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else if (activeDateRange === "custom") {
      const s = document.getElementById("insights-custom-start").value;
      const e = document.getElementById("insights-custom-end").value;
      if (s) startDate = new Date(s);
      if (e) endDate = new Date(e + "T23:59:59");
    }

    return transactions.filter(t => {
      const d = new Date(t.date);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  },

  renderOverviewStrip(txs) {
    const currency = Storage.getCurrency();
    let spent = 0;
    let earned = 0;

    txs.forEach(t => {
      const val = parseFloat(t.amount);
      if (t.type === "expense") spent += val;
      else earned += val;
    });

    const net = earned - spent;

    document.getElementById("insights-total-spent").textContent = `${currency}${spent.toFixed(2)}`;
    document.getElementById("insights-total-earned").textContent = `${currency}${earned.toFixed(2)}`;
    
    const netEl = document.getElementById("insights-net-savings");
    netEl.textContent = `${net >= 0 ? "+" : ""}${currency}${net.toFixed(2)}`;
    netEl.className = `metric-value net ${net >= 0 ? "positive" : "negative"}`;
  },

  renderCategoryBarChart(txs) {
    const container = document.getElementById("insights-bar-chart-container");
    if (!container) return;

    const expenses = txs.filter(t => t.type === "expense");
    const currency = Storage.getCurrency();

    // Sum spend per category
    const categorySpend = {};
    expenses.forEach(t => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
    });

    // Compute total spend
    let totalSpent = Object.values(categorySpend).reduce((a,b) => a + b, 0);

    // Map limits and colors
    let chartData = categoriesList.map(cat => {
      const amount = categorySpend[cat.name] || 0;
      const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
      return { ...cat, amount, percentage };
    });

    // Hide zero-spend if needed
    if (!showZeroCategories) {
      chartData = chartData.filter(c => c.amount > 0);
    }

    // Sort descending
    chartData.sort((a,b) => b.amount - a.amount);

    if (chartData.length === 0) {
      container.innerHTML = `<p class="text-secondary" style="font-size: 0.9rem; text-align: center; padding: 24px 0;">No spending records available.</p>`;
      return;
    }

    const maxVal = Math.max(...chartData.map(c => c.amount)) || 1;

    let svgHtml = `<svg width="100%" height="${chartData.length * 40}" style="font-family: inherit;">`;

    chartData.forEach((row, i) => {
      const y = i * 40;
      const barWidthPercentage = (row.amount / maxVal) * 70; // 70% of parent width max

      svgHtml += `
        <!-- Category bar row group -->
        <g class="bar-chart-row" style="cursor: pointer;" onclick="window.drillDownCategory('${row.name}')">
          <!-- Text Label -->
          <text x="10" y="${y + 24}" fill="var(--text-primary)" font-size="13" font-weight="600">${row.emoji} ${row.name}</text>
          
          <!-- Background track -->
          <rect x="150" y="${y + 12}" width="70%" height="16" rx="8" fill="var(--bg-color)" />
          
          <!-- Colored Fill -->
          <rect x="150" y="${y + 12}" width="${barWidthPercentage}%" height="16" rx="8" fill="${row.color}">
            <animate attributeName="width" from="0%" to="${barWidthPercentage}%" dur="0.6s" fill="freeze" />
          </rect>
          
          <!-- Numeric value text -->
          <text x="150" y="${y + 24}" dx="${barWidthPercentage}%" dx="10" dy="-1" fill="var(--text-secondary)" font-size="11" font-weight="bold">
            ${currency}${row.amount.toFixed(2)} (${row.percentage.toFixed(0)}%)
          </text>
        </g>
      `;
    });

    svgHtml += "</svg>";
    container.innerHTML = svgHtml;

    // Attach global drill-down modal callback
    window.drillDownCategory = (catName) => this.openDrillDown(catName, txs);
  },

  openDrillDown(categoryName, txs) {
    const title = document.getElementById("drill-down-title");
    const tbody = document.getElementById("drill-down-tbody");
    
    title.textContent = `Drill-down: ${categoryName}`;
    tbody.innerHTML = "";

    const filteredTx = txs.filter(t => t.category === categoryName);
    const currency = Storage.getCurrency();

    if (filteredTx.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No entries in range.</td></tr>`;
    } else {
      // Sort newest first
      filteredTx.sort((a,b) => new Date(b.date) - new Date(a.date));
      filteredTx.forEach(tx => {
        const tr = document.createElement("tr");
        const valStr = `${currency}${parseFloat(tx.amount).toFixed(2)}`;
        const classAmt = tx.type === "income" ? "amount-income" : "amount-expense";
        const prefix = tx.type === "income" ? "+ " : "- ";

        tr.innerHTML = `
          <td style="font-weight: 600;">${tx.title}</td>
          <td style="color: var(--text-secondary);">${tx.date}</td>
          <td style="text-align: right;" class="${classAmt}">${prefix}${valStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById("modal-drill-down").classList.add("active");
  },

  renderDonutChart(txs) {
    const container = document.getElementById("insights-donut-container");
    const legend = document.getElementById("insights-donut-legend");
    if (!container || !legend) return;

    container.innerHTML = "";
    legend.innerHTML = "";

    const expenses = txs.filter(t => t.type === "expense");
    const currency = Storage.getCurrency();

    const categorySpend = {};
    expenses.forEach(t => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
    });

    const totalSpent = Object.values(categorySpend).reduce((a,b) => a + b, 0);

    let chartData = categoriesList.map(cat => {
      const amount = categorySpend[cat.name] || 0;
      const percentage = totalSpent > 0 ? (amount / totalSpent) : 0;
      return { ...cat, amount, percentage };
    }).filter(c => c.amount > 0);

    if (chartData.length === 0) {
      container.innerHTML = `<p class="text-secondary" style="font-size: 0.9rem;">No data.</p>`;
      return;
    }

    // Sort descending
    chartData.sort((a,b) => b.amount - a.amount);

    // Draw SVG Donut Chart
    const r = 60;
    const C = 2 * Math.PI * r;
    const center = 120;
    let accumPercent = 0;

    let svg = `<svg width="240" height="240" viewBox="0 0 240 240" style="transform: rotate(-90deg);">`;

    chartData.forEach((slice, index) => {
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
          stroke-width="26"
          stroke-dasharray="${strokeDash} ${C}"
          stroke-dashoffset="${strokeOffset}"
          class="donut-slice"
          data-index="${index}"
          style="transition: stroke-width 0.2s; cursor: pointer;"
        />
      `;

      // Legend items below
      const legItem = document.createElement("div");
      legItem.className = "legend-item";
      legItem.innerHTML = `
        <span class="legend-dot" style="background-color: ${slice.color};"></span>
        <span>${slice.emoji} ${slice.name}: <strong>${currency}${slice.amount.toFixed(0)}</strong> (${(slice.percentage * 100).toFixed(0)}%)</span>
      `;
      legend.appendChild(legItem);
    });

    // Center hole total label (rotated back to normal text orientation)
    svg += `
      <circle cx="${center}" cy="${center}" r="45" fill="var(--surface-color)" />
      <g style="transform: rotate(90deg) translate(0px, -240px); transform-origin: center;">
        <text x="${center}" y="${center - 6}" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-weight="600">TOTAL SPENT</text>
        <text x="${center}" y="${center + 14}" text-anchor="middle" fill="var(--text-primary)" font-size="16" font-weight="800">${currency}${totalSpent.toFixed(0)}</text>
      </g>
    </svg>`;

    container.innerHTML = svg;

    // Hookup slice hovers tooltip
    const slices = container.querySelectorAll(".donut-slice");
    const tooltip = document.getElementById("global-chart-tooltip");

    slices.forEach(slice => {
      slice.addEventListener("mouseenter", (e) => {
        const idx = e.target.getAttribute("data-index");
        const data = chartData[idx];
        
        slice.setAttribute("stroke-width", "32");
        
        tooltip.innerHTML = `<strong>${data.emoji} ${data.name}</strong><br>${currency}${data.amount.toFixed(2)} (${(data.percentage * 100).toFixed(0)}%)`;
        tooltip.style.display = "block";
      });

      slice.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 50}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });

      slice.addEventListener("mouseleave", () => {
        slice.setAttribute("stroke-width", "26");
        tooltip.style.display = "none";
      });
    });
  },

  renderMonthOverMonth(txs) {
    const container = document.getElementById("insights-mom-container");
    const descText = document.getElementById("insights-mom-text");
    if (!container || !descText) return;

    container.innerHTML = "";
    const expenses = txs.filter(t => t.type === "expense");
    const currency = Storage.getCurrency();

    // Group expenses by month (YYYY-MM)
    const monthData = {};
    expenses.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (!monthData[monthKey]) monthData[monthKey] = { total: 0, categories: {} };
      
      monthData[monthKey].total += parseFloat(t.amount);
      monthData[monthKey].categories[t.category] = (monthData[monthKey].categories[t.category] || 0) + parseFloat(t.amount);
    });

    const months = Object.keys(monthData).sort();

    if (months.length === 0) {
      container.innerHTML = `<p class="text-secondary" style="font-size: 0.9rem;">Insufficient monthly spending logs.</p>`;
      return;
    }

    const maxSpent = Math.max(...Object.values(monthData).map(m => m.total)) || 1;

    // SVG parameters
    const svgWidth = 500;
    const svgHeight = 220;
    const padding = 30;
    const chartW = svgWidth - padding * 2;
    const chartH = svgHeight - padding * 2;

    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" style="font-family: inherit;">`;

    // Draw Y axis lines
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      const val = (maxSpent - (maxSpent / 4) * i).toFixed(0);
      svg += `
        <line x1="${padding}" y1="${y}" x2="${svgWidth - padding}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="4" />
        <text x="${padding - 6}" y="${y + 4}" font-size="8" fill="var(--text-muted)" text-anchor="end">${currency}${val}</text>
      `;
    }

    // Render bars
    const colWidth = chartW / months.length;
    const barWidth = Math.min(28, colWidth * 0.6);

    months.forEach((month, index) => {
      const mInfo = monthData[month];
      const xCenter = padding + colWidth * index + colWidth / 2;
      const xStart = xCenter - barWidth / 2;

      // Map Y coordinates
      const totalH = (mInfo.total / maxSpent) * chartH;
      const yStart = padding + chartH - totalH;

      if (momMode === "total") {
        // Draw single overall bar
        svg += `
          <rect x="${xStart}" y="${yStart}" width="${barWidth}" height="${totalH}" fill="var(--accent)" rx="4" class="mom-bar" data-total="${mInfo.total}" data-month="${month}">
            <animate attributeName="height" from="0" to="${totalH}" dur="0.5s" fill="freeze" />
            <animate attributeName="y" from="${padding + chartH}" to="${yStart}" dur="0.5s" fill="freeze" />
          </rect>
        `;
      } else {
        // By Category: Draw stacked category segments in the bar
        let currentY = padding + chartH;
        
        // Sort categories by spend in this month descending
        const sortedCats = Object.entries(mInfo.categories).sort((a,b) => b[1] - a[1]).slice(0, 3);
        
        sortedCats.forEach(([catName, amt]) => {
          const segH = (amt / maxSpent) * chartH;
          const segY = currentY - segH;
          currentY = segY;

          const catColor = (categoriesList.find(c => c.name === catName) || { color: "#64748b" }).color;

          svg += `
            <rect x="${xStart}" y="${segY}" width="${barWidth}" height="${segH}" fill="${catColor}" class="mom-slice-bar" data-name="${catName}" data-total="${amt}">
              <animate attributeName="height" from="0" to="${segH}" dur="0.5s" fill="freeze" />
              <animate attributeName="y" from="${currentY + segH}" to="${segY}" dur="0.5s" fill="freeze" />
            </rect>
          `;
        });
      }

      // X-axis label
      const dateParts = month.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `${monthNames[parseInt(dateParts[1]) - 1]} '${dateParts[0].substring(2)}`;
      
      svg += `
        <text x="${xCenter}" y="${padding + chartH + 16}" font-size="9" fill="var(--text-secondary)" text-anchor="middle">${label}</text>
      `;
    });

    svg += "</svg>";
    container.innerHTML = svg;

    // Hover tooltips on month bars
    const tooltip = document.getElementById("global-chart-tooltip");

    container.querySelectorAll(".mom-bar").forEach(bar => {
      bar.addEventListener("mouseenter", (e) => {
        const amt = parseFloat(e.target.getAttribute("data-total"));
        const m = e.target.getAttribute("data-month");
        tooltip.innerHTML = `<strong>Total Spent (${m})</strong><br>${currency}${amt.toFixed(2)}`;
        tooltip.style.display = "block";
      });
      bar.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 50}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });
      bar.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });

    container.querySelectorAll(".mom-slice-bar").forEach(seg => {
      seg.addEventListener("mouseenter", (e) => {
        const amt = parseFloat(e.target.getAttribute("data-total"));
        const cat = e.target.getAttribute("data-name");
        tooltip.innerHTML = `<strong>${cat}</strong><br>${currency}${amt.toFixed(2)}`;
        tooltip.style.display = "block";
      });
      seg.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 50}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });
      seg.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });

    // Write natural text summary statements
    if (months.length >= 2) {
      const curMonth = months[months.length - 1];
      const prevMonth = months[months.length - 2];
      
      const curTotal = monthData[curMonth].total;
      const prevTotal = monthData[prevMonth].total;

      const diff = curTotal - prevTotal;
      const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
      
      const direction = diff >= 0 ? "more" : "less";
      
      // Top category in current month
      const topCatArr = Object.entries(monthData[curMonth].categories).sort((a,b) => b[1] - a[1])[0];
      const topCatStr = topCatArr ? topCatArr[0] : "Other";

      descText.textContent = `You spent ${Math.abs(pct).toFixed(0)}% ${direction} in ${this.getMonthName(curMonth)} than ${this.getMonthName(prevMonth)}, mostly in ${topCatStr}.`;
    } else {
      descText.textContent = "Log spending across multiple months to see month-over-month comparison summaries.";
    }
  },

  getMonthName(yyyyMm) {
    const parts = yyyyMm.split("-");
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
  },

  renderPodium(txs) {
    const container = document.getElementById("insights-podium-container");
    const textEl = document.getElementById("insights-podium-text");
    if (!container || !textEl) return;

    container.innerHTML = "";

    const expenses = txs.filter(t => t.type === "expense");
    const currency = Storage.getCurrency();

    const categorySpend = {};
    expenses.forEach(t => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + parseFloat(t.amount);
    });

    const totalSpent = Object.values(categorySpend).reduce((a,b) => a + b, 0);

    const sortedData = categoriesList.map(cat => {
      const amount = categorySpend[cat.name] || 0;
      const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
      return { ...cat, amount, percentage };
    }).filter(c => c.amount > 0).sort((a,b) => b.amount - a.amount);

    if (sortedData.length === 0) {
      container.innerHTML = `<p class="text-secondary" style="font-size:0.9rem; text-align:center; width:100%;">No spending history.</p>`;
      return;
    }

    // Top 3 categories
    const gold = sortedData[0];
    const silver = sortedData[1];
    const bronze = sortedData[2];

    let podiumHtml = "";

    // Silver Block (Left)
    if (silver) {
      podiumHtml += `
        <div class="podium-block silver">
          <span class="podium-emoji">${silver.emoji}</span>
          <span class="podium-name">${silver.name}</span>
          <span class="podium-amount">${currency}${silver.amount.toFixed(0)}</span>
          <span class="podium-percentage">${silver.percentage.toFixed(0)}%</span>
        </div>
      `;
    }

    // Gold Block (Center)
    if (gold) {
      podiumHtml += `
        <div class="podium-block gold">
          <span class="podium-emoji">${gold.emoji}</span>
          <span class="podium-name" style="font-weight: bold;">${gold.name}</span>
          <span class="podium-amount">${currency}${gold.amount.toFixed(0)}</span>
          <span class="podium-percentage">${gold.percentage.toFixed(0)}%</span>
        </div>
      `;
    }

    // Bronze Block (Right)
    if (bronze) {
      podiumHtml += `
        <div class="podium-block bronze">
          <span class="podium-emoji">${bronze.emoji}</span>
          <span class="podium-name">${bronze.name}</span>
          <span class="podium-amount">${currency}${bronze.amount.toFixed(0)}</span>
          <span class="podium-percentage">${bronze.percentage.toFixed(0)}%</span>
        </div>
      `;
    }

    container.innerHTML = podiumHtml;

    // Generated podium insight text
    if (gold) {
      const fraction = gold.percentage >= 30 ? "1/3" : (gold.percentage >= 20 ? "1/5" : `roughly ${(gold.percentage).toFixed(0)}%`);
      textEl.textContent = `"${gold.name}" is your biggest expense category — it consumes ${fraction} of your overall spending in the selected period.`;
    }
  },

  renderIncomeExpenseTrend(txs) {
    const container = document.getElementById("insights-trend-container");
    if (!container) return;

    container.innerHTML = "";
    const currency = Storage.getCurrency();

    // Group transactions by date
    const dateData = {};
    txs.forEach(t => {
      if (!dateData[t.date]) dateData[t.date] = { income: 0, expense: 0 };
      dateData[t.date][t.type] += parseFloat(t.amount);
    });

    const dates = Object.keys(dateData).sort();

    if (dates.length <= 1) {
      container.innerHTML = `<p class="text-secondary" style="font-size:0.9rem; text-align:center;">Log transactions across at least two separate dates to generate trend lines.</p>`;
      return;
    }

    // SVG parameters
    const svgWidth = 600;
    const svgHeight = 220;
    const padding = 30;
    const chartW = svgWidth - padding * 2;
    const chartH = svgHeight - padding * 2;

    // Find min and max amounts to scale Y
    let maxAmt = 0;
    let totalInc = 0;
    let totalExp = 0;

    dates.forEach(d => {
      maxAmt = Math.max(maxAmt, dateData[d].income, dateData[d].expense);
      totalInc += dateData[d].income;
      totalExp += dateData[d].expense;
    });

    maxAmt = maxAmt || 1;

    // Map averages
    const avgInc = totalInc / dates.length;
    const avgExp = totalExp / dates.length;

    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" style="font-family: inherit;">`;

    // Draw grid background Y lines
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      const val = (maxAmt - (maxAmt / 4) * i).toFixed(0);
      svg += `
        <line x1="${padding}" y1="${y}" x2="${svgWidth - padding}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3" />
        <text x="${padding - 6}" y="${y + 4}" font-size="8" fill="var(--text-muted)" text-anchor="end">${currency}${val}</text>
      `;
    }

    // Construct coordinates paths
    const stepX = chartW / (dates.length - 1);
    const incPoints = [];
    const expPoints = [];

    dates.forEach((d, index) => {
      const x = padding + stepX * index;
      
      const incY = padding + chartH - (dateData[d].income / maxAmt) * chartH;
      const expY = padding + chartH - (dateData[d].expense / maxAmt) * chartH;

      incPoints.push({ x, y: incY, date: d, val: dateData[d].income });
      expPoints.push({ x, y: expY, date: d, val: dateData[d].expense });
    });

    // Create dual lines paths strings
    let incPath = `M ${incPoints[0].x} ${incPoints[0].y}`;
    let expPath = `M ${expPoints[0].x} ${expPoints[0].y}`;
    
    // Shader polygons coordinates for shading surplus/deficit gap
    let shaderPoints = [];
    
    for (let i = 0; i < dates.length; i++) {
      if (i > 0) {
        incPath += ` L ${incPoints[i].x} ${incPoints[i].y}`;
        expPath += ` L ${expPoints[i].x} ${expPoints[i].y}`;
      }
    }

    // Draw shaded area between lines (surplus/deficit gap)
    // To make this mathematically precise, we can construct overlapping area zones
    // For simplicity, we draw the area under the income line in light green and expense in light red
    let incAreaPath = `${incPath} L ${incPoints[incPoints.length - 1].x} ${padding + chartH} L ${incPoints[0].x} ${padding + chartH} Z`;
    let expAreaPath = `${expPath} L ${expPoints[expPoints.length - 1].x} ${padding + chartH} L ${expPoints[0].x} ${padding + chartH} Z`;

    svg += `
      <!-- Shaded regions under trends -->
      <path d="${incAreaPath}" fill="var(--success-light)" opacity="0.4" />
      <path d="${expAreaPath}" fill="var(--danger-light)" opacity="0.4" />

      <!-- Dotted Average lines -->
      <line x1="${padding}" y1="${padding + chartH - (avgInc / maxAmt) * chartH}" x2="${svgWidth - padding}" y2="${padding + chartH - (avgInc / maxAmt) * chartH}" stroke="var(--success)" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.6" />
      <line x1="${padding}" y1="${padding + chartH - (avgExp / maxAmt) * chartH}" x2="${svgWidth - padding}" y2="${padding + chartH - (avgExp / maxAmt) * chartH}" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.6" />

      <!-- Actual lines -->
      <path d="${incPath}" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" />
      <path d="${expPath}" fill="none" stroke="var(--danger)" stroke-width="3" stroke-linecap="round" />
    `;

    // Render interactive circles
    incPoints.forEach(pt => {
      svg += `
        <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--surface-color)" stroke="var(--success)" stroke-width="2" class="trend-dot" data-date="${pt.date}" data-val="${pt.val}" data-type="Income" />
      `;
    });

    expPoints.forEach(pt => {
      svg += `
        <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--surface-color)" stroke="var(--danger)" stroke-width="2" class="trend-dot" data-date="${pt.date}" data-val="${pt.val}" data-type="Expense" />
      `;
    });

    svg += "</svg>";
    container.innerHTML = svg;

    // Circle tooltips hooks
    const tooltip = document.getElementById("global-chart-tooltip");
    container.querySelectorAll(".trend-dot").forEach(dot => {
      dot.addEventListener("mouseenter", (e) => {
        const type = e.target.getAttribute("data-type");
        const val = parseFloat(e.target.getAttribute("data-val"));
        const date = e.target.getAttribute("data-date");
        dot.setAttribute("r", "6");
        
        tooltip.innerHTML = `<strong>${type}</strong><br>${date}<br>${currency}${val.toFixed(2)}`;
        tooltip.style.display = "block";
      });

      dot.addEventListener("mousemove", (e) => {
        tooltip.style.top = `${e.pageY - 60}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
      });

      dot.addEventListener("mouseleave", () => {
        dot.setAttribute("r", "4");
        tooltip.style.display = "none";
      });
    });
  }
};
