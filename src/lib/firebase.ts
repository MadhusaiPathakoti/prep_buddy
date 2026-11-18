import { getFirestore } from 'firebase/firestore'
import { app } from './firebaseApp'

// The Firebase web config lives in firebaseApp.ts (it is safe to ship; see the note there).
export { app }
export const db = getFirestore(app)
