/* ==========================================================================
   ACADEX STUDENT REGISTRATION CONTROLLER (js/register.js)
   Theme management, password visibility toggles, Firebase email registration,
   Firestore initial users/{uid} creation, and authentication state observers.
   ========================================================================== */

import { auth, db, checkUserProfile, doc, setDoc, serverTimestamp } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
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

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            setTheme(event.matches ? "dark" : "light");
        }
    });

    /* ----------------------------------------------------------------------
       2. PASSWORD VISIBILITY TOGGLES
       ---------------------------------------------------------------------- */
    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("togglePassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");

    function setupPasswordToggle(inputEl, btnEl) {
        if (inputEl && btnEl) {
            btnEl.addEventListener("click", () => {
                const isPassword = inputEl.type === "password";
                inputEl.type = isPassword ? "text" : "password";
                btnEl.classList.toggle("showing", isPassword);
                btnEl.setAttribute(
                    "aria-label",
                    isPassword ? "Hide password" : "Show password"
                );
            });
        }
    }

    setupPasswordToggle(passwordInput, togglePasswordBtn);
    setupPasswordToggle(confirmPasswordInput, toggleConfirmPasswordBtn);

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

            if (isAuthenticating) return;
            const originalBtnHTML = googleLoginBtn.innerHTML;

            try {
                isAuthenticating = true;
                googleLoginBtn.disabled = true;
                googleLoginBtn.innerHTML = "<span>Signing in...</span>";

                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                const user = result.user;

                console.log("Firebase Google Authentication successful:", user.email);

                const firstName = user.displayName
                    ? user.displayName.split(" ")[0]
                    : "Student";

                showToast(`Welcome to Acadex, ${firstName}!`, true);
                const profileResult = await checkUserProfile(user.uid);

                setTimeout(() => {
                    if (profileResult.profileComplete) {
                        window.location.href = "dashboard.html";
                    } else {
                        window.location.href = "onboarding.html";
                    }
                }, 1000);

            } catch (error) {
                console.error("Firebase Google Auth Error:", error);

                googleLoginBtn.disabled = false;
                googleLoginBtn.innerHTML = originalBtnHTML;
                isAuthenticating = false;

                const errorCode = error.code || "";

                if (errorCode === "auth/popup-closed-by-user" || errorCode === "popup-closed-by-user") {
                    showToast("Sign-in was cancelled.", false);
                } else if (errorCode === "auth/popup-blocked") {
                    showToast("Your browser blocked the sign-in popup. Please allow popups and try again.", false);
                } else if (errorCode === "auth/network-request-failed") {
                    showToast("Network error. Please check your connection and try again.", false);
                } else {
                    showToast(`Sign-in error (${errorCode || 'unknown'}). Please check console.`, false);
                }
            }
        });
    }

    /* ----------------------------------------------------------------------
       6. EMAIL / PASSWORD REGISTRATION FORM HANDLER
       ---------------------------------------------------------------------- */
    const registerForm = document.getElementById("registerForm");
    const nameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const submitRegisterBtn = document.getElementById("submitRegisterBtn");

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isAuthenticating) return;

            const nameVal = nameInput ? nameInput.value.trim() : "";
            const emailVal = emailInput ? emailInput.value.trim() : "";
            const passVal = passwordInput ? passwordInput.value.trim() : "";
            const confirmPassVal = confirmPasswordInput ? confirmPasswordInput.value.trim() : "";

            let hasError = false;
            if (!nameVal && nameInput) {
                const parent = nameInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter your full name.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (!emailVal && emailInput) {
                const parent = emailInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter an email address.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            } else if (emailVal) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(emailVal) && emailInput) {
                    const parent = emailInput.closest(".form-group");
                    if (parent) {
                        parent.classList.add("has-error");
                        const errEl = parent.querySelector(".field-error-text");
                        if (errEl) {
                            errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a valid email address.</span>`;
                            errEl.style.display = "flex";
                        }
                    }
                    hasError = true;
                }
            }

            if (!passVal && passwordInput) {
                const parent = passwordInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Please enter a password.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            } else if (passVal && passVal.length < 6 && passwordInput) {
                const parent = passwordInput.closest(".form-group");
                if (parent) {
                    parent.classList.add("has-error");
                    const errEl = parent.querySelector(".field-error-text");
                    if (errEl) {
                        errEl.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Password must be at least 6 characters long.</span>`;
                        errEl.style.display = "flex";
                    }
                }
                hasError = true;
            }

            if (hasError) return;

            const originalBtnHTML = submitRegisterBtn ? submitRegisterBtn.innerHTML : "";

            try {
                isAuthenticating = true;
                if (submitRegisterBtn) {
                    submitRegisterBtn.disabled = true;
                    submitRegisterBtn.classList.add("btn-loading");
                    submitRegisterBtn.innerHTML = `<span class="btn-spinner"></span> <span>Creating Account...</span>`;
                }

                // 1. Create Firebase Auth User
                const userCredential = await createUserWithEmailAndPassword(auth, emailVal, passVal);
                const user = userCredential.user;

                console.log("User account created successfully in Firebase Auth:", user.email);

                // 2. Update user profile display name
                try {
                    await updateProfile(user, { displayName: nameVal });
                } catch (profErr) {
                    console.warn("Could not set displayName on user profile:", profErr);
                }

                // Split full name into first & last name
                const parts = nameVal.split(/\s+/);
                const firstName = parts[0] || "";
                const lastName = parts.slice(1).join(" ") || "";

                // 3. Create initial Firestore document at users/{uid}
                const userDocRef = doc(db, "users", user.uid);
                await setDoc(userDocRef, {
                    uid: user.uid,
                    firstName: firstName,
                    lastName: lastName,
                    displayName: nameVal,
                    email: emailVal,
                    photoURL: null,
                    department: "",
                    year: "",
                    semester: "",
                    interests: [],
                    profileComplete: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                console.log("Initial Firestore user profile doc created for:", user.uid);

                showToast(`Welcome to Acadex, ${firstName}!`, true);

                setTimeout(() => {
                    window.location.href = "onboarding.html";
                }, 800);

            } catch (error) {
                console.error("Registration error:", error);

                isAuthenticating = false;
                if (submitRegisterBtn) {
                    submitRegisterBtn.disabled = false;
                    submitRegisterBtn.innerHTML = originalBtnHTML;
                }

                const errorCode = error.code || "";

                if (errorCode === "auth/email-already-in-use") {
                    showToast("This email address is already registered. Please sign in.", false);
                } else if (errorCode === "auth/weak-password") {
                    showToast("Password is too weak. Please use at least 6 characters.", false);
                } else if (errorCode === "auth/invalid-email") {
                    showToast("The email address provided is invalid.", false);
                } else if (errorCode === "auth/network-request-failed") {
                    showToast("Network error. Please check your connection and try again.", false);
                } else if (errorCode === "auth/operation-not-allowed") {
                    showToast("Email/Password sign-up is not enabled. Please enable it in Firebase Console > Authentication.", false);
                } else {
                    showToast(`Registration failed (${errorCode || 'unknown'}). Please check console.`, false);
                }
            }
        });
    }
});
