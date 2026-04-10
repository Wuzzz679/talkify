import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyA1Rx0yulyeYzk_uPxRykvT_PzpDWfroOo",
  authDomain: "talkify-11901.firebaseapp.com",
  projectId: "talkify-11901",
  storageBucket: "talkify-11901.firebasestorage.app",
  messagingSenderId: "302289814955",
  appId: "1:302289814955:web:24367525f842d0ff77feee",
  measurementId: "G-JLD0G3PSZJ"
};

const app = initializeApp(firebaseConfig);


const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };