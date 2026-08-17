/* ==========================================================================
   ACADEX FIREBASE STORAGE SERVICE (js/services/storage.js)
   Handles uploading and deleting resource files (PDF, DOCX, ZIP) in Storage.
   ========================================================================== */

import { storage } from "../firebase-config.js";
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip",
    "application/x-zip-compressed",
    "image/png",
    "image/jpeg",
    "image/webp"
];

/**
 * Uploads a study resource file to Firebase Storage.
 * @param {File} file - Browser File object
 * @param {string} userId - Authenticated User UID
 * @returns {Promise<{fileURL: string, storagePath: string, fileName: string, fileSize: number, fileType: string}>}
 */
export async function uploadResourceFile(file, userId) {
    if (!file || !userId) {
        throw new Error("File object and user ID are required for upload.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File size exceeds 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
    }

    // Determine extension & normalize file type
    const extension = file.name.split('.').pop().toLowerCase();
    let fileType = extension;
    if (extension === "pdf") fileType = "pdf";
    else if (extension === "docx" || extension === "doc") fileType = "docx";
    else if (extension === "zip") fileType = "zip";
    else if (["png", "jpg", "jpeg", "webp"].includes(extension)) fileType = "image";

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const storagePath = `resources/${userId}/${Date.now()}_${sanitizedFileName}`;
    const storageRef = ref(storage, storagePath);

    try {
        const snapshot = await uploadBytes(storageRef, file, {
            contentType: file.type || "application/octet-stream"
        });

        const fileURL = await getDownloadURL(snapshot.ref);

        return {
            fileURL,
            storagePath,
            fileName: file.name,
            fileSize: file.size,
            fileType
        };
    } catch (error) {
        console.error("Firebase Storage Upload Error:", error);
        throw new Error("Failed to upload file to Firebase Storage: " + (error.message || "Network error."));
    }
}

/**
 * Deletes a file from Firebase Storage.
 * @param {string} storagePath - Relative Storage path e.g. resources/{uid}/{filename}
 */
export async function deleteStorageFile(storagePath) {
    if (!storagePath) return;

    try {
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef);
        console.log("Storage file deleted successfully:", storagePath);
    } catch (error) {
        console.warn(`Storage file deletion warning for ${storagePath}:`, error.message);
        // Do not rethrow so document cleanup can complete gracefully if file is missing
    }
}
