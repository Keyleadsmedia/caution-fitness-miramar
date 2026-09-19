// Netlify Forms submission -> Notion "Site Change Requests" row.
//
// Wired as an outgoing webhook on the site's `change-request` form, the same
// shape as notion-lead.js. The Netlify submission log stays the durable
// backstop: this function ALWAYS returns 200, so a Notion outage leaves the
// request replayable rather than lost.
//
// The point of this function is that the row it writes is machine-actionable.
// It stamps SITE_KEY, REPO_NAME and NETLIFY_SITE_ID onto every row, so the
// scheduled processing run knows exactly which repo to clone and which URL to
// verify without looking anything up.
//
// Required env vars (set per site in Netlify):
//   NOTION_TOKEN                 internal integration secret; the Site Change
//                                Requests database must be connected to it
//   SITE_KEY                     the `Site` select value for this site
//   REPO_NAME                    GitHub repo under Keyleadsmedia
//   NETLIFY_SITE_ID              this site's Netlify id
// Optional:
//   NOTION_CHANGE_REQUESTS_DB    defaults to the id below

const DB_ID = process.env.NOTION_CHANGE_REQUESTS_DB || '9464c4d64b144302a69a1e558c3c0e3a';
const NOTION_VERSION = '2022-06-28';

const text = (v) => (v == null ? '' : String(v)).trim();
const rich = (v) => (text(v) ? { rich_text: [{ text: { content: text(v).slice(0, 2000) } }] } : undefined);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN is not set. Request captured by Netlify Forms only; replay once the token exists.');
    return { statusCode: 200, body: 'Notion token not configured; request held in Netlify Forms.' };
  }

  let d = {};
  let submittedAt = null;
  let referrer = '';
  let formName = '';
  try {
    const body = JSON.parse(event.body || '{}');
    const p = body.payload || body;
    d = p.data || {};
    submittedAt = p.created_at || null;
    referrer = p.referrer || p.site_url || '';
    formName = text(p.form_name);
  } catch (err) {
    console.error('Could not parse webhook body:', err.message);
    return { statusCode: 400, body: 'Bad payload' };
  }

  // Guard: this function only handles change requests, never leads.
  if (formName && formName !== 'change-request') {
    console.log('Ignoring submission from form', formName);
    return { statusCode: 200, body: 'Not a change request; ignored.' };
  }

  const siteKey = process.env.SITE_KEY || 'Caution CrossFit & Fitness';
  const page = text(d.page) || 'not-sure';
  const request = text(d.request);
  if (!request) {
    console.error('Change request had no request body.');
    return { statusCode: 200, body: 'Empty request; held in Netlify Forms.' };
  }

  // A scannable title: site, page, and the first line of the ask.
  const gist = request.replace(/\s+/g, ' ').slice(0, 80);
  const title = `${siteKey} — ${page} — ${gist}`;

  const submitted = (submittedAt || new Date().toISOString()).slice(0, 10);

  const properties = {
    Name: { title: [{ text: { content: title.slice(0, 200) } }] },
    Site: { select: { name: siteKey } },
    Status: { select: { name: 'New' } },
    Priority: { select: { name: ['Normal', 'Urgent', 'Low'].includes(text(d.priority)) ? text(d.priority) : 'Normal' } },
    Submitted: { date: { start: submitted } },
  };
  if (rich(page)) properties.Page = rich(page);
  if (rich(request)) properties.Request = rich(request);
  if (text(d.email)) properties['Submitted By'] = { email: text(d.email) };
  if (rich(process.env.REPO_NAME)) properties.Repo = rich(process.env.REPO_NAME);
  if (rich(process.env.NETLIFY_SITE_ID)) properties['Netlify Site ID'] = rich(process.env.NETLIFY_SITE_ID);

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
      console.error('Notion rejected the change request:', res.status, detail.slice(0, 500));
      return { statusCode: 200, body: `Notion error ${res.status}; request held in Netlify Forms.` };
    }

    const created = await res.json();
    console.log('Created change request', created.id, 'for', siteKey);
    return { statusCode: 200, body: JSON.stringify({ ok: true, notionPageId: created.id }) };
  } catch (err) {
    console.error('Notion request failed:', err.message);
    return { statusCode: 200, body: 'Notion unreachable; request held in Netlify Forms.' };
  }
};
