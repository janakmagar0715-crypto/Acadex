/* ==========================================================================
   ACADEX CLUB NOTICES V1 CONTROLLER (js/notices.js)
   Auth protection, fetching club notices from Firestore, tab filters,
   and posting new campus notices.
   ========================================================================== */

import { auth, db, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
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
    let allNoticesList = [];
    let activeFilterType = "all";

    const noticesGrid = document.getElementById("noticesGrid");
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
            console.log("Notices Page: Unauthenticated user, redirecting to login.");
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

            await loadNotices();

        } catch (err) {
            console.error("Notices Auth Observer Error:", err);
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
       5. FETCH & RENDER NOTICES
       ---------------------------------------------------------------------- */
    async function loadNotices() {
        if (!noticesGrid) return;

        noticesGrid.style.display = "grid";
        noticesGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;

        try {
            const colRef = collection(db, "notices");
            const q = query(colRef, orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);

            allNoticesList = [];
            snapshot.forEach(docSnap => {
                allNoticesList.push({ id: docSnap.id, ...docSnap.data() });
            });

            renderFilteredNotices();
        } catch (error) {
            console.error("Error fetching notices:", error);
            renderFilteredNotices();
        }
    }

    function renderFilteredNotices() {
        const filtered = allNoticesList.filter(item => {
            if (activeFilterType === "all") return true;
            return item.category === activeFilterType;
        });

        if (filtered.length === 0) {
            noticesGrid.style.display = "grid";
            noticesGrid.innerHTML = `
                <div class="state-card" style="grid-column: 1 / -1;">
                    <svg class="state-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <h3 class="state-title">No club notices found</h3>
                    <p class="state-subtitle">Be the first to post a recruitment notice or campus event for your student club!</p>
                </div>
            `;
            return;
        }

        noticesGrid.style.display = "grid";
        noticesGrid.innerHTML = filtered.map(item => {
            let badgeClass = "badge-new";
            if (item.category === "recruitment") badgeClass = "badge-paper";
            else if (item.category === "workshops") badgeClass = "badge-project";

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="resource-card-header">
                            <span class="resource-type-badge ${badgeClass}">${escapeHtml((item.category || "Notice").toUpperCase())}</span>
                            <span class="notice-club-badge">${escapeHtml(item.clubName || "Student Club")}</span>
                        </div>
                        <h3 class="resource-title" style="margin-top: 10px;">${escapeHtml(item.title)}</h3>
                        <p class="notice-desc-text">${escapeHtml(item.description)}</p>
                    </div>
                    <div class="resource-card-actions">
                        <span class="resource-meta-text">Posted by ${escapeHtml(item.authorName || 'Student')}</span>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* ----------------------------------------------------------------------
       6. TAB FILTERS & POST MODAL
       ---------------------------------------------------------------------- */
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeFilterType = btn.getAttribute("data-type");
            renderFilteredNotices();
        });
    });

    const postNoticeModal = document.getElementById("postNoticeModal");
    const openPostNoticeBtn = document.getElementById("openPostNoticeBtn");
    const closeNoticeModalBtn = document.getElementById("closeNoticeModalBtn");
    const cancelNoticeBtn = document.getElementById("cancelNoticeBtn");
    const postNoticeForm = document.getElementById("postNoticeForm");

    const submitNoticeBtn = document.getElementById("submitNoticeBtn");
    const submitNoticeLabel = document.getElementById("submitNoticeLabel");
    let isSubmittingNotice = false;

    function openModal() {
        if (!postNoticeModal) return;
        postNoticeForm.reset();
        postNoticeModal.style.display = "flex";
    }

    function closeModal() {
        if (postNoticeModal && !isSubmittingNotice) postNoticeModal.style.display = "none";
    }

    if (openPostNoticeBtn) openPostNoticeBtn.addEventListener("click", openModal);
    if (closeNoticeModalBtn) closeNoticeModalBtn.addEventListener("click", closeModal);
    if (cancelNoticeBtn) cancelNoticeBtn.addEventListener("click", closeModal);

    if (postNoticeForm) {
        postNoticeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUser || isSubmittingNotice) return;

            const titleInput = document.getElementById("noticeTitle");
            const clubInput = document.getElementById("noticeClub");
            const categoryVal = document.getElementById("noticeCategory").value;
            const descInput = document.getElementById("noticeDescription");

            const titleVal = titleInput.value.trim();
            const clubVal = clubInput.value.trim();
            const descVal = descInput.value.trim();

            let hasError = false;
            if (!titleVal) {
                const parent = titleInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a notice or event title.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!clubVal) {
                const parent = clubInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter your club or organization name.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!descVal) {
                const parent = descInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please provide event details or application link.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (hasError) return;

            let isSuccess = false;

            try {
                isSubmittingNotice = true;
                if (submitNoticeBtn) {
                    submitNoticeBtn.disabled = true;
                    submitNoticeBtn.classList.add("btn-loading");
                }
                if (cancelNoticeBtn) cancelNoticeBtn.disabled = true;
                if (submitNoticeLabel) submitNoticeLabel.innerHTML = `<span class="btn-spinner"></span> <span>Publishing Notice...</span>`;

                const colRef = collection(db, "notices");
                await addDoc(colRef, {
                    title: titleVal,
                    clubName: clubVal,
                    category: categoryVal,
                    description: descVal,
                    authorUid: currentUser.uid,
                    authorName: currentUser.displayName || "Student",
                    createdAt: serverTimestamp()
                });

                isSuccess = true;
                showToast("Notice posted successfully!", true);
                closeModal();
                await loadNotices();
            } catch (err) {
                console.error("Post notice error:", err);
                showToast("Failed to post notice. Please try again.", false);
            } finally {
                isSubmittingNotice = false;
                if (submitNoticeBtn) {
                    submitNoticeBtn.disabled = false;
                    submitNoticeBtn.classList.remove("btn-loading");
                }
                if (cancelNoticeBtn) cancelNoticeBtn.disabled = false;
                if (submitNoticeLabel) submitNoticeLabel.textContent = "Publish Notice";

                if (isSuccess) {
                    postNoticeForm.reset();
                }
            }
        });
    }
});
