import type { FirebaseOptions } from 'firebase/app'

/** Web app config from Firebase Console → Project settings → Your apps. */
export const firebaseSyncDisabled = false

export const firebaseWebConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCgPI6xpYNUr8PLJwPdilXJubiMzmAKEEE',
  authDomain: 'mindpulse-82eb0.firebaseapp.com',
  databaseURL: 'https://mindpulse-82eb0-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'mindpulse-82eb0',
  storageBucket: 'mindpulse-82eb0.firebasestorage.app',
  messagingSenderId: '505194302790',
  appId: '1:505194302790:web:e1590bd08abd1ad2bb2947',
  measurementId: 'G-CP2DNR2EL1',
}

export const firebaseWebConfigPath = 'src/config/firebaseWebConfig.ts'
