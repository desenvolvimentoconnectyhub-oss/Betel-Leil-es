export function whatsappSenderLabel(input: { agentName?: string; agentKey?: string; phone: string }) {
  const registeredName = input.agentName?.trim() || "";
  const technicalName = registeredName === input.agentKey || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(registeredName);
  const name = registeredName && !technicalName ? registeredName : "Agente sem nome";
  const rawPhone = input.phone.trim();
  const digits = rawPhone.replace(/\D/g, "");
  let phone = "Telefone indisponível";
  if (/^\+?[\d\s().-]+$/.test(rawPhone) && digits.length >= 10 && digits.length <= 15) {
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      phone = `+55 (${digits.slice(2, 4)}) ${digits.slice(4, -4)}-${digits.slice(-4)}`;
    } else if (!rawPhone.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
      phone = `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}`;
    } else {
      phone = `+${digits}`;
    }
  }
  return `${name} — ${phone}`;
}
