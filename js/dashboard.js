/* ==========================================================================
   ACADEX DASHBOARD V1 LOGIC
   Firebase User Authentication, State Observer, Logout & UI Component Handlers
   ========================================================================== */

import { auth, db, checkUserProfile } from "./firebase-config.js";
import {
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
    collection,
    query,
    where,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { subscribeResources } from "./services/resources.js";
import { fetchUserBookmarks, addBookmark, removeBookmark } from "./services/bookmarks.js";
import { initNavbar } from "./components/navbar.js";
import { escapeHtml } from "./utils.js";

/* ----------------------------------------------------------------------
   1. DATA LAYER (Live Firestore Integration with Fallbacks)
   ---------------------------------------------------------------------- */
const overviewStatsData = {
    resources: 128,
    pastPapers: 64,
    savedItems: 12,
    uploads: 8
};

const continueStudyingData = [
    { subject: "Data Structures & Algorithms", percent: 75 },
    { subject: "Database Management Systems", percent: 45 },
    { subject: "Operating Systems", percent: 60 }
];

document.addEventListener("DOMContentLoaded", () => {
    initNavbar();


    /* ----------------------------------------------------------------------
       2. THEME CONTROLLER
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
       3. TOAST NOTIFICATION SYSTEM
       ---------------------------------------------------------------------- */
    const toastContainer = document.getElementById("toastContainer");

    function showToast(message, isSuccess = true) {
        if (!toastContainer) return;

        toastContainer.innerHTML = "";
        const toast = document.createElement("div");
        toast.className = "toast";

        const iconSvg = isSuccess
            ? `<svg class="toast-icon toast-lime" viewBox="0 0 24 24" aria-hidden="true">
                 <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                 <polyline points="22 4 12 14.01 9 11.01"></polyline>
               </svg>`
            : `<svg class="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
                 <circle cx="12" cy="12" r="10"></circle>
                 <line x1="12" y1="8" x2="12" y2="12"></line>
                 <line x1="12" y1="16" x2="12.01" y2="16"></line>
               </svg>`;

        toast.innerHTML = `${iconSvg}<span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("toast-exit");
            toast.addEventListener("animationend", () => toast.remove());
        }, 3200);
    }

    /* ----------------------------------------------------------------------
       4. USER PROFILE & UI RENDERERS
       ---------------------------------------------------------------------- */
    const welcomeTitle = document.getElementById("welcomeTitle");
    const userAvatar = document.getElementById("userAvatar");
    const dropdownAvatar = document.getElementById("dropdownAvatar");
    const userNameLabel = document.getElementById("userNameLabel");
    const dropdownName = document.getElementById("dropdownName");
    const dropdownEmail = document.getElementById("dropdownEmail");

    /**
     * Renders current user profile into navigation and welcome header.
     * @param {Object} user - Firebase User object
     * @param {Object} profileData - Firestore user profile document
     */
    function renderUser(user, profileData = {}) {
        if (!user) return;

        const displayName = profileData.displayName || user.displayName || "";
        const firstName = profileData.firstName || (displayName ? displayName.split(" ")[0] : "Student");
        const email = profileData.email || user.email || "student@acadex.edu";
        const photoURL = profileData.photoURL || user.photoURL || null;

        // Calculate Greeting based on local time
        const hours = new Date().getHours();
        let timeGreeting = "Good morning";
        if (hours >= 12 && hours < 18) timeGreeting = "Good afternoon";
        else if (hours >= 18) timeGreeting = "Good evening";

        if (welcomeTitle) {
            welcomeTitle.textContent = `${timeGreeting}, ${firstName}`;
        }

        if (userNameLabel) userNameLabel.textContent = displayName || "Student";
        if (dropdownName) dropdownName.textContent = displayName || "Student";
        if (dropdownEmail) dropdownEmail.textContent = email;

        // Update Semester Badge if profile department & semester exist
        const semesterBadge = document.querySelector(".semester-badge span:last-child");
        if (semesterBadge && profileData.department && profileData.semester) {
            semesterBadge.textContent = `${profileData.department} • ${profileData.semester}`;
        }

        // Render Avatar Photo or Fallback Initials
        if (photoURL) {
            const avatarHTML = `<img src="${photoURL}" alt="${displayName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            if (userAvatar) userAvatar.innerHTML = avatarHTML;
            if (dropdownAvatar) dropdownAvatar.innerHTML = avatarHTML;
        } else {
            const initials = displayName
                ? displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
                : "ST";
            if (userAvatar) userAvatar.textContent = initials;
            if (dropdownAvatar) dropdownAvatar.textContent = initials;
        }
    }

    /**
     * Renders overview stats, recent academic resources, and study progress with Real-Time listeners.
     */
    async function renderDashboardContent(user) {
        const statRes = document.getElementById("statResources");
        const statPap = document.getElementById("statPapers");
        const statSav = document.getElementById("statSaved");
        const statUpl = document.getElementById("statUploads");

        // 1. Real-Time Stat Listener for Resources and User Uploads
        try {
            const resColRef = collection(db, "resources");
            const resQuery = query(resColRef, where("status", "==", "active"));
            onSnapshot(resQuery, (snapshot) => {
                let totalCount = 0;
                let userUploadCount = 0;

                snapshot.forEach(docSnap => {
                    totalCount++;
                    const data = docSnap.data();
                    if (user && data.uploaderUid === user.uid) {
                        userUploadCount++;
                    }
                });

                if (statRes) statRes.textContent = totalCount;
                if (statUpl) statUpl.textContent = userUploadCount;
            }, (err) => {
                console.warn("Resources stat listener warning:", err);
            });
        } catch (e) {
            console.warn("Resources stat subscription error:", e);
        }

        // 2. Real-Time Stat Listener for Past Papers
        try {
            const papColRef = collection(db, "past_papers");
            onSnapshot(papColRef, (snapshot) => {
                if (statPap) statPap.textContent = snapshot.size;
            }, (err) => {
                console.warn("Past papers stat listener warning:", err);
            });
        } catch (e) {
            console.warn("Past papers stat subscription error:", e);
        }

        // Shared bookmark set to sync active button state
        let userBookmarks = [];
        if (user) {
            try { userBookmarks = await fetchUserBookmarks(user.uid); } catch (e) { }
        }
        const bookmarkSet = new Set(userBookmarks.map(b => b.targetId));

        // 3. Real-Time Stat & Sync Listener for User Saved Bookmarks
        if (user) {
            try {
                const bookColRef = collection(db, "users", user.uid, "bookmarks");
                onSnapshot(bookColRef, (snapshot) => {
                    if (statSav) statSav.textContent = snapshot.size;
                    const newIds = new Set();
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data.targetId) newIds.add(data.targetId);
                    });
                    bookmarkSet.clear();
                    newIds.forEach(id => bookmarkSet.add(id));

                    const resourcesList = document.getElementById("resourcesList");
                    if (resourcesList) {
                        resourcesList.querySelectorAll(".bookmark-btn").forEach(btn => {
                            const resId = btn.getAttribute("data-id");
                            if (resId) {
                                btn.classList.toggle("bookmarked", bookmarkSet.has(resId));
                            }
                        });
                    }
                }, (err) => {
                    console.warn("Bookmarks stat listener warning:", err);
                });
            } catch (e) {
                console.warn("Bookmarks stat subscription error:", e);
            }
        }

        // 4. Real-Time Listener for Recent Resources Feed
        const resourcesList = document.getElementById("resourcesList");
        if (resourcesList) {
            try {
                subscribeResources({ limitCount: 4 }, (liveResources, error) => {
                    if (error) {
                        console.error("Dashboard Firestore Resource Subscribe Error:", error);
                        resourcesList.innerHTML = `
                            <div class="resource-card" style="justify-content: center; text-align: center; padding: 20px;">
                                <span class="resource-meta">Unable to load recent resources feed.</span>
                            </div>
                        `;
                        return;
                    }

                    if (liveResources.length > 0) {
                        resourcesList.innerHTML = liveResources.map(item => {
                            const isSaved = bookmarkSet.has(item.id);
                            let badgeClass = "";
                            if (item.category === "assignment") badgeClass = "badge-paper";

                            return `
                                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                                    <div class="resource-left">
                                        <span class="resource-type-badge ${badgeClass}">${escapeHtml((item.category || "Notes").toUpperCase())}</span>
                                        <div class="resource-details">
                                            <h3 class="resource-title">${escapeHtml(item.title)}</h3>
                                            <span class="resource-meta">${escapeHtml(item.subject)} • ${escapeHtml(item.department || 'General')} • By ${escapeHtml(item.uploaderName || 'Student')}</span>
                                        </div>
                                    </div>
                                    <div class="resource-actions">
                                        <button class="btn-icon-secondary bookmark-btn ${isSaved ? 'bookmarked' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Save resource" title="Bookmark">
                                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                                        </button>
                                        <a href="resources.html" class="btn-sm-primary view-btn" style="text-decoration: none;">View</a>
                                    </div>
                                </div>
                            `;
                        }).join("");

                        // Attach real bookmark action handlers
                        resourcesList.querySelectorAll(".bookmark-btn").forEach(btn => {
                            btn.addEventListener("click", async (e) => {
                                e.stopPropagation();
                                if (!user) return;
                                const resId = btn.getAttribute("data-id");
                                const isSaved = bookmarkSet.has(resId);
                                const item = liveResources.find(r => r.id === resId);

                                // Trigger smooth click pop animation
                                btn.classList.add("bookmark-pop");
                                btn.addEventListener("animationend", () => btn.classList.remove("bookmark-pop"), { once: true });

                                try {
                                    if (isSaved) {
                                        await removeBookmark("resource", resId);
                                        bookmarkSet.delete(resId);
                                        btn.classList.remove("bookmarked");
                                        showToast("Resource removed from bookmarks.");
                                    } else {
                                        await addBookmark({
                                            targetId: resId,
                                            targetType: "resource",
                                            title: item ? item.title : "Resource",
                                            subject: item ? item.subject : "",
                                            category: item ? item.category : "notes"
                                        });
                                        bookmarkSet.add(resId);
                                        btn.classList.add("bookmarked");
                                        showToast("Resource saved to your bookmarks!", true);
                                    }
                                } catch (err) {
                                    console.error("Dashboard bookmark toggle error:", err);
                                    showToast("Could not update bookmark.", false);
                                }
                            });
                        });

                    } else {
                        resourcesList.innerHTML = `
                            <div class="resource-card" style="justify-content: center; text-align: center; padding: 24px;">
                                <span class="resource-meta">No academic resources uploaded yet. <a href="resources.html" style="color: var(--primary); font-weight: 700; text-decoration: none;">Upload the first resource &rarr;</a></span>
                            </div>
                        `;
                    }
                });

            } catch (error) {
                console.error("Dashboard Firestore Resource Setup Error:", error);
            }
        }

        // Render Continue Studying Progress Cards
        const progressList = document.getElementById("progressList");
        if (progressList) {
            progressList.innerHTML = continueStudyingData.map(course => `
                <div class="progress-item">
                    <div class="progress-item-header">
                        <span class="progress-subject">${escapeHtml(course.subject)}</span>
                        <span class="progress-percent">${course.percent}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${course.percent}%;"></div>
                    </div>
                </div>
            `).join("");
        }
    }

        /* ----------------------------------------------------------------------
           5. FIREBASE AUTH STATE OBSERVER & PROFILE CHECK
           ---------------------------------------------------------------------- */
        try {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    console.log("Dashboard: User authenticated as:", user.email);

                    // Verify user profile exists and is complete in Firestore
                    const profileResult = await checkUserProfile(user.uid);
                    if (!profileResult.profileComplete) {
                        console.log("Dashboard: User profile incomplete or missing. Redirecting to onboarding...");
                        window.location.href = "onboarding.html";
                        return;
                    }

                    // Render User Profile & Dashboard using Auth and Firestore data
                    const profileData = profileResult.data || {};
                    renderUser(user, profileData);
                    await renderDashboardContent(user);
                } else {
                    console.log("Dashboard: No active user, redirecting to login...");
                    window.location.href = "login.html";
                }
            });
        } catch (err) {
            console.error("Dashboard auth state observer error:", err);
        }

        /* ----------------------------------------------------------------------
           6. REAL FIREBASE LOGOUT HANDLER
           ---------------------------------------------------------------------- */
        const logoutBtn = document.getElementById("logoutBtn");

        async function handleLogout() {
            try {
                showToast("Signing out...");
                await signOut(auth);
                console.log("Firebase user signed out successfully.");
                setTimeout(() => {
                    window.location.href = "login.html";
                }, 600);
            } catch (error) {
                console.error("Logout error:", error);
                showToast("Failed to sign out. Please try again.", false);
            }
        }

        if (logoutBtn) {
            logoutBtn.addEventListener("click", (e) => {
                e.preventDefault();
                handleLogout();
            });
        }

        /* ----------------------------------------------------------------------
           7. UI NAVIGATION & DROPDOWN HANDLERS
           ---------------------------------------------------------------------- */
        const profileTrigger = document.getElementById("profileTrigger");
        const userDropdown = document.getElementById("userDropdown");
        const mobileMenuBtn = document.getElementById("mobileMenuBtn");
        const mobileDrawer = document.getElementById("mobileDrawer");

        // Profile Dropdown Toggle
        if (profileTrigger && userDropdown) {
            profileTrigger.addEventListener("click", (e) => {
                e.stopPropagation();
                const isOpen = userDropdown.classList.contains("show");

                userDropdown.classList.toggle("show", !isOpen);
                profileTrigger.classList.toggle("active", !isOpen);
                profileTrigger.setAttribute("aria-expanded", !isOpen);
            });

            // Close dropdown when clicking outside
            document.addEventListener("click", (e) => {
                if (!userDropdown.contains(e.target) && !profileTrigger.contains(e.target)) {
                    userDropdown.classList.remove("show");
                    profileTrigger.classList.remove("active");
                    profileTrigger.setAttribute("aria-expanded", "false");
                }
            });

            // Close dropdown on Escape key
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    userDropdown.classList.remove("show");
                    profileTrigger.classList.remove("active");
                    profileTrigger.setAttribute("aria-expanded", "false");
                }
            });
        }

        // Mobile Drawer Toggle
        if (mobileMenuBtn && mobileDrawer) {
            mobileMenuBtn.addEventListener("click", () => {
                const isOpen = mobileDrawer.classList.contains("show");
                mobileDrawer.classList.toggle("show", !isOpen);
                mobileDrawer.setAttribute("aria-hidden", isOpen);
            });
        }

        // Quick Action Card Demo Toast Handlers
        const demoQuickActions = [
            { id: "actionMarketplace", name: "Student Marketplace" }
        ];

        demoQuickActions.forEach(action => {
            const cardEl = document.getElementById(action.id);
            if (cardEl) {
                cardEl.addEventListener("click", (e) => {
                    e.preventDefault();
                    showToast(`Opening ${action.name}... (UI Demonstration)`);
                });
            }
        });

        const menuProfileBtn = document.getElementById("menuProfileBtn");
        const menuSettingsBtn = document.getElementById("menuSettingsBtn");

        if (menuProfileBtn) {
            menuProfileBtn.addEventListener("click", () => showToast("Profile settings coming soon!"));
        }
        if (menuSettingsBtn) {
            menuSettingsBtn.addEventListener("click", () => showToast("Account settings coming soon!"));
        }
    });
