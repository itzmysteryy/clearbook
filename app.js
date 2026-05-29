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
  recurring: []
};

let activeSubscriptions = [];
let hasInitiallyLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
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

  const collections = ["transactions", "budgets", "savings", "debts", "alerts", "recurring"];
  const readyFlags = {
    transactions: false,
    budgets: false,
    savings: false,
    debts: false,
    alerts: false,
    recurring: false
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
