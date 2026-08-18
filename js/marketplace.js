/* ==========================================================================
   ACADEX STUDENT MARKETPLACE V1 CONTROLLER (js/marketplace.js)
   Auth protection, search/filtering, Cloud Storage image upload,
   Supabase DB CRUD, contact seller modal, private bookmark toggles,
   and unified modal UI controllers.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { 
    fetchMarketplaceItems, 
    createMarketplaceItem, 
    updateMarketplaceItem,
    deleteMarketplaceItem 
} from "./services/marketplace.js";
import { uploadResourceFile } from "./services/storage.js";
import { fetchUserBookmarks, addBookmark, removeBookmark } from "./services/bookmarks.js";
import { initNavbar } from "./components/navbar.js";
import { setupFileUpload } from "./components/file-upload.js";
import { 
    setupModal, 
    openModal, 
    closeModal, 
    showToast, 
    showConfirmModal, 
    setModalLoadingLock 
} from "./components/modal.js";
import { escapeHtml } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
    initNavbar();

    /* ----------------------------------------------------------------------
       1. THEME CONTROLLER
       ---------------------------------------------------------------------- */
    const themeToggleBtn = document.getElementById("themeToggle");
    const THEME_STORAGE_KEY = "acadex-theme";

    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        if (themeToggleBtn) {
            const isDark = theme === "dark";
            themeToggleBtn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
            themeToggleBtn.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === "dark" || savedTheme === "light") {
            setTheme(savedTheme);
        } else {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            setTheme(prefersDark ? "dark" : "light");
        }
    }

    initTheme();

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme");
            setTheme(currentTheme === "dark" ? "light" : "dark");
        });
    }

    /* ----------------------------------------------------------------------
       2. STATE VARIABLES & DOM REFERENCES
       ---------------------------------------------------------------------- */
    let currentUser = null;
    let userBookmarksSet = new Set();
    let currentItemsList = [];
    let isUploading = false;
    let editingItemId = null; // null for new listing, string ID for edit mode

    const marketplaceGrid = document.getElementById("marketplaceGrid");
    const emptyState = document.getElementById("emptyState");
    const errorState = document.getElementById("errorState");
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const conditionFilter = document.getElementById("conditionFilter");
    const retryFetchBtn = document.getElementById("retryFetchBtn");

    // Profile Dropdown Elements
    const profileMenuBtn = document.getElementById("profileMenuBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    const userAvatar = document.getElementById("userAvatar");
    const userNameLabel = document.getElementById("userNameLabel");
    const dropdownName = document.getElementById("dropdownName");
    const dropdownEmail = document.getElementById("dropdownEmail");
    const logoutBtn = document.getElementById("logoutBtn");

    // Profile Menu Toggle
    if (profileMenuBtn && profileDropdown) {
        profileMenuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = profileDropdown.classList.contains("show");
            profileDropdown.classList.toggle("show", !isOpen);
            profileMenuBtn.setAttribute("aria-expanded", !isOpen);
        });

        document.addEventListener("click", () => {
            profileDropdown.classList.remove("show");
            profileMenuBtn.setAttribute("aria-expanded", "false");
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                showToast("Signing out...");
                await signOut(auth);
                window.location.href = "login.html";
            } catch (err) {
                console.error("Logout error:", err);
                showToast("Logout failed. Please try again.", false);
            }
        });
    }

    // Mobile Drawer
    const mobileDrawerToggle = document.getElementById("mobileDrawerToggle");
    const mobileDrawer = document.getElementById("mobileDrawer");
    const closeDrawerBtn = document.getElementById("closeDrawerBtn");
    const drawerOverlay = document.getElementById("drawerOverlay");

    function toggleDrawer(open) {
        if (mobileDrawer && drawerOverlay) {
            mobileDrawer.classList.toggle("open", open);
            drawerOverlay.classList.toggle("open", open);
        }
    }

    if (mobileDrawerToggle) mobileDrawerToggle.addEventListener("click", () => toggleDrawer(true));
    if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", () => toggleDrawer(false));
    if (drawerOverlay) drawerOverlay.addEventListener("click", () => toggleDrawer(false));

    /* ----------------------------------------------------------------------
       3. AUTH STATE OBSERVER & PROFILE BINDING
       ---------------------------------------------------------------------- */
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("Marketplace Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        try {
            const profileResult = await checkUserProfile(user.uid);
            if (!profileResult || !profileResult.profileComplete) {
                console.log("Marketplace Page: Profile incomplete, redirecting to onboarding.");
                window.location.href = "onboarding.html";
                return;
            }

            const profileData = profileResult.data || {};
            renderUserProfile(user, profileData);

            // Fetch user's bookmarks to sync active bookmark button states
            await loadUserBookmarks(user.uid);

            // Load Marketplace Feed from Supabase
            await loadMarketplaceItems();

            // Check URL query parameters for auto-opening upload modal (e.g. ?upload=true)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get("action") === "upload" || urlParams.get("upload") === "true" || urlParams.get("upload") === "1") {
                openUploadModal();
            }

        } catch (err) {
            console.error("Marketplace Auth Observer Error:", err);
            window.location.href = "login.html";
        }
    });

    function renderUserProfile(user, profileData) {
        const displayName = profileData.displayName || user.displayName || "Student";
        const email = profileData.email || user.email || "";

        if (userNameLabel) userNameLabel.textContent = displayName;
        if (dropdownName) dropdownName.textContent = displayName;
        if (dropdownEmail) dropdownEmail.textContent = email;

        if (userAvatar) {
            if (user.photoURL) {
                userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                const initials = displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
                userAvatar.textContent = initials || "ST";
            }
        }
    }

    async function loadUserBookmarks(uid) {
        try {
            const bookmarks = await fetchUserBookmarks(uid);
            userBookmarksSet = new Set(bookmarks.map(b => b.targetId));
        } catch (err) {
            console.warn("Could not load user bookmarks:", err);
            userBookmarksSet = new Set();
        }
    }

    /* ----------------------------------------------------------------------
       4. MARKETPLACE FEED FETCHING & RENDERING (SUPABASE DB)
       ---------------------------------------------------------------------- */
    async function loadMarketplaceItems() {
        if (!marketplaceGrid) return;

        // Show Shimmer Skeleton
        marketplaceGrid.style.display = "grid";
        marketplaceGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;
        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        const categoryVal = categoryFilter ? categoryFilter.value : "all";
        const conditionVal = conditionFilter ? conditionFilter.value : "all";
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

        try {
            const fetched = await fetchMarketplaceItems({
                category: categoryVal,
                condition: conditionVal,
                limitCount: 30
            });

            // Client-side multi-field search filter
            currentItemsList = fetched.filter(item => {
                if (searchQuery) {
                    const titleMatch = (item.title || "").toLowerCase().includes(searchQuery);
                    const descMatch = (item.description || "").toLowerCase().includes(searchQuery);
                    return titleMatch || descMatch;
                }
                return true;
            });

            if (currentItemsList.length === 0) {
                marketplaceGrid.style.display = "none";
                if (emptyState) emptyState.style.display = "flex";
                return;
            }

            renderMarketplaceGrid(currentItemsList);

        } catch (error) {
            console.error("Marketplace Supabase error:", error);
            marketplaceGrid.style.display = "none";
            if (errorState) errorState.style.display = "flex";
        }
    }

    function renderMarketplaceGrid(items) {
        marketplaceGrid.style.display = "grid";
        marketplaceGrid.innerHTML = items.map(item => {
            const isBookmarked = userBookmarksSet.has(item.id);
            const isOwner = currentUser && item.sellerUid === currentUser.uid;

            let conditionClass = "badge-good";
            if (item.condition === "new") conditionClass = "badge-new";
            else if (item.condition === "like-new") conditionClass = "badge-likenew";
            else if (item.condition === "fair") conditionClass = "badge-fair";

            const defaultImg = "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80";
            const displayImg = item.imageURL || defaultImg;

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="item-thumbnail-box">
                            <img src="${escapeHtml(displayImg)}" alt="${escapeHtml(item.title)}" class="item-thumbnail-img">
                            <span class="price-pill">$${Number(item.price).toFixed(2)}</span>
                        </div>
                        <div class="resource-card-header">
                            <span class="resource-type-badge ${conditionClass}">${escapeHtml((item.condition || "Good").toUpperCase())}</span>
                            ${isOwner ? `
                                <div style="display:flex; align-items:center; gap:4px;">
                                    <button class="btn-icon-secondary edit-btn" data-id="${escapeHtml(item.id)}" aria-label="Edit item" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                                    <button class="btn-icon-secondary delete-btn" data-id="${escapeHtml(item.id)}" aria-label="Delete item" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </div>
                            ` : ''}
                        </div>
                        <h3 class="resource-title" style="margin-top: 8px;">${escapeHtml(item.title)}</h3>
                        <div class="resource-meta-text">Seller: ${escapeHtml(item.sellerName || 'Student')}</div>
                    </div>

                    <div class="resource-card-actions">
                        <button class="btn-icon-secondary bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Bookmark item">
                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <button class="btn-primary contact-seller-btn" data-id="${escapeHtml(item.id)}" style="padding: 6px 14px; font-size: 13px;">Contact Seller</button>
                    </div>
                </div>
            `;
        }).join("");

        // Attach Handlers
        marketplaceGrid.querySelectorAll(".bookmark-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-id");
                await handleBookmarkToggle(itemId, btn);
            });
        });

        marketplaceGrid.querySelectorAll(".contact-seller-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const itemId = btn.getAttribute("data-id");
                openContactModal(itemId);
            });
        });

        marketplaceGrid.querySelectorAll(".edit-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const itemId = btn.getAttribute("data-id");
                openEditModal(itemId);
            });
        });

        marketplaceGrid.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const itemId = btn.getAttribute("data-id");
                await handleItemDelete(itemId);
            });
        });
    }

    /* ----------------------------------------------------------------------
       5. FILTER & SEARCH HANDLERS
       ---------------------------------------------------------------------- */
    if (searchInput) searchInput.addEventListener("input", () => loadMarketplaceItems());
    if (categoryFilter) categoryFilter.addEventListener("change", () => loadMarketplaceItems());
    if (conditionFilter) conditionFilter.addEventListener("change", () => loadMarketplaceItems());
    if (retryFetchBtn) retryFetchBtn.addEventListener("click", () => loadMarketplaceItems());

    /* ----------------------------------------------------------------------
       6. BOOKMARK TOGGLE ENGINE
       ---------------------------------------------------------------------- */
    async function handleBookmarkToggle(itemId, btnElement) {
        if (!currentUser) return;

        if (btnElement) {
            btnElement.classList.add("bookmark-pop");
            btnElement.addEventListener("animationend", () => btnElement.classList.remove("bookmark-pop"), { once: true });
        }

        const isCurrentlyBookmarked = userBookmarksSet.has(itemId);
        const item = currentItemsList.find(i => i.id === itemId);

        try {
            if (isCurrentlyBookmarked) {
                await removeBookmark("marketplace_item", itemId);
                userBookmarksSet.delete(itemId);
                if (btnElement) btnElement.classList.remove("bookmarked");
                showToast("Item removed from bookmarks.");
            } else {
                await addBookmark({
                    targetId: itemId,
                    targetType: "marketplace_item",
                    title: item ? item.title : "Marketplace Item",
                    subject: item ? `$${item.price}` : "",
                    category: item ? item.category : "study"
                });
                userBookmarksSet.add(itemId);
                if (btnElement) btnElement.classList.add("bookmarked");
                showToast("Item saved to bookmarks!", true);
            }
        } catch (err) {
            console.error("Marketplace Supabase error:", err);
            showToast("Could not update bookmark. Please try again.", false);
        }
    }

    /* ----------------------------------------------------------------------
       7. UNIFIED DESTRUCTIVE DELETION MODAL HANDLER (SUPABASE DB)
       ---------------------------------------------------------------------- */
    async function handleItemDelete(itemId) {
        const item = currentItemsList.find(i => i.id === itemId);
        const itemTitle = item ? item.title : "this listing";

        const confirmed = await showConfirmModal({
            title: "Delete Listing?",
            message: `Are you sure you want to delete "${itemTitle}"? This will permanently remove the item from Supabase marketplace.`,
            confirmText: "Delete Listing",
            cancelText: "Cancel",
            isDanger: true
        });

        if (!confirmed) return;

        try {
            showToast("Deleting marketplace item...");
            await deleteMarketplaceItem(itemId);
            showToast("Listing deleted successfully!", true);
            await loadMarketplaceItems();
        } catch (err) {
            console.error("Marketplace Supabase error:", err);
            showToast("Failed to delete item: " + (err.message || "Unknown error"), false);
        }
    }

    /* ----------------------------------------------------------------------
       8. CONTACT SELLER MODAL HANDLER
       ---------------------------------------------------------------------- */
    const contactSellerModal = document.getElementById("contactSellerModal");
    const closeContactModalBtn = document.getElementById("closeContactModalBtn");
    const sellerItemTitle = document.getElementById("sellerItemTitle");
    const sellerPriceTag = document.getElementById("sellerPriceTag");
    const sellerNameVal = document.getElementById("sellerNameVal");
    const sellerPhoneVal = document.getElementById("sellerPhoneVal");
    const sellerCallBtn = document.getElementById("sellerCallBtn");

    setupModal({
        modalElement: contactSellerModal,
        closeTriggers: [closeContactModalBtn]
    });

    function openContactModal(itemId) {
        const item = currentItemsList.find(i => i.id === itemId);
        if (!item || !contactSellerModal) return;

        if (sellerItemTitle) sellerItemTitle.textContent = item.title;
        if (sellerPriceTag) sellerPriceTag.textContent = `$${Number(item.price).toFixed(2)}`;
        if (sellerNameVal) sellerNameVal.textContent = item.sellerName || "Student";
        if (sellerPhoneVal) sellerPhoneVal.textContent = item.contactNumber || "Contact via App";
        if (sellerCallBtn) {
            sellerCallBtn.href = item.contactNumber ? `tel:${item.contactNumber}` : "#";
        }

        openModal(contactSellerModal);
    }

    /* ----------------------------------------------------------------------
       9. LIST / EDIT AN ITEM MODAL CONTROLLER (SUPABASE DB)
       ---------------------------------------------------------------------- */
    const uploadItemModal = document.getElementById("uploadItemModal");
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");
    const closeUploadModalBtn = document.getElementById("closeUploadModalBtn");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");
    const uploadItemForm = document.getElementById("uploadItemForm");
    const submitUploadBtn = document.getElementById("submitUploadBtn");
    const submitUploadLabel = document.getElementById("submitUploadLabel");
    const modalTitleEl = uploadItemModal ? uploadItemModal.querySelector(".modal-title") : null;

    const itemTitleInput = document.getElementById("itemTitle");
    const itemPriceInput = document.getElementById("itemPrice");
    const itemCategoryInput = document.getElementById("itemCategory");
    const itemConditionInput = document.getElementById("itemCondition");
    const contactNumberInput = document.getElementById("contactNumber");
    const itemDescriptionInput = document.getElementById("itemDescription");
    const fileInput = document.getElementById("fileInput");
    const fileUploadContainer = document.getElementById("fileUploadContainer");

    const fileUpload = setupFileUpload({
        containerElement: fileUploadContainer,
        fileInputElement: fileInput,
        maxSizeMB: 10,
        allowedExtensions: [".png", ".jpg", ".jpeg", ".webp"]
    });

    setupModal({
        modalElement: uploadItemModal,
        openTriggers: [openUploadModalBtn],
        closeTriggers: [closeUploadModalBtn, cancelUploadBtn],
        isUploadingGetter: () => isUploading,
        onClose: () => {
            editingItemId = null;
            if (modalTitleEl) modalTitleEl.textContent = "List an Item for Sale";
            if (submitUploadLabel) submitUploadLabel.textContent = "Publish Listing";
        }
    });

    function openUploadModal() {
        if (!uploadItemModal) return;
        editingItemId = null;
        if (modalTitleEl) modalTitleEl.textContent = "List an Item for Sale";
        if (submitUploadLabel) submitUploadLabel.textContent = "Publish Listing";
        uploadItemForm.reset();
        if (fileUpload) fileUpload.reset();
        openModal(uploadItemModal);
    }

    function openEditModal(itemId) {
        const item = currentItemsList.find(i => i.id === itemId);
        if (!item || !uploadItemModal) return;

        editingItemId = itemId;
        if (modalTitleEl) modalTitleEl.textContent = "Edit Marketplace Listing";
        if (submitUploadLabel) submitUploadLabel.textContent = "Save Changes";

        resetFormErrors();
        if (itemTitleInput) itemTitleInput.value = item.title || "";
        if (itemPriceInput) itemPriceInput.value = item.price || 0;
        if (itemCategoryInput) itemCategoryInput.value = item.category || "study";
        if (itemConditionInput) itemConditionInput.value = item.condition || "good";
        if (contactNumberInput) contactNumberInput.value = item.contactNumber || "";
        if (itemDescriptionInput) itemDescriptionInput.value = item.description || "";

        openModal(uploadItemModal);
    }

    function resetFormErrors() {
        if (!uploadItemForm) return;
        uploadItemForm.querySelectorAll(".form-group").forEach(group => {
            group.classList.remove("has-error");
            const errEl = group.querySelector(".field-error-text");
            if (errEl) errEl.style.display = "none";
        });
    }

    if (uploadItemForm) {
        uploadItemForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isUploading || !currentUser) return;
            resetFormErrors();

            const titleVal = itemTitleInput.value.trim();
            const priceVal = parseFloat(itemPriceInput.value) || 0;
            const categoryVal = itemCategoryInput.value;
            const conditionVal = itemConditionInput.value;
            const phoneVal = contactNumberInput.value.trim();
            const descriptionVal = itemDescriptionInput.value.trim();
            const selectedFile = fileUpload ? fileUpload.getSelectedFile() : (fileInput.files ? fileInput.files[0] : null);

            let hasError = false;
            if (!titleVal) {
                const parent = itemTitleInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter an item title.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!phoneVal) {
                const parent = contactNumberInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a contact phone or WhatsApp number.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            // Require photo for new items, optional for edits if keeping existing
            if (!editingItemId && !selectedFile) {
                if (fileUpload) fileUpload.showError("Please select or drop an item photo.");
                hasError = true;
            }

            if (hasError) return;

            let isSuccess = false;

            try {
                isUploading = true;
                setModalLoadingLock(uploadItemModal, true);
                submitUploadBtn.disabled = true;
                if (cancelUploadBtn) cancelUploadBtn.disabled = true;
                if (closeUploadModalBtn) closeUploadModalBtn.disabled = true;
                submitUploadBtn.classList.add("btn-loading");
                
                const actionText = editingItemId ? "Updating Listing..." : "Publishing Listing...";
                if (submitUploadLabel) submitUploadLabel.innerHTML = `<span class="btn-spinner"></span> <span>${actionText}</span>`;

                let storageResult = null;
                if (selectedFile) {
                    // Upload Image to Supabase Storage
                    storageResult = await uploadResourceFile(selectedFile, currentUser.uid);
                }

                if (editingItemId) {
                    // Update existing item in Supabase DB
                    const updatePayload = {
                        title: titleVal,
                        price: priceVal,
                        category: categoryVal,
                        condition: conditionVal,
                        contactNumber: phoneVal,
                        description: descriptionVal
                    };
                    if (storageResult) {
                        updatePayload.imageURL = storageResult.fileURL;
                        updatePayload.storagePath = storageResult.storagePath;
                    }

                    await updateMarketplaceItem(editingItemId, updatePayload);
                    showToast("Listing updated successfully ✓", true);
                } else {
                    // Create new item in Supabase DB
                    await createMarketplaceItem({
                        title: titleVal,
                        price: priceVal,
                        category: categoryVal,
                        condition: conditionVal,
                        contactNumber: phoneVal,
                        description: descriptionVal,
                        imageURL: storageResult ? storageResult.fileURL : "",
                        storagePath: storageResult ? storageResult.storagePath : "",
                        sellerName: currentUser.displayName || "Student"
                    });
                    showToast("Uploaded successfully ✓", true);
                }

                isSuccess = true;
                closeModal(uploadItemModal);
                await loadMarketplaceItems();

            } catch (error) {
                console.error("Marketplace Supabase error:", error);
                showToast("Operation failed: " + (error.message || "Please check your Supabase database connection."), false);
            } finally {
                isUploading = false;
                setModalLoadingLock(uploadItemModal, false);
                submitUploadBtn.disabled = false;
                if (cancelUploadBtn) cancelUploadBtn.disabled = false;
                if (closeUploadModalBtn) closeUploadModalBtn.disabled = false;
                submitUploadBtn.classList.remove("btn-loading");
                
                const defaultLabel = editingItemId ? "Save Changes" : "Publish Listing";
                if (submitUploadLabel) submitUploadLabel.textContent = defaultLabel;

                if (isSuccess) {
                    editingItemId = null;
                    uploadItemForm.reset();
                    if (fileUpload) fileUpload.reset();
                }
            }
        });
    }
});
