// Clearbook Local Storage Helpers

const KEYS = {
  SESSION_USER: "clearbook_session_user",
  SESSION_TIME: "clearbook_session_time",
  TOUR_COMPLETED: "clearbook_tour_completed",
  CURRENCY_SYMBOL: "clearbook_currency_symbol",
  DISMISSED_ALERTS: "clearbook_dismissed_alerts",
  THEME: "clearbook_theme"
};

export const Storage = {
  // Theme Preferences
  getTheme() {
    return localStorage.getItem(KEYS.THEME);
  },

  setTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
  },

  // Session User
  getCurrentUser() {
    const user = localStorage.getItem(KEYS.SESSION_USER);
    const timestamp = localStorage.getItem(KEYS.SESSION_TIME);
    if (!user || !timestamp) return null;

    // Check if session is older than 7 days (optional, let's keep session active for 7 days)
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(timestamp, 10) > sevenDays) {
      this.clearSession();
      return null;
    }
    return user;
  },

  setSession(username) {
    localStorage.setItem(KEYS.SESSION_USER, username);
    localStorage.setItem(KEYS.SESSION_TIME, Date.now().toString());
  },

  clearSession() {
    localStorage.removeItem(KEYS.SESSION_USER);
    localStorage.removeItem(KEYS.SESSION_TIME);
  },

  // Tour State
  isTourCompleted() {
    return localStorage.getItem(KEYS.TOUR_COMPLETED) === "true";
  },

  setTourCompleted(completed) {
    localStorage.setItem(KEYS.TOUR_COMPLETED, completed ? "true" : "false");
  },

  // Currency
  getCurrency() {
    return localStorage.getItem(KEYS.CURRENCY_SYMBOL) || "$";
  },

  setCurrency(symbol) {
    localStorage.setItem(KEYS.CURRENCY_SYMBOL, symbol || "$");
  },

  // Dismissed Alerts
  getDismissedAlerts() {
    try {
      const data = localStorage.getItem(KEYS.DISMISSED_ALERTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  dismissAlert(alertId) {
    const dismissed = this.getDismissedAlerts();
    if (!dismissed.includes(alertId)) {
      dismissed.push(alertId);
      localStorage.setItem(KEYS.DISMISSED_ALERTS, JSON.stringify(dismissed));
    }
  },

  clearDismissedAlerts() {
    localStorage.removeItem(KEYS.DISMISSED_ALERTS);
  }
};
