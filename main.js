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
    #preview-canvas {
        pointer-events: none;
        image-rendering: pixelated;
    }

    #preview-canvas {
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

// Preview overlay

const previewCanvas = document.createElement("canvas");

previewCanvas.id = "preview-canvas";
previewCanvas.width = WIDTH;
previewCanvas.height = HEIGHT;

const previewCtx = previewCanvas.getContext("2d");

canvasWrapper.appendChild(canvas);
canvasWrapper.appendChild(gridCanvas);
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
        imageData
    };
}

function syncActiveProjectFile() {
    const file = projectFiles.find(item => item.id === activeProjectFile);

    if (file) {
        file.imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
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

    syncActiveProjectFile();
    activeProjectFile = target.id;

    ctx.putImageData(target.imageData, 0, 0);
    resetEditorHistory();
    updateProjectFileList();
    setStatus("Opened " + target.name);
}

projectFileSelect.addEventListener("change", () => {
    switchProjectFile(projectFileSelect.value);
});

function createProjectFile(name = "untitled.png") {
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
    ctx.putImageData(imageData, 0, 0);

    resetEditorHistory();
    updateProjectFileList();
    setStatus("Created " + file.name);
}

makeButton("New File", () => {
    const name = prompt("New image filename:", "untitled.png");
    if (name === null) return;

    const cleanName = name.trim();
    if (!cleanName) {
        alert("A filename is required.");
        return;
    }

    createProjectFile(cleanName);
}, projectFileBar);

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

    projectFiles.splice(index, 1);
    const next = projectFiles[Math.min(index, projectFiles.length - 1)];
    activeProjectFile = next.id;

    ctx.putImageData(next.imageData, 0, 0);

    resetEditorHistory();
    updateProjectFileList();
    setStatus("Deleted " + file.name);
}, projectFileBar);

function loadProjectFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error("Project contains no image files");
    }

    projectFiles.length = 0;

    for (const file of files) {
        projectFiles.push(makeProjectFile(file.name, file.imageData));
    }

    activeProjectFile = projectFiles[0].id;
    ctx.putImageData(projectFiles[0].imageData, 0, 0);
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

    pushHistory();

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    selection = null;
    clearPreview();

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

    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
        pushHistory();

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

        selection = null;
        clearPreview();

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

            if (
                metadata.format !== "Fizzpixl" ||
                metadata.version !== "0.4.0" ||
                metadata.width !== WIDTH ||
                metadata.height !== HEIGHT ||
                !Array.isArray(metadata.files) ||
                metadata.files.length !== header.fileCount
            ) {
                throw new Error("Invalid Fizzpixl 0.4.0 project metadata");
            }

            const loadedFiles = [];

            for (const entry of metadata.files) {
                if (
                    typeof entry.name !== "string" ||
                    !entry.name.trim() ||
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
                            new Error("Could not decode " + entry.name)
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

                    loadedFiles.push({
                        name: entry.name,
                        imageData: tempCtx.getImageData(
                            0, 0, WIDTH, HEIGHT
                        )
                    });
                } finally {
                    URL.revokeObjectURL(imageUrl);
                }
            }

            loadProjectFiles(loadedFiles);
            setStatus("Loaded FZPX project (" + loadedFiles.length + " files)");
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

editor.appendChild(palette);

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
    color = colorPicker.value;
});

palette.appendChild(colorPicker);

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
});

canvas.addEventListener("pointercancel", () => {
    drawing = false;
    movingSelection = false;
    clearPreview();
});

// Keyboard shortcuts

document.addEventListener("keydown", event => {
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
    syncActiveProjectFile();

    if (projectFiles.length === 0) {
        setStatus("No project files to save");
        return;
    }

    const imageBlobs = [];

    for (const file of projectFiles) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = WIDTH;
        tempCanvas.height = HEIGHT;
        tempCanvas.getContext("2d").putImageData(file.imageData, 0, 0);

        const blob = await new Promise(resolve => {
            tempCanvas.toBlob(resolve, "image/png");
        });

        if (!blob) {
            setStatus("Failed to encode " + file.name);
            return;
        }

        imageBlobs.push(blob);
    }

    let offset = FZPX.HEADER_SIZE;
    const metadataFiles = [];

    for (let i = 0; i < projectFiles.length; i++) {
        const blob = imageBlobs[i];

        metadataFiles.push({
            name: projectFiles[i].name,
            type: "image/png",
            offset,
            size: blob.size
        });

        offset += blob.size;
    }

    const metadataOffset = offset;
    const metadata = {
        format: "Fizzpixl",
        version: "0.4.0",
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

    const header = FZPX.write(projectFiles.length, metadataOffset);

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
    setStatus("Project saved (" + projectFiles.length + " files)");
}

// Initial state

selectTool("pencil");
selectSize(1);
drawGrid();

createProjectFile("artwork.png");
setStatus("Fizzpixl 0.4.0 ready");