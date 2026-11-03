// SPDX-License-Identifier: MIT
/*
Fizzpixl -- A single file javascript pixel editor

For now, it only runs in the browser. but feel free to port it
(at least the main implementation for the editor)

-- GDDASH45 (on Github)

Version history:

0.1.0:
    Very basic, only 2 colors, no controls

0.2.0:
    Shapes, colors, controls, saving artwork

0.3.0:
    Undo/Redo, zoom, grid, eyedropper, selection,
    keyboard shortcuts, project saving and loading,
    line tool, clipboard support

0.4.0:
    Add FZPX project header

0.5.0:
    Add frame-based animation editing and playback

0.6.0:
    Add onion-skin previews and improve project file creation

0.7.0:
    Add gradients, hexadecimal color entry, and stencil editing
*/

"use strict";

// FZPX
const FZPX = {
    MAGIC: "FZPX",
    VERSION: 1,
    HEADER_SIZE: 16,

    write(fileCount, metadataOffset) {
        const buffer = new ArrayBuffer(this.HEADER_SIZE);
        const view = new DataView(buffer);

        for (let i = 0; i < 4; i++) {
            view.setUint8(i, this.MAGIC.charCodeAt(i));
        }

        view.setUint16(4, this.VERSION, true);
        view.setUint16(6, this.HEADER_SIZE, true);
        view.setUint32(8, fileCount, true);
        view.setUint32(12, metadataOffset, true);

        return new Uint8Array(buffer);
    },

    read(data) {
        if (data.length < this.HEADER_SIZE) {
            throw new Error("FZPX: File is too small");
        }

        const view = new DataView(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );

        let magic = "";

        for (let i = 0; i < 4; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }

        if (magic !== this.MAGIC) {
            throw new Error("FZPX: Invalid magic header");
        }

        const version = view.getUint16(4, true);
        const headerSize = view.getUint16(6, true);

        if (version !== this.VERSION) {
            throw new Error(`FZPX: Unsupported version ${version}`);
        }

        if (headerSize < this.HEADER_SIZE || headerSize > data.length) {
            throw new Error("FZPX: Invalid header size");
        }

        return {
            version,
            headerSize,
            fileCount: view.getUint32(8, true),
            metadataOffset: view.getUint32(12, true)
        };
    }
};

// Configuration

const WIDTH = 680;
const HEIGHT = 480;
const MAX_HISTORY = 50;
const DEFAULT_ANIMATION_FPS = 8;
const STENCIL_SIZE = 32;
const STENCIL_STORAGE_KEY = "fizzpixl.stencils.v1";

// Editor setup

const editor = document.createElement("div");
editor.id = "pixel-editor";

const style = document.createElement("style");

style.textContent = `
    * {
        box-sizing: border-box;
    }

    body {
        background: #252525;
        color: white;
        font-family: sans-serif;
        margin: 20px;
    }

    #pixel-editor {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 100%;
    }

    #toolbar, #palette, #sizes, #zoom-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }

    button {
        background: #444;
        color: white;
        border: 1px solid #666;
        padding: 8px 13px;
        cursor: pointer;
        border-radius: 4px;
    }

    button:hover {
        background: #666;
    }

    button.active {
        background: #2675c9;
        border-color: #4799ee;
    }

    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    #project-file-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
    }

    #project-file-select {
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        padding: 8px;
        min-width: 180px;
    }

    #new-project-file-name {
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        padding: 8px;
        min-width: 160px;
    }

    #color-controls,
    #stencil-controls,
    .color-input {
        width: 100px;
        padding: 6px;
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        font-family: monospace;
    }

    #stencil-editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #stencil-editor-canvas {
        width: 256px;
        height: 256px;
        max-width: 100%;
        border: 1px solid #777;
        background: #171717;
        image-rendering: pixelated;
        touch-action: none;
        cursor: crosshair;
    }

    #stencil-name,
    #stencil-select {
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        padding: 8px;
    }

    #canvas-viewport {
        width: 100%;
        max-width: 100%;
        overflow: auto;
        border: 1px solid #555;
        background: #171717;
    }

    #canvas-wrapper {
        position: relative;
        width: 680px;
        height: 480px;
    }

    #pixel-canvas,
    #grid-canvas,
    #onion-canvas,
    #preview-canvas {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        width: 680px;
        height: 480px;
    }

    #pixel-canvas {
        background: black;
        image-rendering: pixelated;
        cursor: crosshair;
        touch-action: none;
    }

    #grid-canvas,
    #onion-canvas,
    #preview-canvas {
        pointer-events: none;
        image-rendering: pixelated;
    }

    #preview-canvas {
        z-index: 4;
    }

    #onion-canvas {
        z-index: 3;
    }

    #grid-canvas {
        z-index: 2;
    }

    #pixel-canvas {
        z-index: 1;
    }

    .swatch {
        width: 27px;
        height: 27px;
        padding: 0;
        border: 2px solid #777;
    }

    #color-picker {
        width: 40px;
        height: 32px;
        cursor: pointer;
    }

    #status {
        color: #aaa;
        font-size: 13px;
    }

    #zoom-label {
        min-width: 45px;
        text-align: center;
    }

    .section-label {
        color: #bbb;
        margin-right: 4px;
    }

    #animation-editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #animation-controls,
    #animation-timeline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
    }

    #animation-timeline {
        flex-wrap: nowrap;
        overflow-x: auto;
        padding: 2px;
    }

    .animation-frame {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 82px;
        padding: 6px;
    }

    .animation-frame canvas {
        width: 68px;
        height: 48px;
        background: #000;
        image-rendering: pixelated;
        border: 1px solid #888;
    }

    #animation-fps {
        width: 64px;
        padding: 6px;
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
    }
`;

document.head.appendChild(style);
document.body.appendChild(editor);

// Canvas

const canvas = document.createElement("canvas");

canvas.id = "pixel-canvas";
canvas.width = WIDTH;
canvas.height = HEIGHT;

const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});

ctx.fillStyle = "#000000";
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Canvas viewport

const viewport = document.createElement("div");
viewport.id = "canvas-viewport";

const canvasWrapper = document.createElement("div");
canvasWrapper.id = "canvas-wrapper";

viewport.appendChild(canvasWrapper);

// Grid overlay

const gridCanvas = document.createElement("canvas");

gridCanvas.id = "grid-canvas";
gridCanvas.width = WIDTH;
gridCanvas.height = HEIGHT;

const gridCtx = gridCanvas.getContext("2d");

// Onion-skin overlay

const onionCanvas = document.createElement("canvas");

onionCanvas.id = "onion-canvas";
onionCanvas.width = WIDTH;
onionCanvas.height = HEIGHT;

const onionCtx = onionCanvas.getContext("2d");

// Preview overlay

const previewCanvas = document.createElement("canvas");

previewCanvas.id = "preview-canvas";
previewCanvas.width = WIDTH;
previewCanvas.height = HEIGHT;

const previewCtx = previewCanvas.getContext("2d");

canvasWrapper.appendChild(canvas);
canvasWrapper.appendChild(gridCanvas);
canvasWrapper.appendChild(onionCanvas);
canvasWrapper.appendChild(previewCanvas);

editor.appendChild(viewport);

// Toolbar

const toolbar = document.createElement("div");
toolbar.id = "toolbar";

editor.appendChild(toolbar);

function makeButton(name, callback, parent = toolbar) {
    const button = document.createElement("button");

    button.textContent = name;
    button.addEventListener("click", callback);

    parent.appendChild(button);

    return button;
}


// Drawing state

let color = "#ffffff";
let gradientEndColor = "#ffffff";
let tool = "pencil";
let brushSize = 1;

let drawing = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;

let zoom = 1;
let showGrid = false;

let selection = null;
let selectionClipboard = null;

let movingSelection = false;
let selectionImage = null;

let undoStack = [];
let redoStack = [];
let currentFrameIndex = 0;
let animationTimer = null;

// Status

const status = document.createElement("div");

status.id = "status";
status.textContent = "Ready";

editor.appendChild(status);

