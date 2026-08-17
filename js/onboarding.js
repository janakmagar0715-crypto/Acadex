/* ==========================================================================
   ACADEX FIRST-TIME STUDENT ONBOARDING LOGIC
   Multi-step form, pre-filling, validation, and Firestore users/{uid} creation
   ========================================================================== */

import { 
    auth, 
    db, 
    checkUserProfile, 
    doc, 
    setDoc, 
    serverTimestamp 
} from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

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
       3. ONBOARDING STEP NAVIGATION & STATE
       ---------------------------------------------------------------------- */
    let currentStep = 1;
    let currentUser = null;
    let isSubmitting = false;

    const step1Content = document.getElementById("step1Content");
    const step2Content = document.getElementById("step2Content");
    const step3Content = document.getElementById("step3Content");

    const stepIndicator1 = document.getElementById("stepIndicator1");
    const stepIndicator2 = document.getElementById("stepIndicator2");
    const stepIndicator3 = document.getElementById("stepIndicator3");
    const stepperFill = document.getElementById("stepperFill");

    const backBtn = document.getElementById("backBtn");
    const nextBtn = document.getElementById("nextBtn");
    const nextBtnLabel = document.getElementById("nextBtnLabel");
    const nextBtnIcon = document.getElementById("nextBtnIcon");

    const firstNameInput = document.getElementById("firstName");
    const lastNameInput = document.getElementById("lastName");
    const departmentSelect = document.getElementById("department");
    const yearSelect = document.getElementById("year");
    const semesterSelect = document.getElementById("semester");
    const interestsGrid = document.getElementById("interestsGrid");
    const userAvatar = document.getElementById("userAvatar");
    const userEmailDisplay = document.getElementById("userEmailDisplay");

    // Toggle Interest Chips Selection
    if (interestsGrid) {
        interestsGrid.querySelectorAll(".interest-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                chip.classList.toggle("selected");
            });
        });
    }

    // Dynamic Year-to-Semester Options Mapping
    if (yearSelect && semesterSelect) {
        const semesterOptionsMap = {
            "First Year": [
                { value: "Semester 1", text: "Semester 1" },
                { value: "Semester 2", text: "Semester 2" }
            ],
            "Second Year": [
                { value: "Semester 3", text: "Semester 3" },
                { value: "Semester 4", text: "Semester 4" }
            ],
            "Third Year": [
                { value: "Semester 5", text: "Semester 5" },
                { value: "Semester 6", text: "Semester 6" }
            ],
            "Fourth Year": [
                { value: "Semester 7", text: "Semester 7" },
                { value: "Semester 8", text: "Semester 8" }
            ]
        };

        yearSelect.addEventListener("change", () => {
            const selectedYear = yearSelect.value;
            const allowedSemesters = semesterOptionsMap[selectedYear];

            semesterSelect.innerHTML = `<option value="" disabled selected>Select semester</option>`;

            if (allowedSemesters) {
                allowedSemesters.forEach(sem => {
                    const opt = document.createElement("option");
                    opt.value = sem.value;
                    opt.textContent = sem.text;
                    semesterSelect.appendChild(opt);
                });
            } else {
                const allSemesters = [
                    "Semester 1", "Semester 2", "Semester 3", "Semester 4",
                    "Semester 5", "Semester 6", "Semester 7", "Semester 8"
                ];
                allSemesters.forEach(sem => {
                    const opt = document.createElement("option");
                    opt.value = sem;
                    opt.textContent = sem;
                    semesterSelect.appendChild(opt);
                });
            }

            const otherOpt = document.createElement("option");
            otherOpt.value = "Other";
            otherOpt.textContent = "Other";
            semesterSelect.appendChild(otherOpt);
        });
    }

    /**
     * Updates current step UI, progress stepper fill, and action button labels.
     */
    function updateStepUI() {
        // Step visibility
        if (step1Content) step1Content.style.display = currentStep === 1 ? "block" : "none";
        if (step2Content) step2Content.style.display = currentStep === 2 ? "block" : "none";
        if (step3Content) step3Content.style.display = currentStep === 3 ? "block" : "none";

        // Stepper Progress Indicators
        if (stepIndicator1) {
            stepIndicator1.classList.toggle("active", currentStep === 1);
            stepIndicator1.classList.toggle("completed", currentStep > 1);
        }
        if (stepIndicator2) {
            stepIndicator2.classList.toggle("active", currentStep === 2);
            stepIndicator2.classList.toggle("completed", currentStep > 2);
        }
        if (stepIndicator3) {
            stepIndicator3.classList.toggle("active", currentStep === 3);
            stepIndicator3.classList.toggle("completed", currentStep > 3);
        }

        // Stepper Track Fill
        if (stepperFill) {
            if (currentStep === 1) stepperFill.style.width = "0%";
            else if (currentStep === 2) stepperFill.style.width = "50%";
            else if (currentStep === 3) stepperFill.style.width = "100%";
        }

        // Controls
        if (backBtn) {
            backBtn.style.visibility = currentStep === 1 ? "hidden" : "visible";
        }

        if (nextBtnLabel) {
            nextBtnLabel.textContent = currentStep === 3 ? "Complete Profile" : "Continue";
        }

        if (currentStep === 3) {
            updateProfilePreview();
        }
    }

    /**
     * Updates the Step 3 Profile Preview summary box
     */
    function updateProfilePreview() {
        const firstVal = firstNameInput ? firstNameInput.value.trim() : "";
        const lastVal = lastNameInput ? lastNameInput.value.trim() : "";
        const deptVal = departmentSelect ? departmentSelect.value : "";
        const yrVal = yearSelect ? yearSelect.value : "";
        const semVal = semesterSelect ? semesterSelect.value : "";

        const previewFullName = document.getElementById("previewFullName");
        const previewEmail = document.getElementById("previewEmail");
        const previewAcademic = document.getElementById("previewAcademic");
        const previewAvatar = document.getElementById("previewAvatar");

        if (previewFullName) previewFullName.textContent = `${firstVal} ${lastVal}`.trim() || "Student";
        if (previewEmail) previewEmail.textContent = currentUser ? currentUser.email : "";
        if (previewAcademic) previewAcademic.textContent = `${deptVal || 'Program'} • ${yrVal || 'Year'} • ${semVal || 'Semester'}`;

        if (previewAvatar && currentUser) {
            if (currentUser.photoURL) {
                previewAvatar.innerHTML = `<img src="${currentUser.photoURL}" alt="Avatar" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
            } else {
                let initials = `${firstVal[0] || ''}${lastVal[0] || ''}`.toUpperCase();
                if (!initials && currentUser.displayName) {
                    initials = currentUser.displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
                }
                if (!initials && currentUser.email) {
                    initials = currentUser.email.substring(0, 2).toUpperCase();
                }
                previewAvatar.textContent = initials || "ST";
            }
        }
    }

    /* ----------------------------------------------------------------------
       4. AUTH STATE OBSERVER & PROFILE CHECK
       ---------------------------------------------------------------------- */
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("Onboarding: No authenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        // Check if completed user profile already exists in Firestore
        try {
            const profileResult = await checkUserProfile(user.uid);
            if (profileResult && profileResult.profileComplete) {
                console.log("Onboarding: User profile already complete in Firestore. Redirecting to dashboard.");
                window.location.href = "dashboard.html";
                return;
            }
        } catch (err) {
            console.warn("Onboarding initial profile check warning:", err);
        }

        // Pre-fill Step 1 details from Google / Auth User object
        if (userEmailDisplay) {
            userEmailDisplay.textContent = user.email || "student@acadex.edu";
        }

        if (userAvatar) {
            if (user.photoURL) {
                userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName || 'User'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                let initials = "ST";
                if (user.displayName) {
                    initials = user.displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
                } else if (user.email) {
                    initials = user.email.substring(0, 2).toUpperCase();
                }
                userAvatar.textContent = initials;
            }
        }

        // Intelligently split displayName into First and Last Name
        if (user.displayName && firstNameInput && lastNameInput) {
            const parts = user.displayName.trim().split(/\s+/);
            const first = parts[0] || "";
            const last = parts.slice(1).join(" ") || "";
            
            if (!firstNameInput.value) firstNameInput.value = first;
            if (!lastNameInput.value) lastNameInput.value = last;
        }

        updateStepUI();
    });

    /* ----------------------------------------------------------------------
       5. STEP NAVIGATION & FIRESTORE PROFILE SUBMISSION
       ---------------------------------------------------------------------- */
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            if (currentStep > 1) {
                currentStep--;
                updateStepUI();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", async () => {
            // STEP 1 VALIDATION
            if (currentStep === 1) {
                const firstVal = firstNameInput ? firstNameInput.value.trim() : "";
                const lastVal = lastNameInput ? lastNameInput.value.trim() : "";

                if (!firstVal || !lastVal) {
                    showToast("Please enter your first and last name.", false);
                    if (!firstVal && firstNameInput) firstNameInput.focus();
                    else if (!lastVal && lastNameInput) lastNameInput.focus();
                    return;
                }

                currentStep = 2;
                updateStepUI();
                return;
            }

            // STEP 2 VALIDATION
            if (currentStep === 2) {
                const deptVal = departmentSelect ? departmentSelect.value : "";
                const yrVal = yearSelect ? yearSelect.value : "";
                const semVal = semesterSelect ? semesterSelect.value : "";

                if (!deptVal || !yrVal || !semVal) {
                    showToast("Please select your department, year, and semester.", false);
                    if (!deptVal && departmentSelect) departmentSelect.focus();
                    else if (!yrVal && yearSelect) yearSelect.focus();
                    else if (!semVal && semesterSelect) semesterSelect.focus();
                    return;
                }

                currentStep = 3;
                updateStepUI();
                return;
            }

            // STEP 3: SUBMIT PROFILE TO FIRESTORE
            if (currentStep === 3) {
                if (isSubmitting) return;

                // 1. Verify Firebase Auth & Active User Availability
                const activeUser = auth?.currentUser || currentUser;
                if (!auth || !activeUser || !activeUser.uid) {
                    console.error("Onboarding Save Error: Firebase Auth is unavailable or no user is authenticated.", {
                        auth,
                        currentUser,
                        activeUser
                    });
                    showToast("Authentication session expired. Please sign in again.", false);
                    setTimeout(() => {
                        window.location.href = "login.html";
                    }, 1500);
                    return;
                }

                // 2. Validate Form Data
                const firstVal = firstNameInput ? firstNameInput.value.trim() : "";
                const lastVal = lastNameInput ? lastNameInput.value.trim() : "";
                const deptVal = departmentSelect ? departmentSelect.value : "";
                const yrVal = yearSelect ? yearSelect.value : "";
                const semVal = semesterSelect ? semesterSelect.value : "";

                if (!firstVal || !lastVal || !deptVal || !yrVal || !semVal) {
                    showToast("Please complete all required personal and academic details.", false);
                    return;
                }

                // Collect selected interests
                const selectedInterests = [];
                if (interestsGrid) {
                    interestsGrid.querySelectorAll(".interest-chip.selected").forEach(chip => {
                        selectedInterests.push(chip.getAttribute("data-value"));
                    });
                }

                let isSaveSuccessful = false;

                try {
                    isSubmitting = true;
                    nextBtn.disabled = true;
                    if (backBtn) backBtn.disabled = true;
                    if (nextBtnLabel) nextBtnLabel.textContent = "Saving profile...";

                    // Create users/{uid} document in Firestore
                    const userDocRef = doc(db, "users", activeUser.uid);
                    const userProfilePayload = {
                        uid: activeUser.uid,
                        firstName: firstVal,
                        lastName: lastVal,
                        displayName: `${firstVal} ${lastVal}`.trim(),
                        email: activeUser.email || "",
                        photoURL: activeUser.photoURL || null,
                        department: deptVal,
                        year: yrVal,
                        semester: semVal,
                        interests: selectedInterests,
                        profileComplete: true,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };

                    // Timeout race promise to prevent hanging indefinitely on network issues
                    const TIMEOUT_MS = 10000;
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error("Network timeout while saving profile. Please check your connection and try again."));
                        }, TIMEOUT_MS);
                    });

                    // Perform Firestore write
                    await Promise.race([
                        setDoc(userDocRef, userProfilePayload),
                        timeoutPromise
                    ]);

                    console.log("Onboarding complete! Firestore user profile created successfully for:", activeUser.uid);
                    isSaveSuccessful = true;
                    showToast("Profile created successfully!", true);

                    // Redirect to dashboard
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 800);

                } catch (error) {
                    // Log exact error to console during development
                    console.error("Firestore Profile Creation Error Details:", {
                        code: error?.code,
                        message: error?.message,
                        errorObject: error
                    });

                    // User-friendly error message resolution
                    let userFriendlyMsg = "We couldn't save your profile. Please try again.";
                    if (error?.code === "permission-denied") {
                        userFriendlyMsg = "Permission denied. You are not authorized to save this profile.";
                    } else if (error?.code === "unavailable") {
                        userFriendlyMsg = "Network error. Please check your internet connection and try again.";
                    } else if (error?.message) {
                        userFriendlyMsg = error.message;
                    }

                    showToast(userFriendlyMsg, false);

                } finally {
                    // GUARANTEE: Reset submit button and controls if save did not succeed
                    if (!isSaveSuccessful) {
                        isSubmitting = false;
                        nextBtn.disabled = false;
                        if (backBtn) backBtn.disabled = false;
                        if (nextBtnLabel) nextBtnLabel.textContent = "Complete Profile";
                    }
                }
            }
        });
    }
});
