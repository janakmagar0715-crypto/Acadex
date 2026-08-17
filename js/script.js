/* ==========================================================================
   ACADEX CLIENT SIDE LOGIC
   Theme Management, Password Visibility, Accessible Toast Notifications & Handlers
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    
    /* ----------------------------------------------------------------------
       1. THEME CONTROLLER
       ---------------------------------------------------------------------- */
    const themeToggleBtn = document.getElementById("themeToggle");
    const THEME_STORAGE_KEY = "acadex-theme";

    /**
     * Applies theme to root document element and updates storage & accessibility attributes.
     * @param {string} theme - 'dark' | 'light'
     */
    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);

        if (themeToggleBtn) {
            const isDark = theme === "dark";
            themeToggleBtn.setAttribute(
                "aria-label",
                isDark ? "Switch to light theme" : "Switch to dark theme"
            );
            themeToggleBtn.setAttribute(
                "title",
                isDark ? "Switch to light theme" : "Switch to dark theme"
            );
        }
    }

    /**
     * Initializes theme based on stored preference or system settings.
     */
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
            const newTheme = currentTheme === "dark" ? "light" : "dark";
            setTheme(newTheme);
        });
    }

    // Listen for OS system theme changes if user hasn't explicitly set a preference
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            setTheme(event.matches ? "dark" : "light");
        }
    });

    /* ----------------------------------------------------------------------
       2. PASSWORD VISIBILITY TOGGLE
       ---------------------------------------------------------------------- */
    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("togglePassword");

    if (passwordInput && togglePasswordBtn) {
        togglePasswordBtn.addEventListener("click", () => {
            const isPassword = passwordInput.type === "password";
            
            passwordInput.type = isPassword ? "text" : "password";
            togglePasswordBtn.classList.toggle("showing", isPassword);
            togglePasswordBtn.setAttribute(
                "aria-label",
                isPassword ? "Hide password" : "Show password"
            );
        });
    }

    /* ----------------------------------------------------------------------
       3. NON-BLOCKING TOAST NOTIFICATION SYSTEM
       ---------------------------------------------------------------------- */
    const toastContainer = document.getElementById("toastContainer");

    /**
     * Shows a polished, accessible toast message.
     * @param {string} message - Text to display
     * @param {boolean} isSuccess - Success or info state
     */
    function showToast(message, isSuccess = true) {
        if (!toastContainer) return;

        // Clear existing toast if present
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

        // Auto remove after 3.5 seconds
        setTimeout(() => {
            toast.classList.add("toast-exit");
            toast.addEventListener("animationend", () => {
                toast.remove();
            });
        }, 3500);
    }

    /* ----------------------------------------------------------------------
       4. FORM & ACTION INTERACTION HANDLERS
       ---------------------------------------------------------------------- */
    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const googleLoginBtn = document.getElementById("googleLogin");
    const forgotPasswordLink = document.getElementById("forgotPassword");

    // Email / Password Submit Handler
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const emailVal = emailInput ? emailInput.value.trim() : "";
            const passVal = passwordInput ? passwordInput.value.trim() : "";

            if (!emailVal || !passVal) {
                showToast("Please enter your email and password.", false);
                if (!emailVal && emailInput) emailInput.focus();
                else if (!passVal && passwordInput) passwordInput.focus();
                return;
            }

            // Simple client-side email format check
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailVal)) {
                showToast("Please enter a valid email address.", false);
                if (emailInput) emailInput.focus();
                return;
            }

            console.log("Login requested for:", emailVal);
            showToast(`Sign in requested for ${emailVal}. Firebase auth will connect next.`);
        });
    }

    // Google Login Handler
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener("click", () => {
            console.log("Google Sign-In requested");
            showToast("Google Sign-In will connect with Firebase next.");
        });
    }

    // Forgot Password Handler
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("Password reset requested");
            showToast("Password reset will connect with Firebase next.");
        });
    }
});