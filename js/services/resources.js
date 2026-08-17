/* ==========================================================================
   ACADEX SHARED RESOURCES SERVICE (js/services/resources.js)
   CRUD operations for shared notes, assignments, projects, and guides.
   Includes automatic Storage cleanup guards upon creation failure or deletion.
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

const RESOURCES_COLLECTION = "resources";

/**
 * Real-time subscription listener for resources collection.
 * @param {Object} options 
 * @param {Function} callback 
 * @returns {Function} Unsubscribe function
 */
export function subscribeResources({ category, department, limitCount = 30 } = {}, callback) {
    try {
        const colRef = collection(db, RESOURCES_COLLECTION);
        const queryConstraints = [where("status", "==", "active")];

        if (category && category !== "all") {
            queryConstraints.push(where("category", "==", category));
        }
        if (department && department !== "all") {
            queryConstraints.push(where("department", "==", department));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(limitCount));

        const q = query(colRef, ...queryConstraints);

        return onSnapshot(q, (snapshot) => {
            const resources = [];
            snapshot.forEach(docSnap => {
                resources.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            callback(resources);
        }, (error) => {
            console.error("Real-time resources subscription error:", error);
            callback([], error);
        });
    } catch (error) {
        console.error("Error setting up real-time resources subscription:", error);
        throw error;
    }
}

/**
 * Fetches shared academic resources matching optional category/department filters.
 * @param {Object} options - Filter parameters
 * @returns {Promise<Array<Object>>}
 */
export async function fetchResources({ category, department, limitCount = 12 } = {}) {
    try {
        const colRef = collection(db, RESOURCES_COLLECTION);
        const queryConstraints = [where("status", "==", "active")];

        if (category && category !== "all") {
            queryConstraints.push(where("category", "==", category));
        }
        if (department && department !== "all") {
            queryConstraints.push(where("department", "==", department));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(limitCount));

        const q = query(colRef, ...queryConstraints);
        const snapshot = await getDocs(q);

        const resources = [];
        snapshot.forEach(docSnap => {
            resources.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        return resources;
    } catch (error) {
        console.error("Error fetching shared resources:", error);
        throw error;
    }
}

/**
 * Fetches a single shared resource by document ID.
 * @param {string} resourceId 
 * @returns {Promise<Object|null>}
 */
export async function fetchResourceById(resourceId) {
    if (!resourceId) return null;
    try {
        const docRef = doc(db, RESOURCES_COLLECTION, resourceId);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
        console.error(`Error fetching resource ${resourceId}:`, error);
        throw error;
    }
}

/**
 * Creates a new shared resource document in Firestore.
 * Automatically cleans up uploaded Storage file if Firestore creation fails!
 * @param {Object} resourceData - Title, subject, category, fileURL, storagePath, etc.
 * @returns {Promise<string>} Document ID of created resource
 */
export async function createResource(resourceData) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Authentication required to create a resource.");
    }

    if (!resourceData.title || !resourceData.subject || !resourceData.fileURL) {
        throw new Error("Title, subject, and fileURL are required fields.");
    }

    const payload = {
        title: resourceData.title.trim(),
        description: (resourceData.description || "").trim(),
        category: resourceData.category || "notes",
        subject: resourceData.subject.trim(),
        department: resourceData.department || "",
        semester: resourceData.semester || "",
        fileURL: resourceData.fileURL,
        storagePath: resourceData.storagePath || "",
        fileType: resourceData.fileType || "pdf",
        fileSize: resourceData.fileSize || 0,
        uploaderUid: user.uid,
        uploaderName: resourceData.uploaderName || user.displayName || "Student",
        downloadsCount: 0,
        viewsCount: 0,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        const colRef = collection(db, RESOURCES_COLLECTION);
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Firestore Resource Creation Error! Initiating Storage cleanup guard...", error);
        
        // Automatic Storage Cleanup if Firestore write fails after Storage upload
        if (resourceData.storagePath) {
            try {
                await deleteStorageFile(resourceData.storagePath);
                console.log("Cleanup Guard: Orphaned Storage file successfully deleted.");
            } catch (cleanupErr) {
                console.error("Cleanup Guard Error deleting storage file:", cleanupErr);
            }
        }
        throw error;
    }
}

/**
 * Updates a resource document (preserves uploaderUid, createdAt, and excludes counters).
 * @param {string} resourceId 
 * @param {Object} updateFields 
 */
export async function updateResource(resourceId, updateFields = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to update resource.");

    // Strip protected fields to prevent counter/ownership manipulation
    const { 
        uploaderUid, 
        createdAt, 
        downloadsCount, 
        viewsCount, 
        id, 
        storagePath,
        ...allowedFields 
    } = updateFields;

    try {
        const docRef = doc(db, RESOURCES_COLLECTION, resourceId);
        await updateDoc(docRef, {
            ...allowedFields,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error(`Error updating resource ${resourceId}:`, error);
        throw error;
    }
}

/**
 * Deletes a shared resource document AND its associated Storage file.
 * @param {string} resourceId 
 */
export async function deleteResource(resourceId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete resource.");

    try {
        // Fetch resource document first to retrieve storagePath
        const resource = await fetchResourceById(resourceId);
        if (resource && resource.storagePath) {
            await deleteStorageFile(resource.storagePath);
        }

        const docRef = doc(db, RESOURCES_COLLECTION, resourceId);
        await deleteDoc(docRef);
        console.log(`Resource ${resourceId} and storage file deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting resource ${resourceId}:`, error);
        throw error;
    }
}
