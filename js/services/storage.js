/* ==========================================================================
   ACADEX SUPABASE STORAGE SERVICE (js/services/storage.js)
   Handles uploading and deleting resource files (PDF, DOCX, ZIP, Images) in Supabase Storage.
   ========================================================================== */

import { supabase } from "../supabase-config.js";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Uploads a study resource or past paper file to Supabase Storage.
 * @param {File} file - Browser File object
 * @param {string} userId - Authenticated User UID
 * @param {string} bucketName - Supabase storage bucket name (default: "resources")
 * @returns {Promise<{fileURL: string, storagePath: string, fileName: string, fileSize: number, fileType: string}>}
 */
export async function uploadResourceFile(file, userId, bucketName = "resources") {
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
    const filePath = `${userId}/${Date.now()}_${sanitizedFileName}`;

    try {
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file, {
                contentType: file.type || "application/octet-stream",
                upsert: true
            });

        if (error) {
            console.error("Supabase Storage Upload Error:", error);
            throw new Error(error.message || "Failed to upload file to Supabase Storage.");
        }

        // Get public URL for CDN access
        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);

        const fileURL = publicUrlData ? publicUrlData.publicUrl : "";

        return {
            fileURL,
            storagePath: filePath,
            fileName: file.name,
            fileSize: file.size,
            fileType
        };
    } catch (error) {
        console.error("Supabase Storage Service Error:", error);
        throw new Error("Failed to upload file to Supabase Storage: " + (error.message || "Network error."));
    }
}

/**
 * Deletes a file from Supabase Storage.
 * @param {string} storagePath - Relative path inside bucket
 * @param {string} bucketName - Supabase storage bucket name
 */
export async function deleteStorageFile(storagePath, bucketName = "resources") {
    if (!storagePath) return;

    try {
        const { error } = await supabase.storage
            .from(bucketName)
            .remove([storagePath]);

        if (error) {
            console.warn(`Supabase Storage deletion warning for ${storagePath}:`, error.message);
        } else {
            console.log("Supabase Storage file deleted successfully:", storagePath);
        }
    } catch (error) {
        console.warn(`Supabase Storage file deletion error for ${storagePath}:`, error.message);
    }
}
