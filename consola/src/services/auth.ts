export async function loginERP(email: string, password: string) {
  const res = await fetch(`${process.env.REACT_APP_API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error("Credenciales inválidas");
  }

  const data = await res.json();

  // Guarda el token HS256 del ERP
  localStorage.setItem("token", data.token);

  return data;
}
