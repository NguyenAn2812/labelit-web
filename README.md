# Labelit - ViFABSA Annotation Tool

<div align="center">
  
  [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE) [![Python](https://img.shields.io/badge/python-3.12+-blue.svg?style=flat-square)](https://www.python.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg?style=flat-square)](https://fastapi.tiangolo.com/) [![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square)](https://react.dev/)
  
  [![GitHub Stars](https://img.shields.io/github/stars/CSSERT/labelit?style=flat-square)](https://github.com/CSSERT/labelit) [![GitHub Forks](https://img.shields.io/github/forks/CSSERT/labelit?style=flat-square)](https://github.com/CSSERT/labelit) [![GitHub Issues](https://img.shields.io/github/issues/CSSERT/labelit?style=flat-square)](https://github.com/CSSERT/labelit/issues)
</div>

A modern, lightweight web-based ABSA (Aspect-Based Sentiment Analysis) annotation tool for Vietnamese financial news articles. Built with **React + Vite + Tailwind CSS** frontend and **FastAPI** backend for the ViFABSA dataset annotation project.

## Demo

<div align="center">
  <img src="https://github.com/CSSERT/labelit/blob/main/public/DEMO_START.png" alt="Labelit Start" width="100%" />
  <p><em>Modern React interface with article metadata and progress tracking</em></p>
</div>

<div align="center">
  <img src="https://github.com/CSSERT/labelit/blob/main/public/DEMO_SPAN_SELECTION.png" alt="Labelit Span Selection" width="100%" />
  <p><em>Text span selection with aspect and sentiment chips</em></p>
</div>

<div align="center">
  <img src="https://github.com/CSSERT/labelit/blob/main/public/DEMO_SPAN_ANNOTATED.png" alt="Labelit Annotated" width="100%" />
  <p><em>Annotated spans with color-coded sentiments (green=positive, red=negative, amber=neutral)</em></p>
</div>

<div align="center">
  <img src="https://github.com/CSSERT/labelit/blob/main/public/DEMO_STATS.png" alt="Labelit Statistics" width="100%" />
  <p><em>Comprehensive statistics dashboard with progress tracking</em></p>
</div>

## Architecture

```
┌─────────────────────────────────────┐
│   React + Vite + Tailwind (Port 5173)│  UI Layer
│   - Text Selection & Labeling        │
│   - Classification Modal             │
│   - Statistics Dashboard             │
│   - Real-time Progress Tracking      │
└──────────────┬──────────────────────┘
               │ HTTP/REST (dev proxy)
               ↓
┌─────────────────────────────────────┐
│   FastAPI Server (Port 5000)         │  API Layer
│   - Async Request Handling           │
│   - Pydantic Data Validation         │
│   - Automatic API Documentation      │
│   - CORS Middleware                  │
└──────────────┬──────────────────────┘
               │ JSON I/O
               ↓
┌─────────────────────────────────────┐
│   ViFABSA Dataset (merged.json)      │  Data Layer
│   949K+ paragraphs from 10K+ articles│
│   ../ViFABSA/data/raw/merged.json   │
└─────────────────────────────────────┘
```

## Key Features

- **3-Stage Pipeline**: Domain Classification (BANKING/NON_BANKING) → Scope (MICRO/MACRO) → ABSA Annotation
- **Text Selection**: Click and drag to select text, automatically calculates character offsets
- **Label Management**: Add, edit, and remove ABSA labels with aspect/sentiment classification
- **Auto-Classification Modal**: Opens automatically when all paragraphs in an article are annotated
- **Live Statistics**: Real-time progress tracking with sentiment distribution
- **Keyboard Navigation**: Quick navigation between articles and paragraphs
- **Automatic API Documentation**: FastAPI Swagger UI at `/docs`

## Project Structure

```
labelit/
├── app.py                      # FastAPI backend (client-server model)
├── requirements.txt            # Python dependencies (FastAPI, Pydantic, Uvicorn)
├── run-server.sh              # Startup script
├── vite.config.js             # Vite config with /api proxy
├── package.json               # Node dependencies (React, Tailwind)
├── src/
│   ├── App.jsx                # Main React component (690 lines)
│   ├── App.css                # Component styles
│   ├── index.css              # Global Tailwind styles
│   ├── main.jsx               # React entry point
│   └── assets/                # Static assets
└── public/                    # Static files
```

## Installation

### Prerequisites
- **Python 3.12+** installed
- **Node.js 18+** and npm/yarn installed
- **ViFABSA dataset** at `../ViFABSA/data/raw/merged.json`

### Backend Setup

1. **Clone the repository** (if not already):
```bash
git clone https://github.com/CSSERT/labelit
cd labelit
```

2. **Create and activate virtual environment**:
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

### Frontend Setup

4. **Install Node dependencies**:
```bash
npm install
```

## Usage

### Quick Start (Recommended)

**Terminal 1 - Start Backend**:
```bash
cd labelit
./run-server.sh
# Output: 🚀 Starting Labelit FastAPI server on http://127.0.0.1:5000
# Output: 📚 API Documentation: http://127.0.0.1:5000/docs
```

**Terminal 2 - Start Frontend**:
```bash
cd labelit
npm run dev
# Output: ➜  Local:   http://localhost:5173/
```

Then open **http://localhost:5173** in your browser.

### Manual Start

**Backend**:
```bash
cd labelit
source .venv/bin/activate
python3 app.py
```

**Frontend**:
```bash
cd labelit
npm run dev
```

### How to Annotate

1. **Select Text Span**: Click and drag to select any portion of text (word, phrase, sentence, or multiple sentences)
2. **Choose Labels**: 
   - Click an **Aspect** chip (e.g., PROFITABILITY_&_PERFORMANCE)
   - Click a **Sentiment** chip (POSITIVE, NEGATIVE, or NEUTRAL)
   - Click **Confirm** to save the label
3. **View Annotations**: Labeled spans appear with color-coded highlights:
   - 🟢 Green = POSITIVE sentiment
   - 🔴 Red = NEGATIVE sentiment
   - 🟡 Amber = NEUTRAL sentiment
4. **Edit/Remove**: Click on any highlighted span to edit or remove the label
5. **Skip Paragraph**: Click **No Aspects** if the paragraph has no relevant aspects
6. **Save**: Click **Save** or press `S` to persist changes
7. **Navigate**: Use arrow buttons, keyboard shortcuts, or jump to specific article ID

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `←` / `→` | Navigate to previous/next paragraph |
| `S` | Save current annotations |
| `E` | Toggle text edit mode |
| `N` | Mark as "No Aspects" (skip) |
| `Esc` | Close modal/cancel selection |

### Article Classification Workflow

After annotating all paragraphs in an article:

1. **Auto-Modal Appears**: Classification modal opens automatically
2. **Select Banking Domain**:
   - Choose **BANKING** if article discusses banking sector
   - Choose **NON_BANKING** if not related to banking
3. **Select Scope** (if BANKING):
   - **MICRO**: Bank-specific news (earnings, branches, products)
   - **MACRO**: Industry-wide news (policy, regulations, market trends)
4. **Save Classification**: Click **Save** to persist article-level labels

If you close the modal, use the **Classify Article** button to reopen it.

## Data Format

Labelit uses JSON format with support for both input (raw articles) and output (annotated data).

### Input Format
File: `../ViFABSA/data/raw/merged.json`

```json
{
  "publishers": ["vietnambiz", "vnexpress", ...],
  "total": 10245,
  "articles": [
    {
      "article_id": "abc123",
      "title": "Bank reports strong Q4 earnings",
      "source": "https://vietnambiz.vn/...",
      "publisher": "vietnambiz",
      "author": "John Doe",
      "sapo": "Summary text...",
      "category": "finance",
      "web_type": "news",
      "publish_time": "2025-01-15 10:30:00",
      "url": "https://...",
      "content": [
        "First paragraph text...",
        "Second paragraph text...",
        {"text": "Third paragraph as object..."}
      ]
    }
  ]
}
```

### Output Format (Annotated)
File: `data/annotated.json`

```json
{
  "articles": [
    {
      "article_id": "abc123",
      "title": "Bank reports strong Q4 earnings",
      "banking_domain": "BANKING",
      "scope": "MICRO",
      "content": [
        {
          "paragraph_index": 0,
          "text": "First paragraph text...",
          "labels": [
            {
              "aspect": "PROFITABILITY_&_PERFORMANCE",
              "sentiment": "POSITIVE",
              "start": 10,
              "end": 25
            }
          ],
          "no_aspect": false
        },
        {
          "paragraph_index": 1,
          "text": "Second paragraph text...",
          "labels": [],
          "no_aspect": true
        }
      ]
    }
  ],
  "metadata": {
    "last_annotated_at": "2026-02-04T12:30:00"
  }
}
```

### Internal API Format

Each paragraph is served as a flattened item:

```json
{
  "id": 0,
  "article_id": "abc123",
  "article_meta": {
    "title": "Bank reports strong Q4 earnings",
    "source": "vietnambiz.vn",
    "banking_domain": "BANKING",
    "scope": "MICRO",
    "publisher": "vietnambiz",
    "publish_time": "2025-01-15 10:30:00"
  },
  "paragraph_index": 0,
  "text": "First paragraph text...",
  "labels": [
    {
      "aspect": "PROFITABILITY_&_PERFORMANCE",
      "sentiment": "POSITIVE",
      "start": 10,
      "end": 25
    }
  ],
  "skipped": false
}
```

## Configuration

You can customize the tool by editing `app.py`:

### Data Paths
```python
INPUT_DATA = '../ViFABSA/data/raw/merged.json'  # Source dataset
OUTPUT_DATA = "data/annotated.json"              # Output file
```

### Aspect Categories
```python
ASPECTS = [
    "PROFITABILITY_&_PERFORMANCE",
    "CREDIT_GROWTH_&_ASSET_QUALITY",
    "CAPITAL_ADEQUACY_&_LIQUIDITY",
    "GOVERNANCE_&_RISK_MANAGEMENT",
    "REGULATORY_&_POLICY_ENVIRONMENT"
]
```

### Server Settings
```python
# In the main block at the bottom:
uvicorn.run(app, host="127.0.0.1", port=5000)
```

### Frontend Proxy Configuration
Edit `vite.config.js` to change the backend URL:
```javascript
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5000",  // Backend URL
    },
  },
});
```

## Technology Stack

### Frontend
- **React 19** - UI framework with hooks for state management
- **Vite** - Fast build tool & dev server with HMR
- **Tailwind CSS 4** - Utility-first CSS framework
- **Modern JavaScript** - ES6+ features

### Backend
- **FastAPI** - Modern, fast (async) web framework
- **Pydantic** - Data validation using Python type annotations
- **Uvicorn** - Lightning-fast ASGI server
- **Python 3.12** - Latest Python runtime

### Development Tools
- **ESLint** - JavaScript linting
- **Hot Module Replacement** - Instant updates without page refresh
- **Auto API Docs** - Swagger UI and ReDoc included

## Development Workflow

1. **Annotate Paragraphs**: Select text, choose aspect and sentiment
2. **Article-Level Classification**:
   - When all paragraphs are annotated, classification modal appears automatically
   - Choose banking domain (BANKING/NON_BANKING)
   - If BANKING, choose scope (MICRO/MACRO)
3. **Save & Continue**: Changes are auto-saved to backend
4. **View Statistics**: Check progress and label distribution

## License

MIT License - See LICENSE file for details.
This tool is developed for research and educational purposes.

## Contact

For questions, issues, or collaboration opportunities, please open an issue on GitHub.

---