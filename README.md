# Property Publisher

A small Cloudflare Worker application that:

1. Displays a private publishing screen.
2. Triggers a specific GitHub Actions workflow.
3. Checks the workflow status.
4. Tells the user when the website update succeeds or fails.

## Project structure

```text
property-publisher/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── src/
│   └── index.js
├── package.json
└── wrangler.jsonc
```

## 1. Configure the repository and workflow

Open `wrangler.jsonc` and replace:

- `REPLACE_WITH_GITHUB_USERNAME_OR_ORG`
- `REPLACE_WITH_REPOSITORY_NAME`
- `update-json.yml`, if your workflow has a different filename
- `main`, if the workflow runs from another branch

The target workflow must contain:

```yaml
on:
  workflow_dispatch:
```

The workflow file needs to exist on the repository's default branch.

## 2. Add Cloudflare secrets

In Cloudflare:

**Workers & Pages → property-publisher → Settings → Variables and Secrets**

Add these as encrypted secrets:

- `GITHUB_TOKEN`: the GitHub token that can run and read the target workflow
- `PUBLISH_ACCESS_CODE`: a password chosen for the publishing page

Do not write either value in `wrangler.jsonc` or any public file.

For a fine-grained GitHub token, grant access only to the target repository and give it:

- Actions: Read and write
- Metadata: Read-only

## 3. Cloudflare deployment settings

When connecting the GitHub repository to Cloudflare:

- Build command: leave empty
- Deploy command: `npx wrangler deploy`

Cloudflare will install dependencies from `package.json`.

## 4. Commit and deploy

Commit all files to the GitHub repository. Cloudflare should start a deployment automatically.

After deployment, open the generated `workers.dev` address, enter the access code, and click **Publish website changes**.

## Local testing

Install dependencies:

```bash
npm install
```

Create a local `.dev.vars` file:

```text
GITHUB_TOKEN=your_token
PUBLISH_ACCESS_CODE=your_test_password
```

Then run:

```bash
npm run dev
```

Do not commit `.dev.vars`.
