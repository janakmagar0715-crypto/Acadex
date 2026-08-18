/* ==========================================================================
   ACADEX SHARED NAVIGATION COMPONENT (js/components/navbar.js)
   Renders and manages the unified ACADEX navigation bar across all pages.
   Handles active page detection, theme toggling, profile dropdown, and mobile drawer.
   ========================================================================== */

export function initNavbar() {
    const navItems = [
        { label: "Dashboard", href: "dashboard.html", id: "nav-dashboard" },
        { label: "Resources", href: "resources.html", id: "nav-resources" },
        { label: "Past Papers", href: "past-papers.html", id: "nav-past-papers" },
        { label: "Marketplace", href: "marketplace.html", id: "nav-marketplace" },
        { label: "Notices", href: "notices.html", id: "nav-notices" },
        { label: "Saved", href: "saved-items.html", id: "nav-saved" }
    ];

    // Detect Current Page
    const path = window.location.pathname;
    const page = path.split("/").pop() || "dashboard.html";

    function isPageActive(itemHref) {
        if (page === itemHref) return true;
        if (page === "saved.html" && itemHref === "saved-items.html") return true;
        if ((page === "" || page === "index.html") && itemHref === "dashboard.html") return true;
        return false;
    }

    /* ----------------------------------------------------------------------
       1. RENDER & HIGHLIGHT DESKTOP NAV LINKS
       ---------------------------------------------------------------------- */
    const navLinksContainer = document.querySelector(".nav-links");
    if (navLinksContainer) {
        navLinksContainer.innerHTML = navItems.map(item => {
            const activeClass = isPageActive(item.href) ? "active" : "";
            const ariaCurrent = isPageActive(item.href) ? 'aria-current="page"' : "";
            return `<a href="${item.href}" class="nav-link ${activeClass}" ${ariaCurrent}>${item.label}</a>`;
        }).join("");
    }

    /* ----------------------------------------------------------------------
       2. RENDER & HIGHLIGHT MOBILE DRAWER NAV LINKS
       ---------------------------------------------------------------------- */
    const mobileLinksContainers = [
        document.querySelector(".mobile-nav-links"),
        document.querySelector(".drawer-links")
    ].filter(Boolean);

    mobileLinksContainers.forEach(container => {
        container.innerHTML = navItems.map(item => {
            const activeClass = isPageActive(item.href) ? "active" : "";
            return `<a href="${item.href}" class="mobile-nav-link drawer-link ${activeClass}">${item.label}</a>`;
        }).join("");
    });

    /* ----------------------------------------------------------------------
       3. THEME TOGGLE CONTROLLER
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
        // Prevent duplicate listener attachments
        themeToggleBtn.replaceWith(themeToggleBtn.cloneNode(true));
        const newThemeToggleBtn = document.getElementById("themeToggle");
        newThemeToggleBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme");
            setTheme(currentTheme === "dark" ? "light" : "dark");
        });
    }

    /* ----------------------------------------------------------------------
       4. PROFILE DROPDOWN CONTROLLER
       ---------------------------------------------------------------------- */
    const profileBtn = document.getElementById("profileMenuBtn") || document.getElementById("profileTrigger");
    const dropdownMenu = document.getElementById("profileDropdown") || document.getElementById("userDropdown");

    if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = dropdownMenu.classList.contains("show");
            dropdownMenu.classList.toggle("show", !isOpen);
            profileBtn.classList.toggle("active", !isOpen);
            profileBtn.setAttribute("aria-expanded", !isOpen);
        });

        document.addEventListener("click", (e) => {
            if (!dropdownMenu.contains(e.target) && !profileBtn.contains(e.target)) {
                dropdownMenu.classList.remove("show");
                profileBtn.classList.remove("active");
                profileBtn.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                dropdownMenu.classList.remove("show");
                profileBtn.classList.remove("active");
                profileBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

    /* ----------------------------------------------------------------------
       5. MOBILE DRAWER CONTROLLER
       ---------------------------------------------------------------------- */
    const mobileDrawerToggle = document.getElementById("mobileDrawerToggle") || document.getElementById("mobileMenuBtn");
    const mobileDrawer = document.getElementById("mobileDrawer");
    const closeDrawerBtn = document.getElementById("closeDrawerBtn");
    const drawerOverlay = document.getElementById("drawerOverlay");

    function toggleDrawer(open) {
        if (mobileDrawer) mobileDrawer.classList.toggle("open", open);
        if (drawerOverlay) drawerOverlay.classList.toggle("open", open);
    }

    if (mobileDrawerToggle) mobileDrawerToggle.addEventListener("click", () => toggleDrawer(true));
    if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", () => toggleDrawer(false));
    if (drawerOverlay) drawerOverlay.addEventListener("click", () => toggleDrawer(false));
}
