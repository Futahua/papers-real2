'use strict';

const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const crypto = require('node:crypto'); const { spawnSync } = require('node:child_process');
const { validateUnifiedDiff, assertExistingChainSafe } = require('./PatchProposalValidator');
const { PATCH_CODE, PatchError } = require('./PatchErrors');
const locks = new Set();
function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function fileHash(file) { return fs.existsSync(file) ? sha(fs.readFileSync(file)) : null; }
function canonical(p) { return fs.realpathSync.native(p); }
class GitPatchApplier {
  constructor(opts={}) { this.git = opts.gitExecutable || 'git'; this.prohibitedRoots = (opts.prohibitedRoots || []).filter(Boolean); this.spawn = opts.spawn || spawnSync; }
  gitRun(root, args) {
    const r = this.spawn(this.git, ['-C', root, ...args], { encoding:'utf8', shell:false, windowsHide:true, maxBuffer:8*1024*1024 });
    if (r.error || r.status !== 0) throw new PatchError(PATCH_CODE.APPLY_FAILED, 'Git safety operation failed.', { operation:args[0], exitCode:r.status });
    return (r.stdout || '').replace(/\r?\n$/, '');
  }
  inspect(root, affectedPaths=[]) {
    const worktreeRoot = canonical(root); const repoRoot = canonical(this.gitRun(worktreeRoot, ['rev-parse','--show-toplevel']));
    if (repoRoot.toLowerCase() !== worktreeRoot.toLowerCase()) throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE, 'Selected root must be the exact Git worktree root.');
    for (const blocked of this.prohibitedRoots) {
      if (fs.existsSync(blocked) && canonical(blocked).toLowerCase() === worktreeRoot.toLowerCase()) throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE, 'This worktree is protected or reserved.');
    }
    const leaf=path.basename(worktreeRoot).toLowerCase();
    if (leaf==='real2'||leaf.includes('relay_gate_a1')||leaf.includes('complete_recovery')||leaf.includes('gate_a_probe')||leaf.includes('gate-a-probe')) throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE,'Protected, relay, recovery, and probe worktrees are rejected.');
    if (!fs.lstatSync(path.join(worktreeRoot,'.git')).isFile()) throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE,'Backpack v0 requires a disposable linked Git worktree.');
    const gitDir = this.gitRun(worktreeRoot, ['rev-parse','--git-dir']);
    if (!gitDir) throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE, 'Git worktree identity is missing.');
    const branch=this.gitRun(worktreeRoot,['branch','--show-current']); const head=this.gitRun(worktreeRoot,['rev-parse','HEAD']);
    const status=this.gitRun(worktreeRoot,['status','--porcelain=v1','--untracked-files=all']);
    if (status) throw new PatchError(PATCH_CODE.DIRTY_WORKTREE, 'Backpack v0 requires a completely clean disposable worktree.');
    if (this.gitRun(worktreeRoot,['diff','--cached','--name-only'])) throw new PatchError(PATCH_CODE.DIRTY_WORKTREE, 'Staged changes are rejected.');
    const hashes={}; for(const p of affectedPaths){ const f=assertExistingChainSafe(worktreeRoot,p); hashes[p]=fileHash(f); }
    const gitlinks=this.gitRun(worktreeRoot,['ls-files','--stage']).split(/\r?\n/).filter((line)=>line.startsWith('160000 ')).map((line)=>line.split('\t')[1]).filter(Boolean);
    if(affectedPaths.some((p)=>gitlinks.some((g)=>p===g||p.startsWith(g+'/')))) throw new PatchError(PATCH_CODE.UNSAFE_PATH,'Patch crosses a submodule boundary.');
    return { repositoryRoot:repoRoot, worktreeRoot, branch, head, status, affectedFileHashes:hashes };
  }
  apply(proposal) {
    const root=canonical(proposal.worktreeRoot); if(locks.has(root)) throw new PatchError(PATCH_CODE.LOCKED,'Another apply operation holds the worktree lock.');
    locks.add(root); let tempDir=null;
    try {
      const validated=validateUnifiedDiff(proposal.rawDiff); if(validated.affectedPaths.join('\0')!==proposal.affectedPaths.join('\0')) throw new PatchError(PATCH_CODE.INTEGRITY_FAILURE,'Proposal path set changed.');
      const now=this.inspect(root,proposal.affectedPaths); const cap=proposal.capture;
      if(now.head!==cap.head||now.branch!==cap.branch||now.status!==cap.status) throw new PatchError(PATCH_CODE.WORKTREE_DRIFT,'Worktree HEAD, branch, or status changed.');
      for(const p of proposal.affectedPaths) if(now.affectedFileHashes[p]!==cap.affectedFileHashes[p]) throw new PatchError(PATCH_CODE.WORKTREE_DRIFT,'Affected file changed after capture.',{path:p});
      tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'papers-patch-')); const patchFile=path.join(tempDir,'proposal.patch'); fs.writeFileSync(patchFile,validated.rawDiff,{encoding:'utf8',flag:'wx'});
      this.gitRun(root,['apply','--check','--whitespace=error-all',patchFile]);
      this.gitRun(root,['apply','--whitespace=error-all',patchFile]);
      const changed=this.gitRun(root,['status','--porcelain=v1','--untracked-files=all']).split(/\r?\n/).filter(Boolean).map((line)=>line.slice(3).replace(/\\/g,'/')).sort();
      const expected=[...proposal.affectedPaths].sort(); if(JSON.stringify(changed)!==JSON.stringify(expected)) throw new PatchError(PATCH_CODE.INTEGRITY_FAILURE,'Git reported unexpected changed paths.',{requiresInspection:true});
      const post={}; for(const p of expected){const f=assertExistingChainSafe(root,p);if(!fs.existsSync(f)||!fs.lstatSync(f).isFile())throw new PatchError(PATCH_CODE.INTEGRITY_FAILURE,'Expected result file is missing.',{path:p,requiresInspection:true});post[p]=fileHash(f);}
      const diff=this.gitRun(root,['diff','--binary','--',...expected]);
      return { postApplyHashes:post, patchSHA256:sha(Buffer.from(validated.rawDiff,'utf8')), resultingDiffSHA256:sha(Buffer.from(diff,'utf8')) };
    } finally { if(tempDir) fs.rmSync(tempDir,{recursive:true,force:true}); locks.delete(root); }
  }
}
module.exports={GitPatchApplier,sha,fileHash,locks};
