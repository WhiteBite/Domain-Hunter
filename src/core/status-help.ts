/** Conservative EPP/RDAP explanations. Unknown registry-specific codes stay raw. */
export function statusHelpKey(status: string): string | null {
  const s = status.toLowerCase().replace(/[\s_-]/g, '');
  if (s === 'ok' || s === 'active' || s === 'registered') return 'card.status.active';
  if (s === 'inactive') return 'card.status.inactive';
  if (s === 'delegated') return 'card.status.delegated';
  if (s === 'clienthold' || s === 'serverhold') return 'card.status.hold';
  if (s === 'pendingdelete') return 'card.status.pendingDelete';
  if (s === 'redemptionperiod') return 'card.status.redemption';
  if (['pendingcreate', 'pendingrenew', 'pendingtransfer', 'pendingupdate', 'pendingrestore'].includes(s)) return 'card.status.pending';
  if (s === 'addperiod' || s === 'autorenewperiod' || s === 'renewperiod' || s === 'transferperiod') return 'card.status.grace';
  if (/^(client|server)(delete|renew|transfer|update)prohibited$/.test(s)) return 'card.status.restricted';
  return null;
}