function setStatus(message) {
    status.textContent = message;
}

// Project files

const projectFiles = [];
let activeProjectFile = 0;
let nextProjectFileId = 1;

const projectFileBar = document.createElement("div");
projectFileBar.id = "project-file-bar";

const projectFileSelect = document.createElement("select");
projectFileSelect.id = "project-file-select";
projectFileSelect.title = "Active project file";

projectFileBar.appendChild(projectFileSelect);
editor.insertBefore(projectFileBar, viewport);

function makeProjectFile(name, imageData = null) {
    return {
        id: nextProjectFileId++,
        name,
        imageData,
        frames: [imageData],
        fps: DEFAULT_ANIMATION_FPS
    };
}

function syncActiveProjectFile() {
    const file = projectFiles.find(item => item.id === activeProjectFile);

    if (file) {
        const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
        file.frames[currentFrameIndex] = imageData;
        file.imageData = imageData;
    }
}

function updateProjectFileList() {
    projectFileSelect.replaceChildren();

    for (const file of projectFiles) {
        const option = document.createElement("option");
        option.value = String(file.id);
        option.textContent = file.name;
        projectFileSelect.appendChild(option);
    }

    projectFileSelect.value = String(activeProjectFile);
    updateAnimationTimeline();
}

function resetEditorHistory() {
    undoStack = [];
    redoStack = [];
    updateHistoryButtons();
    selection = null;
    selectionClipboard = null;
    movingSelection = false;
    selectionImage = null;
    clearPreview();
}

function switchProjectFile(id) {
    const target = projectFiles.find(file => file.id === Number(id));
    if (!target || target.id === activeProjectFile) return;

    stopAnimation();
    syncActiveProjectFile();
    activeProjectFile = target.id;
    currentFrameIndex = 0;

    ctx.putImageData(target.frames[0], 0, 0);
    resetEditorHistory();
    updateProjectFileList();
    setStatus("Opened " + target.name);
}

projectFileSelect.addEventListener("change", () => {
    switchProjectFile(projectFileSelect.value);
});

function createProjectFile(name = "untitled.png") {
    stopAnimation();
    syncActiveProjectFile();

    const imageData = ctx.createImageData(WIDTH, HEIGHT);
    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 0;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 255;
    }

    const file = makeProjectFile(name, imageData);
    projectFiles.push(file);
    activeProjectFile = file.id;
    currentFrameIndex = 0;
    ctx.putImageData(imageData, 0, 0);

    resetEditorHistory();
    updateProjectFileList();
    setStatus("Created " + file.name);
}

const newProjectFileName = document.createElement("input");
newProjectFileName.id = "new-project-file-name";
newProjectFileName.type = "text";
newProjectFileName.placeholder = "New image name (optional)";
newProjectFileName.setAttribute("aria-label", "New image filename");
projectFileBar.appendChild(newProjectFileName);

function createNamedProjectFile() {
    let name = newProjectFileName.value.trim();

    if (!name) {
        let suffix = 1;
        name = "untitled.png";

        while (projectFiles.some(file => file.name === name)) {
            suffix++;
            name = `untitled-${suffix}.png`;
        }
    }

    createProjectFile(name);
    newProjectFileName.value = "";
}

makeButton("New File", createNamedProjectFile, projectFileBar);
newProjectFileName.addEventListener("keydown", event => {
    if (event.key === "Enter") createNamedProjectFile();
});

makeButton("Rename File", () => {
    const file = projectFiles.find(item => item.id === activeProjectFile);
    if (!file) return;

    const name = prompt("Rename image:", file.name);
    if (name === null) return;

    const cleanName = name.trim();
    if (!cleanName) {
        alert("A filename is required.");
        return;
    }

    file.name = cleanName;
    updateProjectFileList();
    setStatus("Renamed file to " + cleanName);
}, projectFileBar);

makeButton("Delete File", () => {
    if (projectFiles.length <= 1) {
        alert("A project must contain at least one image.");
        return;
    }

    const index = projectFiles.findIndex(file => file.id === activeProjectFile);
    if (index < 0) return;

    const file = projectFiles[index];
    if (!confirm("Delete " + file.name + "?")) return;

    stopAnimation();
    projectFiles.splice(index, 1);
    const next = projectFiles[Math.min(index, projectFiles.length - 1)];
    activeProjectFile = next.id;

    currentFrameIndex = 0;
    ctx.putImageData(next.frames[0], 0, 0);

    resetEditorHistory();
    updateProjectFileList();
    setStatus("Deleted " + file.name);
}, projectFileBar);

function loadProjectFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error("Project contains no image files");
    }

    stopAnimation();
    projectFiles.length = 0;

    for (const file of files) {
        const frames = file.frames || [file.imageData];
        const projectFile = makeProjectFile(
            file.name,
            frames[0],
        );
        projectFile.frames = frames;
        projectFile.fps = file.fps || DEFAULT_ANIMATION_FPS;
        projectFiles.push(projectFile);
    }

    activeProjectFile = projectFiles[0].id;
    currentFrameIndex = 0;
    ctx.putImageData(projectFiles[0].frames[0], 0, 0);
    resetEditorHistory();
    updateProjectFileList();
}

// History

function pushHistory() {
    undoStack.push(
        ctx.getImageData(0, 0, WIDTH, HEIGHT)
    );

    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }

    redoStack = [];

    updateHistoryButtons();
}

function updateHistoryButtons() {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
}

function undo() {
    if (undoStack.length === 0) return;

    redoStack.push(
        ctx.getImageData(0, 0, WIDTH, HEIGHT)
    );

    const previous = undoStack.pop();

    ctx.putImageData(previous, 0, 0);

    updateHistoryButtons();
    drawOnionSkin();
    setStatus("Undo");
}

function redo() {
    if (redoStack.length === 0) return;

    undoStack.push(
        ctx.getImageData(0, 0, WIDTH, HEIGHT)
    );

    const next = redoStack.pop();

    ctx.putImageData(next, 0, 0);

    updateHistoryButtons();
    drawOnionSkin();
    setStatus("Redo");
}

// History buttons

const undoButton = makeButton("Undo", undo);
const redoButton = makeButton("Redo", redo);

updateHistoryButtons();

// Tool selection

const toolButtons = {};

function selectTool(name) {
    tool = name;

    for (const [toolName, button] of Object.entries(toolButtons)) {
        button.classList.toggle("active", toolName === tool);
    }

    canvas.style.cursor =
        name === "eyedropper" ? "copy" :
        name === "selection" ? "crosshair" :
        "crosshair";

    setStatus("Tool: " + name);
}

function addTool(name, label) {
    toolButtons[name] = makeButton(label, () => {
        selectTool(name);
    });
}

addTool("pencil", "Pencil");
addTool("eraser", "Eraser");
addTool("fill", "Bucket Fill");
addTool("eyedropper", "Eyedropper");
addTool("line", "Line");
addTool("rectangle", "Rectangle");
addTool("filledRectangle", "Filled Rectangle");
addTool("circle", "Circle");
addTool("filledCircle", "Filled Circle");
addTool("selection", "Selection");
addTool("gradient", "Gradient");
addTool("stencil", "Stencil");

selectTool("pencil");

// Pencil sizes

const sizeContainer = document.createElement("div");

sizeContainer.id = "sizes";

editor.appendChild(sizeContainer);

const sizeLabel = document.createElement("span");

sizeLabel.className = "section-label";
sizeLabel.textContent = "Brush size:";

sizeContainer.appendChild(sizeLabel);

const sizeButtons = {};

function selectSize(size) {
    brushSize = size;

    for (const [value, button] of Object.entries(sizeButtons)) {
        button.classList.toggle(
            "active",
            Number(value) === size
        );
    }
}

for (const size of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) {
    sizeButtons[size] = makeButton(
        `${size}px`,
        () => selectSize(size),
        sizeContainer
    );
}

if (tool === "gradient") {
    drawLinearGradient(startX, startY, pos.x, pos.y, previewCtx);
}

selectSize(1);

// Zoom controls

