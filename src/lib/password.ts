// Reglas de la contraseña nueva (página «Nouveau mot de passe»). Se comprueban ANTES de gastar el
// enlace del correo: el token solo sirve una vez, así que un fallo después de canjearlo obligaría
// a pedir otro correo. Mínimo 8, como el alta de clientes (registerClientAction).
export const PASSWORD_MIN_LENGTH = 8

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
  }
  if (password !== confirm) return 'Les mots de passe ne correspondent pas.'
  return null
}
