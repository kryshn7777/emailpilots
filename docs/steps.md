# Email Pilots - Developer Steps & Commands

## Development Workflow

1. **Start the Development Server**
   Runs Vite for the frontend and concurrently compiles the Electron main process.
   ```bash
   npm run dev
   ```

2. **Run Tests**
   Executes the Vitest suite for unit and integration testing.
   ```bash
   npm run test
   ```
   *For watch mode:*
   ```bash
   npm run test:watch
   ```

3. **CLI Testing**
   Run an immediate test send from the terminal using `ts-node` (bypasses Electron GUI).
   ```bash
   npm run test-send
   ```

## Build & Release

1. **Build for Production**
   Compiles Vite, builds the Electron main process via esbuild, and packages the application using `electron-builder`.
   ```bash
   npm run build
   ```

2. **Output**
   The compiled executables (NSIS installer and Portable version) will be outputted to the `release/` directory.

## File Structure Guide
- `src/` - Core logic, Email Services, Scheduler, Config parsing.
- `electron/` - Electron Main process (`main.ts`, `preload.ts`).
- `public/` & `index.html` - Vite frontend assets and entry point.
- `docs/` - System documentation (Features, Onboarding, Procedures).