const zoomControls = document.createElement("div");

zoomControls.id = "zoom-controls";

editor.appendChild(zoomControls);

const zoomLabel = document.createElement("span");

zoomLabel.className = "section-label";
zoomLabel.textContent = "Zoom:";

zoomControls.appendChild(zoomLabel);

const zoomValue = document.createElement("span");

zoomValue.id = "zoom-label";

zoomControls.appendChild(zoomValue);

function updateZoom() {
    const width = WIDTH * zoom;
    const height = HEIGHT * zoom;

    canvasWrapper.style.width = width + "px";
    canvasWrapper.style.height = height + "px";

    for (const element of [
        canvas,
        gridCanvas,
        onionCanvas,
        previewCanvas
    ]) {
        element.style.width = width + "px";
        element.style.height = height + "px";
    }

    zoomValue.textContent = zoom + "x";

    drawGrid();
    drawSelectionPreview();
}

makeButton("+", () => {
    zoom = Math.min(zoom + 1, 8);
    updateZoom();
}, zoomControls);

makeButton("-", () => {
    zoom = Math.max(zoom - 1, 1);
    updateZoom();
}, zoomControls);

makeButton("Reset Zoom", () => {
    zoom = 1;
    updateZoom();
}, zoomControls);

updateZoom();

// Animation editor

const animationEditor = document.createElement("section");
animationEditor.id = "animation-editor";

const animationControls = document.createElement("div");
animationControls.id = "animation-controls";
animationEditor.appendChild(animationControls);

const animationTimeline = document.createElement("div");
animationTimeline.id = "animation-timeline";
animationTimeline.setAttribute("aria-label", "Animation frames");
animationEditor.appendChild(animationTimeline);
editor.appendChild(animationEditor);

const fpsLabel = document.createElement("label");
fpsLabel.className = "section-label";
fpsLabel.htmlFor = "animation-fps";
fpsLabel.textContent = "FPS:";
animationControls.appendChild(fpsLabel);

const fpsInput = document.createElement("input");
fpsInput.id = "animation-fps";
fpsInput.type = "number";
fpsInput.min = "1";
fpsInput.max = "60";
fpsInput.value = String(DEFAULT_ANIMATION_FPS);
fpsInput.title = "Animation playback speed";
animationControls.appendChild(fpsInput);

const blankFrameButton = makeButton(
    "Blank Frame",
    () => addAnimationFrame(false),
    animationControls
);
const duplicateFrameButton = makeButton(
    "Duplicate Frame",
    () => addAnimationFrame(true),
    animationControls
);
const deleteFrameButton = makeButton(
    "Delete Frame",
    deleteAnimationFrame,
    animationControls
);
const playAnimationButton = makeButton(
    "Play",
    toggleAnimationPlayback,
    animationControls
);

const onionSkinLabel = document.createElement("label");
const onionSkinToggle = document.createElement("input");
onionSkinToggle.type = "checkbox";
onionSkinToggle.checked = true;
onionSkinToggle.addEventListener("change", drawOnionSkin);
onionSkinLabel.append(onionSkinToggle, " Onion skin");
animationControls.appendChild(onionSkinLabel);

function getActiveProjectFile() {
    return projectFiles.find(file => file.id === activeProjectFile);
}

function getAnimationFPS(file = getActiveProjectFile()) {
    return file ? file.fps : DEFAULT_ANIMATION_FPS;
}

function updateAnimationTimeline() {
    const file = getActiveProjectFile();
    animationTimeline.replaceChildren();

    if (!file) {
        drawOnionSkin();
        return;
    }

    fpsInput.value = String(file.fps);

    file.frames.forEach((frame, index) => {
        const button = document.createElement("button");
        button.className = "animation-frame";
        button.classList.toggle("active", index === currentFrameIndex);
        button.disabled = animationTimer !== null;
        button.title = `Go to frame ${index + 1}`;
        button.setAttribute("aria-label", `Frame ${index + 1}`);

        const thumbnail = document.createElement("canvas");
        thumbnail.width = 68;
        thumbnail.height = 48;
        const thumbnailCtx = thumbnail.getContext("2d");
        thumbnailCtx.imageSmoothingEnabled = false;
        animationThumbnailCtx.putImageData(frame, 0, 0);
        thumbnailCtx.drawImage(animationThumbnailSource, 0, 0, 68, 48);

        const label = document.createElement("span");
        label.textContent = String(index + 1);
        button.append(thumbnail, label);
        button.addEventListener("click", () => selectAnimationFrame(index));
        animationTimeline.appendChild(button);
    });

    const isPlaying = animationTimer !== null;
    blankFrameButton.disabled = isPlaying;
    duplicateFrameButton.disabled = isPlaying;
    deleteFrameButton.disabled = isPlaying || file.frames.length <= 1;
    fpsInput.disabled = isPlaying;
    onionSkinToggle.disabled = isPlaying;
    playAnimationButton.textContent = isPlaying ? "Stop" : "Play";
    canvas.style.pointerEvents = isPlaying ? "none" : "";
    drawOnionSkin();
}

function drawOnionSkin() {
    onionCtx.clearRect(0, 0, WIDTH, HEIGHT);

    const file = getActiveProjectFile();
    if (!onionSkinToggle.checked || animationTimer !== null || !file) return;

    const currentPixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const neighbors = [
        { frame: file.frames[currentFrameIndex - 1], color: [255, 64, 64] },
        { frame: file.frames[currentFrameIndex + 1], color: [64, 200, 255] }
    ];

    for (const neighbor of neighbors) {
        if (!neighbor.frame) continue;

        const ghost = onionCtx.createImageData(WIDTH, HEIGHT);
        const source = neighbor.frame.data;

        for (let i = 0; i < source.length; i += 4) {
            if (
                source[i] === currentPixels[i] &&
                source[i + 1] === currentPixels[i + 1] &&
                source[i + 2] === currentPixels[i + 2] &&
                source[i + 3] === currentPixels[i + 3]
            ) {
                continue;
            }

            ghost.data[i] = neighbor.color[0];
            ghost.data[i + 1] = neighbor.color[1];
            ghost.data[i + 2] = neighbor.color[2];
            ghost.data[i + 3] = Math.round(source[i + 3] * 0.45);
        }

        onionCtx.putImageData(ghost, 0, 0);
    }
}

function selectAnimationFrame(index) {
    const file = getActiveProjectFile();
    if (!file || index < 0 || index >= file.frames.length) return;

    syncActiveProjectFile();
    currentFrameIndex = index;
    ctx.putImageData(file.frames[currentFrameIndex], 0, 0);
    resetEditorHistory();
    updateAnimationTimeline();
    setStatus(`Frame ${currentFrameIndex + 1} of ${file.frames.length}`);
}

function addAnimationFrame(duplicate) {
    const file = getActiveProjectFile();
    if (!file) return;
    if (file.frames.length >= 10000) {
        setStatus("An animation cannot exceed 10000 frames");
        return;
    }

    syncActiveProjectFile();
    const source = file.frames[currentFrameIndex];
    const frame = ctx.createImageData(WIDTH, HEIGHT);

    if (duplicate) {
        frame.data.set(source.data);
    } else {
        for (let i = 0; i < frame.data.length; i += 4) {
            frame.data[i] = 0;
            frame.data[i + 1] = 0;
            frame.data[i + 2] = 0;
            frame.data[i + 3] = 255;
        }
    }

    file.frames.splice(currentFrameIndex + 1, 0, frame);
    currentFrameIndex++;
    ctx.putImageData(frame, 0, 0);
    resetEditorHistory();
    updateAnimationTimeline();
    setStatus(duplicate ? "Frame duplicated" : "Blank frame added");
}

function deleteAnimationFrame() {
    const file = getActiveProjectFile();
    if (!file || file.frames.length <= 1) return;

    stopAnimation();
    file.frames.splice(currentFrameIndex, 1);
    currentFrameIndex = Math.min(currentFrameIndex, file.frames.length - 1);
    ctx.putImageData(file.frames[currentFrameIndex], 0, 0);
    resetEditorHistory();
    updateAnimationTimeline();
    setStatus("Frame deleted");
}

