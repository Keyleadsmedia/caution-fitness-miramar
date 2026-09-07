// Netlify Forms submission -> Notion "Client Leads" row.
//
// Wired as an outgoing webhook on the site's form notifications, so the
// Netlify submission log stays the durable backstop: if Notion is down or
// the token is missing, the lead is still captured and can be replayed.
//
// Required env vars (set per site in Netlify):
//   NOTION_TOKEN   internal integration secret, and the Client Leads
//                  database must be connected to that integration
// Optional:
//   NOTION_CLIENT_LEADS_DB   defaults to the Client Leads database id
//   LEAD_BUSINESS            the Business select value for this site

const DB_ID = process.env.NOTION_CLIENT_LEADS_DB || '3abf73c2b99c4d6b90297588a1dd689f';
const BUSINESS = process.env.LEAD_BUSINESS || 'Caution CrossFit & Fitness';
const NOTION_VERSION = '2022-06-28';

const text = (v) => (v == null ? '' : String(v)).trim();
const rich = (v) => (text(v) ? { rich_text: [{ text: { content: text(v).slice(0, 2000) } }] } : undefined);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    // Do not fail the webhook. The submission is already safe in Netlify.
    console.error('NOTION_TOKEN is not set. Lead captured by Netlify Forms only, replay once the token exists.');
    return { statusCode: 200, body: 'Notion token not configured; lead held in Netlify Forms.' };
  }

  let d = {};
  let submittedAt = null;
  let referrer = '';
  try {
    const body = JSON.parse(event.body || '{}');
    const p = body.payload || body;
    d = p.data || {};
    submittedAt = p.created_at || null;
    referrer = p.referrer || p.site_url || '';
  } catch (err) {
    console.error('Could not parse webhook body:', err.message);
    return { statusCode: 400, body: 'Bad payload' };
  }

  const name = [text(d.firstName), text(d.lastName)].filter(Boolean).join(' ')
    || text(d.name) || text(d.full_name) || text(d.email) || 'Unnamed lead';

  const interest = [text(d.program), text(d.experience)].filter(Boolean).join(' / ');
  const received = (submittedAt || new Date().toISOString()).slice(0, 10);

  const properties = {
    Name: { title: [{ text: { content: name.slice(0, 200) } }] },
    Business: { select: { name: BUSINESS } },
    Status: { select: { name: 'New' } },
    Received: { date: { start: received } },
  };
  if (text(d.email)) properties.Email = { email: text(d.email) };
  if (text(d.phone)) properties.Phone = { phone_number: text(d.phone) };
  if (rich(d.message)) properties.Message = rich(d.message);
  if (interest) properties['Service Interest'] = rich(interest);
  const sourcePage = text(d.pageUrl) || referrer;
  if (/^https?:\/\//i.test(sourcePage)) properties['Source Page'] = { url: sourcePage };

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: DB_ID }, properties }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Notion rejected the lead:', res.status, detail.slice(0, 500));
      return { statusCode: 200, body: `Notion error ${res.status}; lead held in Netlify Forms.` };
    }

    const page = await res.json();
    console.log('Created Notion lead', page.id, 'for', BUSINESS);
    return { statusCode: 200, body: JSON.stringify({ ok: true, notionPageId: page.id }) };
  } catch (err) {
    console.error('Notion request failed:', err.message);
    return { statusCode: 200, body: 'Notion unreachable; lead held in Netlify Forms.' };
  }
};
