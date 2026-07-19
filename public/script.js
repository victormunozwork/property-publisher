const publishButton = document.querySelector("#publish-button");
const buttonLabel = document.querySelector("#button-label");
const buttonSpinner = document.querySelector("#button-spinner");
const accessCodeInput = document.querySelector("#access-code");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusMessage = document.querySelector("#status-message");
const workflowLink = document.querySelector("#workflow-link");

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_ATTEMPTS = 60;

publishButton.addEventListener("click", publishChanges);

accessCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !publishButton.disabled) {
    publishChanges();
  }
});

async function publishChanges() {
  const accessCode = accessCodeInput.value.trim();

  if (!accessCode) {
    setStatus(
      "error",
      "Access code required",
      "Enter the access code before publishing."
    );
    accessCodeInput.focus();
    return;
  }

  setBusy(true);
  hideWorkflowLink();
  setStatus(
    "running",
    "Starting publication",
    "Asking GitHub to begin the website update."
  );

  try {
    const response = await apiRequest("/api/publish", accessCode, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(response.error || "The publication could not be started.");
    }

    setStatus(
      "waiting",
      "Publication started",
      "Waiting for GitHub to create the workflow run."
    );

    await pollWorkflowStatus(accessCode, response.startedAt);
  } catch (error) {
    setBusy(false);
    setStatus(
      "error",
      "Publication failed",
      error instanceof Error ? error.message : "An unexpected error occurred."
    );
  }
}

async function pollWorkflowStatus(accessCode, startedAt) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS);

    const result = await apiRequest(
      `/api/status?since=${encodeURIComponent(startedAt)}`,
      accessCode
    );

    if (!result.ok) {
      throw new Error(result.error || "The workflow status could not be checked.");
    }

    if (!result.found || result.status === "queued") {
      setStatus(
        "waiting",
        "Waiting in queue",
        "GitHub has received the request and will start shortly."
      );
      continue;
    }

    if (result.htmlUrl) {
      showWorkflowLink(result.htmlUrl);
    }

    if (result.status === "in_progress") {
      setStatus(
        "running",
        "Updating the website",
        "GitHub is reading Airtable and regenerating the JSON file."
      );
      continue;
    }

    if (result.status === "completed") {
      setBusy(false);

      if (result.conclusion === "success") {
        const finished = result.updatedAt
          ? new Date(result.updatedAt).toLocaleString()
          : "just now";

        setStatus(
          "success",
          "Website updated successfully",
          `The publication finished at ${finished}.`
        );
        buttonLabel.textContent = "Publish again";
        return;
      }

      throw new Error(
        `The GitHub workflow finished with the result: ${
          result.conclusion || "unknown"
        }.`
      );
    }
  }

  setBusy(false);
  setStatus(
    "error",
    "Update is taking longer than expected",
    "Open the workflow details to check whether GitHub is still working."
  );
}

async function apiRequest(url, accessCode, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessCode}`,
      ...(options.headers || {}),
    },
  });

  let body;

  try {
    body = await response.json();
  } catch {
    body = {
      ok: false,
      error: `The server returned ${response.status} ${response.statusText}.`,
    };
  }

  if (!response.ok && !body.error) {
    body.error = `Request failed with status ${response.status}.`;
  }

  return body;
}

function setBusy(isBusy) {
  publishButton.disabled = isBusy;
  accessCodeInput.disabled = isBusy;
  buttonSpinner.classList.toggle("hidden", !isBusy);
  buttonLabel.textContent = isBusy
    ? "Publishing…"
    : buttonLabel.textContent === "Publish again"
      ? "Publish again"
      : "Publish website changes";
}

function setStatus(type, title, message) {
  statusDot.className = `status-dot ${type}`;
  statusTitle.textContent = title;
  statusMessage.textContent = message;
}

function showWorkflowLink(url) {
  workflowLink.href = url;
  workflowLink.classList.remove("hidden");
}

function hideWorkflowLink() {
  workflowLink.classList.add("hidden");
  workflowLink.removeAttribute("href");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
