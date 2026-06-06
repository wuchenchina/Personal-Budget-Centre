export type PasswordStrength = 'poor' | 'pass' | 'ok';

export const passwordProgressStatus: Record<
  PasswordStrength,
  'exception' | 'normal' | 'success'
> = {
  poor: 'exception',
  pass: 'normal',
  ok: 'success',
};

export const passwordStrengthLabels: Record<PasswordStrength, string> = {
  poor: 'Strength: too short',
  pass: 'Strength: medium',
  ok: 'Strength: strong',
};

export function passwordStrengthFor(value: string | undefined): PasswordStrength {
  if (value !== undefined && value.length > 9) {
    return 'ok';
  }

  if (value !== undefined && value.length > 5) {
    return 'pass';
  }

  return 'poor';
}
