# Cal's Perfection Aquatics website (preview)

A rebuild of [calsperfectionaquatics.com](https://www.calsperfectionaquatics.com/) with a playable tank-cleaning game, a public availability calendar, and an owner dashboard.

**Preview:** https://ramziessgxr.github.io/cals-aquatics-preview/
**Owner dashboard:** https://ramziessgxr.github.io/cals-aquatics-preview/admin.html

This copy is hidden from Google on purpose (every page has a `noindex` tag) so it doesn't compete with the real site while it's a preview. See [Going live](#going-live).

---

## What's on the site

| Page | What it does |
|---|---|
| `index.html` | Home: animated tank hero, services, how it works, recent work gallery, meet Cameron, availability calendar, game, FAQ, request form |
| `about.html` | Cameron's story, quick facts, what he works on, service area |
| `admin.html` | Owner dashboard (sign-in required once Firebase is connected) |
| `home/` | Redirects the old Google Sites `/home` link to the new homepage |

**The game.** Tap algae before it fogs the water. Each level adds more algae and more fish (tapping a fish costs clarity). Clearing the owner's chosen level (default 5, about a minute of play) reveals the discount code; players can keep going for a high score until the water fogs up. Winners can send the code straight into the request form.

**Request form.** When a visitor sends a request, a copy is saved to Cameron's dashboard inbox and their text or email app opens with everything filled in, addressed to him, so he's notified on his phone right away. A hidden spam trap and the database rules keep junk out.

## The owner dashboard

Cameron can change all of this without touching code:

- **Requests:** every request sent from the website's form lands in an inbox, newest first, with the customer's contact info, tank details, preferred day, any discount code (flagged if it matches the current one), and notes. Call, Text, and Email buttons open his phone or email with a friendly reply already written, and using one marks the request *Contacted*. He can also mark requests *Done*, move them back to *New*, or delete them. The tab shows a count of new requests, the dashboard opens straight to the inbox when someone is waiting, and it checks for new ones every minute while open.

- **Discount & game:** turn the discount on or off, change the code, what it's worth, and which level wins it
- **Availability:** block whole days, block busy hours on a day, block a date range (vacations), set normal working hours per weekday, minimum notice, and how far ahead people can pick
- **Contact info:** phone, email, hours, Yelp and Facebook links
- **About page:** his name, photo, story, and quick facts (with writing prompts if he's stuck)
- **Announcement:** a banner across the top of every page

Customers only ever see *open*, *partly booked*, or *booked*. They never see why a day is blocked.

Only Cameron can read requests. Visitors can send one, but the database rules stop anyone else from reading, changing, or deleting them.

### Preview mode vs. live

Until Firebase is connected, the dashboard runs in **preview mode**: everything works, but changes are saved only in the browser you're using. That's good for demoing; it does not change what visitors see. The same goes for requests: in preview mode, the inbox only shows requests sent from that same browser. A yellow banner makes this obvious.

## Connect the owner login

About 15 minutes, free. Ideally Cameron does this with his business Google account so he owns it.

1. Go to [console.firebase.google.com](https://console.firebase.google.com), **Create a project** (any name, e.g. `cals-perfection-aquatics`). Google Analytics can be turned off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Pick a support email and save.
3. **Authentication → Settings → Authorized domains → Add domain:** `ramziessgxr.github.io` (later also `www.calsperfectionaquatics.com` and `calsperfectionaquatics.com`).
4. **Build → Firestore Database → Create database.** Choose **production mode** and a US location near Spokane (e.g. `us-west1`, Oregon).
5. **Firestore → Rules:** replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**. These rules let anyone read the site content and send a cleaning request, but only the listed Google account(s) can change the site or read requests. (If you set Firebase up before the Requests inbox existed, paste the rules in again and re-publish.)
6. **Project settings (gear icon) → General → Your apps → Web (`</>`):** register an app, then copy `apiKey`, `authDomain`, `projectId`, and `appId` into [`js/config.js`](js/config.js). Commit.
7. Open `/admin.html`, sign in with `calsperfectionaquatics@gmail.com`, change something, and **Save**. The first save creates the content in the database.

To test it yourself before handing it over, add your own Google address to **both** `OWNER_EMAILS` in `js/config.js` **and** the list in `firestore.rules` (then re-publish the rules). Take it back out afterward.

**Is the config safe to publish in a public repo?** Yes. Firebase web config identifies the project; it isn't a password. The security rules are what block everyone except the owner from writing. There are no passwords or secret keys anywhere in this repo.

**Cost:** the free Spark plan covers this easily. Each page view does 2 small database reads, each request is 1 write, and the free tier allows tens of thousands of each per day.

## Going live

When Cameron is happy with it and wants it on calsperfectionaquatics.com:

1. **Move the repo to Cameron.** He makes a GitHub account, then in this repo: Settings → General → Danger Zone → **Transfer ownership**. (Or he forks it.) His business site shouldn't depend on someone else's account.
2. **Remove the preview `noindex` lines** from `index.html` and `about.html` (search for `PREVIEW ONLY`). Leave the one in `admin.html`.
3. **Swap the preview address for the real one.** Find and replace `https://ramziessgxr.github.io/cals-aquatics-preview/` with `https://www.calsperfectionaquatics.com/` in `index.html`, `about.html`, `sitemap.xml`, `robots.txt`, and `404.html`.
4. **Point the domain at GitHub Pages.** In the repo: Settings → Pages → Custom domain → `www.calsperfectionaquatics.com`, and tick *Enforce HTTPS* once it's offered. At the domain registrar (Squarespace Domains if it was bought through Google Domains):
   - `CNAME` record: `www` → `<github-username>.github.io`
   - `A` records for the bare domain: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Remove the old Google Sites custom URL mapping.
5. **Add both domains** to Firebase → Authentication → Authorized domains.
6. **Google Search Console:** add the domain, verify with DNS, and submit `https://www.calsperfectionaquatics.com/sitemap.xml`.

The old Google Sites homepage was at `/home`; the `home/` folder forwards those old links to the new homepage.

## SEO

### Already built in

- Page titles and descriptions written around what people actually search ("aquarium cleaning Spokane", ponds, water features, the service-area cities)
- One clear H1 per page, real headings, and all key text in the HTML itself (not only loaded by JavaScript), so search engines read it on the first pass
- Structured data: `WebSite`, `LocalBusiness` (logo, photos, phone, email, service area, Yelp and Facebook links, services, specialties), `FAQPage`, and a `ProfilePage` with breadcrumbs for Cameron
- Service-area cities named in plain text on both pages
- Fast and mobile-first: no frameworks, self-hosted fonts, the database code loads only when needed, the tank animation pauses when it's off screen
- A designed share image, so texted and posted links show a proper preview card
- `sitemap.xml` (including all photos, so they can show in Google Images), `robots.txt`, a friendly 404 page, and a redirect for the old `/home` URL
- Photos served as WebP in phone and desktop sizes (the gallery is about 255KB on a phone instead of 1.2MB), with JPEG fallbacks
- Fonts preloaded and set so the page never jumps when they arrive
- Lighthouse scores on the go-live version (Nov 10, 2026): 97–100 for Performance, Accessibility, Best Practices, and SEO on both pages, phone and desktop

### What moves the needle next (in order)

For a local service business, most of the ranking comes from outside the website.

1. **Google Business Profile.** This is what shows up for "aquarium cleaning near me" and in Google Maps. Set it up as a *service-area business* (hide the home address), list the same cities as the site, add the website link, hours, and services, and pick the closest primary category Google offers for aquarium and pond work.
2. **Reviews.** Ask every happy customer for a Google review, ideally the same day, with a direct link. Reply to every one. Review count and recency matter a lot locally.
3. **Consistent name, phone, and website everywhere.** Google, Yelp, Facebook, Nextdoor, Bing Places, and Apple Business Connect should all match the site exactly.
4. **Real photos.** Before-and-after shots are the best content this business has. Post them to the Google profile regularly, and keep adding to the site's Recent work gallery (see below).
5. **Grow the content slowly and genuinely.** Good next pages: a pond and water feature page with photos, and a short guide like "How often should you clean a fish tank?". Avoid thin copy-paste pages for each city; Google treats those as spam.
6. **Local links.** Local fish stores, pet shops, vets, the Spokane chamber of commerce, and neighborhood groups. One real local link beats dozens of directory listings.
7. **Watch Search Console** after launch to see which searches bring people in, and write toward those.

Skip anything that promises fast rankings: bought links, keyword stuffing, or incentivized and fake reviews. They backfire.

## Adding photos to the gallery

Gallery photos live in `images/work/` as `name.jpg` / `name.webp` (full size, about 1600px wide), plus `name-800.jpg`, `name-800.webp`, and `name-400.webp`. To add one, save those sizes there, copy one of the `<li>` lines in the Recent work section of `index.html`, update the file names, sizes, caption, and description (`alt`), and add the photo to `sitemap.xml`. Describe what's in the photo in the `alt` text; it helps both screen-reader users and Google Images.

Phone photos look best cropped tight to the tank, with the phone's watermark and clutter (buckets, towels) cropped out.

## Editing things that aren't in the dashboard

Services, the FAQ, the "how it works" steps, and the service-area city list live in the HTML (that's better for SEO). If you change the FAQ or the cities, update the matching structured data near the top of `index.html` so they stay in sync.

## Files

```
index.html, about.html, admin.html, 404.html, home/
css/site.css         site styles
css/admin.css        dashboard styles
js/config.js         Firebase settings + owner email list
js/defaults.js       default content used until the owner saves changes
js/store.js          loads and saves content (Firebase or preview mode)
js/calendar.js       availability math shared by the calendar and dashboard
js/tank.js           the animated tank
js/game.js           the tank-cleaning game
js/site.js           public pages
js/admin.js          dashboard
firestore.rules      database security rules (paste into Firebase)
fonts/               Baloo 2 (700, 800) and Figtree (400, 600), self-hosted (SIL Open Font License)
```

## Good to know

- The discount code works like a coupon, not a password: someone determined could find it in the page. Pick an offer Cameron is happy to honor, and change the code in the dashboard whenever he likes.
- High scores and won codes are remembered per device.
- The calendar shows availability for requests. It doesn't book appointments by itself; Cameron confirms each one.
