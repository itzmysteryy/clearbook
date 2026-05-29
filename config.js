// Clearbook Configuration
// Fill in these values with your Firebase and SpreadAPI details as explained in the setup guides.

export const CONFIG = {
  // SpreadAPI (Google Sheets) Config for Authentication
  SPREADAPI_BASE_URL: "", // e.g., "https://spreadapi.roombelt.com/api/v1/..."
  SPREADAPI_API_KEY: "",  // Your SpreadAPI key

  // Firebase Config for Database
  FIREBASE_API_KEY: "AIzaSyCadIrg9Xttu7TCsfHSOQ5Kg0h-ODtlGN8",
  FIREBASE_AUTH_DOMAIN: "clearbook-f4aac.firebaseapp.com",
  FIREBASE_PROJECT_ID: "clearbook-f4aac",
  FIREBASE_STORAGE_BUCKET: "clearbook-f4aac.firebasestorage.app",
  FIREBASE_MESSAGING_ID: "705957452408",
  FIREBASE_APP_ID: "1:705957452408:web:82755fd173968d168bab8d"
};

// Helper to check if credentials are set
export function isConfigured() {
  return (
    CONFIG.FIREBASE_API_KEY &&
    CONFIG.FIREBASE_PROJECT_ID
  );
}
