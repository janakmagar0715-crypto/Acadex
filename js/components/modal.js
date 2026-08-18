/* ==========================================================================
   ACADEX UNIFIED REUSABLE MODAL SYSTEM (js/components/modal.js)
   Centralized modal state management, overlay backdrop dismissals,
   Escape key listeners, body scroll lock, destructive delete confirmations,
   and toast notifications across Acadex.
   ========================================================================== */

/**
 * Currently active open modal stack for proper z-index and Escape key handling
 */
const activeModalStack = [];

/**
 * Initializes global Escape key listener for the modal system
 */
function initGlobalModalListeners() {
    if (window._acadexModalListenersInitialized) return;
    window._acadexModalListenersInitialized = true;

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && activeModalStack.length > 0) {
            const topModal = activeModalStack[activeModalStack.length - 1];
            // Do not close if uploading/submitting in progress
            if (topModal && topModal.dataset.preventClose === "true") return;
            if (topModal && typeof topModal._closeHandler === "function") {
                topModal._closeHandler();
            } else if (topModal) {
                closeModal(topModal);
            }
        }
    });
}

// Call on module load
initGlobalModalListeners();

/**
 * Opens a modal dialog with smooth fade/pop animations and body scroll lock
 * @param {HTMLElement} modalElement - The modal backdrop container element
 * @param {Object} options - Optional configuration ({ onOpen })
 */
export function openModal(modalElement, options = {}) {
    if (!modalElement) return;

    modalElement.style.display = "flex";
    modalElement.setAttribute("aria-hidden", "false");

    if (!activeModalStack.includes(modalElement)) {
        activeModalStack.push(modalElement);
    }

    // Lock body scroll to prevent double scrollbars
    document.body.style.overflow = "hidden";

    if (typeof options.onOpen === "function") {
        options.onOpen(modalElement);
    }
}

/**
 * Closes a modal dialog and restores body scroll if no other modals are open
 * @param {HTMLElement} modalElement - The modal backdrop container element
 * @param {Object} options - Optional configuration ({ onClose })
 */
export function closeModal(modalElement, options = {}) {
    if (!modalElement) return;

    // Do not close if explicitly locked during file upload
    if (modalElement.dataset.preventClose === "true") return;

    modalElement.style.display = "none";
    modalElement.setAttribute("aria-hidden", "true");

    const index = activeModalStack.indexOf(modalElement);
    if (index !== -1) {
        activeModalStack.splice(index, 1);
    }

    // Restore body scroll if all modals are closed
    if (activeModalStack.length === 0) {
        document.body.style.overflow = "";
    }

    if (typeof options.onClose === "function") {
        options.onClose(modalElement);
    }
}

/**
 * Prevents closing the modal via backdrop or Escape key during file upload
 * @param {HTMLElement} modalElement 
 * @param {boolean} isLocked 
 */
export function setModalLoadingLock(modalElement, isLocked) {
    if (!modalElement) return;
    if (isLocked) {
        modalElement.dataset.preventClose = "true";
    } else {
        delete modalElement.dataset.preventClose;
    }
}

/**
 * Binds standardized triggers and backdrop dismissals to a modal element
 * @param {Object} params
 * @param {HTMLElement} params.modalElement - Modal backdrop container
 * @param {HTMLElement|HTMLElement[]} [params.openTriggers] - Element(s) that open the modal
 * @param {HTMLElement|HTMLElement[]} [params.closeTriggers] - Element(s) that close the modal
 * @param {Function} [params.onOpen] - Optional callback on modal open
 * @param {Function} [params.onClose] - Optional callback on modal close
 * @param {Function} [params.isUploadingGetter] - Optional function returning boolean if busy
 */
