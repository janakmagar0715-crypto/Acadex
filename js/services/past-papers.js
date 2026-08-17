/* ==========================================================================
   ACADEX PAST PAPERS SERVICE (js/services/past-papers.js)
   CRUD operations for past examination papers.
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

const PAPERS_COLLECTION = "past_papers";

/**
 * Fetches past examination papers with optional subject/department/examType filters.
 * @param {Object} options 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPastPapers({ department, subject, examType, limitCount = 10 } = {}) {
    try {
        const colRef = collection(db, PAPERS_COLLECTION);
        const queryConstraints = [];

        if (department) {
            queryConstraints.push(where("department", "==", department));
        }
        if (subject) {
            queryConstraints.push(where("subject", "==", subject));
        }
        if (examType) {
            queryConstraints.push(where("examType", "==", examType));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(limitCount));

        const q = query(colRef, ...queryConstraints);
        const snapshot = await getDocs(q);

        const papers = [];
        snapshot.forEach(docSnap => {
            papers.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        return papers;
    } catch (error) {
        console.error("Error fetching past papers:", error);
        throw error;
    }
}

/**
 * Fetches a single past paper document by ID.
 * @param {string} paperId 
 * @returns {Promise<Object|null>}
 */
export async function fetchPastPaperById(paperId) {
    if (!paperId) return null;
    try {
        const docRef = doc(db, PAPERS_COLLECTION, paperId);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
        console.error(`Error fetching past paper ${paperId}:`, error);
        throw error;
    }
}

/**
 * Creates a new past paper document in Firestore.
 * @param {Object} paperData 
 * @returns {Promise<string>} Document ID
 */
export async function createPastPaper(paperData) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Authentication required to create a past paper entry.");
    }

    if (!paperData.title || !paperData.subject || !paperData.fileURL) {
        throw new Error("Title, subject, and fileURL are required.");
    }

    try {
        const colRef = collection(db, PAPERS_COLLECTION);
        const payload = {
            title: paperData.title.trim(),
            courseCode: (paperData.courseCode || "").trim().toUpperCase(),
            subject: paperData.subject.trim(),
            department: paperData.department || "",
            year: paperData.year || new Date().getFullYear().toString(),
            semester: paperData.semester || "",
            examType: paperData.examType || "final",
            fileURL: paperData.fileURL,
            fileType: paperData.fileType || "pdf",
            fileSize: paperData.fileSize || 0,
            uploaderUid: user.uid,
            uploaderName: paperData.uploaderName || user.displayName || "Student",
            downloadsCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Error creating past paper:", error);
        throw error;
    }
}

/**
 * Updates a past paper document (preserves uploaderUid, createdAt, and excludes counters).
 * @param {string} paperId 
 * @param {Object} updateFields 
 */
export async function updatePastPaper(paperId, updateFields = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to update past paper.");

    // Strip protected fields
    const { 
        uploaderUid, 
        createdAt, 
        downloadsCount, 
        id, 
        ...allowedFields 
    } = updateFields;

    try {
        const docRef = doc(db, PAPERS_COLLECTION, paperId);
        await updateDoc(docRef, {
            ...allowedFields,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error(`Error updating past paper ${paperId}:`, error);
        throw error;
    }
}

/**
 * Deletes a past paper document.
 * @param {string} paperId 
 */
export async function deletePastPaper(paperId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete past paper.");

    try {
        const docRef = doc(db, PAPERS_COLLECTION, paperId);
        await deleteDoc(docRef);
    } catch (error) {
        console.error(`Error deleting past paper ${paperId}:`, error);
        throw error;
    }
}
