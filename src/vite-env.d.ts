/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase is configured in src/config/firebaseWebConfig.ts (not env).
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
