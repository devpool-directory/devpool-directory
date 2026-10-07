#!/usr/bin/env python3
"""
UbiquityOS Sprint Management Dashboard Generator

This script fetches open bounties from the devpool-directory repository
and generates a Markdown dashboard summarizing sprint progress.
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
import yaml


GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO_OWNER = "devpool-directory"
REPO_NAME = "devpool-directory"
DASHBOARD_PATH = Path("docs/sprint-dashboard.md")
ISSUES_PER_PAGE = 100


def github_request(url: str, headers: dict) -> list:
    """Make a paginated GitHub API request and return all results."""
    all_items = []
    page = 1
    while True:
        params = {"page": page, "per_page": ISSUES_PER_PAGE, "state": "open"}
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            print(f"Error fetching {url}: {resp.status_code} {resp.text}")
            break
        items = resp.json()
        if not items:
            break
        all_items.extend(items)
        if len(items) < ISSUES_PER_PAGE:
            break
        page += 1
    return all_items


def fetch_bounties() -> list:
    """Fetch all open bounty issues from the repository."""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    # Filter for issues with bounty labels only
    labels = [lb["name"] for lb in github_request(
        f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/labels", headers
    )]
    bounty_labels = [lb for lb in labels if "bounty" in lb.lower()]

    all_issues = github_request(url, headers)
    bounties = [
        issue for issue in all_issues
        if any(lb["name"] in bounty_labels for lb in issue.get("labels", []))
    ]
    return bounties


def parse_bounty_data(issue: dict) -> dict:
    """Extract bounty information from an issue body."""
    body = issue.get("body") or ""
    data = {"title": issue["title"], "url": issue["html_url"], "number": issue["number"]}

    # Try to parse YAML frontmatter or key-value pairs from body
    try:
        # Check for YAML block
        if body.startswith("---"):
            end_idx = body.find("---", 3)
            if end_idx > 0:
                yaml_block = body[3:end_idx].strip()
                parsed = yaml.safe_load(yaml_block)
                if isinstance(parsed, dict):
                    data.update(parsed)
    except Exception:
        pass

    # Extract common fields with defaults
    data.setdefault("category", "Uncategorized")
    data.setdefault("difficulty", "Medium")
    data.setdefault("reward", "TBD")
    data.setdefault("status", "Open")
    data.setdefault("assignee", "Unassigned")

    # Override from labels
    label_names = [lb["name"] for lb in issue.get("labels", [])]
    for lbl in label_names:
        low = lbl.lower()
        if "bug" in low:
            data["category"] = "Bug"
        elif "feature" in low:
            data["category"] = "Feature"
        elif "doc" in low or "documentation" in low:
            data["category"] = "Documentation"
        if "easy" in low:
            data["difficulty"] = "Easy"
        elif "medium" in low:
            data["difficulty"] = "Medium"
        elif "hard" in low:
            data["difficulty"] = "Hard"

    # Extract assignee
    assignee = issue.get("assignee")
    data["assignee"] = assignee["login"] if assignee else "Unassigned"

    # Creation and update dates
    data["created_at"] = issue.get("created_at", "")[:10]
    data["updated_at"] = issue.get("updated_at", "")[:10]

    return data


def generate_dashboard(bounties: list) -> str:
    """Generate the Markdown dashboard content."""
    now = datetime.utcnow()
    sprint_start = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    sprint_end = (now + timedelta(days=14)).strftime("%Y-%m-%d")

    completed = [b for b in bounties if b["status"] == "Completed"]
    in_progress = [b for b in bounties if b["status"] == "In Progress"]
    open_bounties = [b for b in bounties if b["status"] == "Open"]

    lines = [
        "# 🏃 UbiquityOS Sprint Management Dashboard",
        "",
        f"**Sprint Period:** {sprint_start} → {sprint_end}",
        f"**Generated:** {now.strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## 📊 Summary",
        "",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Total Open Bounties | {len(open_bounties)} |",
        f"| In Progress | {len(in_progress)} |",
        f"| Completed (This Sprint) | {len(completed)} |",
        "",
        "## 📋 Open Bounties",
        "",
    ]

    if open_bounties:
        lines += [
            "| # | Title | Category | Difficulty | Assignee | Link |",
            "|---|-------|----------|------------|----------|------|",
        ]
        for b in sorted(open_bounties, key=lambda x: x["created_at"]):
            title_escaped = b["title"].replace("|", "\\|")
            lines.append(
                f"| {b['number']} | {title_escaped} | {b['category']} | "
                f"{b['difficulty']} | {b['assignee']} | [{b['number']}]({b['url']}) |"
            )
    else:
        lines.append("No open bounties at this time. 🎉")

    lines += ["", "## 🔄 In Progress", ""]

    if in_progress:
        lines += [
            "| # | Title | Category | Assignee | Link |",
            "|---|-------|----------|----------|------|",
        ]
        for b in in_progress:
            title_escaped = b["title"].replace("|", "\\|")
            lines.append(
                f"| {b['number']} | {title_escaped} | {b['category']} | "
                f"{b['assignee']} | [{b['number']}]({b['url']}) |"
            )
    else:
        lines.append("No items in progress.")

    lines += ["", "## ✅ Completed This Sprint", ""]

    if completed:
        lines += [
            "| # | Title | Category | Link |",
            "|---|-------|----------|------|",
        ]
        for b in completed:
            title_escaped = b["title"].replace("|", "\\|")
            lines.append(
                f"| {b['number']} | {title_escaped} | {b['category']} | [{b['number']}]({b['url']}) |"
            )
    else:
        lines.append("No completions yet this sprint.")

    lines += [
        "",
        "---",
        "*Dashboard generated automatically by [sprint-dashboard](.github/workflows/sprint-dashboard.yml)*",
    ]

    return "\n".join(lines) + "\n"


def main():
    if not GITHUB_TOKEN:
        print("ERROR: GITHUB_TOKEN environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    print("Fetching bounties...")
    bounties = fetch_bounties()
    print(f"Found {len(bounties)} bounty issues.")

    # Parse bounty data
    parsed_bounties = [parse_bounty_data(b) for b in bounties]

    # Generate dashboard
    dashboard_md = generate_dashboard(parsed_bounties)

    # Write to file
    DASHBOARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    DASHBOARD_PATH.write_text(dashboard_md)
    print(f"Dashboard written to {DASHBOARD_PATH}")


if __name__ == "__main__":
    main()
