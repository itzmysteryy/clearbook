// ═══════════════════════════════════════════════════════════
//   CLEARBOOK — FIREBASE FIRESTORE SETUP GUIDE
// ═══════════════════════════════════════════════════════════
//
//   STEP 1 — CREATE A FIREBASE PROJECT:
//   - Go to https://console.firebase.google.com
//   - Click "Add project", name it (e.g. "clearbook")
//   - Disable Google Analytics (not needed)
//   - Click "Create project" and wait for it to finish
//
//   STEP 2 — REGISTER YOUR WEB APP:
//   - On the project homepage click the "</>" (Web) icon
//   - Enter a nickname (e.g. "clearbook-web")
//   - Do NOT check "Firebase Hosting" — you are using GitHub Pages
//   - Click "Register app"
//   - You will see a firebaseConfig object. Copy ALL of these values:
//       apiKey, authDomain, projectId, storageBucket,
//       messagingSenderId, appId
//   - Click "Continue to console"
//
//   STEP 3 — ENABLE FIRESTORE:
//   - In left sidebar: Build → Firestore Database
//   - Click "Create database"
//   - Select "Start in test mode"
//   - Choose the region closest to you
//   - Click "Enable" and wait
//
//   STEP 4 — SET SECURITY RULES:
//   - In Firestore click the "Rules" tab
//   - Replace default rules with:
//
//       rules_version = '2';
//       service cloud.firestore {
//         match /databases/{database}/documents {
//           match /users/{username}/{document=**} {
//             allow read, write: if true;
//           }
//         }
//       }
//
//   - Click "Publish"
//
//   STEP 5 — PASTE YOUR CONFIG VALUES:
//   Open config.js and fill in the 6 values you copied in STEP 2:
//     FIREBASE_API_KEY        → your apiKey
//     FIREBASE_AUTH_DOMAIN    → your authDomain
//     FIREBASE_PROJECT_ID     → your projectId
//     FIREBASE_STORAGE_BUCKET → your storageBucket
//     FIREBASE_MESSAGING_ID   → your messagingSenderId
//     FIREBASE_APP_ID         → your appId
//   These are the ONLY values you need to touch in config.js.
//
//   STEP 6 — TEST THE CONNECTION:
//   - Open the app and sign up with a test username
//   - Add one test transaction
//   - Go to Firebase console → Firestore Database
//   - You should see: users → {yourUsername} → transactions →
//     your test entry
//   - If it appears: you are fully configured.
//   - If not: open browser console (F12) and check for errors —
//     most likely a wrong value in config.js
//
//   STEP 7 — FREE TIER LIMITS:
//   Firebase Firestore Spark (free) plan gives you:
//     1 GB storage
//     50,000 reads/day
//     20,000 writes/day
//     20,000 deletes/day
//   A personal finance app will never realistically hit these.
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  getDocs,
  updateDoc, 
  deleteDoc, 
  setDoc, 
  getDoc, 
  enableIndexedDbPersistence,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { CONFIG } from "./config.js";

let db = null;
let firebaseInitialized = false;

