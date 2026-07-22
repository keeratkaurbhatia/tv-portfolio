import { hasMasterControlSession, isLocalRequest } from "@/app/station-auth";

export async function GET(request: Request) {
  try {
    if (await hasMasterControlSession(request)) {
      return Response.json({ authenticated: true, isOwner: true, displayName: "MASTER CONTROL", local: isLocalRequest(request) });
    }
  } catch {
    // The public broadcast remains available if the owner vault is offline.
  }

  return Response.json({
    authenticated: false,
    isOwner: false,
    local: isLocalRequest(request),
  });
}
