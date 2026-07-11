# Recovery procedure

Clone the repository, fetch branches and tags, verify both tags, check out the recovery branch, read START_HERE, recreate protected work from the protected tag plus the preserved patch, verify its patch ID, and recreate broker work from its tag or branch. Never use the relay branch as a product branch. If artifacts are missing, follow the manifests; if they conflict, stop fail-closed. This covers chat, worktree, broker, relay, machine, branch, patch, tag, and incorrect-agent recovery.
