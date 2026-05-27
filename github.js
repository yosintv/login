export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const owner = env.GITHUB_OWNER || "yosintv2";
  const repo = env.GITHUB_REPO || "blog";
  const branch = env.GITHUB_BRANCH || "main";
  const token = String(env.GITHUB_TOKEN || "").trim();
  const adminPassword = String(env.ADMIN_PASSWORD || "").trim();

  let password = url.searchParams.get("password") || "";
  let body = {};

  if (request.method === "POST") {
    try {
      body = await request.json();
      password = body.password || password;
    } catch (e) {}
  }

  if (!adminPassword) {
    return new Response(JSON.stringify({ error: "ADMIN_PASSWORD is missing" }), { status: 500, headers: corsHeaders });
  }
  if (!token) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN is missing" }), { status: 500, headers: corsHeaders });
  }
  if (password.trim() !== adminPassword) {
    return new Response(JSON.stringify({ error: "Wrong password" }), { status: 401, headers: corsHeaders });
  }

  try {
    // List Files
    if (request.method === "GET" && url.searchParams.get("action") === "list") {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "YoSinTV-Blog-Admin"
          }
        }
      );

      if (r.status === 404) return new Response(JSON.stringify({ files: [] }), { status: 200, headers: corsHeaders });
      const data = await r.json();
      if (!r.ok) return new Response(JSON.stringify(data), { status: r.status, headers: corsHeaders });

      const files = data
        .filter(item => item.type === "file" && item.name.endsWith(".json"))
        .map(item => item.name)
        .sort();

      return new Response(JSON.stringify({ files }), { status: 200, headers: corsHeaders });
    }

    // Get Content
    if (request.method === "GET") {
      const path = url.searchParams.get("path") || "";
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "YoSinTV-Blog-Admin"
          }
        }
      );

      const data = await r.json();
      if (!r.ok) return new Response(JSON.stringify(data), { status: r.status, headers: corsHeaders });

      const content = JSON.parse(atob(data.content.replace(/\n/g, "")));

      return new Response(JSON.stringify({ path, content, sha: data.sha }), { status: 200, headers: corsHeaders });
    }

    // Update Content
    if (request.method === "POST") {
      const { path, content, message } = body;
      const current = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "YoSinTV-Blog-Admin" }
      });
      const currentData = await current.json();

      const update = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "YoSinTV-Blog-Admin"
        },
        body: JSON.stringify({
          message: message || `Update ${path}`,
          content: btoa(JSON.stringify(content, null, 2)),
          sha: currentData.sha,
          branch
        })
      });

      const result = await update.json();
      return new Response(JSON.stringify({ success: update.ok, path, commit: result.commit?.html_url || null }), {
        status: update.ok ? 200 : update.status,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}