function stopAnimation() {
    if (animationTimer !== null) {
        clearInterval(animationTimer);
        animationTimer = null;
    }

    updateAnimationTimeline();
}

function toggleAnimationPlayback() {
    if (animationTimer !== null) {
        stopAnimation();
        setStatus("Animation stopped");
        return;
    }

    const file = getActiveProjectFile();
    if (!file) return;

    syncActiveProjectFile();
    animationTimer = setInterval(() => {
        const activeFile = getActiveProjectFile();
        if (!activeFile) {
            stopAnimation();
            return;
        }

        syncActiveProjectFile();
        currentFrameIndex = (currentFrameIndex + 1) % activeFile.frames.length;
        ctx.putImageData(activeFile.frames[currentFrameIndex], 0, 0);
        resetEditorHistory();
        updateSelectedAnimationFrame();
    }, 1000 / getAnimationFPS(file));

    updateAnimationTimeline();
    setStatus("Playing animation");
}

fpsInput.addEventListener("change", () => {
    const file = getActiveProjectFile();
    if (!file) return;

    const fps = Number(fpsInput.value);
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
        fpsInput.value = String(file.fps);
        setStatus("FPS must be between 1 and 60");
        return;
    }

    file.fps = fps;
    setStatus(`Playback speed set to ${fps} FPS`);
});

const animationThumbnailSource = document.createElement("canvas");
animationThumbnailSource.width = WIDTH;
animationThumbnailSource.height = HEIGHT;
const animationThumbnailCtx = animationThumbnailSource.getContext("2d");

function updateSelectedAnimationFrame() {
    for (const [index, button] of animationTimeline.children.entries()) {
        button.classList.toggle("active", index === currentFrameIndex);
    }
}

// Grid

function drawGrid() {
    gridCtx.clearRect(0, 0, WIDTH, HEIGHT);

    if (!showGrid) return;

    gridCtx.beginPath();

    for (let x = 0; x <= WIDTH; x++) {
        gridCtx.moveTo(x + 0.5, 0);
        gridCtx.lineTo(x + 0.5, HEIGHT);
    }

    for (let y = 0; y <= HEIGHT; y++) {
        gridCtx.moveTo(0, y + 0.5);
        gridCtx.lineTo(WIDTH, y + 0.5);
    }

    gridCtx.strokeStyle = "rgba(255,255,255,0.18)";
    gridCtx.lineWidth = 1;
    gridCtx.stroke();
}

makeButton("Toggle Grid", () => {
    showGrid = !showGrid;
    drawGrid();

    setStatus(showGrid ? "Grid enabled" : "Grid disabled");
});

// Clear canvas

makeButton("Clear", () => {
    if (!confirm("Clear the entire canvas?")) return;

    stopAnimation();
    pushHistory();

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    selection = null;
    clearPreview();
    drawOnionSkin();

    setStatus("Canvas cleared");
});

// Save PNG

makeButton("Save PNG", () => {
    const link = document.createElement("a");

    link.download = "artwork.png";
    link.href = canvas.toDataURL("image/png");

    link.click();

    setStatus("PNG exported");
});

// Save project

makeButton("Save Project", saveProject);

// Image loading

const fileInput = document.createElement("input");

fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.hidden = true;

editor.appendChild(fileInput);

makeButton("Load Image", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (!file) return;

    stopAnimation();
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
        pushHistory();

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

        selection = null;
        clearPreview();
        drawOnionSkin();

        URL.revokeObjectURL(url);

        fileInput.value = "";

        setStatus("Image loaded");
    };

    image.onerror = () => {
        alert("Could not load image.");

        URL.revokeObjectURL(url);
        fileInput.value = "";
    };

    image.src = url;
});

// Project loading

const projectInput = document.createElement("input");

projectInput.type = "file";
projectInput.accept = ".fizzpixl,.json,application/json,application/x-fizzpixl";
projectInput.hidden = true;

editor.appendChild(projectInput);

makeButton("Load Project", () => {
    projectInput.click();
});

projectInput.addEventListener("change", async () => {
    const file = projectInput.files[0];
    if (!file) return;

    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const isFZPX =
            bytes.length >= 4 &&
            bytes[0] === 0x46 &&
            bytes[1] === 0x5a &&
            bytes[2] === 0x50 &&
            bytes[3] === 0x58;

        if (isFZPX) {
            const header = FZPX.read(bytes);

            if (
                header.fileCount < 1 ||
                header.fileCount > 10000 ||
                header.metadataOffset < header.headerSize ||
                header.metadataOffset >= bytes.length
            ) {
                throw new Error("Invalid FZPX file table");
            }

            const metadataBytes = bytes.subarray(header.metadataOffset);
            const metadata = JSON.parse(
                new TextDecoder().decode(metadataBytes)
            );

            const isAnimationProject =
                metadata.version === "0.5.0" ||
                metadata.version === "0.6.0" ||
                metadata.version === "0.7.0";
            if (
                metadata.format !== "Fizzpixl" ||
                (!isAnimationProject && metadata.version !== "0.4.0") ||
                metadata.width !== WIDTH ||
                metadata.height !== HEIGHT ||
                !Array.isArray(metadata.files)
            ) {
                throw new Error("Invalid Fizzpixl project metadata");
            }

            const entries = [];
            for (const fileEntry of metadata.files) {
                if (
                    typeof fileEntry.name !== "string" ||
                    !fileEntry.name.trim()
                ) {
                    throw new Error("Invalid image entry in project");
                }

                const frames = isAnimationProject
                    ? fileEntry.frames
                    : [fileEntry];

                if (
                    !Array.isArray(frames) ||
                    frames.length === 0 ||
                    (isAnimationProject && (
                        !Number.isInteger(fileEntry.fps) ||
                        fileEntry.fps < 1 ||
                        fileEntry.fps > 60
                    ))
                ) {
                    throw new Error("Invalid animation frames in project");
                }

                entries.push({
                    name: fileEntry.name,
                    fps: isAnimationProject
                        ? fileEntry.fps
                        : DEFAULT_ANIMATION_FPS,
                    frames
                });
            }

            const imageCount = entries.reduce(
                (total, fileEntry) => total + fileEntry.frames.length,
                0
            );
            if (imageCount !== header.fileCount || imageCount > 10000) {
                throw new Error("Invalid FZPX image count");
            }

            const loadedFiles = [];

            for (const fileEntry of entries) {
                const loadedFrames = [];

                for (const entry of fileEntry.frames) {
                    if (
                        entry.type !== "image/png" ||
                        !Number.isSafeInteger(entry.offset) ||
                        !Number.isSafeInteger(entry.size) ||
                        entry.offset < header.headerSize ||
                        entry.size <= 0 ||
                        entry.offset + entry.size > header.metadataOffset
                    ) {
                        throw new Error("Invalid image entry in project");
                    }

                    const pngBytes = bytes.slice(
                        entry.offset,
                        entry.offset + entry.size
                    );

                    const imageBlob = new Blob([pngBytes], {
                        type: "image/png"
                    });

                    const imageUrl = URL.createObjectURL(imageBlob);

                    try {
                        const image = await new Promise((resolve, reject) => {
                            const loadedImage = new Image();
                            loadedImage.onload = () => resolve(loadedImage);
                            loadedImage.onerror = () => reject(
                                new Error(
                                    "Could not decode " + fileEntry.name
                                )
                            );
                            loadedImage.src = imageUrl;
                        });

                        const tempCanvas = document.createElement("canvas");
                        tempCanvas.width = WIDTH;
                        tempCanvas.height = HEIGHT;

                        const tempCtx = tempCanvas.getContext("2d", {
                            willReadFrequently: true
                        });

                        tempCtx.fillStyle = "#000000";
                        tempCtx.fillRect(0, 0, WIDTH, HEIGHT);
                        tempCtx.drawImage(image, 0, 0, WIDTH, HEIGHT);
                        loadedFrames.push(
                            tempCtx.getImageData(0, 0, WIDTH, HEIGHT)
                        );
                    } finally {
                        URL.revokeObjectURL(imageUrl);
                    }
                }

                loadedFiles.push({
                    name: fileEntry.name,
                    fps: fileEntry.fps,
                    frames: loadedFrames
                });
            }

            loadProjectFiles(loadedFiles);
            setStatus(
                `Loaded FZPX project (${loadedFiles.length} files, ${imageCount} frames)`
            );
        } else {
            // Backward compatibility with 0.3.0 JSON projects.
            const project = JSON.parse(
                new TextDecoder().decode(bytes)
            );

            if (
                project.format !== "Fizzpixl" ||
                project.width !== WIDTH ||
                project.height !== HEIGHT ||
                typeof project.image !== "string"
            ) {
                throw new Error("Invalid Fizzpixl project");
            }

            const image = await new Promise((resolve, reject) => {
                const loadedImage = new Image();
                loadedImage.onload = () => resolve(loadedImage);
                loadedImage.onerror = () => reject(
                    new Error("Invalid project image")
                );
                loadedImage.src = project.image;
            });

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = WIDTH;
            tempCanvas.height = HEIGHT;

            const tempCtx = tempCanvas.getContext("2d", {
                willReadFrequently: true
            });

            tempCtx.fillStyle = "#000000";
            tempCtx.fillRect(0, 0, WIDTH, HEIGHT);
            tempCtx.drawImage(image, 0, 0, WIDTH, HEIGHT);

            loadProjectFiles([{
                name: "artwork.png",
                imageData: tempCtx.getImageData(0, 0, WIDTH, HEIGHT)
            }]);

            setStatus("Loaded legacy 0.3.0 project");
        }
    } catch (error) {
        alert("Could not load project: " + error.message);
    } finally {
        projectInput.value = "";
    }
});

