import { z } from "zod";
import { roles } from "./types";
export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres.")
  .max(72, "Usa como máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "Incluye una letra.")
  .regex(/[0-9]/, "Incluye un número.");
export const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Escribe tu nombre completo.").max(100),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+0-9 ()-]*$/, "Teléfono inválido."),
});
export const createUserSchema = profileSchema.extend({
  email: z.email("Correo inválido.").max(254),
  password: passwordSchema,
});
export const updateUserSchema = profileSchema.extend({
  role: z.enum(roles),
  status: z.enum(["activo", "inactivo"]),
});
