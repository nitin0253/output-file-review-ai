# output-file-review-ai

Spyne Image Review Dashboard with an in-browser **AI few-shot classifier** on top of Praveen's `output-file-review`.

Live tool: GitHub Pages (see repo settings)

## What's new vs. the base dashboard

A reviewer tags **≥ 5 sample VINs per focus class** (Raw / Stock / Hero Angle / Photo NA) using the normal `r` / `s` / `h` / `p` shortcuts, then clicks **Analyze with AI**. CLIP ViT-B/32 runs in the browser via `@xenova/transformers`, builds one centroid per class from the samples, and classifies every still-pending VIN by cosine similarity.

The report screen shows per-class counts and lets the reviewer **Accept all** per class, override a single tile, or dismiss.

### Focus classes

| Class       | Shortcut | Definition                                                                          |
|-------------|----------|-------------------------------------------------------------------------------------|
| Raw         | `r`      | Unprocessed photo of car (natural lighting, dealer lot, no background edit)         |
| Stock       | `s`      | Computer-generated manufacturer render                                               |
| Hero Angle  | `h`      | Wrong 1st image for this team's expected sequencing                                  |
| Photo NA    | `p`      | No image, or "coming soon" / placeholder / promotional image                        |

Hero Angle is team-specific — samples teach the model what *this team's* wrong angles look like, so the classifier is per-review-session rather than global.

### Where the AI code lives

Single-file static page. Everything AI-related is inline in `index.html`:
- CSS: FAB + progress bar styles (search `.ai-fab`, `.ai-progress-bar`)
- Modal DOM: `#ai-prompt-modal`, `#ai-progress-modal`, `#ai-report-modal`
- Module: block starting at `AI few-shot classifier` comment, inside the main `<script>`
- Hooks: `applyImg1Issue` calls `aiMaybeShowPrompt`; `render1ImgGallery` calls `aiOverlaySuggestion`

### Base repo

Forked from [`praveenagarwal24/output-file-review`](https://github.com/praveenagarwal24/output-file-review). All original SSO + Google Drive + CSV + manual-review behavior is unchanged.
