import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: if you deploy to https://<user>.github.io/<repo-name>/
// set base to "/<repo-name>/" below. If you deploy to a custom domain
// or to https://<user>.github.io/ (a "user site" repo), leave it as "/".
export default defineConfig({
  base: "/card-table/",
  plugins: [react()],
});