// Color palette

const palette = document.createElement("div");

palette.id = "palette";

editor.insertBefore(palette, viewport);

const colors = [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#ff00ff",
    "#00ffff",
    "#ff8000",
    "#804000",
    "#808080",
    "#c0c0c0",
    "#800080",
    "#008000",
    "#000080",
    "#ffc0cb"
];

// Custom color picker

const colorPicker = document.createElement("input");

colorPicker.type = "color";
colorPicker.id = "color-picker";
colorPicker.value = color;
colorPicker.title = "Custom color";

function selectColor(newColor) {
    color = newColor;
    colorPicker.value = color;
    hexColorInput.value = color;
}

for (const paletteColor of colors) {
    const swatch = document.createElement("button");

    swatch.className = "swatch";
    swatch.style.backgroundColor = paletteColor;
    swatch.title = paletteColor;

    swatch.addEventListener("click", () => {
        selectColor(paletteColor);
    });

    palette.appendChild(swatch);
}

colorPicker.addEventListener("input", () => {
    selectColor(colorPicker.value);
});

palette.appendChild(colorPicker);

// Stencil editor and library

const stencils = [];

const stencilEditor = document.createElement("details");
stencilEditor.id = "stencil-editor";

const stencilSummary = document.createElement("summary");
stencilSummary.textContent = "Stencil editor and library";
stencilEditor.appendChild(stencilSummary);

const stencilControls = document.createElement("div");
stencilControls.id = "stencil-controls";
stencilEditor.appendChild(stencilControls);

const stencilSelect = document.createElement("select");
stencilSelect.id = "stencil-select";
stencilSelect.setAttribute("aria-label", "Saved stencils");
stencilControls.appendChild(stencilSelect);

const stencilNameInput = document.createElement("input");
stencilNameInput.id = "stencil-name";
stencilNameInput.type = "text";
stencilNameInput.placeholder = "Stencil name";
stencilNameInput.setAttribute("aria-label", "Stencil name");
stencilControls.appendChild(stencilNameInput);

const stencilCanvas = document.createElement("canvas");
stencilCanvas.id = "stencil-editor-canvas";
stencilCanvas.width = STENCIL_SIZE;
stencilCanvas.height = STENCIL_SIZE;
stencilCanvas.setAttribute("aria-label", "32 by 32 stencil drawing area");
stencilEditor.appendChild(stencilCanvas);
const stencilCtx = stencilCanvas.getContext("2d");
let stencilPixels = new Uint8Array(STENCIL_SIZE * STENCIL_SIZE);
let drawingStencil = false;

const saveStencilButton = makeButton(
    "Save Stencil",
    saveStencil,
    stencilControls
);
const deleteStencilButton = makeButton(
    "Delete Stencil",
    deleteSelectedStencil,
    stencilControls
);
const exportStencilButton = makeButton(
    "Export Stencil",
    exportSelectedStencil,
    stencilControls
);
const importStencilButton = makeButton(
    "Import Stencil",
    () => stencilImportInput.click(),
    stencilControls
);
const stencilImportInput = document.createElement("input");
stencilImportInput.type = "file";
stencilImportInput.accept = ".json,application/json";
stencilImportInput.hidden = true;
stencilEditor.appendChild(stencilImportInput);

stencilSelect.addEventListener("change", () => {
    const stencil = getSelectedStencil();
    stencilPixels = stencil
        ? Uint8Array.from(stencil.pixels)
        : new Uint8Array(STENCIL_SIZE * STENCIL_SIZE);
    stencilNameInput.value = stencil ? stencil.name : "";
    redrawStencilEditor();
});

function getSelectedStencil() {
    return stencils.find(stencil => stencil.id === stencilSelect.value);
}

function redrawStencilEditor() {
    stencilCtx.fillStyle = "#171717";
    stencilCtx.fillRect(0, 0, STENCIL_SIZE, STENCIL_SIZE);

    for (let y = 0; y < STENCIL_SIZE; y++) {
        for (let x = 0; x < STENCIL_SIZE; x++) {
            if (stencilPixels[y * STENCIL_SIZE + x]) {
                stencilCtx.fillStyle = "#5ee7a1";
                stencilCtx.fillRect(x, y, 1, 1);
            }
        }
    }

    stencilCtx.strokeStyle = "rgba(255,255,255,0.12)";
    stencilCtx.lineWidth = 0.04;
    for (let i = 0; i <= STENCIL_SIZE; i++) {
        stencilCtx.beginPath();
        stencilCtx.moveTo(i, 0);
        stencilCtx.lineTo(i, STENCIL_SIZE);
        stencilCtx.stroke();
        stencilCtx.beginPath();
        stencilCtx.moveTo(0, i);
        stencilCtx.lineTo(STENCIL_SIZE, i);
        stencilCtx.stroke();
    }
}

function updateStencilSelect(selectedId = stencilSelect.value) {
    stencilSelect.replaceChildren();

    for (const stencil of stencils) {
        const option = document.createElement("option");
        option.value = stencil.id;
        option.textContent = stencil.name;
        stencilSelect.appendChild(option);
    }

    if (stencils.some(stencil => stencil.id === selectedId)) {
        stencilSelect.value = selectedId;
    }

    const selected = getSelectedStencil();
    deleteStencilButton.disabled = !selected;
    exportStencilButton.disabled = !selected;
    if (selected) {
        stencilNameInput.value = selected.name;
        stencilPixels = Uint8Array.from(selected.pixels);
    } else {
        stencilNameInput.value = "";
        stencilPixels = new Uint8Array(STENCIL_SIZE * STENCIL_SIZE);
    }

    redrawStencilEditor();
}

function persistStencils() {
    try {
        localStorage.setItem(STENCIL_STORAGE_KEY, JSON.stringify(stencils));
        return true;
    } catch (error) {
        console.error("Could not save stencils to browser storage:", error);
        setStatus("Stencil changed, but could not be saved in browser storage");
        return false;
    }
}

