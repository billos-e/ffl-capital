---
name: Local publish commit cleanup
description: Replit may create empty local "Published your App" commits that can be removed without changing the project tree.
---

When removing unpushed publish-only commits, reset to the remote branch and cherry-pick only the real local commits in chronological order.

**Why:** An interactive rebase may preserve these empty commits unexpectedly in this workspace, while reconstructing from the remote base preserves the exact files and removes only the unwanted local history.

**How to apply:** Confirm the target commits are unpushed and empty, record the final tree hash, reset to the remote base, replay legitimate local commits, and verify the tree hash and clean working tree.