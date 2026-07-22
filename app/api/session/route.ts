import { getChatGPTUser } from "@/app/chatgpt-auth";
import { hasMasterControlSession, isLocalRequest } from "@/app/station-auth";

export async function GET(request: Request) {
  try {
    if (await hasMasterControlSession(request)) {
      return Response.json({ authenticated: true, isOwner: true, displayName: "MASTER CONTROL", local: isLocalRequest(request) });
    }
  } catch {
    // The public broadcast remains available if the owner vault is offline.
  }

  const user = await getChatGPTUser();
  if (!user) return Response.json({ authenticated: false, isOwner: false, local: isLocalRequest(request) });

  const ownerEmail = process.env.PORTFOLIO_OWNER_EMAIL?.trim().toLowerCase();
  return Response.json({
    authenticated: true,
    isOwner: false,
    displayName: user.displayName,
    configured: Boolean(ownerEmail),
    identityOwner: Boolean(ownerEmail && user.email.toLowerCase() === ownerEmail),
  });
}
