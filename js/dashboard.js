/* ==========================================================================
   ACADEX DASHBOARD V1 LOGIC
   Firebase User Authentication, State Observer, Logout & UI Component Handlers
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

/* ----------------------------------------------------------------------
   1. DATA LAYER (Decoupled Demo Data for future Firestore integration)
   ---------------------------------------------------------------------- */
const overviewStatsData = {
    resources: 128,
    pastPapers: 64,
    savedItems: 12,
    uploads: 8
};

const recentResourcesData = [
    {
        id: "res-1",
        type: "Notes",
        badgeClass: "",
        title: "Data Structures & Algorithms Notes",
        subject: "CS201",
        year: "2024",
        uploader: "Alex M."
    },
    {
        id: "res-2",
        type: "Exam Paper",
        badgeClass: "badge-paper",
        title: "Database Management Midterm Paper",
        subject: "CS302",
        year: "2023",
        uploader: "Sarah K."
    },
    {
        id: "res-3",
        type: "Assignment",
        badgeClass: "",
        title: "Operating Systems Process Control Solution",
        subject: "CS305",
        year: "2024",
        uploader: "David P."
    },
    {
        id: "res-4",
        type: "Notes",
        badgeClass: "",
        title: "Computer Networks Protocols Summary",
        subject: "CS401",
        year: "2024",
        uploader: "Emma W."
    }
];

const continueStudyingData = [
    { id: "course-1", subject: "Data Structures", percent: 65 },
    { id: "course-2", subject: "Database Management", percent: 40 },
    { id: "course-3", subject: "Computer Networks", percent: 80 }
];

document.addEventListener("DOMContentLoaded", () => {

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
     * Renders dashboard content components (Stats, Recent Resources, Progress)
     */
    function renderDashboardContent() {
        // Render Stats Overview
        const statRes = document.getElementById("statResources");
        const statPap = document.getElementById("statPapers");
        const statSav = document.getElementById("statSaved");
        const statUpl = document.getElementById("statUploads");

        if (statRes) statRes.textContent = overviewStatsData.resources;
        if (statPap) statPap.textContent = overviewStatsData.pastPapers;
        if (statSav) statSav.textContent = overviewStatsData.savedItems;
        if (statUpl) statUpl.textContent = overviewStatsData.uploads;

        // Render Recent Resources
        const resourcesList = document.getElementById("resourcesList");
        if (resourcesList) {
            resourcesList.innerHTML = recentResourcesData.map(item => `
                <div class="resource-card">
                    <div class="resource-left">
                        <span class="resource-type-badge ${item.badgeClass}">${item.type}</span>
                        <div class="resource-details">
                            <h3 class="resource-title">${item.title}</h3>
                            <span class="resource-meta">${item.subject} • ${item.year} • Uploaded by ${item.uploader}</span>
                        </div>
                    </div>
                    <div class="resource-actions">
                        <button class="btn-icon-secondary bookmark-btn" aria-label="Save resource" title="Bookmark">
                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <button class="btn-sm-primary view-btn">View</button>
                    </div>
                </div>
            `).join("");

            // Add action handlers for demo resource buttons
            resourcesList.querySelectorAll(".bookmark-btn").forEach(btn => {
                btn.addEventListener("click", () => showToast("Resource saved to your bookmarks!"));
            });
            resourcesList.querySelectorAll(".view-btn").forEach(btn => {
                btn.addEventListener("click", () => showToast("Opening resource preview..."));
            });
        }

        // Render Continue Studying Progress Cards
        const progressList = document.getElementById("progressList");
        if (progressList) {
            progressList.innerHTML = continueStudyingData.map(course => `
                <div class="progress-item">
                    <div class="progress-item-header">
                        <span class="progress-subject">${course.subject}</span>
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
                renderDashboardContent();
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
    const quickActions = [
        { id: "actionUpload", name: "Resource Uploader" },
        { id: "actionNotes", name: "Notes Browser" },
        { id: "actionPapers", name: "Past Papers Repository" },
        { id: "actionMarketplace", name: "Student Marketplace" }
    ];

    quickActions.forEach(action => {
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
