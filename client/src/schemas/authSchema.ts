import { z } from 'zod';
import type { TFunction } from 'i18next';

const keyT = ((key: string) => key) as TFunction;

export function createLoginSchema(t: TFunction) {
  return z.object({
    login: z.string().min(2, t('login.validation.loginMin')),

    password: z
      .string()
      .min(8, t('login.validation.passwordMin'))
      .regex(
        /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/,
        t('login.validation.passwordFormat'),
      ),
  });
}

export function createChangePasswordSchema(t: TFunction) {
  return z
    .object({
      oldPassword: z
        .string()
        .min(1, t('profile.validation.currentPasswordRequired')),

      newPassword: z
        .string()
        .min(8, t('profile.validation.passwordMin'))
        .max(50, t('profile.validation.passwordMax'))
        .regex(
          /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/,
          t('profile.validation.passwordComplexity'),
        ),

      confirmPassword: z
        .string()
        .min(1, t('profile.validation.confirmPasswordRequired')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('profile.validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });
}

export const loginSchema = createLoginSchema(keyT);
export const changePasswordSchema = createChangePasswordSchema(keyT);

export type ChangePasswordFormData = z.infer<
  ReturnType<typeof createChangePasswordSchema>
>;

export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;

function createPasswordRecoveryPasswordSchema(t: TFunction) {
  return z
    .string()
    .min(8, t('passwordReset.validation.passwordMin'))
    .max(50, t('passwordReset.validation.passwordMax'))
    .regex(
      /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/,
      t('passwordReset.validation.passwordComplexity'),
    );
}

export const passwordResetRequestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(2, keyT('passwordReset.validation.identifierRequired'))
    .max(120, keyT('passwordReset.validation.identifierMax')),
});

export const passwordResetConfirmSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(32, keyT('passwordReset.validation.tokenInvalid'))
      .max(200, keyT('passwordReset.validation.tokenInvalid')),
    newPassword: createPasswordRecoveryPasswordSchema(keyT),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: keyT('passwordReset.validation.passwordsMismatch'),
    path: ['confirmPassword'],
  });

export type PasswordResetRequestFormData = z.infer<
  typeof passwordResetRequestSchema
>;
export type PasswordResetConfirmFormData = z.infer<
  typeof passwordResetConfirmSchema
>;
