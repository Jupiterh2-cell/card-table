// OPTIONAL: fill this in with your own free Firebase project to enable
// real-time syncing between friends on different phones/computers.
// If you leave apiKey empty, the app runs in "local-only" mode: the
// draw/discard piles only sync between browser tabs on the SAME device
// (fine for pass-and-play, not for friends on separate phones).
//
// How to get these values (free, ~5 minutes):
// 1. Go to https://console.firebase.google.com and create a project.
// 2. In the project, click the "</>" (web) icon to register a web app.
// 3. Firebase shows you a config object — copy the values below.
// 4. In the Firebase console, go to Build > Firestore Database > Create
//    database, and start it in test mode (fine for a casual game with
//    friends; anyone with the link can read/write room data).

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);
