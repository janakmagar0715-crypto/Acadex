/* ==========================================================================
   ACADEX PAST EXAMINATION PAPERS V1 CONTROLLER (js/past-papers.js)
   Auth protection, paper filtering, Cloud Storage upload, Firestore CRUD,
   private bookmark toggles, and modal UI controllers.
   ========================================================================== */

import { auth, checkUserProfile } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { fetchPastPapers, createPastPaper, deletePastPaper } from "./services/past-papers.js";
import { uploadResourceFile } from "./services/storage.js";
import { fetchUserBookmarks, addBookmark, removeBookmark } from "./services/bookmarks.js";
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
    let userBookmarksSet = new Set();
    let currentPapersList = [];
    let isUploading = false;

    const papersGrid = document.getElementById("papersGrid");
    const emptyState = document.getElementById("emptyState");
    const errorState = document.getElementById("errorState");
    const searchInput = document.getElementById("searchInput");
    const examTypeFilter = document.getElementById("examTypeFilter");
    const departmentFilter = document.getElementById("departmentFilter");
    const semesterFilter = document.getElementById("semesterFilter");
    const yearFilter = document.getElementById("yearFilter");
    const retryFetchBtn = document.getElementById("retryFetchBtn");

    // Profile Dropdown Elements
    const profileMenuBtn = document.getElementById("profileMenuBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    const userAvatar = document.getElementById("userAvatar");
    const userNameLabel = document.getElementById("userNameLabel");
    const dropdownName = document.getElementById("dropdownName");
    const dropdownEmail = document.getElementById("dropdownEmail");
    const logoutBtn = document.getElementById("logoutBtn");

    // Profile Menu Toggle
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

    // Logout
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
            console.log("Past Papers Page: Unauthenticated user, redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        try {
            const profileResult = await checkUserProfile(user.uid);
            if (!profileResult || !profileResult.profileComplete) {
                console.log("Past Papers Page: Profile incomplete, redirecting to onboarding.");
                window.location.href = "onboarding.html";
                return;
            }

            const profileData = profileResult.data || {};
            renderUserProfile(user, profileData);

            // Fetch user's bookmarks to sync active bookmark button states
            await loadUserBookmarks(user.uid);

            // Load Past Papers Feed
            await loadPastPapers();

        } catch (err) {
            console.error("Past Papers Auth Observer Error:", err);
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

    async function loadUserBookmarks(uid) {
        try {
            const bookmarks = await fetchUserBookmarks(uid);
            userBookmarksSet = new Set(bookmarks.map(b => b.targetId));
        } catch (err) {
            console.warn("Could not load user bookmarks:", err);
            userBookmarksSet = new Set();
        }
    }

    /* ----------------------------------------------------------------------
       5. PAST PAPERS FEED FETCHING & RENDERING
       ---------------------------------------------------------------------- */
    async function loadPastPapers() {
        if (!papersGrid) return;

        // Show Shimmer Skeleton
        papersGrid.style.display = "grid";
        papersGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
            <div class="skeleton-card"><div class="skeleton-badge"></div><div class="skeleton-line title"></div><div class="skeleton-line meta"></div><div class="skeleton-actions"></div></div>
        `;
        if (emptyState) emptyState.style.display = "none";
        if (errorState) errorState.style.display = "none";

        const examTypeVal = examTypeFilter ? examTypeFilter.value : "all";
        const deptVal = departmentFilter ? departmentFilter.value : "all";
        const semVal = semesterFilter ? semesterFilter.value : "all";
        const yearVal = yearFilter ? yearFilter.value : "all";
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

        try {
            const fetched = await fetchPastPapers({
                department: deptVal,
                examType: examTypeVal,
                limitCount: 30
            });

            // Client-side multi-field filter
            currentPapersList = fetched.filter(item => {
                if (semVal !== "all" && item.semester !== semVal) return false;
                if (yearVal !== "all" && item.year !== yearVal) return false;

                if (searchQuery) {
                    const titleMatch = (item.title || "").toLowerCase().includes(searchQuery);
                    const subjectMatch = (item.subject || "").toLowerCase().includes(searchQuery);
                    const codeMatch = (item.courseCode || "").toLowerCase().includes(searchQuery);
                    return titleMatch || subjectMatch || codeMatch;
                }
                return true;
            });

            if (currentPapersList.length === 0) {
                papersGrid.style.display = "none";
                if (emptyState) emptyState.style.display = "flex";
                return;
            }

            renderPapersGrid(currentPapersList);

        } catch (error) {
            console.error("Error loading past papers feed:", error);
            papersGrid.style.display = "none";
            if (errorState) errorState.style.display = "flex";
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return "0 KB";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function renderPapersGrid(papers) {
        papersGrid.style.display = "grid";
        papersGrid.innerHTML = papers.map(item => {
            const isBookmarked = userBookmarksSet.has(item.id);
            const isOwner = currentUser && item.uploaderUid === currentUser.uid;

            let badgeClass = "badge-final";
            let badgeText = "FINAL EXAM";
            if (item.examType === "midterm") {
                badgeClass = "badge-midterm";
                badgeText = "MIDTERM EXAM";
            } else if (item.examType === "quiz") {
                badgeClass = "badge-quiz";
                badgeText = "QUIZ / TEST";
            } else if (item.examType === "model") {
                badgeClass = "badge-model";
                badgeText = "MODEL QUESTION";
            }

            return `
                <div class="resource-card" data-id="${escapeHtml(item.id)}">
                    <div>
                        <div class="resource-card-header">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="resource-type-badge ${badgeClass}">${badgeText}</span>
                                ${item.courseCode ? `<span class="course-code-pill">${escapeHtml(item.courseCode)}</span>` : ''}
                            </div>
                            ${isOwner ? `<button class="btn-icon-secondary delete-btn" data-id="${escapeHtml(item.id)}" aria-label="Delete past paper" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
                        </div>
                        <h3 class="resource-title" style="margin-top: 10px;">${escapeHtml(item.title)}</h3>
                        <div class="resource-meta-text">${escapeHtml(item.subject)} • ${escapeHtml(item.department || 'General')} (${escapeHtml(item.year || '2024')})</div>
                        <div class="resource-meta-text" style="font-size: 11.5px; margin-top: 4px;">By ${escapeHtml(item.uploaderName || 'Student')} • ${formatFileSize(item.fileSize)}</div>
                    </div>

                    <div class="resource-card-actions">
                        <button class="btn-icon-secondary bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Bookmark past paper">
                            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        </button>
                        <div class="card-btn-group">
                            <button class="btn-secondary view-details-btn" data-id="${escapeHtml(item.id)}" style="padding: 6px 12px; font-size: 13px;">View</button>
                            <a href="${escapeHtml(item.fileURL)}" target="_blank" download class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none;">Download</a>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // Attach Card Button Handlers
        papersGrid.querySelectorAll(".bookmark-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const paperId = btn.getAttribute("data-id");
                await handleBookmarkToggle(paperId, btn);
            });
        });

        papersGrid.querySelectorAll(".view-details-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const paperId = btn.getAttribute("data-id");
                openDetailsModal(paperId);
            });
        });

        papersGrid.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const paperId = btn.getAttribute("data-id");
                if (confirm("Are you sure you want to delete this past paper and its associated file?")) {
                    await handlePaperDelete(paperId);
                }
            });
        });
    }

    /* ----------------------------------------------------------------------
       6. FILTER & SEARCH HANDLERS
       ---------------------------------------------------------------------- */
    if (searchInput) searchInput.addEventListener("input", () => loadPastPapers());
    if (examTypeFilter) examTypeFilter.addEventListener("change", () => loadPastPapers());
    if (departmentFilter) departmentFilter.addEventListener("change", () => loadPastPapers());
    if (semesterFilter) semesterFilter.addEventListener("change", () => loadPastPapers());
    if (yearFilter) yearFilter.addEventListener("change", () => loadPastPapers());
    if (retryFetchBtn) retryFetchBtn.addEventListener("click", () => loadPastPapers());

    /* ----------------------------------------------------------------------
       7. BOOKMARK TOGGLE ENGINE
       ---------------------------------------------------------------------- */
    async function handleBookmarkToggle(paperId, btnElement) {
        if (!currentUser) return;

        const isCurrentlyBookmarked = userBookmarksSet.has(paperId);
        const item = currentPapersList.find(p => p.id === paperId);

        try {
            if (isCurrentlyBookmarked) {
                await removeBookmark("past_paper", paperId);
                userBookmarksSet.delete(paperId);
                if (btnElement) btnElement.classList.remove("bookmarked");
                showToast("Past paper removed from bookmarks.");
            } else {
                await addBookmark({
                    targetId: paperId,
                    targetType: "past_paper",
                    title: item ? item.title : "Past Paper",
                    subject: item ? item.subject : "",
                    category: "past_paper"
                });
                userBookmarksSet.add(paperId);
                if (btnElement) btnElement.classList.add("bookmarked");
                showToast("Past paper saved to bookmarks!", true);
            }
        } catch (err) {
            console.error("Bookmark toggle error:", err);
            showToast("Could not update bookmark. Please try again.", false);
        }
    }

    /* ----------------------------------------------------------------------
       8. PAPER DELETION HANDLER
       ---------------------------------------------------------------------- */
    async function handlePaperDelete(paperId) {
        try {
            showToast("Deleting past paper and file...");
            await deletePastPaper(paperId);
            showToast("Past paper deleted successfully!", true);
            await loadPastPapers();
        } catch (err) {
            console.error("Delete past paper error:", err);
            showToast("Failed to delete past paper. " + (err.message || ""), false);
        }
    }

    /* ----------------------------------------------------------------------
       9. PAPER DETAILS MODAL HANDLER
       ---------------------------------------------------------------------- */
    const paperDetailsModal = document.getElementById("paperDetailsModal");
    const closeDetailsModalBtn = document.getElementById("closeDetailsModalBtn");
    const modalExamTypeBadge = document.getElementById("modalExamTypeBadge");
    const modalCourseCodeBadge = document.getElementById("modalCourseCodeBadge");
    const modalTitle = document.getElementById("modalTitle");
    const modalMeta = document.getElementById("modalMeta");
    const modalExamYear = document.getElementById("modalExamYear");
    const modalUploader = document.getElementById("modalUploader");
    const modalFileSize = document.getElementById("modalFileSize");
    const modalDept = document.getElementById("modalDept");
    const modalDownloadBtn = document.getElementById("modalDownloadBtn");
    const modalBookmarkBtn = document.getElementById("modalBookmarkBtn");
    const modalBookmarkText = document.getElementById("modalBookmarkText");

    let currentActiveDetailsId = null;

    function openDetailsModal(paperId) {
        const item = currentPapersList.find(p => p.id === paperId);
        if (!item || !paperDetailsModal) return;

        currentActiveDetailsId = paperId;

        if (modalExamTypeBadge) {
            modalExamTypeBadge.textContent = (item.examType || "final").toUpperCase() + " EXAM";
        }
        if (modalCourseCodeBadge) {
            if (item.courseCode) {
                modalCourseCodeBadge.textContent = item.courseCode;
                modalCourseCodeBadge.style.display = "inline-flex";
            } else {
                modalCourseCodeBadge.style.display = "none";
            }
        }

        if (modalTitle) modalTitle.textContent = item.title;
        if (modalMeta) modalMeta.textContent = `${item.subject} • ${item.department || 'General'} (${item.semester || ''})`;
        if (modalExamYear) modalExamYear.textContent = item.year || "2024";
        if (modalUploader) modalUploader.textContent = item.uploaderName || "Student";
        if (modalFileSize) modalFileSize.textContent = formatFileSize(item.fileSize);
        if (modalDept) modalDept.textContent = item.department || "General";
        if (modalDownloadBtn) modalDownloadBtn.href = item.fileURL;

        updateModalBookmarkState();

        paperDetailsModal.style.display = "flex";
    }

    function updateModalBookmarkState() {
        if (!currentActiveDetailsId) return;
        const isBookmarked = userBookmarksSet.has(currentActiveDetailsId);
        if (modalBookmarkText) modalBookmarkText.textContent = isBookmarked ? "Remove Bookmark" : "Save Bookmark";
        if (modalBookmarkBtn) {
            modalBookmarkBtn.classList.toggle("bookmarked", isBookmarked);
        }
    }

    if (closeDetailsModalBtn && paperDetailsModal) {
        closeDetailsModalBtn.addEventListener("click", () => {
            paperDetailsModal.style.display = "none";
        });

        paperDetailsModal.addEventListener("click", (e) => {
            if (e.target === paperDetailsModal) paperDetailsModal.style.display = "none";
        });
    }

    if (modalBookmarkBtn) {
        modalBookmarkBtn.addEventListener("click", async () => {
            if (!currentActiveDetailsId) return;
            const cardBtn = papersGrid ? papersGrid.querySelector(`.bookmark-btn[data-id="${currentActiveDetailsId}"]`) : null;
            await handleBookmarkToggle(currentActiveDetailsId, cardBtn);
            updateModalBookmarkState();
        });
    }

    /* ----------------------------------------------------------------------
       10. UPLOAD PAST PAPER MODAL CONTROLLER
       ---------------------------------------------------------------------- */
    const uploadPaperModal = document.getElementById("uploadPaperModal");
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");
    const closeUploadModalBtn = document.getElementById("closeUploadModalBtn");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");
    const uploadPaperForm = document.getElementById("uploadPaperForm");
    const submitUploadBtn = document.getElementById("submitUploadBtn");
    const submitUploadLabel = document.getElementById("submitUploadLabel");

    const paperTitleInput = document.getElementById("paperTitle");
    const courseCodeInput = document.getElementById("courseCode");
    const paperSubjectInput = document.getElementById("paperSubject");
    const examTypeInput = document.getElementById("examType");
    const paperDepartmentInput = document.getElementById("paperDepartment");
    const paperSemesterInput = document.getElementById("paperSemester");
    const paperYearInput = document.getElementById("paperYear");
    const fileInput = document.getElementById("fileInput");

    function openUploadModal() {
        if (!uploadPaperModal) return;
        uploadPaperForm.reset();
        uploadPaperModal.style.display = "flex";
    }

    function closeUploadModal() {
        if (uploadPaperModal && !isUploading) {
            uploadPaperModal.style.display = "none";
        }
    }

    if (openUploadModalBtn) openUploadModalBtn.addEventListener("click", openUploadModal);
    if (closeUploadModalBtn) closeUploadModalBtn.addEventListener("click", closeUploadModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener("click", closeUploadModal);

    if (uploadPaperForm) {
        uploadPaperForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (isUploading || !currentUser) return;

            const titleVal = paperTitleInput.value.trim();
            const courseCodeVal = courseCodeInput ? courseCodeInput.value.trim() : "";
            const subjectVal = paperSubjectInput.value.trim();
            const examTypeVal = examTypeInput.value;
            const departmentVal = paperDepartmentInput.value;
            const semesterVal = paperSemesterInput.value;
            const yearVal = paperYearInput.value;
            const selectedFile = fileInput.files[0];

            if (!titleVal || !subjectVal || !selectedFile) {
                showToast("Please fill in all required fields and select a file.", false);
                return;
            }

            // Validate File Size (<25MB)
            if (selectedFile.size > 25 * 1024 * 1024) {
                showToast("File size exceeds the 25 MB limit.", false);
                return;
            }

            let isSuccess = false;

            try {
                isUploading = true;
                submitUploadBtn.disabled = true;
                if (cancelUploadBtn) cancelUploadBtn.disabled = true;
                if (submitUploadLabel) submitUploadLabel.textContent = "Uploading file to Cloud Storage...";

                // 1. Upload File to Firebase Storage
                const storageResult = await uploadResourceFile(selectedFile, currentUser.uid);
                console.log("Storage Upload Succeeded:", storageResult);

                if (submitUploadLabel) submitUploadLabel.textContent = "Creating Firestore paper record...";

                // 2. Create Cloud Firestore Past Paper Document
                const paperId = await createPastPaper({
                    title: titleVal,
                    courseCode: courseCodeVal,
                    subject: subjectVal,
                    examType: examTypeVal,
                    department: departmentVal,
                    semester: semesterVal,
                    year: yearVal,
                    fileURL: storageResult.fileURL,
                    storagePath: storageResult.storagePath,
                    fileType: storageResult.fileType,
                    fileSize: storageResult.fileSize,
                    uploaderName: currentUser.displayName || "Student"
                });

                console.log("Firestore Past Paper Record Created:", paperId);
                isSuccess = true;
                showToast("Past examination paper uploaded successfully!", true);

                closeUploadModal();
                await loadPastPapers();

            } catch (error) {
                console.error("Paper Upload Process Error:", error);
                showToast("Upload failed: " + (error.message || "Please check your connection."), false);
            } finally {
                isUploading = false;
                submitUploadBtn.disabled = false;
                if (cancelUploadBtn) cancelUploadBtn.disabled = false;
                if (submitUploadLabel) submitUploadLabel.textContent = "Upload File & Create Paper";
            }
        });
    }
});
