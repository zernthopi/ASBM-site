// @ts-check
import { defineConfig } from 'astro/config';

// Quand le nom de domaine sera choisi, renseigner `site` (ex. 'https://www.asbm-marseille.fr')
// pour activer les URL canoniques.
export default defineConfig({
  site: undefined,
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'never',
    assets: 'assets', // pas de dossier « _astro » : GitHub Pages ignore les dossiers commençant par « _ »
  },
});
