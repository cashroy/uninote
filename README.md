# UniNote

AI-powered university notes organiser for Windows. Organise notes by **Year → Semester → Paper**, drag-and-drop any document, and Claude classifies it (lecture notes, workshop, assignment, past paper…), files it, and offers to summarise it.

## Features

- **Degree tree navigation** — years, semesters, papers; add any of them inline in the sidebar.
- **Drop anything, anywhere** — files dropped into the window are read, classified by Claude, and filed into the right category folder automatically.
- **Paired summaries** — after upload (or any time later), pick a summary style: study sheet, structured outline, flashcards, plain-language explainer, exam revision summary, or custom instructions. Summaries live next to the original document.
- **Tests** — within a semester, create a test, tick which lectures/notes/assignments it covers, optionally attach a past paper, and Claude generates full study material (topic map, condensed notes, practice questions matched to the past paper style, revision checklist).
- **Ask Claude panel** — ask anything about your current location (paper / semester / year); answers are grounded in your actual documents.
- **Two answer engines** — a built-in instant index, or your **graphify** knowledge graph (Settings → Answer engine) for richer cross-document answers with lower token usage.
- **Built-in notes** — create Markdown notes inside any paper (live preview, autosave). They're stored as `.md` files in the paper's folder and behave like any document: summarisable, searchable, chat-aware, graphified.
- **Side notes** — a pinned, collapsible scratchpad per paper, autosaved, always beside the paper's contents.
- **Global search (Ctrl+K)** — filenames, titles and content across years, semesters, papers, documents, notes, summaries, side notes and tests; results show where each hit lives and click to jump there.
- **Calendar** — a month grid with every test and assignment due date, plus a weekly timetable. Upload your class timetable (PDF, Excel, Word or text) and Claude lays out the classes; add or remove classes by hand too.
- **Deadlines** — optional due dates on assignments and tests; a dashboard on launch and a dedicated view lists what's coming, overdue items highlighted. Create a test straight from here with **New test**.
- **Flashcard review** — flashcard summaries are playable: flip to reveal, grade again/hard/good/easy, and spaced-repetition scheduling brings cards back when due (progress saved per set).
- **Weeks** — tag any document with a week number and filter a paper by week.
- **Test coverage memory** — tests are per-paper; when creating one you see which material was already covered by earlier tests and which test used it.
- **Confirmed filing** — on upload, Claude says what each file *looks like* ("this looks like Lecture Notes…") and you confirm, pick a different type, or add a brand-new type before it's filed.
- **In-app viewer** — open any document inside UniNote (PDFs and images render inline; Markdown/text too; Office files show their extracted text with an "open externally" option). Browse everything in one place via **All documents** in the sidebar.
- **Themes** — Minimal black & white (default), Warm paper, or Dark. Switch in Settings.
- **Sign in with Claude** — runs on your Claude subscription via Claude Code; no API key, no pay-per-use. Log in once from the onboarding screen or Settings.
- **Seamless window** — a custom frameless title bar with its own minimise/close controls.
- **Your files stay yours** — everything is a plain folder tree; Settings → "Show location in Explorer".

## Development

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run smoke      # quick launch check
npm run dist       # build the x64 Windows installer + portable exe into release/
npm run dist:arm   # build for ARM64 Windows instead
```

## Install

Run `release/UniNote-Setup-<version>.exe`, **or** just run `release/UniNote-Portable-<version>.exe` directly with no installation. Both are x64 (run on Intel/AMD and, via emulation, on ARM Windows).

> First launch may show a Windows SmartScreen prompt because the build is unsigned — choose **More info → Run anyway**.

## Auto-updates & the release site

UniNote checks **GitHub Releases** for new versions on launch (installed build only) and offers to download + install them. There's also a landing/download site in `docs/` for **GitHub Pages**.

One-time setup:

1. Create a GitHub repo and push this project.
2. Set your repo in **three places**: `build.publish.owner` / `build.publish.repo` in [package.json](package.json), and the `OWNER` / `REPO` constants at the bottom of [docs/index.html](docs/index.html).
3. **Enable Pages:** repo Settings → Pages → Source = *Deploy from a branch*, branch = `main`, folder = `/docs`. Your site goes live at `https://<owner>.github.io/<repo>/`.
4. **Publish a release:** bump the version in `package.json`, commit, then tag and push:
   ```bash
   git tag v1.5.0 && git push --tags
   ```
   The [release workflow](.github/workflows/release.yml) builds on GitHub's runners and publishes the installer, portable exe, and `latest.yml` (the update feed) to a GitHub Release. Installed apps pick it up automatically.

To publish from your own machine instead of CI: `set GH_TOKEN=<token>` then `npx electron-builder --win --x64 --publish always`.

> The **portable** build can't self-update (nothing is installed to replace) — it points users to the site for the latest download. The **installer** build is the one that auto-updates.

Supported document types for text extraction: PDF, DOCX, PPTX, TXT/MD/CSV/TEX and common source files. Scanned PDFs with no text layer are summarised natively by Claude when using the API backend.
