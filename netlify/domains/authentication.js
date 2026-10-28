export function createAuthenticationDomain({ supabase, bodyOf, requireFields, cleanUsuario, dbError, json, disabledPassword, verifyOperationalPassword, hashOperationalPassword, resolveAdministratorContext, withStoreName, jwt, sessionClaims, jwtSecret, sessionCookie, readAllResult, httpError, todayISO, cleanText }) {
  async function authAccount(query) {
    const fields = "id,nombres,apellidos,dni,usuario,password,rol,estado,tienda_id,cambio_credenciales_pendiente,credenciales_actualizadas_en";
    let result = await query(fields);
    if (["42703", "PGRST204"].includes(result.error?.code)) {
      // Mantiene el ingreso disponible mientras la migración se aplica en bd-app.
      result = await query("id,nombres,apellidos,dni,usuario,password,rol,estado,tienda_id");
      if (result.data) {
        result.data.cambio_credenciales_pendiente = false;
        result.data.credenciales_actualizadas_en = null;
      }
    }
    return result;
  }

  async function login(event) {
    const { usuario, password } = bodyOf(event);
    requireFields({ usuario, password }, ["usuario", "password"]);
    const { data: account, error } = await authAccount(fields => supabase
      .from("usuarios").select(fields).eq("usuario", cleanUsuario(usuario)).maybeSingle());
    if (error) throw dbError(error);

    const fail = () => json(401, { error: "Usuario o contrase?a incorrectos." });
    if (!account || account.estado !== "activo") return fail();
    if (!account.password || account.password === disabledPassword) return fail();
    const verification = await verifyOperationalPassword(account.password, password);
    if (!verification.valid) return fail();
    if (verification.needsUpgrade) {
      const upgraded = await hashOperationalPassword(password);
      const { error: upgradeError } = await supabase.from("usuarios")
        .update({ password: upgraded }).eq("id", account.id).eq("password", account.password);
      if (upgradeError) throw dbError(upgradeError);
    }

    const sessionUser = {
      id: account.id, nombres: account.nombres, apellidos: account.apellidos, dni: account.dni,
      usuario: account.usuario, rol: account.rol, tienda_id: account.tienda_id,
      cambio_credenciales_pendiente: account.cambio_credenciales_pendiente,
      credenciales_actualizadas_en: account.credenciales_actualizadas_en,
    };
    const user = account.rol === "jefe_tienda"
      ? await resolveAdministratorContext(supabase, sessionUser, { allowFallback: true }) : await withStoreName(sessionUser);
    const token = jwt.sign(sessionClaims(user), jwtSecret(), { expiresIn: "10h" });
    return json(200, { user }, { "Set-Cookie": sessionCookie(token, event) });
  }

  async function credentialPermissions(user) {
    await requireSystemsCredentialAdmin(user);
    const { data, error } = await readAllResult(supabase.from("usuarios")
      .select("id,nombres,apellidos,usuario,rol,estado,cambio_credenciales_pendiente")
      .eq("estado", "activo").neq("password", disabledPassword).not("usuario", "is", null), "nombres");
    if (error) throw dbError(error);
    return { accounts: data || [] };
  }

  async function setCredentialPermission(event, user, targetId) {
    await requireSystemsCredentialAdmin(user);
    const id = Number(targetId);
    const { enabled } = bodyOf(event);
    if (!Number.isSafeInteger(id) || id < 1 || typeof enabled !== "boolean") throw httpError("Indica una cuenta y un permiso válidos.", 400);
    const { data: target, error: targetError } = await supabase.from("usuarios")
      .select("id,estado,password,usuario").eq("id", id).maybeSingle();
    if (targetError) throw dbError(targetError);
    if (!target || target.estado !== "activo" || !target.usuario || !target.password || target.password === disabledPassword)
      throw httpError("La cuenta no tiene acceso activo al sistema.", 400);
    const { data, error } = await supabase.from("usuarios")
      .update({ cambio_credenciales_pendiente: enabled }).eq("id", id)
      .select("id,cambio_credenciales_pendiente").single();
    if (error) throw dbError(error);
    return { account: data };
  }

  async function requireSystemsCredentialAdmin(user) {
    if (user.rol !== "sistemas") throw httpError("Solo Sistemas puede administrar este permiso.", 403);
    const { data, error } = await supabase.from("usuarios").select("rol,estado").eq("id", user.id).maybeSingle();
    if (error) throw dbError(error);
    if (data?.rol !== "sistemas" || data?.estado !== "activo") throw httpError("Tu cuenta ya no tiene permiso de Sistemas.", 403);
  }

  async function changeCredentials(event, user) {
    const body = bodyOf(event);
    const usuario = cleanUsuario(body.usuario);
    const password = String(body.password || "");
    if (usuario.length < 2 || usuario.length > 40 || !/^[a-z0-9._-]+$/.test(usuario))
      throw httpError("El usuario debe tener entre 2 y 40 caracteres: letras, números, punto, guion o guion bajo.", 400);
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72)
      throw httpError("La contraseña debe tener al menos 8 caracteres y no superar 72 bytes.", 400);
    if (password !== body.confirmarPassword) throw httpError("Las contraseñas no coinciden.", 400);
    const { data: current, error: currentError } = await supabase.from("usuarios")
      .select("id,nombres,apellidos,usuario,rol,estado,tienda_id,cambio_credenciales_pendiente")
      .eq("id", user.id).maybeSingle();
    if (currentError) throw dbError(currentError);
    if (!current || current.estado !== "activo") throw httpError("Tu cuenta ya no está activa.", 403);
    if (!current.cambio_credenciales_pendiente) throw httpError("Sistemas no ha habilitado el cambio de credenciales para esta cuenta.", 403);
    const { data: duplicate, error: duplicateError } = await supabase.from("usuarios")
      .select("id").eq("usuario", usuario).neq("id", user.id).limit(1);
    if (duplicateError) throw dbError(duplicateError);
    if (duplicate?.length) throw httpError("Ese nombre de usuario ya está en uso.", 409);
    const hash = await hashOperationalPassword(password);
    const { data: updated, error } = await supabase.from("usuarios")
      .update({ usuario, password: hash, cambio_credenciales_pendiente: false, credenciales_actualizadas_en: new Date().toISOString() })
      .eq("id", user.id).eq("cambio_credenciales_pendiente", true)
      .select("id,nombres,apellidos,usuario,rol,tienda_id,cambio_credenciales_pendiente,credenciales_actualizadas_en").maybeSingle();
    if (error) throw dbError(error);
    if (!updated) throw httpError("El permiso ya fue utilizado o deshabilitado. Vuelve a iniciar sesión.", 409);
    const sessionUser = { ...updated, tienda_contexto_id: user.tienda_contexto_id };
    const account = updated.rol === "jefe_tienda"
      ? await resolveAdministratorContext(supabase, sessionUser, { allowFallback: true }) : await withStoreName(sessionUser);
    const token = jwt.sign(sessionClaims(account), jwtSecret(), { expiresIn: "10h" });
    return json(200, { user: account }, { "Set-Cookie": sessionCookie(token, event) });
  }

  async function loginApoyoSeguridad(event) {
    const body = bodyOf(event);
    requireFields(body, ["dni", "foto_base64", "foto_mime"]);
    const dni = cleanText(body.dni);
    if (!/^\d{8}$/.test(dni)) throw httpError("Ingresa un DNI válido de 8 dígitos.", 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(body.foto_mime)) throw httpError("La foto debe ser JPG, PNG o WEBP.", 400);
    const { data: support, error } = await supabase.from("apoyos_seguridad")
      .select("id,usuario_id,tienda_id,fecha_inicio,fecha_fin,activo,usuarios!apoyos_seguridad_usuario_id_fkey(id,nombres,apellidos,dni,usuario,estado)")
      .eq("dni", dni).maybeSingle();
    if (error) throw dbError(error);
    const today = todayISO(); const account = support?.usuarios;
    if (!support || !support.activo || support.fecha_inicio > today || support.fecha_fin < today || account?.estado !== "activo") throw httpError("El apoyo no tiene una autorización vigente para ingresar.", 403);
    const buffer = Buffer.from(String(body.foto_base64).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buffer.length || buffer.length > 3 * 1024 * 1024) throw httpError("La foto debe pesar como máximo 3 MB.", 400);
    const extension = body.foto_mime === "image/png" ? "png" : body.foto_mime === "image/webp" ? "webp" : "jpg";
    const photoPath = `${support.tienda_id}/apoyos-seguridad/accesos/${support.id}-${Date.now()}.${extension}`;
    const uploaded = await supabase.storage.from("mi-tienda").upload(photoPath, buffer, { contentType: body.foto_mime, upsert: false });
    if (uploaded.error) throw dbError(uploaded.error);
    const clientIp = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "local";
    const access = await supabase.from("apoyo_seguridad_accesos").insert({ apoyo_id: support.id, foto_rostro_path: photoPath, ip: clientIp });
    if (access.error) throw dbError(access.error);
    const sessionUser = { id: account.id, nombres: account.nombres, apellidos: account.apellidos, dni: account.dni, usuario: account.usuario, rol: "seguridad", tienda_id: support.tienda_id, apoyo_temporal: true };
    const token = jwt.sign(sessionUser, jwtSecret(), { expiresIn: "10h" });
    return json(200, { user: await withStoreName(sessionUser) }, { "Set-Cookie": sessionCookie(token, event) });
  }

  return { authAccount, login, credentialPermissions, setCredentialPermission, changeCredentials, loginApoyoSeguridad };
}
