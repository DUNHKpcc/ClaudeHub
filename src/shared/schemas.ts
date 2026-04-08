import { z } from "zod";

export const dependencyNameSchema = z.enum(["node", "npm", "git", "claude"]);

export const dependencyStateSchema = z.enum(["installed", "missing", "outdated", "broken"]);

export const dependencyStatusSchema = z.object({
  name: dependencyNameSchema,
  state: dependencyStateSchema,
  version: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  message: z.string().min(1).optional()
});

export const configInputSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().or(z.literal("")),
  model: z.string().min(1)
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type ConfigInput = z.infer<typeof configInputSchema>;
