# slobo.xyz

Personal website - experiments, blog posts, curated content.

## Tech Stack

- **Eleventy (11ty)** - static site generator
- **Tailwind CSS** - styling via utility classes + custom components
- **PostCSS** - CSS processing

## Commands

```bash
npm start    # dev server with hot reload
npm run build  # production build to _site/
```

## Project Structure

```
src/
├── _includes/
│   ├── default.html   # master layout
│   └── hero.html      # reusable hero partial
├── _data/             # JSON data files
├── img/               # images (webp preferred)
├── styles.css         # tailwind + component classes
└── *.html             # pages
_site/                 # build output (gitignored)
```

## Design System (Jan 2026)

### Typography
- **Body:** Source Serif 4 (Google Fonts)
- **Code:** JetBrains Mono
- Fonts loaded in `default.html`

### Colors (defined in `tailwind.config.js`)
- `cream` (#FDFBF7) - background
- `warmgray` (#2D2D2D) - text
- `accent` (#2E7D32) - green links/highlights
- `warm-border` (#E8E4DF) - borders

### Key Classes (`styles.css`)
- `.content-link` - green link with subtle underline
- `.section-title` - h2 styling
- `.content-list` - content container
- `.thought-card` - blog post card with hover lift
- `.nav-link` - navigation links

### Animations
- `animate-fade-in` - page load fade
- Hover effects on cards, links, "slobo" wordmark

## Conventions

- **Layout**: all pages use `layout: default`
- **Hero**: `{% include "hero.html", title: "...", image: "..." %}`
- **Container**: `max-w-2xl` centered
- **Nav**: "slobo" left, links right
- **JavaScript**: small inline scripts in `default.html` only (theme switch); no frameworks or bundles
