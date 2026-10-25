"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  tool: "compress",
  file: null,
  image: null,
  sourceURL: null,
  resultURL: null,
  width: 0,
  height: 0
};

const tools = {
  compress: {
    title: "Image compressor",
    description: "Make image files smaller while keeping them looking sharp.",
    button: "Compress image"
  },
  resize: {
    title: "Image resizer",
    description: "Set the dimensions that work best for your project.",
    button: "Resize image"
  },
  convert: {
    title: "Image format converter",
    description: "Convert your image to a different file format.",
    button: "Convert image"
  }
};

const extensions = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png"
};

$("year").textContent = new Date().getFullYear();

function bytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1048576).toFixed(2)} MB`;
}

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function cleanName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "image";
}

function setTool(tool) {
  state.tool = tool;

  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tool === tool;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  $("tool-title").textContent = tools[tool].title;
  $("tool-description").textContent = tools[tool].description;
  $("process-label").textContent = tools[tool].button;

  $("compress-options").classList.toggle(
    "hidden", tool !== "compress"
  );
  $("resize-options").classList.toggle(
    "hidden", tool !== "resize"
  );
  $("convert-options").classList.toggle(
    "hidden", tool !== "convert"
  );

  updateQualityVisibility();
  $("error").classList.add("hidden");

  if (tool === "resize" && state.file) {
    $("width").value = state.width;
    $("height").value = state.height;
  }
}

function updateQualityVisibility() {
  const isPNG = $("format").value === "image/png";
  $("output-quality-option").classList.toggle(
    "hidden",
    state.tool === "resize" ||
    (state.tool === "convert" && isPNG)
  );
}

function resetResult() {
  if (state.resultURL) {
    URL.revokeObjectURL(state.resultURL);
  }

  state.resultURL = null;

  $("result-content").classList.add("hidden");
  $("empty-result").classList.remove("hidden");
  $("result-status").textContent =
    state.file ? "Ready to process" : "Waiting for image";
  $("download").removeAttribute("href");
}

function removeImage() {
  if (state.sourceURL) {
    URL.revokeObjectURL(state.sourceURL);
  }

  state.file = null;
  state.image = null;
  state.sourceURL = null;
  state.width = 0;
  state.height = 0;

  $("file-input").value = "";
  $("drop-zone").classList.remove("hidden");
  $("selected-file").classList.add("hidden");
  $("process").disabled = true;

  resetResult();
}

function loadImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    notify("Please select an image file.");
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    notify("Please choose an image smaller than 25 MB.");
    return;
  }

  removeImage();

  const url = URL.createObjectURL(file);
  const image = new Image();

  state.file = file;
  state.sourceURL = url;

  image.onload = () => {
    state.image = image;
    state.width = image.naturalWidth;
    state.height = image.naturalHeight;

    $("source-preview").src = url;
    $("source-name").textContent = file.name;
    $("source-meta").textContent =
      `${state.width.toLocaleString()} × ` +
      `${state.height.toLocaleString()} · ${bytes(file.size)}`;

    $("drop-zone").classList.add("hidden");
    $("selected-file").classList.remove("hidden");
    $("process").disabled = false;

    $("width").value = state.width;
    $("height").value = state.height;

    resetResult();
    $("error").classList.add("hidden");
  };

  image.onerror = () => {
    removeImage();
    notify("This image could not be opened. Try another file.");
  };

  image.src = url;
}

function outputType() {
  if (state.tool === "convert") {
    return $("format").value;
  }

  if (state.tool === "compress") {
    return "image/webp";
  }

  if (["image/jpeg", "image/png", "image/webp"].includes(
    state.file.type
  )) {
    return state.file.type;
  }

  return "image/png";
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(
        "Your browser could not export this format. Try another format."
      ));
    }, type, quality);
  });
}

function showError(message) {
  $("error").textContent = message;
  $("error").classList.remove("hidden");
}

async function processImage() {
  if (!state.file || !state.image) {
    notify("Choose an image first.");
    return;
  }

  const button = $("process");
  button.disabled = true;
  $("process-label").textContent = "Processing...";
  $("result-status").textContent = "Working...";
  $("error").classList.add("hidden");

  try {
    let width = state.width;
    let height = state.height;

    if (state.tool === "resize") {
      const w = Number($("width").value);
      const h = Number($("height").value);

      if (
        !Number.isInteger(w) || !Number.isInteger(h) ||
        w < 1 || h < 1 || w > 12000 || h > 12000
      ) {
        throw new Error(
          "Enter width and height between 1 and 12,000 pixels."
        );
      }

      if ($("keep-ratio").checked) {
        const scale = Math.min(
          w / state.width,
          h / state.height
        );

        width = Math.max(1, Math.round(state.width * scale));
        height = Math.max(1, Math.round(state.height * scale));
      } else {
        width = w;
        height = h;
      }
    }

    if (width * height > 40000000) {
      throw new Error(
        "That output is too large. Choose smaller dimensions."
      );
    }

    const type = outputType();
    const quality = (
      state.tool === "compress"
        ? Number($("compress-quality").value)
        : Number($("output-quality").value)
    ) / 100;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Your browser could not create the image canvas.");
    }

    // JPEG does not support transparent pixels.
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(state.image, 0, 0, width, height);

    const blob = await canvasBlob(
      canvas,
      type,
      type === "image/png" ? undefined : quality
    );

    // Use the browser's actual output MIME type.
    const actualType = blob.type || "image/png";
    const extension = extensions[actualType] || "png";

    const suffix = {
      compress: "compressed",
      resize: "resized",
      convert: "converted"
    }[state.tool];

    const filename =
      `${cleanName(state.file.name)}-${suffix}.${extension}`;

    resetResult();

    state.resultURL = URL.createObjectURL(blob);

    $("result-preview").src = state.resultURL;
    $("result-name").textContent = filename;
    $("original-size").textContent = bytes(state.file.size);
    $("new-size").textContent = bytes(blob.size);
    $("dimensions").textContent =
      `${width.toLocaleString()} × ${height.toLocaleString()}`;

    const change =
      ((state.file.size - blob.size) / state.file.size) * 100;

    const saving = $("saving-value");

    if (change >= 0) {
      saving.textContent = `${change.toFixed(1)}% smaller`;
      saving.style.color = "#168653";
    } else {
      saving.textContent = `${Math.abs(change).toFixed(1)}% larger`;
      saving.style.color = "#b45309";
    }

    $("download").href = state.resultURL;
    $("download").download = filename;

    $("empty-result").classList.add("hidden");
    $("result-content").classList.remove("hidden");
    $("result-status").textContent = "Ready to download";

    if (state.tool === "compress" && blob.size >= state.file.size) {
      notify("Finished, but the output is not smaller. Try lowering quality.");
    } else {
      notify("Success! Your image is ready to download.");
    }
  } catch (error) {
    showError(error.message || "Something went wrong.");
    $("result-status").textContent = "Processing failed";
  } finally {
    button.disabled = !state.file;
    $("process-label").textContent = tools[state.tool].button;
  }
}

// Tool navigation
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setTool(tab.dataset.tool));
});

// File picker
$("browse").addEventListener("click", () => {
  $("file-input").click();
});

$("drop-zone").addEventListener("click", (event) => {
  if (!event.target.closest("button")) {
    $("file-input").click();
  }
});

$("drop-zone").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $("file-input").click();
  }
});

$("file-input").addEventListener("change", (event) => {
  loadImage(event.target.files[0]);
});

// Drag and drop
["dragenter", "dragover"].forEach((type) => {
  $("drop-zone").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop-zone").classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  $("drop-zone").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop-zone").classList.remove("dragover");
  });
});

$("drop-zone").addEventListener("drop", (event) => {
  loadImage(event.dataTransfer.files[0]);
});

$("remove-file").addEventListener("click", removeImage);
$("process").addEventListener("click", processImage);

// Quality controls
$("compress-quality").addEventListener("input", () => {
  $("compress-value").textContent = $("compress-quality").value;
});

$("output-quality").addEventListener("input", () => {
  $("output-value").textContent = $("output-quality").value;
});

$("format").addEventListener("change", updateQualityVisibility);

// Keep dimensions proportional when editing either field.
$("width").addEventListener("input", () => {
  if (!$("keep-ratio").checked || !state.width) return;

  const width = Number($("width").value);

  if (width > 0) {
    $("height").value = Math.max(
      1, Math.round(width * state.height / state.width)
    );
  }
});

$("height").addEventListener("input", () => {
  if (!$("keep-ratio").checked || !state.height) return;

  const height = Number($("height").value);

  if (height > 0) {
    $("width").value = Math.max(
      1, Math.round(height * state.width / state.height)
    );
  }
});

// Release temporary browser resources when the page closes.
window.addEventListener("pagehide", () => {
  if (state.sourceURL) URL.revokeObjectURL(state.sourceURL);
  if (state.resultURL) URL.revokeObjectURL(state.resultURL);
});

setTool("compress");