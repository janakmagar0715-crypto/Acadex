/* ==========================================================================
   ACADEX SHARED RESOURCES SERVICE (js/services/resources.js)
   CRUD operations for shared notes, assignments, projects, and guides.
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

const RESOURCES_COLLECTION = "resources";

/**
 * Fetches shared academic resources matching optional category/department filters.
 * @param {Object} options - Filter parameters
 * @returns {Promise<Array<Object>>}
 */
export async function fetchResources({ category, department, limitCount = 10 } = {}) {
    try {
        const colRef = collection(db, RESOURCES_COLLECTION);
        const queryConstraints = [where("status", "==", "active")];

        if (category) {
            queryConstraints.push(where("category", "==", category));
        }
        if (department) {
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
 * @param {Object} resourceData - Title, subject, category, fileURL, etc.
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

    try {
        const colRef = collection(db, RESOURCES_COLLECTION);
        const payload = {
            title: resourceData.title.trim(),
            description: (resourceData.description || "").trim(),
            category: resourceData.category || "notes",
            subject: resourceData.subject.trim(),
            department: resourceData.department || "",
            semester: resourceData.semester || "",
            fileURL: resourceData.fileURL,
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

        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Error creating resource:", error);
        throw error;
    }
}

/**
 * Updates a resource document (preserves uploaderUid, createdAt, and excludes counters from arbitrary CRUD updates).
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
 * Deletes a shared resource document.
 * @param {string} resourceId 
 */
export async function deleteResource(resourceId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete resource.");

    try {
        const docRef = doc(db, RESOURCES_COLLECTION, resourceId);
        await deleteDoc(docRef);
    } catch (error) {
        console.error(`Error deleting resource ${resourceId}:`, error);
        throw error;
    }
}
