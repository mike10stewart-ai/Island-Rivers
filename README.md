# Island Rivers

Live water levels, flood advisories, 5-day forecasts, rain, tides and push alerts for Vancouver Island rivers.

## What's in this folder

- `site/` is the app itself: the page, service worker, icons and manifest.
- `netlify/functions/` holds the alert server, with three small functions:
  - `vapid` creates the app's notification key on first use and stores it in Netlify Blobs.
  - `subscribe` saves which rivers each phone follows.
  - `check-rivers` runs every 15 minutes. It checks advisories and marks and sends the alerts.
- `lib/` is shared code for the functions.
- `netlify.toml` tells Netlify to publish `site/` and build the functions.

## Option A: app only, no alerts (drag and drop)

Drag the `site` folder onto your site's **Deploys** page in Netlify. Everything works except alerts, and the alerts card stays hidden.

## Option B: app with push alerts (one-time setup, about 10 minutes)

Netlify only runs the alert functions when the site is deployed from GitHub (or from the Netlify command-line tool).

1. Create a free account at github.com if you don't have one.
2. Click **New repository**, name it `island-rivers`, set it to **Public** or **Private**, and click **Create repository**.
3. On the empty repository page, click **uploading an existing file**. Drag in everything inside this folder (`site`, `netlify`, `lib`, `netlify.toml`, `package.json`, `README.md`), then click **Commit changes**.
4. In Netlify, open your site, then go to **Site configuration → Build & deploy → Continuous deployment → Link repository**. Choose GitHub, authorise Netlify, and pick `island-rivers`.
5. Leave the build settings as Netlify fills them in from `netlify.toml` (publish directory `site`, functions `netlify/functions`) and deploy.
6. Open the site. The **Alerts for this river** card now appears. On iPhone it works once the app is added to the Home Screen and opened from there.

After that, any change you upload to the GitHub repository deploys automatically. You don't need to drag folders onto Netlify any more.

There are no keys to set up. The notification key is generated on first use and stored in Netlify Blobs.

## Optional extras

- **Visitor counting:** sign up free at goatcounter.com and choose a code, for example `islandrivers`. In `site/index.html`, find `const GOATCOUNTER_CODE = '';` and put your code between the quotes.
- **Short web address:** buy a domain (for example islandrivers.ca, about $15/year) from any registrar. In Netlify, go to **Domain management → Add a domain** and follow the steps, which Netlify can handle for you if you buy the domain through Netlify.

## Data sources

- Water levels and flows: Environment and Climate Change Canada, Water Survey of Canada (real-time, provisional).
- Advisories, return periods and 5-day forecasts: BC River Forecast Centre.
- Typical and record highs: Environment Canada yearly peak records.
- Rain: Environment Canada GEM model via Open-Meteo.
- Tides: Fisheries and Oceans Canada predictions.
- Map: © OpenStreetMap contributors, © CARTO.
