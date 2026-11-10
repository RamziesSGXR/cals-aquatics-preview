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
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
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
