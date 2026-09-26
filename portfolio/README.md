# Suraj Patel — Portfolio

A monochrome editorial portfolio: black and white, Instrument Serif for display type with Geist and Geist Mono for text and labels, a hairline-framed grid layout, and hand-drawn SVG architecture plates for each featured project (`src/components/ProjectPlate.tsx`). Built with React, TypeScript, Tailwind CSS v4, and Motion.

Content (bio, experience, projects, skills, certifications) lives in one place: `src/data/content.ts`. Edit that file to update the site.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # outputs to dist/
npm run preview # preview the production build locally
```

## Deploy

This site ships through the CI/CD pipeline in the repository root. The Dockerfile builds `dist/` in its own stage and the Express app serves it at `/`, so pushing to `main` lints, builds, scans and deploys it along with everything else. See the root `README.md`.

### Live URL

The site is live at https://ci-cd-pipeline-automation-app.onrender.com/. `index.html` (canonical, `og:url`, `og:image`, `twitter:image`), `public/robots.txt` and `public/sitemap.xml` all hard-code that address. Update all four if the domain changes.

## Notes

- Fonts are self-hosted in `public/fonts/` (no requests to Google): Instrument Serif, Geist and Geist Mono are from Google Fonts under the SIL Open Font License, loaded via `src/fonts.css`.
- The hero name uses **Akira Expanded** by Typologic (`public/fonts/akira-expanded.woff2`, with the original `.otf` as fallback), downloaded from DaFont as the free demo. It is free for personal use only; commercial use requires the full license from https://creativemarket.com/typologic/4868098-Akira-Expanded.
- The link preview image is `public/og-image.png` (1200×630).

- The résumé linked from the nav bar is served from `public/Suraj_Patel_Resume.pdf` — replace that file to update it.
- Update social links, email, and bio text in `src/data/content.ts`.
