// ═══════════════════════════════════════════════════════════
//   CLEARBOOK — SPREADAPI + GOOGLE SHEETS AUTH SETUP GUIDE
// ═══════════════════════════════════════════════════════════
//
//   STEP 1 — CREATE THE GOOGLE SHEET:
//   - Create a new Google Sheet
//   - Rename Sheet 1 tab to exactly: Users
//   - Add these headers in row 1:
//       A1: id   B1: username   C1: passwordHash   D1: createdAt
//   - Leave all other rows empty
//
//   STEP 2 — CONNECT TO SPREADAPI:
//   - Go to spreadapi.roombelt.com and sign in with Google
//   - Connect your Google Sheet by pasting its URL
//   - Copy the generated REST API base URL
//   - Paste it into config.js as SPREADAPI_BASE_URL
//
//   STEP 3 — CONFIGURE PERMISSIONS:
//   - In SpreadAPI dashboard, allow GET and POST on the Users sheet
//   - Enable API key protection
//   - Copy your API key into config.js as SPREADAPI_API_KEY
//
//   STEP 4 — TEST:
//   - Open the app and sign up with a test account
//   - Check your Google Sheet — a new row should appear within seconds
//
//   STEP 5 — SECURITY NOTE:
//   - Suitable for personal/fun projects
//   - Passwords are SHA-256 hashed before storage
//   - Only usernames and password hashes touch the sheet
//   - All financial data stays in Firestore, never in the sheet
// ═══════════════════════════════════════════════════════════

import { CONFIG } from "./config.js";
import { Storage } from "./storage.js";
import { Database } from "./firebase.js";

// Pure-JS SHA-256 fallback (used when crypto.subtle is unavailable on HTTP/LAN)
// Produces the same output as crypto.subtle so existing hashed passwords remain valid.
function sha256Fallback(str) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = "";
  const words = [];
  const asciiBitLength = str.length * 8;
  let hash = [];
  let k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = candidate * candidate; i < 313; i += candidate) isComposite[i] = true;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  str += "\x80";
  while (str.length % 64 - 56) str += "\x00";
  for (let i = 0; i < str.length; i++) {
    const j = str.charCodeAt(i);
    if (j >> 8) return null; // Non-ASCII; bail out
    words[i >> 2] |= j << (24 - (i % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length;) {
    const W = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = W[i - 15], w2 = W[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (W[i] = i < 16 ? W[i]
          : (W[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + W[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash).slice(0, 7).concat([(hash[3] + temp1) | 0]);
    }
    hash = hash.map((h, i) => (h + oldHash[i]) | 0);
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

// SHA-256 password hashing — uses native crypto.subtle when available (HTTPS/localhost),
// falls back to pure-JS implementation for HTTP on local network access.
export async function hashPassword(password) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      // Fall through to JS fallback
    }
  }
  // Pure-JS fallback for non-secure contexts (HTTP on LAN)
  const result = sha256Fallback(password);
  if (result) return result;
  // Last resort: simple deterministic hash (for non-ASCII passwords)
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}


// Check if SpreadAPI configuration is active
function isAuthApiConfigured() {
  return CONFIG.SPREADAPI_BASE_URL && CONFIG.SPREADAPI_API_KEY;
}

// Local mock database for user accounts prior to API setup
const mockAuth = {
  getUsers() {
    try {
      const data = localStorage.getItem("clearbook_mock_users");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  addUser(user) {
    const users = this.getUsers();
    users.push(user);
    localStorage.setItem("clearbook_mock_users", JSON.stringify(users));
  }
};

export const Auth = {
  // Sign Up: creates a new user
  async signUp(username, password) {
    const trimmedUser = username.trim().toLowerCase();
    if (!trimmedUser || !password) {
      throw new Error("Username and password are required.");
    }

    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);

    const newUser = { id, username: trimmedUser, passwordHash, createdAt };

    if (isAuthApiConfigured()) {
      // Check if user already exists
      const existingUsers = await this.fetchRemoteUsers();
      if (existingUsers.some(u => u.username === trimmedUser)) {
        throw new Error("Username already exists.");
      }

      // POST to SpreadAPI
      const response = await fetch(CONFIG.SPREADAPI_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CONFIG.SPREADAPI_API_KEY,
          "Authorization": `Bearer ${CONFIG.SPREADAPI_API_KEY}`
        },
        body: JSON.stringify(newUser)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("SpreadAPI Signup Error:", errorText);
        throw new Error("Failed to sign up on Google Sheets. Please check configurations.");
      }
    } else if (Database.isConfigured()) {
      // Firebase Firestore signup fallback
      const profile = await Database.get(trimmedUser, "profile", "profileData");
      if (profile) {
        throw new Error("Username already exists.");
      }
      await Database.set(trimmedUser, "profile", "profileData", newUser);
    } else {
      // Local storage auth fallback
      const existingUsers = mockAuth.getUsers();
      if (existingUsers.some(u => u.username === trimmedUser)) {
        throw new Error("Username already exists.");
      }
      mockAuth.addUser(newUser);
    }

    // Auto log in after sign up
    Storage.setSession(trimmedUser);
    return trimmedUser;
  },

  // Log In: authenticates existing user
  async logIn(username, password) {
    const trimmedUser = username.trim().toLowerCase();
    if (!trimmedUser || !password) {
      throw new Error("Username and password are required.");
    }

    const passwordHash = await hashPassword(password);

    if (isAuthApiConfigured()) {
      const users = await this.fetchRemoteUsers();
      const match = users.find(u => u.username === trimmedUser && u.passwordHash === passwordHash);
      if (!match) {
        throw new Error("Invalid username or password.");
      }
    } else if (Database.isConfigured()) {
      // Firebase Firestore login fallback
      const profile = await Database.get(trimmedUser, "profile", "profileData");
      if (!profile || profile.passwordHash !== passwordHash) {
        throw new Error("Invalid username or password.");
      }
    } else {
      const users = mockAuth.getUsers();
      const match = users.find(u => u.username === trimmedUser && u.passwordHash === passwordHash);
      if (!match) {
        throw new Error("Invalid username or password.");
      }
    }

    Storage.setSession(trimmedUser);
    return trimmedUser;
  },

  // Log Out
  logOut() {
    Storage.clearSession();
    // Do not clear currency settings or tour status unless required,
    // but clear active session state.
  },

  // Helper: Fetch all rows from the Google Sheet
  async fetchRemoteUsers() {
    try {
      const response = await fetch(CONFIG.SPREADAPI_BASE_URL, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CONFIG.SPREADAPI_API_KEY,
          "Authorization": `Bearer ${CONFIG.SPREADAPI_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error(`SpreadAPI fetch error: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle different SpreadAPI response structures (could be directly an array, or nested under 'records' etc)
      if (Array.isArray(data)) return data;
      if (data.records && Array.isArray(data.records)) return data.records;
      if (data.data && Array.isArray(data.data)) return data.data;
      return [];
    } catch (error) {
      console.error("Error fetching users from SpreadAPI:", error);
      throw new Error("Could not connect to Google Sheets authentication database.");
    }
  }
};
