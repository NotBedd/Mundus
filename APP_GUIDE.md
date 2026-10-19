# Mundus Desktop Application (Electron)

Mundus is designed to run as a Native Desktop App by wrapping its webapp logic with **Electron**.

## 📁 Where Your Data Is Stored on Disk

By default, Mundus creates a `mundus_data` folder:
- If the application directory is writable (e.g. portable app or selected user folder in Installer), it creates `mundus_data/` right inside the app folder.
- If installed in a protected directory (such as `C:\Program Files`, if selected "pc" in Installer), it safely uses:
  - **Windows**: `%APPDATA%/mundus-app/mundus_data`
  - **macOS**: `~/Library/Application Support/mundus-app/mundus_data`
  - **Linux**: `~/.config/mundus-app/mundus_data`

### Files generated in your local storage folder:
- `projects.json`: All your Mundus worlds and metadata
- `documents.json`: Manuscripts, chapters, scenes, and word counts
- `folders.json`: Manuscript hierarchy and organization
- `characters.json`: Characters, relationships, arcs, and family trees
- `codex_entries.json`: Lore, world encyclopedia, dynasties, and places
- `timeline_events.json`: Chronology milestones and placed scenes
- `timeline_config.json`: Calendar systems and epoch configurations
- `story_links.json`: Story flow node connections and plot links
- `settings.json`: Theme preferences, fonts, and workspace configuration
- `dictionary.json`: Custom spelling dictionary
- `auto_backups.json`: Automatic backup snapshots
- `snapshots/`: Document revision history snapshots

FEATURES OVERVIEW: 