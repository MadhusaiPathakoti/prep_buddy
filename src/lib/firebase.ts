import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase's web config is safe to ship in the client bundle — it's not a secret. Access
 * control comes from Firestore Security Rules (see README), not from hiding these values.
 * Fill these in from Firebase Console > Project settings > Your apps > SDK setup and config.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCpfaegTQ3guibhb012YknkiN_wffPZ5Hk',
  authDomain: 'prepbuddy-564d8.firebaseapp.com',
  projectId: 'prepbuddy-564d8',
  storageBucket: 'prepbuddy-564d8.firebasestorage.app',
  messagingSenderId: '286341805615',
  appId: '1:286341805615:web:959bf186f8d4bcb104b8da',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
