/* ==========================================================================
   ACADEX SAVED ITEMS V1 CONTROLLER (js/saved.js)
   Auth protection, fetching user bookmarks subcollection, tab filters,
   and bookmark removal engine.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { fetchUserBookmarks, removeBookmark } from "./services/bookmarks.js";
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
    let allBookmarksList = [];
    let activeFilterType = "all";

    const savedGrid = document.getElementById("savedGrid");
    const emptyState = document.getElementById("emptyState");
    const tabButtons = document.querySelectorAll(".tab-btn");

    // Profile Dropdown Elements
    const profileMenuBtn = document.getElementById("profileMenuBtn");
    const profileDropdown = document.getElementById("profileDropdown");
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
            profileMenuBtn.setAttribute("aria-expanded", !isOpen);
        });

        document.addEventListener("click", () => {
            profileDropdown.classList.remove("show");
            profileMenuBtn.setAttribute("aria-expanded", "false");
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
            console.log("Saved Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        try {
            const profileResult = await checkUserProfile(user.uid);
            if (!profileResult || !profileResult.profileComplete) {
                window.location.href = "onboarding.html";
                return;
            }

            const profileData = profileResult.data || {};
            renderUserProfile(user, profileData);

            await loadSavedBookmarks();

        } catch (err) {
            console.error("Saved Auth Observer Error:", err);
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

    /* ----------------------------------------------------------------------
       5. FETCH & RENDER BOOKMARKS
       ---------------------------------------------------------------------- */
    async function loadSavedBookmarks() {
        if (!savedGrid) return;

        savedGrid.style.display = "grid";
        savedGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;
        if (emptyState) emptyState.style.display = "none";

        try {
            allBookmarksList = await fetchUserBookmarks(currentUser.uid);
            renderFilteredBookmarks();
        } catch (error) {
            console.error("Error fetching bookmarks:", error);
            showToast("Failed to load saved items.", false);
        }
    }

    function renderFilteredBookmarks() {
        const filtered = allBookmarksList.filter(item => {
            if (activeFilterType === "all") return true;
            return item.targetType === activeFilterType;
        });

        if (filtered.length === 0) {
            savedGrid.style.display = "none";
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        savedGrid.style.display = "grid";

        savedGrid.innerHTML = filtered.map(item => {
            let targetPage = "resources.html";
            let typeBadge = "RESOURCE";
            let badgeClass = "badge-new";

            if (item.targetType === "past_paper") {
                targetPage = "past-papers.html";
                typeBadge = "PAST PAPER";
                badgeClass = "badge-midterm";
            } else if (item.targetType === "marketplace_item") {
                targetPage = "marketplace.html";
                typeBadge = "MARKETPLACE";
                badgeClass = "badge-fair";
            }

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="resource-card-header">
                            <span class="resource-type-badge ${badgeClass}">${escapeHtml(typeBadge)}</span>
                        </div>
                        <h3 class="resource-title" style="margin-top: 10px;">${escapeHtml(item.title || 'Saved Item')}</h3>
                        <div class="resource-meta-text">${escapeHtml(item.subject || '')} • ${escapeHtml(item.category || '')}</div>
                    </div>

                    <div class="resource-card-actions">
                        <button class="btn-icon-secondary remove-bookmark-btn" data-type="${escapeHtml(item.targetType)}" data-target-id="${escapeHtml(item.targetId)}" aria-label="Remove bookmark" title="Remove bookmark">
                            <svg viewBox="0 0 24 24" style="stroke: var(--error); fill: rgba(239,68,68,0.1);"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <a href="${escapeHtml(targetPage)}" class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none;">View in Page</a>
                    </div>
                </div>
            `;
        }).join("");

        // Attach remove handlers
        savedGrid.querySelectorAll(".remove-bookmark-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const targetType = btn.getAttribute("data-type");
                const targetId = btn.getAttribute("data-target-id");
                await handleRemoveBookmark(targetType, targetId);
            });
        });
    }

    async function handleRemoveBookmark(targetType, targetId) {
        try {
            await removeBookmark(targetType, targetId);
            allBookmarksList = allBookmarksList.filter(b => !(b.targetType === targetType && b.targetId === targetId));
            showToast("Saved item removed.");
            renderFilteredBookmarks();
        } catch (err) {
            console.error("Remove bookmark error:", err);
            showToast("Could not remove item. Please try again.", false);
        }
    }

    /* ----------------------------------------------------------------------
       6. TAB FILTER HANDLERS
       ---------------------------------------------------------------------- */
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeFilterType = btn.getAttribute("data-type");
            renderFilteredBookmarks();
        });
    });
});
