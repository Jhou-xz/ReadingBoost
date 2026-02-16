# ReadingBoost

A distraction-free speed reading web app that displays **one word at a time** at a fixed focal point, using a **red pivot letter** to reduce eye movement and improve recognition.

Designed for focus, clarity, and smooth reading flow.

---

## Features

-  Red pivot letter (visual anchor)
-  Fixed word position (no eye scanning)
-  Adjustable speed (WPM)
-  Smart punctuation pauses
-  Adjustable text size
-  Optional beep per word
-  Keyboard shortcuts
-  Progress & settings persistence
-  File upload support

## How It Works

Traditional reading requires constant eye movement.  
This reader keeps your eyes **fixed** while words appear sequentially.

Benefits:

✔ Reduced eye strain  
✔ Faster word recognition  
✔ Better concentration  

The red letter marks the visual pivot to stabilize focus.


## Recommended Usage

1. Use AI to **summarize** a long paper or article  
2. Paste the summary into the reader  
3. Start at a **comfortable speed**  
4. Increase gradually as comprehension remains stable  

  Speed improves best when reading feels smooth, not forced.


## Controls

### Mouse / UI

- **Play / Pause**
- **Back / Next**
- **Reload** — restart from beginning
- **Reset** — reset settings
- **Refresh** — clear everything


### ⌨ Keyboard Shortcuts

| Key | Action |
|------|--------|
| `Space` | Play / Pause |
| `↑ / ↓` | Adjust speed |
| `← / →` | Step words |
| `R` | Reload text |


## 📂 Supported File Types

| Format | Support |
|--------|---------|
| `.txt` | ✅ Full |
| `.docx` | ✅ Full |
| `.doc` | ⚠ Convert to DOCX/TXT |
| `.pdf` | ✅ Text-based PDFs |

⚠ Scanned/image PDFs will not extract text.

## Tech Stack

- HTML / CSS / JavaScript
- Web Audio API (beep)
- PDF.js (PDF text extraction)
- Mammoth.js (DOCX extraction)
- LocalStorage (state persistence)


