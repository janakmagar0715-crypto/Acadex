/* ==========================================================================
   ACADEX PAST PAPERS SERVICE (js/services/past-papers.js)
   CRUD operations for past examination papers.
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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const PAPERS_COLLECTION = "past_papers";

/**
 * Fetches past examination papers with optional subject/department/examType filters.
 * @param {Object} options 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPastPapers({ department, subject, examType, limitCount = 16 } = {}) {
    try {
        const colRef = collection(db, PAPERS_COLLECTION);
        const queryConstraints = [];

        if (department && department !== "all") {
            queryConstraints.push(where("department", "==", department));
        }
        if (examType && examType !== "all") {
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
 * Automatically cleans up uploaded Storage file if Firestore creation fails!
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

    const payload = {
        title: paperData.title.trim(),
        courseCode: (paperData.courseCode || "").trim().toUpperCase(),
        subject: paperData.subject.trim(),
        department: paperData.department || "",
        year: paperData.year || new Date().getFullYear().toString(),
        semester: paperData.semester || "",
        examType: paperData.examType || "final",
        fileURL: paperData.fileURL,
        storagePath: paperData.storagePath || "",
        fileType: paperData.fileType || "pdf",
        fileSize: paperData.fileSize || 0,
        uploaderUid: user.uid,
        uploaderName: paperData.uploaderName || user.displayName || "Student",
        downloadsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        const colRef = collection(db, PAPERS_COLLECTION);
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    } catch (error) {
        console.error("Firestore Past Paper Creation Error! Initiating Storage cleanup guard...", error);
        
        // Automatic Storage Cleanup if Firestore write fails after Storage upload
        if (paperData.storagePath) {
            try {
                await deleteStorageFile(paperData.storagePath);
                console.log("Cleanup Guard: Orphaned Storage file successfully deleted.");
            } catch (cleanupErr) {
                console.error("Cleanup Guard Error deleting storage file:", cleanupErr);
            }
        }
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
        storagePath,
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
 * Deletes a past paper document AND its associated Storage file.
 * @param {string} paperId 
 */
export async function deletePastPaper(paperId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete past paper.");

    try {
        // Fetch paper document first to retrieve storagePath
        const paper = await fetchPastPaperById(paperId);
        if (paper && paper.storagePath) {
            await deleteStorageFile(paper.storagePath);
        }

        const docRef = doc(db, PAPERS_COLLECTION, paperId);
        await deleteDoc(docRef);
        console.log(`Past Paper ${paperId} and storage file deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting past paper ${paperId}:`, error);
        throw error;
    }
}