function saveStencil() {
    const name = stencilNameInput.value.trim();
    if (!name) {
        setStatus("Enter a name for the stencil");
        stencilNameInput.focus();
        return;
    }

    if (!stencilPixels.some(pixel => pixel === 1)) {
        setStatus("Draw at least one pixel in the stencil editor");
        return;
    }

    const existing = getSelectedStencil();
    const stencil = {
        id: existing ? existing.id : `stencil-${Date.now()}-${Math.random()}`,
        name,
        width: STENCIL_SIZE,
        height: STENCIL_SIZE,
        pixels: Array.from(stencilPixels)
    };

    if (existing) {
        Object.assign(existing, stencil);
    } else {
        stencils.push(stencil);
    }

    updateStencilSelect(stencil.id);
    if (persistStencils()) setStatus(`Saved stencil "${name}"`);
}

function deleteSelectedStencil() {
    const stencil = getSelectedStencil();
    if (!stencil) return;

    const index = stencils.indexOf(stencil);
    stencils.splice(index, 1);
    updateStencilSelect(stencils[Math.max(0, index - 1)]?.id);
    if (persistStencils()) setStatus(`Deleted stencil "${stencil.name}"`);
}

function downloadStencil(stencil) {
    const blob = new Blob([JSON.stringify({
        format: "FizzpixlStencil",
        version: 1,
        name: stencil.name,
        width: stencil.width,
        height: stencil.height,
        pixels: stencil.pixels
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = stencil.name.replace(/[^a-z0-9-_]+/gi, "-") + ".stencil.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSelectedStencil() {
    const stencil = getSelectedStencil();
    if (stencil) downloadStencil(stencil);
}

function validateStencil(data) {
    if (
        !data ||
        data.format !== "FizzpixlStencil" ||
        data.version !== 1 ||
        typeof data.name !== "string" ||
        !data.name.trim() ||
        data.width !== STENCIL_SIZE ||
        data.height !== STENCIL_SIZE ||
        !Array.isArray(data.pixels) ||
        data.pixels.length !== STENCIL_SIZE * STENCIL_SIZE ||
        data.pixels.some(pixel => pixel !== 0 && pixel !== 1)
    ) {
        throw new Error("Invalid Fizzpixl stencil file");
    }

    return {
        id: `stencil-${Date.now()}-${Math.random()}`,
        name: data.name.trim(),
        width: STENCIL_SIZE,
        height: STENCIL_SIZE,
        pixels: data.pixels
    };
}

stencilImportInput.addEventListener("change", async () => {
    const file = stencilImportInput.files[0];
    if (!file) return;

    try {
        const stencil = validateStencil(JSON.parse(await file.text()));
        stencils.push(stencil);
        updateStencilSelect(stencil.id);
        if (persistStencils()) setStatus(`Imported stencil "${stencil.name}"`);
    } catch (error) {
        console.error("Could not import stencil:", error);
        setStatus("Could not import stencil: " + error.message);
    } finally {
        stencilImportInput.value = "";
    }
});

function stencilEditorPosition(event) {
    const rect = stencilCanvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(STENCIL_SIZE - 1,
            Math.floor((event.clientX - rect.left) * STENCIL_SIZE / rect.width))),
        y: Math.max(0, Math.min(STENCIL_SIZE - 1,
            Math.floor((event.clientY - rect.top) * STENCIL_SIZE / rect.height)))
    };
}

function paintStencilEditor(event) {
    const { x, y } = stencilEditorPosition(event);
    stencilPixels[y * STENCIL_SIZE + x] = event.buttons & 2 ? 0 : 1;
    redrawStencilEditor();
}

function stampSelectedStencil(x, y) {
    const stencil = getSelectedStencil();
    if (!stencil) {
        setStatus("Create or import a stencil first");
        return false;
    }

    pushHistory();
    const left = x - Math.floor(stencil.width / 2);
    const top = y - Math.floor(stencil.height / 2);

    for (let sy = 0; sy < stencil.height; sy++) {
        for (let sx = 0; sx < stencil.width; sx++) {
            if (stencil.pixels[sy * stencil.width + sx]) {
                ctx.fillStyle = color;
                ctx.fillRect(left + sx, top + sy, 1, 1);
            }
        }
    }

    drawOnionSkin();
    setStatus(`Stamped stencil "${stencil.name}"`);
    return true;
}

stencilCanvas.addEventListener("contextmenu", event => event.preventDefault());
stencilCanvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    drawingStencil = true;
    stencilCanvas.setPointerCapture(event.pointerId);
    paintStencilEditor(event);
});
stencilCanvas.addEventListener("pointermove", event => {
    if (drawingStencil) paintStencilEditor(event);
});
stencilCanvas.addEventListener("pointerup", () => {
    drawingStencil = false;
});
stencilCanvas.addEventListener("pointercancel", () => {
    drawingStencil = false;
});

function loadStoredStencils() {
    try {
        const saved = localStorage.getItem(STENCIL_STORAGE_KEY);
        if (saved === null) return;

        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) {
            throw new Error("Stencil storage must contain a list");
        }

        const loadedStencils = [];
        for (const entry of parsed) {
            const validated = validateStencil({
                ...entry,
                format: "FizzpixlStencil",
                version: 1
            });
            validated.id = typeof entry.id === "string"
                ? entry.id
                : validated.id;
            loadedStencils.push(validated);
        }
        stencils.push(...loadedStencils);
    } catch (error) {
        console.error("Could not load saved stencils:", error);
        stencilStorageWarning = "Could not load saved stencils: " + error.message;
        setStatus(stencilStorageWarning);
    }
}

let stencilStorageWarning = null;
loadStoredStencils();
updateStencilSelect();
redrawStencilEditor();
editor.appendChild(stencilEditor);

const colorControls = document.createElement("div");
colorControls.id = "color-controls";
editor.insertBefore(colorControls, viewport);

const hexColorLabel = document.createElement("label");
hexColorLabel.htmlFor = "hex-color-input";
hexColorLabel.textContent = "Color:";
colorControls.appendChild(hexColorLabel);

const hexColorInput = document.createElement("input");
hexColorInput.id = "hex-color-input";
hexColorInput.className = "color-input";
hexColorInput.type = "text";
hexColorInput.value = color;
hexColorInput.placeholder = "#RRGGBB";
hexColorInput.maxLength = 7;
hexColorInput.setAttribute("aria-label", "Current color in hexadecimal");
colorControls.appendChild(hexColorInput);

const gradientEndLabel = document.createElement("label");
gradientEndLabel.htmlFor = "gradient-end-color";
gradientEndLabel.textContent = "Gradient to:";
colorControls.appendChild(gradientEndLabel);

const gradientEndInput = document.createElement("input");
gradientEndInput.id = "gradient-end-color";
gradientEndInput.className = "color-input";
gradientEndInput.type = "text";
gradientEndInput.value = gradientEndColor;
gradientEndInput.placeholder = "#RRGGBB";
gradientEndInput.maxLength = 7;
gradientEndInput.setAttribute("aria-label", "Gradient end color in hexadecimal");
colorControls.appendChild(gradientEndInput);

function normalizeHexColor(value) {
    const trimmed = value.trim();
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
    if (!match) return null;

    const digits = match[1].length === 3
        ? [...match[1]].map(digit => digit + digit).join("")
        : match[1];

    return "#" + digits.toLowerCase();
}

hexColorInput.addEventListener("change", () => {
    const normalized = normalizeHexColor(hexColorInput.value);
    if (!normalized) {
        hexColorInput.value = color;
        setStatus("Enter a valid hex color, such as #f80 or #ff8800");
        return;
    }

    selectColor(normalized);
    setStatus("Color set to " + normalized);
});

gradientEndInput.addEventListener("change", () => {
    const normalized = normalizeHexColor(gradientEndInput.value);
    if (!normalized) {
        gradientEndInput.value = gradientEndColor;
        setStatus("Enter a valid gradient hex color, such as #f80 or #ff8800");
        return;
    }

    gradientEndColor = normalized;
    gradientEndInput.value = normalized;
});

// Coordinate conversion

function getPixelPosition(event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: Math.max(
            0,
            Math.min(
                WIDTH - 1,
                Math.floor(
                    (event.clientX - rect.left) * WIDTH / rect.width
                )
            )
        ),

        y: Math.max(
            0,
            Math.min(
                HEIGHT - 1,
                Math.floor(
                    (event.clientY - rect.top) * HEIGHT / rect.height
                )
            )
        )
    };
}

