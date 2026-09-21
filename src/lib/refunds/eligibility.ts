export function isPartnerRefundAllowed(channel: string): boolean {
  return channel !== "aged";
}