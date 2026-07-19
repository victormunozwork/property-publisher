const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/publish" && request.method === "POST") {
      return publishWorkflow(request, env);
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return getWorkflowStatus(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function publishWorkflow(request, env) {
  const authError = await validateAccessCode(request, env);
  if (authError) return authError;

  const missing = requiredConfiguration(env);
  if (missing.length > 0) {
    return json(
      {
        ok: false,
        error: `Missing Cloudflare configuration: ${missing.join(", ")}`,
      },
      500
    );
  }

  const workflowUrl =
    `${GITHUB_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}` +
    `/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/` +
    `${encodeURIComponent(env.GITHUB_WORKFLOW_ID)}/dispatches`;

  const response = await fetch(workflowUrl, {
    method: "POST",
    headers: githubHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH || "main",
    }),
  });

  if (response.status !== 204) {
    const details = await safeGitHubError(response);
    return json(
      {
        ok: false,
        error: "GitHub did not start the workflow.",
        details,
      },
      response.status
    );
  }

  return json({
    ok: true,
    message: "Publication started.",
    startedAt: new Date().toISOString(),
  });
}

async function getWorkflowStatus(request, env) {
  const authError = await validateAccessCode(request, env);
  if (authError) return authError;

  const missing = requiredConfiguration(env);
  if (missing.length > 0) {
    return json(
      {
        ok: false,
        error: `Missing Cloudflare configuration: ${missing.join(", ")}`,
      },
      500
    );
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const runsUrl =
    `${GITHUB_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}` +
    `/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/` +
    `${encodeURIComponent(env.GITHUB_WORKFLOW_ID)}/runs` +
    `?branch=${encodeURIComponent(env.GITHUB_BRANCH || "main")}` +
    `&event=workflow_dispatch&per_page=5`;

  const response = await fetch(runsUrl, {
    method: "GET",
    headers: githubHeaders(env.GITHUB_TOKEN),
  });

  if (!response.ok) {
    const details = await safeGitHubError(response);
    return json(
      {
        ok: false,
        error: "GitHub workflow status could not be read.",
        details,
      },
      response.status
    );
  }

  const data = await response.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];

  let run = runs[0] || null;

  if (since) {
    const sinceTime = Date.parse(since);
    if (!Number.isNaN(sinceTime)) {
      run =
        runs.find((candidate) => {
          const created = Date.parse(candidate.created_at);
          return !Number.isNaN(created) && created >= sinceTime - 5000;
        }) || null;
    }
  }

  if (!run) {
    return json({
      ok: true,
      found: false,
      status: "waiting",
      message: "Waiting for GitHub to create the workflow run.",
    });
  }

  return json({
    ok: true,
    found: true,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
  });
}

async function validateAccessCode(request, env) {
  if (!env.PUBLISH_ACCESS_CODE) {
    return json(
      {
        ok: false,
        error: "PUBLISH_ACCESS_CODE has not been configured in Cloudflare.",
      },
      500
    );
  }

  const authorization = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.PUBLISH_ACCESS_CODE}`;

  if (!timingSafeEqual(authorization, expected)) {
    return json(
      {
        ok: false,
        error: "Incorrect access code.",
      },
      401
    );
  }

  return null;
}

function requiredConfiguration(env) {
  return [
    ["GITHUB_TOKEN", env.GITHUB_TOKEN],
    ["GITHUB_OWNER", env.GITHUB_OWNER],
    ["GITHUB_REPO", env.GITHUB_REPO],
    ["GITHUB_WORKFLOW_ID", env.GITHUB_WORKFLOW_ID],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "property-publisher-cloudflare-worker",
    "Content-Type": "application/json",
  };
}

async function safeGitHubError(response) {
  try {
    const body = await response.json();
    return body.message || JSON.stringify(body);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// This avoids returning early on the first mismatched character.
function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);

  let result = a.length ^ b.length;

  for (let i = 0; i < length; i += 1) {
    result |= (a[i] || 0) ^ (b[i] || 0);
  }

  return result === 0;
}
