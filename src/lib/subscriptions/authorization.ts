import { getCurrentSession } from "../auth";
import { canManageSubscription } from "../content/access";

export async function authorizeSubscriptionActor(subscription: {
  targetType: string;
  targetId: string;
  subscriberId: string | null;
}): Promise<{ error: string; status: number } | null> {
  const session = await getCurrentSession();
  if (!session) return { error: "Unauthorized", status: 401 };
  if (!canManageSubscription(subscription, session.user)) {
    return { error: "Forbidden", status: 403 };
  }
  return null;
}
