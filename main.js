// SPDX-License-Identifier: MIT
/*
Fizzpixl -- A single file javascript pixel editor

For now, it only runs in the browser. but feel free to port it

-- GDDASH45 (on Github)

Version history:

0.1.0:
    Very basic, only 2 colors, no controls

0.2.0:
    Shapes, colors, controls, saving artwork
*/
const WIDTH = 680;
const HEIGHT = 480;

const editor = document.createElement("div");
editor.id = "pixel-editor";

const style = document.createElement("style");
style.textContent = `
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
        width: fit-content;
        max-width: 100%;
    }

    #toolbar, #palette, #sizes {
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
    }

    #pixel-canvas {
        width: 680px;
        max-width: 100%;
        height: auto;
        border: 2px solid #777;
        background: black;
        image-rendering: pixelated;
        cursor: crosshair;
        touch-action: none;
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

// Tools

const toolButtons = {};

function selectTool(name) {
    tool = name;

    for (const [toolName, button] of Object.entries(toolButtons)) {
        button.classList.toggle("active", toolName === tool);
    }
}

function addTool(name, label) {
    toolButtons[name] = makeButton(label, () => {
        selectTool(name);
    });
}

addTool("pencil", "Pencil");
addTool("eraser", "Eraser");
addTool("fill", "Bucket Fill");
addTool("rectangle", "Rectangle");
addTool("filledRectangle", "Filled Rectangle");
addTool("circle", "Circle");
addTool("filledCircle", "Filled Circle");

selectTool("pencil");

// Pencil sizes

const sizeContainer = document.createElement("div");
sizeContainer.id = "sizes";

editor.appendChild(sizeContainer);

const sizeLabel = document.createElement("span");
sizeLabel.textContent = "Brush size:";
sizeContainer.appendChild(sizeLabel);

const sizeButtons = {};

function selectSize(size) {
    brushSize = size;

    for (const [value, button] of Object.entries(sizeButtons)) {
        button.classList.toggle("active", Number(value) === size);
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

// Clear canvas

makeButton("Clear", () => {
    if (confirm("Clear the entire canvas?")) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
});

// Save PNG

makeButton("Save PNG", () => {
    const link = document.createElement("a");
    link.download = "artwork.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
});

// Load image

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
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

        URL.revokeObjectURL(url);
        fileInput.value = "";
    };

    image.onerror = () => {
        alert("Could not load image.");
        URL.revokeObjectURL(url);
        fileInput.value = "";
    };

    image.src = url;
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
        x: Math.floor((event.clientX - rect.left) * WIDTH / rect.width),
        y: Math.floor((event.clientY - rect.top) * HEIGHT / rect.height)
    };
}

// Pixel drawing

function drawPixel(x, y) {
    const size = brushSize;

    if (tool === "eraser") {
        ctx.fillStyle = "#000000";
    } else {
        ctx.fillStyle = color;
    }

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
    const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
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

        const neighbors = [
            position - 1,
            position + 1,
            position - WIDTH,
            position + WIDTH
        ];

        for (let i = 0; i < neighbors.length; i++) {
            const next = neighbors[i];

            if (next < 0 || next >= WIDTH * HEIGHT) continue;

            const nx = next % WIDTH;
            const ny = Math.floor(next / WIDTH);

            if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
                continue;
            }

            if (!visited[next]) {
                visited[next] = 1;
                queue[tail++] = next;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// Rectangle

function drawRectangle(x0, y0, x1, y1, filled) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);

    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);

    ctx.fillStyle = color;

    if (filled) {
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
    ctx.arc(x0, y0, radius, 0, Math.PI * 2);

    if (filled) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.stroke();
    }
}

// Drawing events

canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const pos = getPixelPosition(event);

    drawing = true;

    startX = pos.x;
    startY = pos.y;

    lastX = pos.x;
    lastY = pos.y;

    if (tool === "fill") {
        floodFill(pos.x, pos.y);
        drawing = false;
        return;
    }

    canvas.setPointerCapture(event.pointerId);

    if (tool === "pencil" || tool === "eraser") {
        drawPixel(pos.x, pos.y);
    }
});

canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;

    const pos = getPixelPosition(event);

    if (tool === "pencil" || tool === "eraser") {
        drawLine(lastX, lastY, pos.x, pos.y);
    }

    lastX = pos.x;
    lastY = pos.y;
});

canvas.addEventListener("pointerup", (event) => {
    if (!drawing) return;

    const pos = getPixelPosition(event);

    switch (tool) {
        case "rectangle":
            drawRectangle(startX, startY, pos.x, pos.y, false);
            break;

        case "filledRectangle":
            drawRectangle(startX, startY, pos.x, pos.y, true);
            break;

        case "circle":
            drawCircle(startX, startY, pos.x, pos.y, false);
            break;

        case "filledCircle":
            drawCircle(startX, startY, pos.x, pos.y, true);
            break;
    }

    drawing = false;
});

canvas.addEventListener("pointercancel", () => {
    drawing = false;
});

// Add canvas

editor.appendChild(canvas);
