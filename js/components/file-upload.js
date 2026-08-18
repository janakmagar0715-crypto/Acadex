/* ==========================================================================
   ACADEX FILE UPLOAD COMPONENT (js/components/file-upload.js)
   Reusable Drag & Drop file input controller with size/type validation
   and interactive file preview card.
   ========================================================================== */

export function setupFileUpload({
    containerElement,
    fileInputElement,
    maxSizeMB = 25,
    allowedExtensions = [],
    onFileSelected,
    onFileRemoved
}) {
    if (!containerElement || !fileInputElement) return null;

    let selectedFile = null;

    // Build Dropzone HTML structure if container is simple
    let dropzoneBox = containerElement.querySelector(".file-dropzone");
    let previewBox = containerElement.querySelector(".file-preview-card");
    let errorText = containerElement.querySelector(".field-error-text");

    if (!dropzoneBox) {
        dropzoneBox = document.createElement("div");
        dropzoneBox.className = "file-dropzone";
        dropzoneBox.innerHTML = `
            <div class="file-dropzone-inner">
                <div class="file-drop-icon">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <span class="file-drop-text">Drag & drop your file here, or browse</span>
                <span class="file-drop-subtext">Supports PDF, DOCX, ZIP, Images (Max ${maxSizeMB}MB)</span>
            </div>
        `;
        fileInputElement.parentNode.insertBefore(dropzoneBox, fileInputElement);
        dropzoneBox.appendChild(fileInputElement);
    }

    if (!previewBox) {
        previewBox = document.createElement("div");
        previewBox.className = "file-preview-card";
        previewBox.style.display = "none";
        containerElement.appendChild(previewBox);
    }

    if (!errorText) {
        errorText = document.createElement("div");
        errorText.className = "field-error-text";
        errorText.style.display = "none";
        containerElement.appendChild(errorText);
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function getExtension(filename) {
        return (filename.substring(filename.lastIndexOf(".")) || "").toLowerCase();
    }

    function showError(msg) {
        errorText.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>${msg}</span>`;
        errorText.style.display = "flex";
        containerElement.classList.add("has-error");
    }

    function clearError() {
        errorText.style.display = "none";
        errorText.innerHTML = "";
        containerElement.classList.remove("has-error");
    }

    function handleFile(file) {
        clearError();

        if (!file) {
            resetFile();
            return;
        }

        // Validate File Size
        const maxBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            showError(`File size exceeds the ${maxSizeMB} MB limit (${formatBytes(file.size)}).`);
            resetFile();
            return;
        }

        // Validate Allowed Extensions
        if (allowedExtensions.length > 0) {
            const ext = getExtension(file.name);
            const isValidExt = allowedExtensions.some(e => e.toLowerCase() === ext);
            if (!isValidExt) {
                showError(`Invalid file format. Allowed: ${allowedExtensions.join(", ")}`);
                resetFile();
                return;
            }
        }

        selectedFile = file;

        // Render Preview Card
        const extName = (getExtension(file.name).replace(".", "") || "FILE").toUpperCase();
        previewBox.innerHTML = `
            <div class="file-preview-info">
                <span class="file-type-badge">${extName}</span>
                <div class="file-preview-details">
                    <span class="file-preview-name">${file.name}</span>
                    <span class="file-preview-size">${formatBytes(file.size)}</span>
                </div>
            </div>
            <button type="button" class="file-remove-btn" aria-label="Remove file" title="Remove file">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        previewBox.style.display = "flex";

        const removeBtn = previewBox.querySelector(".file-remove-btn");
        if (removeBtn) {
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                resetFile();
            });
        }

        if (onFileSelected) onFileSelected(file);
    }

    function resetFile() {
        selectedFile = null;
        fileInputElement.value = "";
        previewBox.style.display = "none";
        previewBox.innerHTML = "";
        if (onFileRemoved) onFileRemoved();
    }

    // Drag and drop events
    ["dragenter", "dragover"].forEach(eventName => {
        dropzoneBox.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneBox.classList.add("drag-over");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropzoneBox.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneBox.classList.remove("drag-over");
        }, false);
    });

    dropzoneBox.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            fileInputElement.files = files;
            handleFile(files[0]);
        }
    });

    fileInputElement.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        } else {
            resetFile();
        }
    });

    return {
        getSelectedFile: () => selectedFile,
        reset: resetFile,
        showError,
        clearError
    };
}
