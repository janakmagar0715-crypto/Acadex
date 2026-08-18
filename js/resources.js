/* ==========================================================================
   ACADEX SHARED RESOURCES V1 CONTROLLER (js/resources.js)
   Auth protection, resource filtering, Cloud Storage upload, Firestore CRUD,
   private bookmark toggles, and unified modal UI controllers.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { subscribeResources, createResource, deleteResource } from "./services/resources.js";
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
    let currentResourcesList = [];
    let isUploading = false;

    const resourcesGrid = document.getElementById("resourcesGrid");
    const emptyState = document.getElementById("emptyState");
    const errorState = document.getElementById("errorState");
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const departmentFilter = document.getElementById("departmentFilter");
    const semesterFilter = document.getElementById("semesterFilter");
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
            console.log("Resources Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        try {
            const profileResult = await checkUserProfile(user.uid);
            if (!profileResult || !profileResult.profileComplete) {
                console.log("Resources Page: Profile incomplete, redirecting to onboarding.");
                window.location.href = "onboarding.html";
                return;
            }

            const profileData = profileResult.data || {};
            renderUserProfile(user, profileData);

            // Fetch user's bookmarks to sync active bookmark button states
            await loadUserBookmarks(user.uid);

            // Load Resources Feed
            await loadResources();

            // Check URL query parameters for auto-opening upload modal (e.g. ?upload=true)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get("action") === "upload" || urlParams.get("upload") === "true" || urlParams.get("upload") === "1") {
                openUploadModal();
            }

        } catch (err) {
            console.error("Resources Auth Observer Error:", err);
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
       4. RESOURCE FEED FETCHING & RENDERING (REAL-TIME FIRESTORE LISTENER)
       ---------------------------------------------------------------------- */
    let resourcesUnsubscribe = null;

    async function loadResources() {
        if (!resourcesGrid) return;

        // Show Skeleton Loader initially if empty
        if (!resourcesUnsubscribe) {
            resourcesGrid.style.display = "grid";
            resourcesGrid.innerHTML = `
                <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
                <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
                <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            `;
        }

        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        const categoryVal = categoryFilter ? categoryFilter.value : "all";
        const deptVal = departmentFilter ? departmentFilter.value : "all";
        const semVal = semesterFilter ? semesterFilter.value : "all";
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

        // Cancel previous snapshot listener if active
        if (resourcesUnsubscribe) {
            resourcesUnsubscribe();
            resourcesUnsubscribe = null;
        }

        try {
            resourcesUnsubscribe = subscribeResources({
                category: categoryVal,
                department: deptVal,
                limitCount: 30
            }, (fetchedResources, error) => {
                if (error) {
                    console.error("Error in real-time resources subscription:", error);
                    resourcesGrid.style.display = "none";
                    if (errorState) errorState.style.display = "flex";
                    return;
                }

                // Client-side filtering for search query and semester
                currentResourcesList = fetchedResources.filter(item => {
                    if (semVal !== "all" && item.semester !== semVal) return false;

                    if (searchQuery) {
                        const titleMatch = (item.title || "").toLowerCase().includes(searchQuery);
                        const subjectMatch = (item.subject || "").toLowerCase().includes(searchQuery);
                        const descMatch = (item.description || "").toLowerCase().includes(searchQuery);
                        return titleMatch || subjectMatch || descMatch;
                    }
                    return true;
                });

                if (currentResourcesList.length === 0) {
                    resourcesGrid.style.display = "none";
                    if (emptyState) emptyState.style.display = "flex";
                    return;
                }

                if (emptyState) emptyState.style.display = "none";
                if (errorState) errorState.style.display = "none";

                renderResourcesGrid(currentResourcesList);
            });
        } catch (err) {
            console.error("Failed to setup real-time resources listener:", err);
            resourcesGrid.style.display = "none";
            if (errorState) errorState.style.display = "flex";
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return "0 KB";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function renderResourcesGrid(resources) {
        resourcesGrid.style.display = "grid";
        resourcesGrid.innerHTML = resources.map(item => {
            const isBookmarked = userBookmarksSet.has(item.id);
            const isOwner = currentUser && item.uploaderUid === currentUser.uid;

            let badgeClass = "badge-notes";
            if (item.category === "assignment") badgeClass = "badge-paper";
            else if (item.category === "project") badgeClass = "badge-project";
            else if (item.category === "guide") badgeClass = "badge-guide";

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="resource-card-header">
                            <span class="resource-type-badge ${badgeClass}">${escapeHtml((item.category || "Notes").toUpperCase())}</span>
                            ${isOwner ? `<button class="btn-icon-secondary delete-btn" data-id="${escapeHtml(item.id)}" aria-label="Delete resource" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
                        </div>
                        <h3 class="resource-title" style="margin-top: 10px;">${escapeHtml(item.title)}</h3>
                        <div class="resource-meta-text">${escapeHtml(item.subject)} • ${escapeHtml(item.department || 'General')}</div>
                        <div class="resource-meta-text" style="font-size: 11.5px; margin-top: 4px;">By ${escapeHtml(item.uploaderName || 'Student')} • ${formatFileSize(item.fileSize)}</div>
                    </div>

                    <div class="resource-card-actions">
                        <button class="btn-icon-secondary bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Bookmark resource">
                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <div class="card-btn-group">
                            <button class="btn-secondary view-details-btn" data-id="${escapeHtml(item.id)}" style="padding: 6px 12px; font-size: 13px;">View</button>
                            <a href="${escapeHtml(item.fileURL)}" target="_blank" download class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none;">Download</a>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // Attach Card Button Handlers
        resourcesGrid.querySelectorAll(".bookmark-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute("data-id");
                await handleBookmarkToggle(resId, btn);
            });
        });

        resourcesGrid.querySelectorAll(".view-details-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const resId = btn.getAttribute("data-id");
                openDetailsModal(resId);
            });
        });

        resourcesGrid.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const resId = btn.getAttribute("data-id");
                await handleResourceDelete(resId);
            });
        });
    }

    /* ----------------------------------------------------------------------
       5. FILTER & SEARCH HANDLERS
       ---------------------------------------------------------------------- */
    if (searchInput) searchInput.addEventListener("input", () => loadResources());
    if (categoryFilter) categoryFilter.addEventListener("change", () => loadResources());
    if (departmentFilter) departmentFilter.addEventListener("change", () => loadResources());
    if (semesterFilter) semesterFilter.addEventListener("change", () => loadResources());
    if (retryFetchBtn) retryFetchBtn.addEventListener("click", () => loadResources());

    /* ----------------------------------------------------------------------
       6. BOOKMARK TOGGLE ENGINE
       ---------------------------------------------------------------------- */
    async function handleBookmarkToggle(resourceId, btnElement) {
        if (!currentUser) return;

        if (btnElement) {
            btnElement.classList.add("bookmark-pop");
            btnElement.addEventListener("animationend", () => btnElement.classList.remove("bookmark-pop"), { once: true });
        }

        const isCurrentlyBookmarked = userBookmarksSet.has(resourceId);
        const item = currentResourcesList.find(r => r.id === resourceId);

        try {
            if (isCurrentlyBookmarked) {
                await removeBookmark("resource", resourceId);
                userBookmarksSet.delete(resourceId);
                if (btnElement) btnElement.classList.remove("bookmarked");
                showToast("Resource removed from bookmarks.");
            } else {
                await addBookmark({
                    targetId: resourceId,
                    targetType: "resource",
                    title: item ? item.title : "Resource",
                    subject: item ? item.subject : "",
                    category: item ? item.category : "notes"
                });
                userBookmarksSet.add(resourceId);
                if (btnElement) btnElement.classList.add("bookmarked");
                showToast("Resource saved to bookmarks!", true);
            }
        } catch (err) {
            console.error("Bookmark toggle error:", err);
            showToast("Could not update bookmark. Please try again.", false);
        }
    }

    /* ----------------------------------------------------------------------
       7. UNIFIED DESTRUCTIVE DELETION MODAL HANDLER
       ---------------------------------------------------------------------- */
    async function handleResourceDelete(resourceId) {
        const item = currentResourcesList.find(r => r.id === resourceId);
        const itemTitle = item ? item.title : "this resource";

        const confirmed = await showConfirmModal({
            title: "Delete Resource?",
            message: `Are you sure you want to delete "${itemTitle}"? This will permanently delete the file and resource details.`,
            confirmText: "Delete Resource",
            cancelText: "Cancel",
            isDanger: true
        });

        if (!confirmed) return;

        try {
            showToast("Deleting resource...");
            await deleteResource(resourceId);
            showToast("Resource deleted successfully!", true);
            await loadResources();
        } catch (err) {
            console.error("Delete resource error:", err);
            showToast("Failed to delete resource: " + (err.message || "Unknown error"), false);
        }
    }

    /* ----------------------------------------------------------------------
       8. RESOURCE DETAILS MODAL CONTROLLER
       ---------------------------------------------------------------------- */
    const resourceDetailsModal = document.getElementById("resourceDetailsModal");
    const closeDetailsModalBtn = document.getElementById("closeDetailsModalBtn");
    const modalCategoryBadge = document.getElementById("modalCategoryBadge");
    const modalTitle = document.getElementById("modalTitle");
    const modalMeta = document.getElementById("modalMeta");
    const modalDescription = document.getElementById("modalDescription");
    const modalUploader = document.getElementById("modalUploader");
    const modalFileSize = document.getElementById("modalFileSize");
    const modalDownloadBtn = document.getElementById("modalDownloadBtn");
    const modalBookmarkBtn = document.getElementById("modalBookmarkBtn");
    const modalBookmarkText = document.getElementById("modalBookmarkText");

    let currentActiveDetailsId = null;

    setupModal({
        modalElement: resourceDetailsModal,
        closeTriggers: [closeDetailsModalBtn]
    });

    function openDetailsModal(resourceId) {
        const item = currentResourcesList.find(r => r.id === resourceId);
        if (!item || !resourceDetailsModal) return;

        currentActiveDetailsId = resourceId;

        if (modalCategoryBadge) {
            modalCategoryBadge.textContent = (item.category || "Notes").toUpperCase();
        }
        if (modalTitle) modalTitle.textContent = item.title;
        if (modalMeta) modalMeta.textContent = `${item.subject} • ${item.department || 'General'} (${item.semester || ''})`;
        if (modalDescription) modalDescription.textContent = item.description || "No description provided.";
        if (modalUploader) modalUploader.textContent = item.uploaderName || "Student";
        if (modalFileSize) modalFileSize.textContent = formatFileSize(item.fileSize);
        if (modalDownloadBtn) modalDownloadBtn.href = item.fileURL;

        updateModalBookmarkState();

        openModal(resourceDetailsModal);
    }

    function updateModalBookmarkState() {
        if (!currentActiveDetailsId) return;
        const isBookmarked = userBookmarksSet.has(currentActiveDetailsId);
        if (modalBookmarkText) modalBookmarkText.textContent = isBookmarked ? "Remove Bookmark" : "Save Bookmark";
        if (modalBookmarkBtn) {
            modalBookmarkBtn.classList.toggle("bookmarked", isBookmarked);
        }
    }

    if (modalBookmarkBtn) {
        modalBookmarkBtn.addEventListener("click", async () => {
            if (!currentActiveDetailsId) return;
            modalBookmarkBtn.classList.add("bookmark-pop");
            modalBookmarkBtn.addEventListener("animationend", () => modalBookmarkBtn.classList.remove("bookmark-pop"), { once: true });
            const cardBtn = resourcesGrid ? resourcesGrid.querySelector(`.bookmark-btn[data-id="${currentActiveDetailsId}"]`) : null;
            await handleBookmarkToggle(currentActiveDetailsId, cardBtn);
            updateModalBookmarkState();
        });
    }

    /* ----------------------------------------------------------------------
       9. UPLOAD RESOURCE MODAL CONTROLLER
       ---------------------------------------------------------------------- */
    const uploadResourceModal = document.getElementById("uploadResourceModal");
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");
    const closeUploadModalBtn = document.getElementById("closeUploadModalBtn");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");
    const uploadResourceForm = document.getElementById("uploadResourceForm");
    const submitUploadBtn = document.getElementById("submitUploadBtn");
    const submitUploadLabel = document.getElementById("submitUploadLabel");

    const resourceTitleInput = document.getElementById("resourceTitle");
    const resourceSubjectInput = document.getElementById("resourceSubject");
    const resourceCategoryInput = document.getElementById("resourceCategory");
    const resourceDepartmentInput = document.getElementById("resourceDepartment");
    const resourceSemesterInput = document.getElementById("resourceSemester");
    const resourceDescriptionInput = document.getElementById("resourceDescription");
    const fileInput = document.getElementById("fileInput");
    const fileUploadContainer = document.getElementById("fileUploadContainer");

    const fileUpload = setupFileUpload({
        containerElement: fileUploadContainer,
        fileInputElement: fileInput,
        maxSizeMB: 25,
        allowedExtensions: [".pdf", ".docx", ".doc", ".zip", ".png", ".jpg", ".jpeg", ".webp"]
    });

    setupModal({
        modalElement: uploadResourceModal,
        openTriggers: [openUploadModalBtn],
        closeTriggers: [closeUploadModalBtn, cancelUploadBtn],
        isUploadingGetter: () => isUploading
    });

    function openUploadModal() {
        if (!uploadResourceModal) return;
        openModal(uploadResourceModal);
    }

    function resetFormErrors() {
        if (!uploadResourceForm) return;
        uploadResourceForm.querySelectorAll(".form-group").forEach(group => {
            group.classList.remove("has-error");
            const errEl = group.querySelector(".field-error-text");
            if (errEl) errEl.style.display = "none";
        });
    }

    if (uploadResourceForm) {
        uploadResourceForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isUploading || !currentUser) return;
            resetFormErrors();

            const titleVal = resourceTitleInput.value.trim();
            const subjectVal = resourceSubjectInput.value.trim();
            const categoryVal = resourceCategoryInput.value;
            const departmentVal = resourceDepartmentInput.value;
            const semesterVal = resourceSemesterInput.value;
            const descriptionVal = resourceDescriptionInput.value.trim();
            const selectedFile = fileUpload ? fileUpload.getSelectedFile() : (fileInput.files ? fileInput.files[0] : null);

            let hasError = false;
            if (!titleVal) {
                const parent = resourceTitleInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a resource title.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!subjectVal) {
                const parent = resourceSubjectInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a subject name.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!selectedFile) {
                if (fileUpload) fileUpload.showError("Please select or drop a resource file.");
                hasError = true;
            }

            if (hasError) return;

            let isSuccess = false;

            try {
                isUploading = true;
                setModalLoadingLock(uploadResourceModal, true);
                submitUploadBtn.disabled = true;
                if (cancelUploadBtn) cancelUploadBtn.disabled = true;
                if (closeUploadModalBtn) closeUploadModalBtn.disabled = true;
                submitUploadBtn.classList.add("btn-loading");
                if (submitUploadLabel) submitUploadLabel.innerHTML = `<span class="btn-spinner"></span> <span>Uploading Resource...</span>`;

                // 1. Upload File to Firebase Storage
                const storageResult = await uploadResourceFile(selectedFile, currentUser.uid);

                // 2. Create Cloud Firestore Resource Document
                await createResource({
                    title: titleVal,
                    subject: subjectVal,
                    category: categoryVal,
                    department: departmentVal,
                    semester: semesterVal,
                    description: descriptionVal,
                    fileURL: storageResult.fileURL,
                    storagePath: storageResult.storagePath,
                    fileType: storageResult.fileType,
                    fileSize: storageResult.fileSize,
                    uploaderName: currentUser.displayName || "Student"
                });

                isSuccess = true;
                showToast("Uploaded successfully ✓", true);

                closeModal(uploadResourceModal);
                await loadResources();

            } catch (error) {
                console.error("Resource Upload Process Error:", error);
                showToast("Upload failed: " + (error.message || "Please check your connection."), false);
            } finally {
                isUploading = false;
                setModalLoadingLock(uploadResourceModal, false);
                submitUploadBtn.disabled = false;
                if (cancelUploadBtn) cancelUploadBtn.disabled = false;
                if (closeUploadModalBtn) closeUploadModalBtn.disabled = false;
                submitUploadBtn.classList.remove("btn-loading");
                if (submitUploadLabel) submitUploadLabel.textContent = "Upload Resource";

                if (isSuccess) {
                    uploadResourceForm.reset();
                    if (fileUpload) fileUpload.reset();
                }
            }
        });
    }
});