if (CONFIG.FIREBASE_API_KEY && CONFIG.FIREBASE_PROJECT_ID) {
  try {
    const firebaseConfig = {
      apiKey: CONFIG.FIREBASE_API_KEY,
      authDomain: CONFIG.FIREBASE_AUTH_DOMAIN,
      projectId: CONFIG.FIREBASE_PROJECT_ID,
      storageBucket: CONFIG.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: CONFIG.FIREBASE_MESSAGING_ID,
      appId: CONFIG.FIREBASE_APP_ID
    };
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseInitialized = true;

    enableIndexedDbPersistence(db).catch((err) => {
      console.warn("Offline persistence unavailable:", err);
    });
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
} else {
  console.log("Firebase credentials not configured. Using local fallback database.");
}

// Local Storage Fallback implementation for testing prior to configuration
const localDB = {
  get(username, subcollection) {
    const key = `clearbook_db_${username}_${subcollection}`;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },
  save(username, subcollection, data) {
    const key = `clearbook_db_${username}_${subcollection}`;
    localStorage.setItem(key, JSON.stringify(data));
  }
};

export const Database = {
  isConfigured() {
    return firebaseInitialized;
  },

  // Listen to a subcollection (realtime updates)
  subscribe(username, subcollection, callback) {
    if (firebaseInitialized && db) {
      const colRef = collection(db, "users", username, subcollection);
      return onSnapshot(colRef, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        callback(items);
      }, (error) => {
        console.error(`Subscription error for ${subcollection}:`, error);
      });
    } else {
      // Mock listener using interval or immediate callback
      const getLocalData = () => {
        const dataObj = localDB.get(username, subcollection);
        return Object.entries(dataObj).map(([id, val]) => ({ id, ...val }));
      };
      // Send initial data
      callback(getLocalData());
      
      // Setup a simple poll to simulate changes if needed (or just let mutations trigger manually)
      const interval = setInterval(() => {
        callback(getLocalData());
      }, 2000);
      
      return () => clearInterval(interval);
    }
  },

  // Fetch all documents in a subcollection
  async getAll(username, subcollection) {
    if (firebaseInitialized && db) {
      const colRef = collection(db, "users", username, subcollection);
      const snapshot = await getDocs(colRef);
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      return items;
    } else {
      const dataObj = localDB.get(username, subcollection);
      return Object.entries(dataObj).map(([id, val]) => ({ id, ...val }));
    }
  },

  // Add a document to a subcollection
  async add(username, subcollection, data) {
    if (firebaseInitialized && db) {
      const colRef = collection(db, "users", username, subcollection);
      const docRef = await addDoc(colRef, data);
      return docRef.id;
    } else {
      const dataObj = localDB.get(username, subcollection);
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      dataObj[id] = data;
      localDB.save(username, subcollection, dataObj);
      return id;
    }
  },

  // Update an existing document
  async update(username, subcollection, docId, data) {
    if (firebaseInitialized && db) {
      const docRef = doc(db, "users", username, subcollection, docId);
      await updateDoc(docRef, data);
    } else {
      const dataObj = localDB.get(username, subcollection);
      if (dataObj[docId]) {
        dataObj[docId] = { ...dataObj[docId], ...data };
        localDB.save(username, subcollection, dataObj);
      }
    }
  },

  // Set/Write document with fixed ID
  async set(username, subcollection, docId, data) {
    if (firebaseInitialized && db) {
      const docRef = doc(db, "users", username, subcollection, docId);
      await setDoc(docRef, data);
    } else {
      const dataObj = localDB.get(username, subcollection);
      dataObj[docId] = data;
      localDB.save(username, subcollection, dataObj);
    }
  },

  // Get a single document by ID
  async get(username, subcollection, docId) {
    if (firebaseInitialized && db) {
      const docRef = doc(db, "users", username, subcollection, docId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } else {
      const dataObj = localDB.get(username, subcollection);
      return dataObj[docId] ? { id: docId, ...dataObj[docId] } : null;
    }
  },

  // Delete a document
  async delete(username, subcollection, docId) {
    if (firebaseInitialized && db) {
      const docRef = doc(db, "users", username, subcollection, docId);
      await deleteDoc(docRef);
    } else {
      const dataObj = localDB.get(username, subcollection);
      delete dataObj[docId];
      localDB.save(username, subcollection, dataObj);
    }
  },

  // Delete all data for a user
  async wipeAllData(username) {
    const collections = ["transactions", "budgets", "savings", "debts", "alerts", "settings"];
    if (firebaseInitialized && db) {
      for (const colName of collections) {
        const colRef = collection(db, "users", username, colName);
        const snapshot = await getDocs(colRef);
        const deletePromises = [];
        snapshot.forEach((document) => {
          const docRef = doc(db, "users", username, colName, document.id);
          deletePromises.push(deleteDoc(docRef));
        });
        await Promise.all(deletePromises);
      }
    } else {
      for (const colName of collections) {
        localStorage.removeItem(`clearbook_db_${username}_${colName}`);
      }
    }
  }
};
