// FIX: Manually define `import.meta.env` types
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// FIX: Define the type for Vite worker imports to resolve TS2307
declare module '*?worker' {
  const workerFactory: {
    new (): Worker;
  };
  export default workerFactory;
}