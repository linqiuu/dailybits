export function getSubscriptionReuseAction(subscription: {
  isActive: boolean;
}): { action: "conflict" } | { action: "reactivate" } {
  return subscription.isActive ? { action: "conflict" } : { action: "reactivate" };
}
