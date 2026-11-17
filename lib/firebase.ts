import { type FirebaseApp, type FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Firebase só pode ser inicializado no navegador.");
  }
}

function assertConfig(): void {
  const required = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.storageBucket,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId
  ];
  if (required.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new Error("Configuração do Firebase ausente.");
  }
}

export function getFirebaseApp(): FirebaseApp {
  assertBrowser();
  if (getApps().length > 0) {
    return getApp();
  }
  assertConfig();
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirestoreDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function explainFirebaseError(error: unknown, fallback: string): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code === "permission-denied") {
    return "O Firestore recusou a gravação. Publique as regras e confira os limites dos campos.";
  }
  if (code === "unavailable") {
    return "O Firestore está indisponível. Tente novamente.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Este domínio não está autorizado no Firebase Auth.";
  }
  if (code === "auth/popup-blocked") {
    return "O navegador bloqueou a janela de entrada.";
  }
  if (code === "auth/network-request-failed") {
    return "Falha de rede ao entrar com o Google.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "";
  }
  if (code) {
    return fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
