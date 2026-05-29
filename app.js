// Clearbook Personal Finance Manager — App Entry Point & Router
import { isConfigured } from "./config.js";
import { Storage } from "./storage.js";
import { Auth } from "./auth.js";
import { Database } from "./firebase.js";
import { WelcomeTour } from "./tour.js";
import { Dashboard } from "./dashboard.js";
import { Transactions } from "./transactions.js";
import { Budgets } from "./budgets.js";
import { Savings } from "./savings.js";
import { Debts } from "./debts.js";
import { Insights } from "./insights.js";
import { AlertsEngine } from "./alerts.js";
import { Settings } from "./settings.js";

// Global datasets state
let appState = {
  transactions: [],
  budgets: [],
  savings: [],
  debts: [],
  alerts: [],
  recurring: [],
  settings: []
};

let activeSubscriptions = [];
let hasInitiallyLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // Apply visual theme preferences
  const storedTheme = Storage.getTheme();
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeTheme = storedTheme || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", activeTheme);

  // 1. Check if Firebase / SpreadAPI configuration is missing
  if (!isConfigured()) {
    document.getElementById("unconfigured-warning-overlay").style.display = "flex";
  } else {
    document.getElementById("unconfigured-warning-overlay").style.display = "none";
  }

  // 2. Auth checking
  const currentUser = Storage.getCurrentUser();
  if (currentUser) {
    setupLoggedInSession(currentUser);
  } else {
    setupLoggedOutSession();
  }

  // 3. Welcome Tour setup
  WelcomeTour.init();

  // 4. Hash Router listener
  window.addEventListener("hashchange", () => {
    if (Storage.getCurrentUser()) {
      routeActiveView();
    }
  });

  // Attach auth form listeners
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("signup-form").addEventListener("submit", handleSignup);
}

async function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById("login-username").value.trim().toLowerCase();
  const pass = document.getElementById("login-password").value;
  const errorEl = document.getElementById("auth-error-msg");

  errorEl.style.display = "none";
  try {
    const username = await Auth.logIn(user, pass);
    setupLoggedInSession(username);
  } catch (err) {
    errorEl.textContent = err.message || "Failed to log in.";
    errorEl.style.display = "block";
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const user = document.getElementById("signup-username").value.trim().toLowerCase();
  const pass = document.getElementById("signup-password").value;
  const confirmPass = document.getElementById("signup-confirm-password").value;
  const errorEl = document.getElementById("auth-error-msg");

  errorEl.style.display = "none";

  if (pass !== confirmPass) {
    errorEl.textContent = "Passwords do not match.";
    errorEl.style.display = "block";
    return;
  }

  try {
    const username = await Auth.signUp(user, pass);
    setupLoggedInSession(username);
  } catch (err) {
    errorEl.textContent = err.message || "Failed to sign up.";
    errorEl.style.display = "block";
  }
}

function setupLoggedInSession(username) {
  document.getElementById("auth-container").classList.remove("active");
  document.getElementById("app-layout").style.display = "block";
  
  // Set profile names
  document.getElementById("user-display-name").textContent = username;
  document.getElementById("avatar-letter").textContent = username[0].toUpperCase();

  // Route to dashboard default if no hash is specified
  if (!window.location.hash) {
    window.location.hash = "#dashboard";
  }

  // Initialize modular controllers
  Transactions.init(username);
  Budgets.init(username);
  Savings.init(username);
  Debts.init(username);
  Insights.init(username);
  Settings.init(username);

  // Setup PDF print date info helper
  document.getElementById("print-user").textContent = username;
  document.getElementById("print-date").textContent = new Date().toLocaleString();

  // Start Realtime Database syncing
  startRealtimeSync(username);
}

function setupLoggedOutSession() {
  document.getElementById("auth-container").classList.add("active");
  document.getElementById("app-layout").style.display = "none";
  
  // Clear subscriptions
  activeSubscriptions.forEach(unsub => {
    if (typeof unsub === "function") unsub();
  });
  activeSubscriptions = [];
  hasInitiallyLoaded = false;
}

function startRealtimeSync(username) {
  const skeleton = document.getElementById("main-skeleton-loader");
  const defaultView = document.querySelector(".view-container.active");
  
  if (!hasInitiallyLoaded) {
    if (skeleton) skeleton.style.display = "block";
    if (defaultView) defaultView.classList.remove("active");
  }

  const collections = ["transactions", "budgets", "savings", "debts", "alerts", "recurring", "settings"];
  const readyFlags = {
    transactions: false,
    budgets: false,
    savings: false,
    debts: false,
    alerts: false,
    recurring: false,
    settings: false
  };

  collections.forEach(col => {
    const unsub = Database.subscribe(username, col, (data) => {
      appState[col] = data;
      readyFlags[col] = true;

      // Check if all collections have loaded their initial snapshot
      const allReady = Object.values(readyFlags).every(val => val === true);
      if (allReady) {
        if (!hasInitiallyLoaded) {
          hasInitiallyLoaded = true;
          if (skeleton) skeleton.style.display = "none";
          
          // Check welcome tour
          WelcomeTour.checkAndStart();
        }

        // 1. Run dynamic alerts generation
        AlertsEngine.scanAndSyncAlerts(
          username,
          appState.transactions,
          appState.budgets,
          appState.savings,
          appState.recurring
        );

        // 2. Render badge count & alerts view log
        AlertsEngine.renderAlertsList(appState.alerts);

        // 3. Render current view
        routeActiveView();
      }
    });
    activeSubscriptions.push(unsub);
  });
}

// Router routing selector mapping
function routeActiveView() {
  const hash = window.location.hash || "#dashboard";
  const views = {
    "#dashboard": { id: "dashboard-view", title: "Dashboard", subtitle: "Financial summary and balances" },
    "#transactions": { id: "transactions-view", title: "Transactions", subtitle: "Record of income and expenditures" },
    "#budgets": { id: "budgets-view", title: "Budget Planner", subtitle: "Stay in control with custom limits" },
    "#savings-debts": { id: "savings-debts-view", title: "Goals & Debts", subtitle: "Savings targets and loan amortization" },
    "#insights": { id: "insights-view", title: "Spending Insights", subtitle: "SVG charts and reporting metrics" },
    "#alerts": { id: "alerts-view", title: "System Alerts", subtitle: "Notifications and milestone achievements" },
    "#settings": { id: "settings-view", title: "Settings", subtitle: "Customize your Clearbook configurations" }
  };

  const targetView = views[hash];
  if (!targetView) return;

  // Toggle active styling on navigation items
  const menuTarget = hash === "#savings-debts" ? "savings-debts" : hash.substring(1);
  
  // Desktop
  document.querySelectorAll("#sidebar .menu-item").forEach(item => {
    if (item.getAttribute("data-target") === menuTarget) item.classList.add("active");
    else item.classList.remove("active");
  });

  // Mobile
  document.querySelectorAll("#mobile-nav .mobile-item").forEach(item => {
    if (item.getAttribute("data-target") === menuTarget) item.classList.add("active");
    else item.classList.remove("active");
  });

  // Switch view tabs container visibility
  document.querySelectorAll(".view-container").forEach(view => {
    if (view.id === targetView.id) view.classList.add("active");
    else view.classList.remove("active");
  });

  // Update Headers text
  document.getElementById("page-title").textContent = targetView.title;
  document.getElementById("page-subtitle").textContent = targetView.subtitle;

  // Render view-specific records
  const user = Storage.getCurrentUser();
  if (hash === "#dashboard") {
    Dashboard.render(
      appState.transactions,
      appState.budgets,
      appState.savings,
      appState.debts,
      appState.alerts,
      appState.recurring,
      appState.settings
    );
  } else if (hash === "#transactions") {
    Transactions.applyFiltersAndRender(user);
  } else if (hash === "#budgets") {
    Budgets.renderBudgetsList(appState.budgets, appState.transactions);
  } else if (hash === "#savings-debts") {
    Savings.renderSavingsList(appState.savings);
    Debts.renderDebtsList(appState.debts);
  } else if (hash === "#insights") {
    Insights.renderPage(appState.transactions);
  }
}

// Global bridges to trigger renders on updates
export function renderDashboard() {
  const user = Storage.getCurrentUser();
  if (user) {
    routeActiveView();
  }
}

export async function reloadAllData() {
  const user = Storage.getCurrentUser();
  if (user) {
    startRealtimeSync(user);
  }
}

// Global Theme Toggle Handler
window.toggleTheme = () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  Storage.setTheme(next);
  
  window.showToast(`Switched to ${next} theme mode`, "info");
  renderDashboard();
};

// Sleek Glass Toast Alerts Utility
window.showToast = (message, type = "info") => {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `alert-banner ${type}`;
  toast.style.width = "100%";
  toast.style.maxWidth = "none";
  toast.style.margin = "0";
  toast.style.animation = "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
  
  const emojis = {
    success: "✓",
    danger: "🚨",
    warning: "⚠️",
    info: "ℹ️"
  };
  const emoji = emojis[type] || "ℹ️";

  toast.innerHTML = `
    <span class="alert-banner-icon">${emoji}</span>
    <div class="alert-banner-content">
      <span class="alert-banner-title" style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${message}</span>
    </div>
    <button class="alert-banner-close" style="font-size: 1rem; cursor: pointer; border: none; background: transparent; color: var(--text-muted);">&times;</button>
  `;

  toast.querySelector(".alert-banner-close").addEventListener("click", () => {
    toast.remove();
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);

  container.appendChild(toast);
};

// Custom window.alert override using our Glass Toast Alerts
window.alert = (message) => {
  const cleanMsg = message.toLowerCase();
  const isSuccess = cleanMsg.includes("success") || cleanMsg.includes("restore") || cleanMsg.includes("clear") || cleanMsg.includes("imported");
  const isDanger = cleanMsg.includes("fail") || cleanMsg.includes("error") || cleanMsg.includes("cannot") || cleanMsg.includes("invalid") || cleanMsg.includes("mismatch");
  
  let type = "info";
  if (isSuccess) type = "success";
  else if (isDanger) type = "danger";
  else if (cleanMsg.includes("warning") || cleanMsg.includes("required") || cleanMsg.includes("valid")) type = "warning";

  window.showToast(message, type);
};
