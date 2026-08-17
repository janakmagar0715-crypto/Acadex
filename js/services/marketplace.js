/* ==========================================================================
   ACADEX MARKETPLACE SERVICE (js/services/marketplace.js)
   CRUD operations for student marketplace listings (books, gear, devices).
   Includes automatic Cloud Storage cleanup guards upon creation failure or deletion.
   ========================================================================== */

import { auth, db } from "../firebase-config.js";
import { deleteStorageFile } from "./storage.js";
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
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const MARKETPLACE_COLLECTION = "marketplace_items";

/**
 * Real-time subscription listener for marketplace_items collection.
 * @param {Object} options 
 * @param {Function} callback 
 * @returns {Function} Unsubscribe function
 */
export function subscribeMarketplaceItems({ category, status = "available", limitCount = 30 } = {}, callback) {
    try {
        const colRef = collection(db, MARKETPLACE_COLLECTION);
        const queryConstraints = [where("status", "==", status)];

        if (category && category !== "all") {
            queryConstraints.push(where("category", "==", category));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(limitCount));

        const q = query(colRef, ...queryConstraints);

        return onSnapshot(q, (snapshot) => {
            const items = [];
            snapshot.forEach(docSnap => {
                items.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            callback(items);
        }, (error) => {
            console.error("Real-time marketplace subscription error:", error);
            callback([], error);
        });
    } catch (error) {
        console.error("Error setting up real-time marketplace subscription:", error);
        throw error;
    }
}

/**
 * Fetches available marketplace listings matching optional category filters.
 * @param {Object} options 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchMarketplaceItems({ category, status = "available", limitCount = 20 } = {}) {
    try {
        const colRef = collection(db, MARKETPLACE_COLLECTION);
        const queryConstraints = [where("status", "==", status)];

        if (category && category !== "all") {
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
 * Automatically cleans up uploaded Storage image if Firestore creation fails!
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

    const payload = {
        title: itemData.title.trim(),
        description: (itemData.description || "").trim(),
        category: itemData.category || "study",
        price: Number(itemData.price) || 0,
        condition: itemData.condition || "good",
        contactNumber: (itemData.contactNumber || "").trim(),
        imageURL: itemData.imageURL || "",
        storagePath: itemData.storagePath || "",
        sellerUid: user.uid,
        sellerName: itemData.sellerName || user.displayName || "Student",
        status: "available",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        const colRef = collection(db, MARKETPLACE_COLLECTION);
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Firestore Marketplace Creation Error! Initiating Storage cleanup guard...", error);
        
        // Automatic Storage Cleanup if Firestore write fails after Storage upload
        if (itemData.storagePath) {
            try {
                await deleteStorageFile(itemData.storagePath);
                console.log("Cleanup Guard: Orphaned Storage image successfully deleted.");
            } catch (cleanupErr) {
                console.error("Cleanup Guard Error deleting storage image:", cleanupErr);
            }
        }
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
    const { sellerUid, createdAt, id, storagePath, ...allowedFields } = updateFields;

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
 * Deletes a marketplace listing document AND its associated Storage image.
 * @param {string} itemId 
 */
export async function deleteMarketplaceItem(itemId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete item.");

    try {
        // Fetch item document first to retrieve storagePath
        const item = await fetchMarketplaceItemById(itemId);
        if (item && item.storagePath) {
            await deleteStorageFile(item.storagePath);
        }

        const docRef = doc(db, MARKETPLACE_COLLECTION, itemId);
        await deleteDoc(docRef);
        console.log(`Marketplace Item ${itemId} and storage image deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting marketplace item ${itemId}:`, error);
        throw error;
    }
}