export function setupModal({
    modalElement,
    openTriggers = [],
    closeTriggers = [],
    onOpen = null,
    onClose = null,
    isUploadingGetter = null
}) {
    if (!modalElement) return;

    const opens = Array.isArray(openTriggers) ? openTriggers : [openTriggers];
    const closes = Array.isArray(closeTriggers) ? closeTriggers : [closeTriggers];

    opens.forEach(trigger => {
        if (trigger) {
            trigger.addEventListener("click", (e) => {
                e.preventDefault();
                openModal(modalElement, { onOpen });
            });
        }
    });

    const safeClose = () => {
        if (typeof isUploadingGetter === "function" && isUploadingGetter()) return;
        closeModal(modalElement, { onClose });
    };

    modalElement._closeHandler = safeClose;

    closes.forEach(trigger => {
        if (trigger) {
            trigger.addEventListener("click", (e) => {
                e.preventDefault();
                safeClose();
            });
        }
    });

    // Close on dark overlay backdrop click
    modalElement.addEventListener("click", (e) => {
        if (e.target === modalElement) {
            safeClose();
        }
    });
}

/**
 * Centralized Toast Notification System
 * @param {string} message - Notification text
 * @param {boolean} isSuccess - True for success (green check), false for error
 */
export function showToast(message, isSuccess = true) {
    let toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toastContainer";
        toastContainer.className = "toast-container";
        document.body.appendChild(toastContainer);
    }

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

/**
 * Standardized Destructive Confirmation Modal (replaces browser alert/confirm)
 * @param {Object} config
 * @param {string} config.title - Title for confirmation dialog
 * @param {string} config.message - Subtitle / description message
 * @param {string} [config.confirmText="Delete"] - Label for confirm action button
 * @param {string} [config.cancelText="Cancel"] - Label for cancel button
 * @param {boolean} [config.isDanger=true] - Uses red danger button styling if true
 * @returns {Promise<boolean>} Resolves to true if user clicks confirm, false otherwise
 */
export function showConfirmModal({
    title = "Are you sure?",
    message = "This action cannot be undone.",
    confirmText = "Delete",
    cancelText = "Cancel",
    isDanger = true
}) {
    return new Promise((resolve) => {
        let confirmModal = document.getElementById("confirmModal");

        if (!confirmModal) {
            confirmModal = document.createElement("div");
            confirmModal.id = "confirmModal";
            confirmModal.className = "modal-backdrop";
            confirmModal.style.display = "none";

            confirmModal.innerHTML = `
                <div class="modal-box modal-confirm-box">
                    <div id="confirmModalIcon" class="modal-confirm-icon">
                        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 1 1.71 3h16.94a2 2 0 0 1 1.71-3L13.71 3.86a2 2 0 0 3-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <h3 id="confirmModalTitle" class="modal-confirm-title">Are you sure?</h3>
                    <p id="confirmModalText" class="modal-confirm-text">This action cannot be undone.</p>
                    <div class="modal-confirm-actions">
                        <button type="button" id="confirmModalCancelBtn" class="btn-secondary">Cancel</button>
                        <button type="button" id="confirmModalConfirmBtn" class="btn-danger">Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmModal);
        }

        const titleEl = confirmModal.querySelector("#confirmModalTitle");
        const textEl = confirmModal.querySelector("#confirmModalText");
        const cancelBtn = confirmModal.querySelector("#confirmModalCancelBtn");
        const confirmBtn = confirmModal.querySelector("#confirmModalConfirmBtn");

        if (titleEl) titleEl.textContent = title;
        if (textEl) textEl.textContent = message;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        if (confirmBtn) {
            confirmBtn.textContent = confirmText;
            if (isDanger) {
                confirmBtn.className = "btn-danger";
            } else {
                confirmBtn.className = "btn-primary";
            }
        }

        let cleanup = () => {};

        const handleConfirm = () => {
            cleanup();
            closeModal(confirmModal);
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            closeModal(confirmModal);
            resolve(false);
        };

        cleanup = () => {
            confirmBtn.removeEventListener("click", handleConfirm);
            cancelBtn.removeEventListener("click", handleCancel);
        };

        confirmBtn.addEventListener("click", handleConfirm);
        cancelBtn.addEventListener("click", handleCancel);

        setupModal({
            modalElement: confirmModal,
            closeTriggers: [cancelBtn],
            onClose: () => {
                cleanup();
                resolve(false);
            }
        });

        openModal(confirmModal);
    });
}
