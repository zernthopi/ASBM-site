import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Une actualité = un fichier Markdown dans src/content/actualites/.
// Les fichiers dont le nom commence par « _ » sont des modèles et ne sont pas publiés.
const actualites = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/actualites' }),
  schema: z.object({
    titre: z.string(),
    // Date de l'événement (ou de publication pour une simple nouvelle)
    date: z.coerce.date(),
    heure: z.string().optional(),
    format: z.enum(['open', 'dyp', 'championnat', 'vie-du-club']),
    lieu: z.string().optional(),
    // Marque des tables utilisées (Bonzini par défaut pour les tournois au club)
    table: z.string().optional(),
    resume: z.string(),
    inscription: z.string().url().optional(),
    brouillon: z.boolean().default(false),
  }),
});

export const collections = { actualites };
