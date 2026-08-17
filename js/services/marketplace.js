/* ==========================================================================
   ACADEX MARKETPLACE SERVICE (js/services/marketplace.js)
   CRUD operations for student marketplace listings (books, gear, devices).
   ========================================================================== */

import { auth, db } from "../firebase-config.js";
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const MARKETPLACE_COLLECTION = "marketplace_items";

/**
 * Fetches available marketplace listings matching optional category filters.
 * @param {Object} options 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchMarketplaceItems({ category, status = "available", limitCount = 10 } = {}) {
    try {
        const colRef = collection(db, MARKETPLACE_COLLECTION);
        const queryConstraints = [where("status", "==", status)];

        if (category) {
            queryConstraints.push(where("category", "==", category));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(limitCount));

        const q = query(colRef, ...queryConstraints);
        const snapshot = await getDocs(q);

        const items = [];
        snapshot.forEach(docSnap => {
            items.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        return items;
    } catch (error) {
        console.error("Error fetching marketplace items:", error);
        throw error;
    }
}

/**
 * Fetches a single marketplace listing document by ID.
 * @param {string} itemId 
 * @returns {Promise<Object|null>}
 */
export async function fetchMarketplaceItemById(itemId) {
    if (!itemId) return null;
    try {
        const docRef = doc(db, MARKETPLACE_COLLECTION, itemId);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
        console.error(`Error fetching marketplace item ${itemId}:`, error);
        throw error;
    }
}

/**
 * Creates a new marketplace listing (excludes seller email for user privacy).
 * @param {Object} itemData 
 * @returns {Promise<string>} Document ID
 */
export async function createMarketplaceItem(itemData) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Authentication required to post a marketplace item.");
    }

    if (!itemData.title || itemData.price === undefined) {
        throw new Error("Title and price are required for marketplace listings.");
    }

    try {
        const colRef = collection(db, MARKETPLACE_COLLECTION);
        const payload = {
            title: itemData.title.trim(),
            description: (itemData.description || "").trim(),
            category: itemData.category || "textbook",
            price: Number(itemData.price) || 0,
            condition: itemData.condition || "good",
            images: Array.isArray(itemData.images) ? itemData.images : [],
            sellerUid: user.uid,
            sellerName: itemData.sellerName || user.displayName || "Student",
            status: "available",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Error creating marketplace item:", error);
        throw error;
    }
}

/**
 * Updates a marketplace listing (preserves sellerUid and createdAt).
 * @param {string} itemId 
 * @param {Object} updateFields 
 */
export async function updateMarketplaceItem(itemId, updateFields = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to update item.");

    // Strip protected immutable fields
    const { sellerUid, createdAt, id, ...allowedFields } = updateFields;

    try {
        const docRef = doc(db, MARKETPLACE_COLLECTION, itemId);
        await updateDoc(docRef, {
            ...allowedFields,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error(`Error updating marketplace item ${itemId}:`, error);
        throw error;
    }
}

/**
 * Deletes a marketplace listing document.
 * @param {string} itemId 
 */
export async function deleteMarketplaceItem(itemId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete item.");

    try {
        const docRef = doc(db, MARKETPLACE_COLLECTION, itemId);
        await deleteDoc(docRef);
    } catch (error) {
        console.error(`Error deleting marketplace item ${itemId}:`, error);
        throw error;
    }
}
