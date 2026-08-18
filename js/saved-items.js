/* ==========================================================================
   ACADEX SAVED ITEMS CONTROLLER (js/saved-items.js)
   Auth protection, loading user bookmarked resources from Firestore,
   rendering resource cards with active green bookmark state, and immediate removal.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { fetchUserBookmarks, removeBookmark } from "./services/bookmarks.js";
import { fetchResourceById } from "./services/resources.js";
import { initNavbar } from "./components/navbar.js";
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
    let savedResourcesList = [];

    const savedGrid = document.getElementById("savedGrid");
    const emptyState = document.getElementById("emptyState");
    const errorState = document.getElementById("errorState");
    const retryFetchBtn = document.getElementById("retryFetchBtn");

    // Profile Dropdown Elements
    const profileMenuBtn = document.getElementById("profileMenuBtn") || document.getElementById("profileTrigger");
    const profileDropdown = document.getElementById("profileDropdown") || document.getElementById("userDropdown");
    const userAvatar = document.getElementById("userAvatar");
    const userNameLabel = document.getElementById("userNameLabel");
    const dropdownName = document.getElementById("dropdownName");
    const dropdownEmail = document.getElementById("dropdownEmail");
    const logoutBtn = document.getElementById("logoutBtn");

    if (profileMenuBtn && profileDropdown) {
        profileMenuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = profileDropdown.classList.contains("show");
            profileDropdown.classList.toggle("show", !isOpen);
            profileMenuBtn.classList.toggle("active", !isOpen);
            profileMenuBtn.setAttribute("aria-expanded", !isOpen);
        });

        document.addEventListener("click", (e) => {
            if (!profileDropdown.contains(e.target) && !profileMenuBtn.contains(e.target)) {
                profileDropdown.classList.remove("show");
                profileMenuBtn.classList.remove("active");
                profileMenuBtn.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                profileDropdown.classList.remove("show");
                profileMenuBtn.classList.remove("active");
                profileMenuBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

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
            console.log("Saved Items Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        try {
            const profileResult = await checkUserProfile(user.uid);
            if (!profileResult || !profileResult.profileComplete) {
                console.log("Saved Items Page: Profile incomplete, redirecting to onboarding.");
                window.location.href = "onboarding.html";
                return;
            }

            const profileData = profileResult.data || {};
            renderUserProfile(user, profileData);

            await loadSavedResources();

        } catch (err) {
            console.error("Saved Items Auth Observer Error:", err);
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

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return "N/A";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    /* ----------------------------------------------------------------------
       5. FETCH & RENDER BOOKMARKED RESOURCES
       ---------------------------------------------------------------------- */
    async function loadSavedResources() {
        if (!savedGrid) return;

        savedGrid.style.display = "grid";
        savedGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;
        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        try {
            const rawBookmarks = await fetchUserBookmarks(currentUser.uid);
            
            // Resolve full resource document for each bookmark
            const resourcePromises = rawBookmarks.map(async (b) => {
                const targetId = b.targetId || (b.id ? b.id.replace(/^(resource|past_paper|marketplace_item)_/, "") : null);
                if (!targetId) return null;

                try {
                    const resourceDoc = await fetchResourceById(targetId);
                    if (resourceDoc) {
                        return {
                            ...resourceDoc,
                            bookmarkType: b.targetType || "resource"
                        };
                    }
                } catch (e) {
                    console.warn(`Could not fetch details for targetId ${targetId}:`, e);
                }

                // Fallback to bookmark fields if document was deleted or custom
                return {
                    id: targetId,
                    title: b.title || "Bookmarked Item",
                    subject: b.subject || "",
                    category: b.category || "notes",
                    department: "General",
                    uploaderName: "Student",
                    fileType: "PDF",
                    fileSize: 0,
                    fileURL: "#",
                    bookmarkType: b.targetType || "resource"
                };
            });

            const resolvedList = await Promise.all(resourcePromises);
            savedResourcesList = resolvedList.filter(item => item !== null);

            if (savedResourcesList.length === 0) {
                savedGrid.style.display = "none";
                if (emptyState) emptyState.style.display = "flex";
                return;
            }

            renderSavedGrid(savedResourcesList);

        } catch (error) {
            console.error("Error fetching saved resources:", error);
            savedGrid.style.display = "none";
            if (errorState) errorState.style.display = "flex";
        }
    }

    function renderSavedGrid(resources) {
        if (!savedGrid) return;

        if (resources.length === 0) {
            savedGrid.style.display = "none";
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        savedGrid.style.display = "grid";
        savedGrid.innerHTML = resources.map(item => {
            let badgeClass = "badge-notes";
            const categoryUpper = (item.category || "Notes").toUpperCase();
            if (item.category === "assignment") badgeClass = "badge-paper";
            else if (item.category === "project") badgeClass = "badge-project";
            else if (item.category === "guide") badgeClass = "badge-guide";

            const fileTypeUpper = (item.fileType || "PDF").toUpperCase();
            const semesterText = item.semester ? `Semester ${escapeHtml(item.semester)}` : null;

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="resource-card-header">
                            <span class="resource-type-badge ${badgeClass}">${escapeHtml(categoryUpper)}</span>
                            <span class="meta-pill">${escapeHtml(fileTypeUpper)}</span>
                        </div>
                        <h3 class="resource-title" style="margin-top: 10px;">${escapeHtml(item.title)}</h3>
                        <div class="resource-meta-text">
                            ${escapeHtml(item.subject)} • ${escapeHtml(item.department || 'General')} ${semesterText ? `• ${semesterText}` : ''}
                        </div>
                        <div class="meta-details-row">
                            <span>By ${escapeHtml(item.uploaderName || 'Student')}</span>
                            <span>•</span>
                            <span>${formatFileSize(item.fileSize)}</span>
                        </div>
                    </div>

                    <div class="resource-card-actions">
                        <button class="btn-icon-secondary bookmark-btn bookmarked" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.bookmarkType || 'resource')}" aria-label="Remove bookmark" title="Remove from saved items">
                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <a href="${escapeHtml(item.fileURL || '#')}" target="_blank" ${item.fileURL && item.fileURL !== '#' ? 'download' : ''} class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none;">
                            View / Open
                        </a>
                    </div>
                </div>
            `;
        }).join("");

        // Attach Remove Bookmark Handlers
        savedGrid.querySelectorAll(".bookmark-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute("data-id");
                const targetType = btn.getAttribute("data-type") || "resource";
                await handleRemoveBookmark(resId, targetType, btn);
            });
        });
    }

    /* ----------------------------------------------------------------------
       6. REMOVE BOOKMARK HANDLER (IMMEDIATE DOM REMOVAL)
       ---------------------------------------------------------------------- */
    async function handleRemoveBookmark(resourceId, targetType, btnElement) {
        if (!currentUser) return;

        if (btnElement) {
            btnElement.classList.add("bookmark-pop");
        }

        try {
            await removeBookmark(targetType, resourceId);
            
            // Remove item from local state list
            savedResourcesList = savedResourcesList.filter(item => item.id !== resourceId);
            showToast("Resource removed from saved items.");

            // Immediately re-render grid or show empty state if 0 items remain
            renderSavedGrid(savedResourcesList);

        } catch (err) {
            console.error("Remove bookmark error:", err);
            showToast("Could not remove bookmark. Please try again.", false);
        }
    }

    if (retryFetchBtn) {
        retryFetchBtn.addEventListener("click", () => loadSavedResources());
    }
});
