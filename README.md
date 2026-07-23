# Kyle Wang | Portfolio

Personal portfolio for Kyle Wang, a Computer Science Ph.D. candidate working across human-centered AI, Human-Computer Interaction, and social data science.

**Live site:** [kyleearth.github.io/portfolio](https://kyleearth.github.io/portfolio/)

## Website Sections

- **Home:** Research focus, experience, professional links, and current opportunities.
- **Publications:** Journal articles, conference papers, posters, extended abstracts, and work in progress.
- **Travel Footprint:** A privacy-conscious overview of visited destinations and an interactive destination poll.

## Update Content

| Content | File |
| --- | --- |
| Home page | `_pages/about.md` |
| Publications | `_pages/publications.md` |
| Travel page layout | `_pages/gallery.html` |
| Visited places | `_data/travel_gallery.yml` |
| Country reference list | `_data/world_countries.yml` |
| Main navigation | `_data/navigation.yml` |
| Site colors and layout | `_sass/_custom.scss` |
| Interactive behavior | `assets/js/custom.js` |
| Site-wide settings | `_config.yml` |

## Preview Locally

Ruby 3.0 or newer and Bundler are required.

```bash
bundle install
bundle exec ruby scripts/jekyll_local_preview.rb serve --config _config.yml,_config.dev.yml
```

Open [http://localhost:4000](http://localhost:4000). The development configuration removes the `/portfolio` path locally.

## Publish

The production configuration is set up for the `kyleearth/portfolio` GitHub Pages project site. Changes pushed to `main` can be published from **Settings > Pages > Deploy from a branch > main > /(root)**.

## License

Original portfolio content is copyright Kyle Wang. Open-source components retain their respective license notices in `LICENSE` and their source files.
