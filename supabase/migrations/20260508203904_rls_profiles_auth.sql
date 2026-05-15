
-- Dar acceso a authenticated para leer y actualizar su propio perfil
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Política: cada usuario solo ve su propio perfil
CREATE POLICY "users_select_own_profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Política: cada usuario solo actualiza su propio perfil
CREATE POLICY "users_update_own_profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
