# Tournament Tree – Vanilla JS

A simple, framework‑free tournament generator for 4‑player matches (top‑2 advance, best 3rds fill) with Google Sheets as the source of participants.

## Requirements
- A static web server (or open `index.html` directly)
- A Google Sheet that you can publish to the web as CSV

## Google Sheets setup
1. Create a sheet with headers in row 1:
   - A1: **Name**
   - B1: **Flag** (URL to a flag image, optional)
2. Fill each subsequent row with a participant.
3. File → Share → **Publish to web** → Link → Entire sheet → **CSV** → Publish.
4. Copy the URL. In the app, paste into the input and click **Load**.

## Using the app
1. **Load** participants using your CSV link (or **Sample** to test).
2. Click **Generate Round 1** to seed the initial matches.
3. Enter **points** for each player in every match.
4. Click **Compute Round** to lock standings and mark the round computed.
5. Click **Build Next Round** to create the next round. The app automatically adds **best 3rd places** by points if needed to reach a multiple of 4.
6. Repeat 3–5 until the **Final Table** of 4.

## Notes
- BYE slots are auto‑filled when the last match has fewer than 4 players.
- Ties are broken alphabetically by player name, then by id (stable but arbitrary). You can extend this in `computePlacements`.
- Use **Export State** to save progress and **Import State** to resume.
- Styling is in `styles.css`. Customize freely.

## Security
- CSV fetching is client‑side. If your CSV requires authentication, use a small proxy or switch to the Google Sheets API with an API key and a public sheet. (This template uses the simpler **Publish to web (CSV)** approach.)
