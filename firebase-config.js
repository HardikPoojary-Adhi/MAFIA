// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
// Replace the placeholder values below with your own Firebase
// project configuration from the Firebase Console.
//
// How to get these values:
// 1. Go to https://console.firebase.google.com/
// 2. Select your project (or create one)
// 3. Click the gear icon → Project settings
// 4. Scroll to "Your apps" → select your Web app
// 5. Copy the firebaseConfig object values
// ============================================================

const firebaseConfig = {
    apiKey: "PASTE_YOUR_FIREBASE_API_KEY_HERE",
    authDomain: "PASTE_YOUR_FIREBASE_AUTH_DOMAIN_HERE",
    databaseURL: "PASTE_YOUR_FIREBASE_DATABASE_URL_HERE",
    projectId: "PASTE_YOUR_FIREBASE_PROJECT_ID_HERE",
    storageBucket: "PASTE_YOUR_FIREBASE_STORAGE_BUCKET_HERE",
    messagingSenderId: "PASTE_YOUR_FIREBASE_MESSAGING_SENDER_ID_HERE",
    appId: "PASTE_YOUR_FIREBASE_APP_ID_HERE"
};

// Export for use in game.js (also available globally)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig };
}
