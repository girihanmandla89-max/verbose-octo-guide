# NextHyke Pull Request Verification & Gated Review

## 1. Pull Request Scope
- **Target Branch:** `main` (or designated integration branch)
- **Feature / Phase:** `Phase <Number>: <Title>`
- **Description of Changes:**
  <!-- Briefly state what was changed, which components were touched, and why. -->

---

## 2. Hardware Budget & Compute Constraints Checklist
All pull requests must strictly satisfy the physical machine boundaries (HP Pavilion 15-eg0xxx):

- [ ] **Dedicated VRAM Cap:** Peak dedicated VRAM usage stays strictly $\le 1.4\text{ GB} / 2.0\text{ GB}$ on NVIDIA GeForce MX450. (Attach `nvidia-smi` log snippet below).
- [ ] **CPU Worker Cap:** Multithreading in worker processes is hard-capped at $\le 3$ threads on Intel Core i5-1135G7 (reserving Core 0 for Electron UI and display compositor).
- [ ] **Working Set System RAM:** Application process working set envelope stays $< 1.2\text{ GB}$ system RAM (UI idle memory $< 110\text{ MB}$).
- [ ] **Continuous Stability / Memory Growth:** Memory growth rate during continuous processing is $\le 1.0\text{ MB/hr}$ (zero handle or memory leaks).
- [ ] **Zero Phantom Dependencies:** Only pinned, verified packages from `requirements-runtime.txt` or `package.json` are introduced.

---

## 3. Explicit Verification Command & Output
Include the exact command executed and the verified terminal output:
```text
Command: ...
Output / Result: ...
```

---

## 4. Exit Gate Validation Checklist
- [ ] TypeScript compiles cleanly with zero type errors (`npm run build`).
- [ ] Python syntax and typing verified against isolated embedded CPython runtime.
- [ ] All unit and synthetic stress tests pass.
- [ ] No screen capture evasion flags (`WDA_EXCLUDEFROMCAPTURE`) introduced.
- [ ] Zero private keys, Google Service Account secrets, or unencrypted tokens embedded in client binary.
