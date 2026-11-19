# PGUK Timesheet

A simple mobile web app for drivers to log day/night shift hours worked and
export a PDF for each payroll period. No server, no accounts, no admin
overhead — each driver installs it on their own phone and it saves data
locally on that device.

## How it works

- Each entry is a day logged: the **date**, then the **start and finish
  times** on a 24-hour clock (to be checked against the tacho record).
- Nothing ticked means a **standard day shift**. The driver can instead tick
  **Night shift premium**, **Annual leave** or **Stood down**.
- Ticking **Night shift premium** pops up a box asking who they delivered to
  (required). The hours are still logged so the premium can be confirmed.
- **Annual leave** and **Stood down** are automatically logged as a 12 hour
  day (no times needed).
- A standard day is **12 hours**. Anything over that is **overtime**. Days
  under 12 hours are still paid as a full day.
- The summary shows total days worked, night shift premiums, annual leave
  days, stood down days and total overtime.
- Payroll periods run **19th to 18th** (e.g. 19 Jun – 18 Jul). The app shows
  one period at a time with prev/next buttons to move between periods.
- Tap **Export period to PDF** — it generates a PDF containing only the
  entries that fall within the payroll period currently on screen: a table of
  every day (times, hours, day type, overtime), a totals table, and the
  driver declaration. It then opens the phone's share sheet so it can be sent
  straight to payroll over email/WhatsApp/Teams.
- Data stays on the driver's device (browser local storage). Nothing is
  uploaded anywhere.

## Publishing it so drivers can install it

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save.
4. GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/`. That's the link to send
   to drivers.

## Installing on a phone (Add to Home Screen)

**iPhone (Safari):** open the link → tap the Share icon → **Add to Home
Screen**.

**Android (Chrome):** open the link → tap the ⋮ menu → **Add to Home
screen** / **Install app**.

Once installed it behaves like a normal app icon and works offline after the
first load.

## If you update the files later

This app is a Progressive Web App, which caches itself on the phone so it
still works offline. That means after you push a change and redeploy:

- The **page itself** (HTML/CSS/JS) is set to always check the network first,
  so a simple pull-to-refresh / reopen of the app should pick up the change
  within a few seconds of the new version going live on GitHub Pages.
- If a phone still shows the old version, force it: in the browser, open the
  site's settings and choose **Clear site data** (or in Chrome: ⋮ menu → site
  info icon → **Clear & reset**), then reload. This only clears the app's
  cache, not the local timesheet log — but export/back up any unsaved
  entries first to be safe.

## Notes

- Everything runs entirely in the browser — there is no backend and no data
  leaves the phone until the driver chooses to share the exported PDF.
- Each driver's data is separate and local to their own phone/browser.
- If someone clears their browser data or switches phones, their history is
  lost — encourage them to export/send their PDF at the end of each payroll
  period as intended.
