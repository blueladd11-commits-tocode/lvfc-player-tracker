import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
await setPersistence(auth, browserLocalPersistence);

const root = document.getElementById('app');
root.innerHTML = `<main class="screen"><h1>LVFC Firebase connected</h1><p>Authentication and Firestore are now connected. The production role dashboards are being migrated.</p></main>`;

onAuthStateChanged(auth, user => {
  console.log('LVFC Firebase user:', user?.uid || 'not signed in');
});

export { auth, db };
