# Tournament Tree
A simple, framework‑free tournament generator for 4‑player matches (top‑2 advance, best 3rds fill) with Google Sheets as the source of participants.

## Requirements

- A static web server (or open `index.html` directly)
- A Google Sheet that you can publish to the web as CSV

## Google Sheets setup

1. Create a sheet with headers in row 1. The app accepts either of these header name pairs (case-insensitive):
   - `Participants` (or `Name`) — participant name
   - `Countries` (or `Flag`) — URL to a flag image (optional)
2. Fill each subsequent row with a participant.
3. File → Share → **Publish to web** → Link → Entire sheet → **CSV** → Publish.
4. The app is pre-configured to fetch from a published Google Sheet. Click **Load participants** in the UI to pull the CSV from the project's configured sheet.

## Using the app

1. Click **Load participants** to fetch the published Google Sheet and populate the participants list.
2. Click **Generate Round 1** to seed the initial matches.
3. Enter **points** for each player in every match.
4. Click **Compute Round** to lock standings and mark the round computed.
5. Click **Build Next Round** to create the next round. The app automatically adds **best 3rd places** by points if needed to reach a multiple of 4.
6. Repeat 3–5 until the **Final Table** of 4.

## Notes

- BYE slots are auto‑filled when the last match has fewer than 4 players.
- Ties are broken alphabetically by player name, then by id (stable but arbitrary). You can extend this in `computePlacements`.
  -- Export/Import state via the UI has been removed in this build; the app automatically uses the configured Google Sheet as the source of truth.
- Styling is in `styles.css`. Customize freely.

## Security

- CSV fetching is client‑side. If your CSV requires authentication, use a small proxy or switch to the Google Sheets API with an API key and a public sheet. (This template uses the simpler **Publish to web (CSV)** approach.)
