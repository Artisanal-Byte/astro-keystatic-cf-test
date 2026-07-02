# GitHub Setup Guide

This guide walks through setting up a GitHub account, creating a content repository, and generating a read-only access token. These steps are required for the Keystatic GitHub Reader to fetch content at runtime.

You will need:
- A GitHub account (free)
- A repository to hold your content files
- A fine-grained Personal Access Token (read-only)

---

## Step 1: Create a GitHub Account

If you don't already have one:

1. Go to **https://github.com/signup**
2. Enter your email, create a password, and pick a username
3. Verify your email address when prompted

Your **username** is what you'll use as `GITHUB_REPO_OWNER` later. For example, if your profile URL is `https://github.com/janesmith`, your username is `janesmith`.

---

## Step 2: Create a Content Repository

This is the repository where your content files (Markdown/Markdoc posts, pages, etc.) will live. The Keystatic reader fetches files from this repo at runtime.

### Option A: Create a new repo (recommended for content-only)

1. Go to **https://github.com/new**
2. Fill in:
   - **Repository name**: something descriptive, e.g. `website-content`
   - **Description** (optional): "Content files for the website"
   - **Visibility**: 
     - **Public** — anyone can see the content, but only your token can trigger reads via the API. If your content is not sensitive (blog posts, docs), public is fine and simpler.
     - **Private** — only you (and your token) can read it. Use this if the content should not be publicly visible.
   - **Initialize this repository with**: check "Add a README file"
3. Click **Create repository**

### Option B: Use an existing repo

If you already have a repo that contains your content (e.g., your website's source code repo), you can use it. Just make sure the content files are in the path expected by `keystatic.config.ts` (e.g., `content/posts/*.mdoc`).

### Add content files

Your repo needs content files in the structure defined by `keystatic.config.ts`. For this template, that's:

```
content/
  posts/
    hello-world.mdoc
    another-post.mdoc
```

Each `.mdoc` file has YAML frontmatter (title, summary) followed by Markdoc body content:

```
---
title: Hello World
summary: A first post.
---

# Hello World

This is the post body written in **Markdoc**.
```

You can create these files directly in the GitHub web UI:
1. Navigate into your repo → `content/posts/` (create the folders by typing `content/posts/` in the filename field)
2. Click **Add file** → **Create new file**
3. Name it `hello-world.mdoc`
4. Paste the content above
5. Click **Commit changes**

Whatever name you chose for the repo is your `GITHUB_REPO_NAME`. For example, if the repo URL is `https://github.com/janesmith/website-content`, then `GITHUB_REPO_NAME=website-content`.

---

## Step 3: Create a Fine-Grained Personal Access Token

The token is a credential that lets the website read files from your repo via the GitHub API. It is **read-only** — it cannot modify or delete anything.

1. Go to **https://github.com/settings/personal-access-tokens/new**
   (This page is under: Profile → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token)

2. Fill in the form:

   | Field | What to enter |
   |-------|---------------|
   | **Token name** | `website-content-reader` (or any name you'll recognize later) |
   | **Expiration** | 90 days (default). You'll need to regenerate it when it expires. |
   | **Resource owner** | Select your own username/organization from the dropdown |
   | **Repository access** | Select **"Only select repositories"**, then pick your content repo from the list. (If you have multiple content repos, you can select all of them.) |
   | **Repository permissions** | Scroll down to find the **Repository permissions** section. Find **"Contents"** and set it to **"Read-only"**. Leave everything else as "No access". |
   | **Account permissions** | Leave all as "No access". None are needed. |

3. Double-check:
   - **Contents** = Read-only ✅
   - Everything else = No access ✅
   - You did NOT select "Read and write" for anything ✅

4. Click **Generate token**

5. **Copy the token immediately.** It will look like:
   ```
   github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz
   ```
   GitHub will NOT show it again. If you lose it, you'll have to generate a new one.

   This is your `GITHUB_CONTENT_READ_TOKEN`.

---

## Step 4: Provide the Three Values

You now have everything needed. Provide these three values to whoever is setting up the website:

| Variable | What it is | Example |
|----------|------------|---------|
| `GITHUB_REPO_OWNER` | Your GitHub username | `janesmith` |
| `GITHUB_REPO_NAME` | The name of your content repo | `website-content` |
| `GITHUB_CONTENT_READ_TOKEN` | The `github_pat_...` token you just copied | `github_pat_11ABC...` |

These go into:
- **Local development**: a `.env` file in the project root (copy from `.env.example`)
- **Production (Cloudflare)**: set as encrypted environment variables in the Cloudflare Pages dashboard, or via `bunx wrangler pages secret put <NAME> --project-name <project>`

---

## Security Notes

- **The token is read-only.** It can list and read files from the repos you selected, and nothing else. It cannot create, edit, or delete anything.
- **Keep the token private.** Never commit it to git, never paste it into chat or email. If it leaks, revoke it immediately at `https://github.com/settings/personal-access-tokens` and generate a new one.
- **Token expiration.** Fine-grained tokens expire (default 90 days). When the reader starts returning 401 errors, it's time to generate a new token and update the Cloudflare environment variable.
- **Repo visibility.** A public repo can be read by anyone via the GitHub API without a token. The token is still needed because the Keystatic reader authenticates all requests for higher rate limits and consistent behavior. If your repo is private, the token is strictly required.
- **One token per project.** If you have multiple websites, generate a separate token for each. This limits the blast radius if one is compromised.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Bad credentials` | Token is missing, expired, or incorrect | Regenerate the token and update the env var |
| `403 User-Agent header required` | (Cloudflare runtime only) CF's fetch doesn't send a default User-Agent | Already patched in `src/lib/reader.ts`. If you see this, the fetch patch is not applied. |
| `404 Not Found` | Wrong repo owner/name, or the repo has no `content/posts/` directory | Verify `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, and that the repo contains content files at the expected path |
| `403 Resource not accessible by personal access token` | Token doesn't have access to the repo, or repo wasn't selected during token creation | Edit the token's repository access at `https://github.com/settings/personal-access-tokens` and add the repo |
| `The 'cache' field on 'RequestInitializerDict' is not implemented` | (Cloudflare runtime only) Keystatic's fetch uses `cache: 'no-store'` which CF doesn't support | Already patched in `src/lib/reader.ts`. If you see this, the fetch patch is not applied. |
