import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase's web config is safe to ship in the client bundle — it's not a secret. Access
 * control comes from Firestore Security Rules (see README), not from hiding these values.
 * Fill these in from Firebase Console > Project settings > Your apps > SDK setup and config.
 */
const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