// Pixel drawing

function drawPixel(x, y) {
    ctx.fillStyle = tool === "eraser" ? "#000000" : color;

    const size = brushSize;

    ctx.fillRect(
        x - Math.floor(size / 2),
        y - Math.floor(size / 2),
        size,
        size
    );
}

// Line drawing

function drawLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);

    const steps = Math.max(dx, dy, 1);

    for (let i = 0; i <= steps; i++) {
        const x = Math.round(x0 + (x1 - x0) * i / steps);
        const y = Math.round(y0 + (y1 - y0) * i / steps);

        drawPixel(x, y);
    }
}

function drawLinearGradient(x0, y0, x1, y1, target = ctx) {
    if (target === previewCtx) {
        target.clearRect(0, 0, WIDTH, HEIGHT);
    }

    const gradient = target.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, gradientEndColor);
    target.fillStyle = gradient;
    target.fillRect(0, 0, WIDTH, HEIGHT);
}

// Bucket fill

function floodFill(startX, startY) {
    const imageData = ctx.getImageData(
        0, 0, WIDTH, HEIGHT
    );

    const pixels = imageData.data;

    const startIndex = (startY * WIDTH + startX) * 4;

    const targetR = pixels[startIndex];
    const targetG = pixels[startIndex + 1];
    const targetB = pixels[startIndex + 2];
    const targetA = pixels[startIndex + 3];

    const fillR = parseInt(color.slice(1, 3), 16);
    const fillG = parseInt(color.slice(3, 5), 16);
    const fillB = parseInt(color.slice(5, 7), 16);

    if (
        targetR === fillR &&
        targetG === fillG &&
        targetB === fillB &&
        targetA === 255
    ) {
        return;
    }

    pushHistory();

    const visited = new Uint8Array(WIDTH * HEIGHT);
    const queue = new Int32Array(WIDTH * HEIGHT);

    let head = 0;
    let tail = 0;

    const start = startY * WIDTH + startX;

    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
        const position = queue[head++];

        const x = position % WIDTH;
        const y = Math.floor(position / WIDTH);
        const index = position * 4;

        if (
            pixels[index] !== targetR ||
            pixels[index + 1] !== targetG ||
            pixels[index + 2] !== targetB ||
            pixels[index + 3] !== targetA
        ) {
            continue;
        }

        pixels[index] = fillR;
        pixels[index + 1] = fillG;
        pixels[index + 2] = fillB;
        pixels[index + 3] = 255;

        const neighbors = [];

        if (x > 0) neighbors.push(position - 1);
        if (x < WIDTH - 1) neighbors.push(position + 1);
        if (y > 0) neighbors.push(position - WIDTH);
        if (y < HEIGHT - 1) neighbors.push(position + WIDTH);

        for (const next of neighbors) {
            if (!visited[next]) {
                visited[next] = 1;
                queue[tail++] = next;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);

    drawOnionSkin();
    setStatus("Area filled");
}

// Rectangle

function drawRectangle(x0, y0, x1, y1, filled) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);

    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);

    if (filled) {
        ctx.fillStyle = color;
        ctx.fillRect(left, top, width + 1, height + 1);
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.strokeRect(left, top, width, height);
    }
}

// Circle

function drawCircle(x0, y0, x1, y1, filled) {
    const radius = Math.sqrt(
        (x1 - x0) ** 2 + (y1 - y0) ** 2
    );

    ctx.beginPath();

    ctx.arc(
        x0,
        y0,
        radius,
        0,
        Math.PI * 2
    );

    if (filled) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.stroke();
    }
}

// Draw shape

function drawShape(x0, y0, x1, y1, target = ctx) {
    if (target === ctx) {
        switch (tool) {
            case "line":
                drawLine(x0, y0, x1, y1);
                break;

            case "rectangle":
                drawRectangle(x0, y0, x1, y1, false);
                break;

            case "filledRectangle":
                drawRectangle(x0, y0, x1, y1, true);
                break;

            case "circle":
                drawCircle(x0, y0, x1, y1, false);
                break;

            case "filledCircle":
                drawCircle(x0, y0, x1, y1, true);
                break;
        }

        return;
    }

    target.clearRect(0, 0, WIDTH, HEIGHT);

    target.strokeStyle = color;
    target.fillStyle = color;
    target.lineWidth = brushSize;

    switch (tool) {
        case "line":
            target.beginPath();
            target.moveTo(x0, y0);
            target.lineTo(x1, y1);
            target.stroke();
            break;

        case "rectangle":
            target.strokeRect(
                Math.min(x0, x1),
                Math.min(y0, y1),
                Math.abs(x1 - x0),
                Math.abs(y1 - y0)
            );
            break;

        case "filledRectangle":
            target.fillRect(
                Math.min(x0, x1),
                Math.min(y0, y1),
                Math.abs(x1 - x0) + 1,
                Math.abs(y1 - y0) + 1
            );
            break;

        case "circle":
            target.beginPath();
            target.arc(
                x0,
                y0,
                Math.hypot(x1 - x0, y1 - y0),
                0,
                Math.PI * 2
            );
            target.stroke();
            break;

        case "filledCircle":
            target.beginPath();
            target.arc(
                x0,
                y0,
                Math.hypot(x1 - x0, y1 - y0),
                0,
                Math.PI * 2
            );
            target.fill();
            break;
    }
}

// Preview

function clearPreview() {
    previewCtx.clearRect(0, 0, WIDTH, HEIGHT);
}

function drawSelectionPreview() {
    clearPreview();

    if (!selection) return;

    previewCtx.save();

    previewCtx.strokeStyle = "#ffffff";
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([4, 3]);

    previewCtx.strokeRect(
        selection.x + 0.5,
        selection.y + 0.5,
        selection.w,
        selection.h
    );

    previewCtx.restore();
}

// Selection

function insideSelection(x, y) {
    return selection &&
        x >= selection.x &&
        y >= selection.y &&
        x < selection.x + selection.w &&
        y < selection.y + selection.h;
}

function copySelection(cut = false) {
    if (!selection) return;

    selectionClipboard = ctx.getImageData(
        selection.x,
        selection.y,
        selection.w,
        selection.h
    );

    if (cut) {
        pushHistory();

        ctx.fillStyle = "#000000";

        ctx.fillRect(
            selection.x,
            selection.y,
            selection.w,
            selection.h
        );

        drawOnionSkin();
        setStatus("Selection cut");
    } else {
        setStatus("Selection copied");
    }
}

function pasteSelection() {
    if (!selectionClipboard) return;

    pushHistory();

    const x = selection
        ? Math.min(selection.x + 10, WIDTH - 1)
        : 10;

    const y = selection
        ? Math.min(selection.y + 10, HEIGHT - 1)
        : 10;

    ctx.putImageData(selectionClipboard, x, y);

    selection = {
        x,
        y,
        w: selectionClipboard.width,
        h: selectionClipboard.height
    };

    drawSelectionPreview();
    drawOnionSkin();

    setStatus("Selection pasted");
}

// Eyedropper

function pickColor(x, y) {
    const pixel = ctx.getImageData(x, y, 1, 1).data;

    const hex = "#" +
        [pixel[0], pixel[1], pixel[2]]
            .map(value => value.toString(16).padStart(2, "0"))
            .join("");

    selectColor(hex);

    setStatus("Picked color: " + hex);
}

// Pointer events

