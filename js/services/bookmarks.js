/* ==========================================================================
   ACADEX BOOKMARKS SERVICE (js/services/bookmarks.js)
   Subcollection CRUD operations for users/{uid}/bookmarks.
   ========================================================================== */

import { auth, db } from "../firebase-config.js";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/**
 * Fetches all saved bookmarks for a given student UID.
 * @param {string} uid - Student Firebase Auth UID
 * @returns {Promise<Array<Object>>}
 */
export async function fetchUserBookmarks(uid) {
    if (!uid) return [];
    try {
        const bookmarksRef = collection(db, "users", uid, "bookmarks");
        const q = query(bookmarksRef, orderBy("savedAt", "desc"));
        const snapshot = await getDocs(q);

        const bookmarks = [];
        snapshot.forEach(docSnap => {
            bookmarks.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        return bookmarks;
    } catch (error) {
        console.error(`Error fetching bookmarks for user ${uid}:`, error);
        throw error;
    }
}

/**
 * Adds a resource, paper, or marketplace item to the user's bookmarks subcollection.
 * @param {Object} bookmarkItem - Item to bookmark (targetId, targetType, title, etc.)
 * @returns {Promise<string>} Bookmark ID
 */
export async function addBookmark(bookmarkItem) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to bookmark an item.");
    if (!bookmarkItem.targetId || !bookmarkItem.targetType) {
        throw new Error("targetId and targetType are required to add a bookmark.");
    }

    const bookmarkId = `${bookmarkItem.targetType}_${bookmarkItem.targetId}`;

    try {
        const bookmarkRef = doc(db, "users", user.uid, "bookmarks", bookmarkId);
        const payload = {
            id: bookmarkId,
            targetId: bookmarkItem.targetId,
            targetType: bookmarkItem.targetType,
            title: (bookmarkItem.title || "").trim(),
            subject: (bookmarkItem.subject || "").trim(),
            category: (bookmarkItem.category || "").trim(),
            savedAt: serverTimestamp()
        };

        await setDoc(bookmarkRef, payload);
        return bookmarkId;
    } catch (error) {
        console.error("Error adding bookmark:", error);
        throw error;
    }
}

/**
 * Removes a saved item from the user's bookmarks subcollection.
 * @param {string} targetType - "resource" | "past_paper" | "marketplace_item"
 * @param {string} targetId - ID of the bookmarked item
 */
export async function removeBookmark(targetType, targetId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to remove a bookmark.");

    const bookmarkId = `${targetType}_${targetId}`;

    try {
        const bookmarkRef = doc(db, "users", user.uid, "bookmarks", bookmarkId);
        await deleteDoc(bookmarkRef);
    } catch (error) {
        console.error(`Error removing bookmark ${bookmarkId}:`, error);
        throw error;
    }
}

/**
 * Checks whether an item is bookmarked by the currently authenticated user.
 * @param {string} targetType 
 * @param {string} targetId 
 * @returns {Promise<boolean>}
 */
export async function isItemBookmarked(targetType, targetId) {
    const user = auth.currentUser;
    if (!user || !targetId || !targetType) return false;

    const bookmarkId = `${targetType}_${targetId}`;

    try {
        const bookmarkRef = doc(db, "users", user.uid, "bookmarks", bookmarkId);
        const snap = await getDoc(bookmarkRef);
        return snap.exists();
    } catch (error) {
        console.warn(`Error checking bookmark status for ${bookmarkId}:`, error);
        return false;
    }
}
