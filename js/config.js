/* ------------------------------------------------------------------
   Site configuration
   ------------------------------------------------------------------
   FIREBASE_CONFIG: paste the values from Firebase console →
   Project settings → Your apps → Web app. These values are meant to
   be public (they identify the project, they are not passwords).
   Who can change the site is decided by firestore.rules, not by
   keeping this file secret.

   Leave apiKey empty and the owner dashboard runs in "preview mode":
   changes save only in the browser you're using, which is handy for
   showing the dashboard off but does not update the live site.
------------------------------------------------------------------- */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9eqGVOhZy42SnLNE_2GUPT1Gy_-mRipk",
  authDomain: "cals-perfection-aquatics.firebaseapp.com",
  projectId: "cals-perfection-aquatics",
  storageBucket: "cals-perfection-aquatics.firebasestorage.app",
  messagingSenderId: "535622809535",
  appId: "1:535622809535:web:f61be46b460bfb094a930a",
};

// Google accounts allowed into the owner dashboard. Keep this list in
// sync with the list in firestore.rules (the rules are what actually
// protect the data; this list just gives a friendly message to others).
export const OWNER_EMAILS = [
  "calsperfectionaquatics@gmail.com",
];

export const FIREBASE_VERSION = "10.12.2";

export const isFirebaseConfigured = () =>
  Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

/* ------------------------------------------------------------------
   Alerts for new cleaning requests (both optional, both free)
   - web3formsKey: emails every request to Cameron. Get a key at
     web3forms.com by entering his email; the key arrives by email.
     It's made to be public; it only lets the site send to that inbox.
   - ntfyTopic: buzzes his phone. Install the free "ntfy" app and
     subscribe to this topic name. Alerts contain no customer details,
     because anyone who knows a topic name can read it.
   Leave either one empty to turn it off.
------------------------------------------------------------------- */
export const NOTIFY = {
  web3formsKey: "",
  ntfyTopic: "cpa-requests-u4fuixqzap2jwk",
};