canvas.addEventListener("pointerdown", event => {
    if (animationTimer !== null) return;
    if (event.button !== 0) return;

    const pos = getPixelPosition(event);

    startX = pos.x;
    startY = pos.y;

    lastX = pos.x;
    lastY = pos.y;

    if (tool === "eyedropper") {
        pickColor(pos.x, pos.y);
        return;
    }

    if (tool === "fill") {
        floodFill(pos.x, pos.y);
        return;
    }

    if (tool === "stencil") {
        stampSelectedStencil(pos.x, pos.y);
        return;
    }

    if (tool === "selection") {
        drawing = true;

        canvas.setPointerCapture(event.pointerId);

        if (insideSelection(pos.x, pos.y)) {
            movingSelection = true;

            selectionImage = ctx.getImageData(
                selection.x,
                selection.y,
                selection.w,
                selection.h
            );

            pushHistory();
        } else {
            movingSelection = false;
            selection = null;
            clearPreview();
        }

        return;
    }

    drawing = true;

    canvas.setPointerCapture(event.pointerId);

    pushHistory();

    if (tool === "pencil" || tool === "eraser") {
        drawPixel(pos.x, pos.y);
    }
});

canvas.addEventListener("pointermove", event => {
    if (animationTimer !== null) return;
    const pos = getPixelPosition(event);

    if (!drawing) return;

    if (tool === "pencil" || tool === "eraser") {
        drawLine(lastX, lastY, pos.x, pos.y);
    }

    if (
        tool === "line" ||
        tool === "rectangle" ||
        tool === "filledRectangle" ||
        tool === "circle" ||
        tool === "filledCircle"
    ) {
        drawShape(
            startX,
            startY,
            pos.x,
            pos.y,
            previewCtx
        );
    }

    if (tool === "selection" && !movingSelection) {
        clearPreview();

        const left = Math.min(startX, pos.x);
        const top = Math.min(startY, pos.y);

        previewCtx.strokeStyle = "#ffffff";
        previewCtx.setLineDash([4, 3]);

        previewCtx.strokeRect(
            left + 0.5,
            top + 0.5,
            Math.abs(pos.x - startX) + 1,
            Math.abs(pos.y - startY) + 1
        );

        previewCtx.setLineDash([]);
    }

    if (tool === "selection" && movingSelection) {
        clearPreview();

        previewCtx.strokeStyle = "#ffffff";
        previewCtx.setLineDash([4, 3]);

        previewCtx.strokeRect(
            selection.x + pos.x - startX + 0.5,
            selection.y + pos.y - startY + 0.5,
            selection.w,
            selection.h
        );

        previewCtx.setLineDash([]);
    }

    lastX = pos.x;
    lastY = pos.y;
});

canvas.addEventListener("pointerup", event => {
    if (animationTimer !== null) return;
    if (!drawing) return;

    const pos = getPixelPosition(event);

    if (tool === "line" ||
        tool === "rectangle" ||
        tool === "filledRectangle" ||
        tool === "circle" ||
        tool === "filledCircle") {

        clearPreview();

        drawShape(startX, startY, pos.x, pos.y);
    }

    if (tool === "gradient") {
        clearPreview();
        drawLinearGradient(startX, startY, pos.x, pos.y);
        drawOnionSkin();
    }

    if (tool === "selection") {
        if (movingSelection) {
            const dx = pos.x - startX;
            const dy = pos.y - startY;

            ctx.fillStyle = "#000000";

            ctx.fillRect(
                selection.x,
                selection.y,
                selection.w,
                selection.h
            );

            ctx.putImageData(
                selectionImage,
                selection.x + dx,
                selection.y + dy
            );

            selection.x += dx;
            selection.y += dy;

            selection.x = Math.max(
                0,
                Math.min(WIDTH - 1, selection.x)
            );

            selection.y = Math.max(
                0,
                Math.min(HEIGHT - 1, selection.y)
            );

            selectionImage = null;
            movingSelection = false;

        } else {
            selection = {
                x: Math.min(startX, pos.x),
                y: Math.min(startY, pos.y),
                w: Math.abs(pos.x - startX) + 1,
                h: Math.abs(pos.y - startY) + 1
            };
        }

        drawSelectionPreview();
    }

    drawing = false;
    drawOnionSkin();
});

canvas.addEventListener("pointercancel", () => {
    drawing = false;
    movingSelection = false;
    clearPreview();
    drawOnionSkin();
});

// Keyboard shortcuts

document.addEventListener("keydown", event => {
    if (animationTimer !== null) {
        if (event.key === "Escape") stopAnimation();
        return;
    }

    if (event.target.matches("input, textarea, select")) {
        return;
    }

    const key = event.key.toLowerCase();

    if (event.ctrlKey || event.metaKey) {
        switch (key) {
            case "z":
                event.preventDefault();

                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }

                return;

            case "y":
                event.preventDefault();
                redo();
                return;

            case "s":
                event.preventDefault();

                if (event.shiftKey) {
                    exportPNG();
                } else {
                    saveProject();
                }

                return;

            case "c":
                if (selection) {
                    event.preventDefault();
                    copySelection(false);
                }
                return;

            case "x":
                if (selection) {
                    event.preventDefault();
                    copySelection(true);
                }
                return;

            case "v":
                if (selectionClipboard) {
                    event.preventDefault();
                    pasteSelection();
                }
                return;
        }
    }

    switch (key) {
        case "b":
            selectTool("pencil");
            break;

        case "e":
            selectTool("eraser");
            break;

        case "g":
            selectTool("fill");
            break;

        case "i":
            selectTool("eyedropper");
            break;

        case "l":
            selectTool("line");
            break;

        case "m":
            selectTool("selection");
            break;

        case "escape":
            selection = null;
            clearPreview();
            setStatus("Selection cleared");
            break;

        case "[":
            selectSize(Math.max(1, brushSize - 1));
            break;

        case "]":
            selectSize(Math.min(32, brushSize + 1));
            break;
    }
});

// Save functions used by keyboard shortcuts

function exportPNG() {
    const link = document.createElement("a");

    link.download = "artwork.png";
    link.href = canvas.toDataURL("image/png");

    link.click();

    setStatus("PNG exported");
}

async function saveProject() {
    stopAnimation();
    syncActiveProjectFile();

    if (projectFiles.length === 0) {
        setStatus("No project files to save");
        return;
    }

    const totalFrames = projectFiles.reduce(
        (total, file) => total + file.frames.length,
        0
    );
    if (totalFrames > 10000) {
        setStatus("A project cannot contain more than 10000 frames");
        return;
    }

    const imageBlobs = [];
    const metadataFiles = [];

    for (const file of projectFiles) {
        const metadataFrames = [];

        for (const frame of file.frames) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = WIDTH;
            tempCanvas.height = HEIGHT;
            tempCanvas.getContext("2d").putImageData(frame, 0, 0);

            const blob = await new Promise(resolve => {
                tempCanvas.toBlob(resolve, "image/png");
            });

            if (!blob) {
                setStatus("Failed to encode " + file.name);
                return;
            }

            imageBlobs.push(blob);
            metadataFrames.push(blob);
        }

        metadataFiles.push({
            name: file.name,
            fps: file.fps,
            frames: metadataFrames
        });
    }

    let offset = FZPX.HEADER_SIZE;
    let imageIndex = 0;
    for (const file of metadataFiles) {
        file.frames = file.frames.map(blob => {
            const entry = {
                type: "image/png",
                offset,
                size: blob.size
            };
            offset += blob.size;
            imageIndex++;
            return entry;
        });
    }

    const metadataOffset = offset;
    const metadata = {
        format: "Fizzpixl",
        version: "0.7.0",
        width: WIDTH,
        height: HEIGHT,
        files: metadataFiles
    };

    const metadataBytes = new TextEncoder().encode(
        JSON.stringify(metadata)
    );

    if (metadataOffset + metadataBytes.length > 0xffffffff) {
        setStatus("Project is too large for FZPX version 1");
        return;
    }

    const header = FZPX.write(imageIndex, metadataOffset);

    const blob = new Blob([
        header,
        ...imageBlobs,
        metadataBytes
    ], {
        type: "application/x-fizzpixl"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "artwork.fizzpixl";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(
        `Project saved (${projectFiles.length} files, ${imageIndex} frames)`
    );
}

// Initial state

selectTool("pencil");
selectSize(1);
drawGrid();

createProjectFile("artwork.png");
setStatus(stencilStorageWarning || "Fizzpixl 0.7.0 ready");