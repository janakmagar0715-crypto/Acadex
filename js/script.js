/* ==========================================================================
   ACADEX CLIENT SIDE LOGIC & FIREBASE GOOGLE AUTHENTICATION
   Theme Management, Password Visibility, Accessible Toast Notifications & Firebase Auth
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

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
     * @param {boolean} isSuccess - Success or info/error state
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
       4. AUTH STATE MONITORING & PROFILE CHECK
       ---------------------------------------------------------------------- */
    try {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User is already authenticated:", user.email);
                const profileResult = await checkUserProfile(user.uid);
                if (profileResult.profileComplete) {
                    window.location.href = "dashboard.html";
                } else {
                    window.location.href = "onboarding.html";
                }
            }
        });
    } catch (err) {
        console.warn("Firebase auth state observer warning:", err);
    }

    /* ----------------------------------------------------------------------
       5. FIREBASE GOOGLE AUTHENTICATION HANDLER
       ---------------------------------------------------------------------- */
    const googleLoginBtn = document.getElementById("googleLogin");
    let isAuthenticating = false;

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener("click", async (e) => {
            e.preventDefault();

            // Prevent multiple simultaneous sign-in attempts
            if (isAuthenticating) return;

            const originalBtnHTML = googleLoginBtn.innerHTML;

            try {
                isAuthenticating = true;

                // Loading State
                googleLoginBtn.disabled = true;
                googleLoginBtn.innerHTML = "<span>Signing in...</span>";

                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                const user = result.user;

                console.log("Firebase Google Authentication successful:", user.email);

                // Format user first name for welcome toast
                const firstName = user.displayName
                    ? user.displayName.split(" ")[0]
                    : "Student";

                showToast(`Welcome to Acadex, ${firstName}!`, true);

                // Check if user has a completed Firestore profile
                const profileResult = await checkUserProfile(user.uid);

                // Redirect based on profile status
                setTimeout(() => {
                    if (profileResult.profileComplete) {
                        window.location.href = "dashboard.html";
                    } else {
                        window.location.href = "onboarding.html";
                    }
                }, 1000);

            } catch (error) {
                console.error("Firebase Google Auth Error:", error);

                // Restore button state
                googleLoginBtn.disabled = false;
                googleLoginBtn.innerHTML = originalBtnHTML;
                isAuthenticating = false;

                // Handle specific Firebase error codes
                const errorCode = error.code || "";

                if (errorCode === "auth/popup-closed-by-user" || errorCode === "popup-closed-by-user") {
                    showToast("Sign-in was cancelled.", false);
                } else if (errorCode === "auth/popup-blocked") {
                    showToast("Your browser blocked the sign-in popup. Please allow popups and try again.", false);
                } else if (errorCode === "auth/network-request-failed") {
                    showToast("Network error. Please check your connection and try again.", false);
                } else if (errorCode === "auth/unauthorized-domain") {
                    showToast("Domain not authorized. Please add your domain to Firebase Console > Authentication > Settings.", false);
                } else if (errorCode === "auth/operation-not-allowed") {
                    showToast("Google sign-in is not enabled. Please enable Google provider in Firebase Console > Authentication.", false);
                } else if (errorCode === "auth/operation-not-supported-in-this-environment") {
                    showToast("Firebase Auth requires a local server. Please open using Live Server (http://localhost).", false);
                } else if (errorCode.includes("invalid-api-key") || errorCode.includes("api-key-not-valid") || (error.message && error.message.includes("API_KEY"))) {
                    showToast("Please configure real Firebase credentials in js/firebase-config.js.", false);
                } else {
                    showToast(`Sign-in error (${errorCode || 'unknown'}). Please check console.`, false);
                }
            }
        });
    }

    /* ----------------------------------------------------------------------
       6. EMAIL / PASSWORD FORM HANDLER
       ---------------------------------------------------------------------- */
    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const forgotPasswordLink = document.getElementById("forgotPassword");

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isAuthenticating) return;

            const emailVal = emailInput ? emailInput.value.trim() : "";
            const passVal = passwordInput ? passwordInput.value : "";

            if (!emailVal || !passVal) {
                showToast("Please enter your email and password.", false);
                if (!emailVal && emailInput) emailInput.focus();
                else if (!passVal && passwordInput) passwordInput.focus();
                return;
            }

            // Client-side email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailVal)) {
                showToast("Please enter a valid email address.", false);
                if (emailInput) emailInput.focus();
                return;
            }

            const submitBtn = loginForm.querySelector("button[type='submit']");
            const originalBtnHTML = submitBtn ? submitBtn.innerHTML : "";

            try {
                isAuthenticating = true;
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = "<span>Signing in...</span>";
                }

                const result = await signInWithEmailAndPassword(auth, emailVal, passVal);
                const user = result.user;

                console.log("Firebase Email Authentication successful:", user.email);

                const firstName = user.displayName
                    ? user.displayName.split(" ")[0]
                    : "Student";

                showToast(`Welcome back, ${firstName}!`, true);

                const profileResult = await checkUserProfile(user.uid);

                setTimeout(() => {
                    if (profileResult.profileComplete) {
                        window.location.href = "dashboard.html";
                    } else {
                        window.location.href = "onboarding.html";
                    }
                }, 1000);

            } catch (error) {
                console.error("Firebase Email Auth Error:", error);

                isAuthenticating = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                }

                const errorCode = error.code || "";

                if (errorCode === "auth/invalid-credential" || errorCode === "auth/user-not-found" || errorCode === "auth/wrong-password") {
                    showToast("Invalid email or password. Please try again.", false);
                } else if (errorCode === "auth/too-many-requests") {
                    showToast("Too many failed attempts. Please try again later or reset your password.", false);
                } else if (errorCode === "auth/user-disabled") {
                    showToast("This user account has been disabled.", false);
                } else if (errorCode === "auth/invalid-email") {
                    showToast("Please enter a valid email address.", false);
                } else if (errorCode === "auth/network-request-failed") {
                    showToast("Network error. Please check your connection and try again.", false);
                } else {
                    showToast(`Sign-in failed (${errorCode || 'unknown'}). Please check console.`, false);
                }
            }
        });
    }

    // Forgot Password Handler
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", async (e) => {
            e.preventDefault();

            const emailVal = emailInput ? emailInput.value.trim() : "";

            if (!emailVal) {
                showToast("Please enter your email address in the field above first.", false);
                if (emailInput) emailInput.focus();
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailVal)) {
                showToast("Please enter a valid email address.", false);
                if (emailInput) emailInput.focus();
                return;
            }

            try {
                await sendPasswordResetEmail(auth, emailVal);
                showToast(`Password reset link sent to ${emailVal}! Check your inbox.`, true);
            } catch (error) {
                console.error("Password reset error:", error);
                const errorCode = error.code || "";

                if (errorCode === "auth/user-not-found") {
                    showToast("No account found with this email address.", false);
                } else if (errorCode === "auth/invalid-email") {
                    showToast("Please enter a valid email address.", false);
                } else {
                    showToast(`Password reset error (${errorCode || 'unknown'}).`, false);
                }
            }
        });
    }
});