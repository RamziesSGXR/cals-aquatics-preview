/* ------------------------------------------------------------------
   Default content. The site shows these values until the owner saves
   something different from the dashboard. The same text is also
   written into the HTML so search engines see it without running JS.
------------------------------------------------------------------- */

export const DEFAULT_SETTINGS = {
  business: {
    name: "Cal's Perfection Aquatics",
    owner: "Cameron Latimer",
    phone: "(509) 828-9399",
    email: "calsperfectionaquatics@gmail.com",
    hoursText: "9:00 a.m.–5:00 p.m. Pacific",
    yelpUrl: "https://www.yelp.com/biz/cals-perfection-aquatics-spokane-valley",
    facebookUrl: "https://www.facebook.com/profile.php?id=61557978218930",
  },
  announcement: {
    enabled: false,
    text: "",
  },
  discount: {
    enabled: true,
    code: "DIRTYFISH",
    offer: "15% off your next cleaning",
    winLevel: 5,
  },
  about: {
    photoUrl: "images/cameron.jpg",
    bio:
      "Cal's Perfection Aquatics is run by Cameron Latimer. It started with a passion for pristine, thriving aquariums, and grew to cover ponds, water features, and just about every kind of aquatic setup in between.\n\n" +
      "The goal is simple: take the stress out of aquarium maintenance. Freshwater, brackish, or saltwater, Cameron handles the cleaning, the water testing, and the regular upkeep so you can just enjoy the view.\n\n" +
      "The best part of the job is the moment a client sees their tank the way it was always meant to look.",
    facts: [
      { label: "Works on", value: "Freshwater, brackish, and saltwater" },
      { label: "Also cleans", value: "Ponds and water features" },
      { label: "Based in", value: "The Spokane area" },
    ],
  },
  booking: {
    noticeDays: 1,   // how many days ahead someone has to ask
    weeksAhead: 8,   // how far ahead the public calendar shows
  },
};

const day = (open) => ({ open, start: "09:00", end: "17:00" });

export const DEFAULT_AVAILABILITY = {
  // index 0 = Sunday … 6 = Saturday
  weekly: [day(true), day(true), day(true), day(true), day(true), day(true), day(true)],
  // { id, date: "YYYY-MM-DD", allDay: true }  or  { id, date, start: "HH:MM", end: "HH:MM" }
  blocks: [],
};
