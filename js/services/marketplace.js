/* ==========================================================================
   ACADEX MARKETPLACE SUPABASE SERVICE (js/services/marketplace.js)
   CRUD operations for student marketplace listings using Supabase DB & Storage.
   Integrates with Firebase Auth for user UIDs while storing all marketplace
   data exclusively in Supabase.
   ========================================================================== */

import { supabase } from "../supabase-config.js";
import { auth } from "../firebase-config.js";
import { deleteStorageFile } from "./storage.js";

const MARKETPLACE_TABLE = "marketplace_items";

/**
 * Fetches available marketplace listings matching optional category & condition filters.
 * Logs "Marketplace Supabase error:" and returns [] gracefully if query fails or table is missing.
 * @param {Object} options 
 * @param {string} [options.category="all"]
 * @param {string} [options.condition="all"]
 * @param {string} [options.status="available"]
 * @param {number} [options.limitCount=30]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchMarketplaceItems({ category, condition, status = "available", limitCount = 30 } = {}) {
    try {
        let query = supabase
            .from(MARKETPLACE_TABLE)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limitCount);

        if (status && status !== "all") {
            query = query.eq("status", status);
        }

        if (category && category !== "all") {
            query = query.eq("category", category);
        }

        if (condition && condition !== "all") {
            query = query.eq("condition", condition);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Marketplace Supabase error:", error);
            return [];
        }

        return (data || []).map(item => ({
            id: item.id,
            title: item.title || "",
            description: item.description || "",
            category: item.category || "study",
            price: Number(item.price) || 0,
            condition: item.condition || "good",
            contactNumber: item.contact_number || item.contactNumber || "",
            imageURL: item.image_url || item.imageURL || "",
            storagePath: item.storage_path || item.storagePath || "",
            sellerUid: item.seller_uid || item.sellerUid || "",
            sellerName: item.seller_name || item.sellerName || "Student",
            status: item.status || "available",
            createdAt: item.created_at || item.createdAt || new Date().toISOString()
        }));
    } catch (error) {
        console.error("Marketplace Supabase error:", error);
        return [];
    }
}

/**
 * Fetches a single marketplace listing by ID from Supabase.
 * @param {string} itemId 
 * @returns {Promise<Object|null>}
 */
export async function fetchMarketplaceItemById(itemId) {
    if (!itemId) return null;
    try {
        const { data, error } = await supabase
            .from(MARKETPLACE_TABLE)
            .select("*")
            .eq("id", itemId)
            .single();

        if (error) {
            console.error("Marketplace Supabase error:", error);
            return null;
        }

        return {
            id: data.id,
            title: data.title || "",
            description: data.description || "",
            category: data.category || "study",
            price: Number(data.price) || 0,
            condition: data.condition || "good",
            contactNumber: data.contact_number || data.contactNumber || "",
            imageURL: data.image_url || data.imageURL || "",
            storagePath: data.storage_path || data.storagePath || "",
            sellerUid: data.seller_uid || data.sellerUid || "",
            sellerName: data.seller_name || data.sellerName || "Student",
            status: data.status || "available",
            createdAt: data.created_at || data.createdAt || new Date().toISOString()
        };
    } catch (error) {
        console.error("Marketplace Supabase error:", error);
        throw error;
    }
}

/**
 * Creates a new marketplace listing in Supabase DB.
 * Automatically cleans up uploaded Storage image if database insertion fails.
 * @param {Object} itemData 
 * @returns {Promise<string>} Created Record ID
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
        contact_number: (itemData.contactNumber || "").trim(),
        image_url: itemData.imageURL || "",
        storage_path: itemData.storagePath || "",
        seller_uid: user.uid,
        seller_name: itemData.sellerName || user.displayName || "Student",
        status: "available"
    };

    try {
        const { data, error } = await supabase
            .from(MARKETPLACE_TABLE)
            .insert([payload])
            .select();

        if (error) {
            console.error("Marketplace Supabase error:", error);
            if (itemData.storagePath) {
                try {
                    await deleteStorageFile(itemData.storagePath);
                } catch (cleanupErr) {}
            }
            throw new Error("Could not publish listing to Supabase. " + (error.message || "Please check your Supabase table setup."));
        }

        return data && data[0] ? data[0].id : null;
    } catch (error) {
        console.error("Marketplace Supabase error:", error);
        throw error;
    }
}

/**
 * Updates an existing marketplace listing in Supabase DB.
 * @param {string} itemId 
 * @param {Object} updateFields 
 */
export async function updateMarketplaceItem(itemId, updateFields = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to update item.");

    const payload = {};
    if (updateFields.title !== undefined) payload.title = updateFields.title.trim();
    if (updateFields.description !== undefined) payload.description = updateFields.description.trim();
    if (updateFields.category !== undefined) payload.category = updateFields.category;
    if (updateFields.price !== undefined) payload.price = Number(updateFields.price);
    if (updateFields.condition !== undefined) payload.condition = updateFields.condition;
    if (updateFields.contactNumber !== undefined) payload.contact_number = updateFields.contactNumber.trim();
    if (updateFields.imageURL !== undefined) payload.image_url = updateFields.imageURL;
    if (updateFields.storagePath !== undefined) payload.storage_path = updateFields.storagePath;
    if (updateFields.status !== undefined) payload.status = updateFields.status;

    payload.updated_at = new Date().toISOString();

    try {
        const { error } = await supabase
            .from(MARKETPLACE_TABLE)
            .update(payload)
            .eq("id", itemId)
            .eq("seller_uid", user.uid);

        if (error) {
            console.error("Marketplace Supabase error:", error);
            throw error;
        }
    } catch (error) {
        console.error("Marketplace Supabase error:", error);
        throw error;
    }
}

/**
 * Deletes a marketplace listing from Supabase DB and its associated file from Supabase Storage.
 * @param {string} itemId 
 */
export async function deleteMarketplaceItem(itemId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required to delete item.");

    try {
        // Fetch item first to retrieve storage_path
        const item = await fetchMarketplaceItemById(itemId);
        if (item && item.storagePath) {
            await deleteStorageFile(item.storagePath);
        }

        const { error } = await supabase
            .from(MARKETPLACE_TABLE)
            .delete()
            .eq("id", itemId)
            .eq("seller_uid", user.uid);

        if (error) {
            console.error("Marketplace Supabase error:", error);
            throw error;
        }
    } catch (error) {
        console.error("Marketplace Supabase error:", error);
        throw error;
    }
}
