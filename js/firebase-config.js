import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* ==========================================================================
   ACADEX FIREBASE CONFIGURATION & FIRESTORE SERVICES
   ========================================================================== */
const firebaseConfig = {
    apiKey: "AIzaSyB2HvU3VKdrB8JPl7QMtYTjdZJYhYEPZJU",
    authDomain: "acadex-01.firebaseapp.com",
    projectId: "acadex-01",
    storageBucket: "acadex-01.firebasestorage.app",
    messagingSenderId: "688482253498",
    appId: "1:688482253498:web:cda066442230f7bb06a083"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Checks whether a user profile document exists in Firestore at users/{uid} and if profileComplete is true
 * @param {string} uid - Firebase User UID
 * @returns {Promise<{exists: boolean, profileComplete: boolean, data: Object|null}>}
 */
export async function checkUserProfile(uid) {
    if (!uid) return { exists: false, profileComplete: false, data: null };
    try {
        const userDocRef = doc(db, "users", uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const profileComplete = data && data.profileComplete === true;
            return { exists: true, profileComplete, data };
        }
        return { exists: false, profileComplete: false, data: null };
    } catch (error) {
        console.error("Error checking Firestore user profile:", error);
        return { exists: false, profileComplete: false, data: null, error };
    }
}

export { doc, getDoc, setDoc, serverTimestamp };
