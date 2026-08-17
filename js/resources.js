/* ==========================================================================
   ACADEX ACADEMIC RESOURCES V1 CONTROLLER (js/resources.js)
   Auth protection, resource filtering, Firebase Storage upload, Firestore CRUD,
   private bookmark toggles, and modal UI controllers.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { fetchResources, createResource, deleteResource, fetchResourceById, subscribeResources } from "./services/resources.js";
import { uploadResourceFile } from "./services/storage.js";
import { fetchUserBookmarks, addBookmark, removeBookmark } from "./services/bookmarks.js";
import { escapeHtml } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {

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
       2. TOAST NOTIFICATION SYSTEM
       ---------------------------------------------------------------------- */
    const toastContainer = document.getElementById("toastContainer");

    function showToast(message, isSuccess = true) {
        if (!toastContainer) return;

        toastContainer.innerHTML = "";
        const toast = document.createElement("div");
        toast.className = "toast";

        const iconSvg = isSuccess
            ? `<svg class="toast-icon toast-lime" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
            : `<svg class="toast-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

        toast.innerHTML = `${iconSvg}<span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("toast-exit");
            toast.addEventListener("animationend", () => toast.remove());
        }, 3200);
    }

    /* ----------------------------------------------------------------------
       3. STATE VARIABLES & DOM REFERENCES
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
       4. AUTH STATE OBSERVER & PROFILE BINDING
       ---------------------------------------------------------------------- */
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("Resources Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        // Check if profile is complete
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
       5. RESOURCE FEED FETCHING & RENDERING (REAL-TIME FIRESTORE LISTENER)
       ---------------------------------------------------------------------- */
    let resourcesUnsubscribe = null;

    function loadResources() {
        if (!resourcesGrid) return;

        if (resourcesUnsubscribe) {
            resourcesUnsubscribe();
            resourcesUnsubscribe = null;
        }

        // Show Shimmer Skeleton
        resourcesGrid.style.display = "grid";
        resourcesGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;
        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        const categoryVal = categoryFilter ? categoryFilter.value : "all";
        const deptVal = departmentFilter ? departmentFilter.value : "all";
        const semVal = semesterFilter ? semesterFilter.value : "all";
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

        try {
            resourcesUnsubscribe = subscribeResources({
                category: categoryVal,
                department: deptVal,
                limitCount: 30
            }, (fetched, error) => {
                if (error) {
                    console.error("Real-time resources error:", error);
                    resourcesGrid.style.display = "none";
                    if (errorState) errorState.style.display = "flex";
                    return;
                }

                // Client-side filter for semester and search query
                currentResourcesList = fetched.filter(item => {
                    if (semVal !== "all" && item.semester !== semVal) return false;
                    if (searchQuery) {
                        const titleMatch = (item.title || "").toLowerCase().includes(searchQuery);
                        const subjectMatch = (item.subject || "").toLowerCase().includes(searchQuery);
                        return titleMatch || subjectMatch;
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

        } catch (error) {
            console.error("Error establishing real-time resources feed:", error);
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

            let badgeClass = "";
            if (item.category === "assignment") badgeClass = "badge-paper";
            else if (item.category === "project") badgeClass = "badge-project";

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
                if (confirm("Are you sure you want to delete this resource and its associated file?")) {
                    await handleResourceDelete(resId);
                }
            });
        });
    }

    /* ----------------------------------------------------------------------
       6. FILTER & SEARCH HANDLERS
       ---------------------------------------------------------------------- */
    if (searchInput) searchInput.addEventListener("input", () => loadResources());
    if (categoryFilter) categoryFilter.addEventListener("change", () => loadResources());
    if (departmentFilter) departmentFilter.addEventListener("change", () => loadResources());
    if (semesterFilter) semesterFilter.addEventListener("change", () => loadResources());
    if (retryFetchBtn) retryFetchBtn.addEventListener("click", () => loadResources());

    /* ----------------------------------------------------------------------
       7. BOOKMARK TOGGLE ENGINE
       ---------------------------------------------------------------------- */
    async function handleBookmarkToggle(resourceId, btnElement) {
        if (!currentUser) return;

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
       8. RESOURCE DELETION HANDLER
       ---------------------------------------------------------------------- */
    async function handleResourceDelete(resourceId) {
        try {
            showToast("Deleting resource and file...");
            await deleteResource(resourceId);
            showToast("Resource deleted successfully!", true);
            await loadResources();
        } catch (err) {
            console.error("Delete resource error:", err);
            showToast("Failed to delete resource. " + (err.message || ""), false);
        }
    }

    /* ----------------------------------------------------------------------
       9. RESOURCE DETAILS MODAL HANDLER
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

    function openDetailsModal(resourceId) {
        const item = currentResourcesList.find(r => r.id === resourceId);
        if (!item || !resourceDetailsModal) return;

        currentActiveDetailsId = resourceId;

        if (modalCategoryBadge) modalCategoryBadge.textContent = (item.category || "Notes").toUpperCase();
        if (modalTitle) modalTitle.textContent = item.title;
        if (modalMeta) modalMeta.textContent = `${item.subject} • ${item.department || 'General'} (${item.semester || ''})`;
        if (modalDescription) modalDescription.textContent = item.description || "No additional description provided for this resource.";
        if (modalUploader) modalUploader.textContent = item.uploaderName || "Student";
        if (modalFileSize) modalFileSize.textContent = formatFileSize(item.fileSize);
        if (modalDownloadBtn) modalDownloadBtn.href = item.fileURL;

        updateModalBookmarkState();

        resourceDetailsModal.style.display = "flex";
    }

    function updateModalBookmarkState() {
        if (!currentActiveDetailsId) return;
        const isBookmarked = userBookmarksSet.has(currentActiveDetailsId);
        if (modalBookmarkText) modalBookmarkText.textContent = isBookmarked ? "Remove Bookmark" : "Save Bookmark";
        if (modalBookmarkBtn) {
            modalBookmarkBtn.classList.toggle("bookmarked", isBookmarked);
        }
    }

    if (closeDetailsModalBtn && resourceDetailsModal) {
        closeDetailsModalBtn.addEventListener("click", () => {
            resourceDetailsModal.style.display = "none";
        });

        resourceDetailsModal.addEventListener("click", (e) => {
            if (e.target === resourceDetailsModal) resourceDetailsModal.style.display = "none";
        });
    }

    if (modalBookmarkBtn) {
        modalBookmarkBtn.addEventListener("click", async () => {
            if (!currentActiveDetailsId) return;
            const cardBtn = resourcesGrid ? resourcesGrid.querySelector(`.bookmark-btn[data-id="${currentActiveDetailsId}"]`) : null;
            await handleBookmarkToggle(currentActiveDetailsId, cardBtn);
            updateModalBookmarkState();
        });
    }

    /* ----------------------------------------------------------------------
       10. UPLOAD RESOURCE MODAL CONTROLLER
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

    function openUploadModal() {
        if (!uploadResourceModal) return;
        uploadResourceForm.reset();
        uploadResourceModal.style.display = "flex";
    }

    function closeUploadModal() {
        if (uploadResourceModal && !isUploading) {
            uploadResourceModal.style.display = "none";
        }
    }

    if (openUploadModalBtn) openUploadModalBtn.addEventListener("click", openUploadModal);
    if (closeUploadModalBtn) closeUploadModalBtn.addEventListener("click", closeUploadModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener("click", closeUploadModal);

    if (uploadResourceForm) {
        uploadResourceForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isUploading || !currentUser) return;

            const titleVal = resourceTitleInput.value.trim();
            const subjectVal = resourceSubjectInput.value.trim();
            const categoryVal = resourceCategoryInput.value;
            const departmentVal = resourceDepartmentInput.value;
            const semesterVal = resourceSemesterInput.value;
            const descriptionVal = resourceDescriptionInput.value.trim();
            const selectedFile = fileInput.files[0];

            if (!titleVal || !subjectVal || !selectedFile) {
                showToast("Please fill in all required fields and select a file.", false);
                return;
            }

            // Validate File Size (<25MB)
            if (selectedFile.size > 25 * 1024 * 1024) {
                showToast("File size exceeds the 25 MB limit.", false);
                return;
            }

            let isSuccess = false;

            try {
                isUploading = true;
                submitUploadBtn.disabled = true;
                if (cancelUploadBtn) cancelUploadBtn.disabled = true;
                if (submitUploadLabel) submitUploadLabel.textContent = "Uploading file to Firebase Storage...";

                // 1. Upload File to Firebase Storage
                const storageResult = await uploadResourceFile(selectedFile, currentUser.uid);
                console.log("Firebase Storage Upload Succeeded:", storageResult);

                if (submitUploadLabel) submitUploadLabel.textContent = "Creating Firestore record...";

                // 2. Create Cloud Firestore Resource Document
                const resourceId = await createResource({
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

                console.log("Firestore Resource Record Created:", resourceId);
                isSuccess = true;
                showToast("Resource uploaded successfully!", true);

                closeUploadModal();
                await loadResources();

            } catch (error) {
                console.error("Resource Upload Process Error:", error);
                showToast("Upload failed: " + (error.message || "Please check your network connection."), false);
            } finally {
                isUploading = false;
                submitUploadBtn.disabled = false;
                if (cancelUploadBtn) cancelUploadBtn.disabled = false;
                if (submitUploadLabel) submitUploadLabel.textContent = "Upload File & Create Resource";
            }
        });
    }
});
