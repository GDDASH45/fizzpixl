# Fizzpixl

Fizzpixl 0.6.0 is a browser-based pixel editor with drawing tools, multiple project images, and a frame-based animation editor. It runs locally without a build step or external dependencies.

## Run

Open `index.html` in a modern web browser. The editor creates a 680 × 480 canvas when it starts.

## Drawing

Choose a tool from the toolbar, then draw on the canvas:

- **Pencil** and **Eraser** draw with the selected brush size. Erasing paints black.
- **Bucket Fill** fills a connected area with the current color.
- **Eyedropper** picks a color from the canvas.
- **Line**, **Rectangle**, **Filled Rectangle**, **Circle**, and **Filled Circle** draw shapes.
- **Selection** lets you select, move, copy, cut, and paste rectangular areas.

Use the color swatches or color picker to choose a color. Brush sizes, zoom, and the pixel grid can be adjusted with the controls below the toolbar.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `B` | Pencil |
| `E` | Eraser |
| `G` | Bucket Fill |
| `I` | Eyedropper |
| `L` | Line |
| `M` | Selection |
| `[` / `]` | Decrease / increase brush size |
| `Escape` | Clear the selection |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` or `Y` | Redo |
| `Ctrl`/`Cmd` + `C` / `X` / `V` | Copy / cut / paste selection |
| `Ctrl`/`Cmd` + `S` | Save project |
| `Ctrl`/`Cmd` + `Shift` + `S` | Export current canvas as PNG |

## Animation editor

Each project image has its own animation timeline:

1. Draw on the canvas to create the current frame.
2. Select **Blank Frame** to add an empty frame after the current one, or **Duplicate Frame** to copy it.
3. Click a frame thumbnail to edit that frame. Use **Delete Frame** to remove the selected frame.
4. Set the playback speed between 1 and 60 FPS, then select **Play** to preview the looping animation. Select **Stop** to return to editing.
5. Keep **Onion skin** enabled to see differently colored previews of non-black pixels from the previous and next frames that differ from the current frame. Turn it off whenever you want an unobstructed canvas.

The timeline always retains at least one frame. Playback temporarily disables canvas editing and frame controls.

## Project files and export

- Enter an optional name and select **New File** to add another image to the project. If the name is blank, a unique `untitled` filename is generated. Use the project selector to switch between images.
- **Save PNG** exports the current canvas frame as a PNG.
- **Save Project** downloads the project as an `.fizzpixl` file, including its images, animation frames, and playback speeds.
- **Load Image** imports an image onto the current canvas.
- **Load Project** opens a saved project. The editor supports current Fizzpixl projects and existing FZPX 0.5.0, 0.4.0, and legacy 0.3.0 projects.

Undo history is maintained separately for the currently edited frame and is reset when switching frames.
