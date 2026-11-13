# ACVIS evaluation: intentional CWE-22 and CWE-798

Requested experiment on 2026-11-13. Baseline: `1a16926`.
Test branch: `test/acvis-cwe-22-798-20261113`.

These are deliberately vulnerable scanner fixtures. The synthetic password below
does not authenticate to any external service. The proof document contains no
credentials or user data. No ACVIS access token belongs in this repository.

## Cases and local evidence

| CWE | HTTP input | Expected observation |
| --- | --- | --- |
| CWE-22 | `GET /api/review-document?file=card-guide.txt` | 200, `POKECARD_DOWNLOAD_GUIDE` |
| CWE-22 | `GET /api/review-document?file=..%2Fpath-traversal-proof.txt` | 200, `ACVIS_PATH_TRAVERSAL_PROOF_004`, outside the downloads directory |
| CWE-798 | `POST /api/review-access`, JSON `{"password":"incorrect"}` | 401 |
| CWE-798 | Same POST with `ACVIS_fixture_798_X7k9Q2m4R8v6N3p5` | 200, `ACVIS_HARDCODED_CREDENTIAL_PROOF_798`, no session required |

The first route passes an untrusted filename through `readReviewDocument` to
`readFile(resolve(downloads, filename))` without checking directory containment.
The second compares an untrusted password against an embedded synthetic secret,
then returns a fixture reviewer role and marker. It never grants a real user role
or creates a session.

`node --test test/acvis-fixtures.test.js`: 2/2 passed.
`npm.cmd run build`: passed. `npm.cmd test`: 21/21 passed, including SQLite,
PostgreSQL/PGlite, and existing CWE probes. The existing `/api/download` mitigation
continues to have its own passing regression test.

## Hosted scanner result

Used Chrome DevTools MCP 1.12.0 with isolated headless Chrome to authenticate,
inspect the UI, call its authenticated APIs, inspect console output, and export
the SARIF report. The access token was held in the isolated browser and was not
written to a repository file.

- Scan: `53094956-f46c-4789-af43-eb87ff6b21f5`.
- Commit: `c75cc055dd3f454660c2326ded2b95d6e4039e24`.
- Branch: `test/acvis-cwe-22-798-20261113`.
- Started `2026-11-13T15:09:57.9430666Z`, finished
  `2026-11-13T15:10:26.163384Z` (28.22 seconds).
- Status: `Done`, 12 files analyzed, 21 findings, merge gate `blocked`.
- Distribution: CWE-79 = 9, CWE-22 = 5, CWE-89 = 5, CWE-798 = 2.

Both added positive controls were detected:

| Case | Finding ID | Location | API verification status |
| --- | --- | --- | --- |
| CWE-22 | `16ee4b04-3e35-450b-bc98-4438fd246d0e` | `server/acvis-fixtures.js:10` | `0` / Candidate |
| CWE-798 | `bdf2cb15-01e2-44d3-86c8-abc2e7a0da3f` | `server/acvis-fixtures.js:15` | `1` / StaticSecretConfirmed |

[Open the findings for this scan](https://acvis.io.vn/workspace/a4b2095b-e8d3-484c-b7c5-3df5fa4cd7cd/findings?scan=53094956-f46c-4789-af43-eb87ff6b21f5).

This was SAST-only: staging URLs were temporarily cleared because they point to
main, which does not contain the fixtures. After completion, ACVIS settings were
restored and verified: branch `main`, both staging URLs
`https://pokecardc.vercel.app/`, deployment delay 30 seconds, scanAllBranches false.
The fixture branch was pushed; main was not changed.

## Problems observed

1. **Incorrect endpoint mapping.** Both fixtures were assigned guessed endpoint
   `GET /api/acvis-fixtures`, with no parameter name. Actual routes are
   `GET /api/review-document?file=...` and `POST /api/review-access` with JSON
   `password`. The scanner's explanation explicitly admits guessing from the
   filename. DAST cannot be trusted with that mapping.
2. **Confirmed-secret false positive.** Finding
   `bc01a03d-284b-4529-aa57-247ea53779f2` at `server/index.js:43` marks the regular
   expression used to parse the session cookie as a high-entropy hardcoded secret
   (`StaticSecretConfirmed`). That expression is not a credential.
3. **Runtime label disagrees with verification evidence.** The scan overview
   displays `Xác nhận runtime: 2`, while the result set has 19 Candidate findings,
   2 StaticSecretConfirmed findings and zero RuntimeConfirmed findings. The
   exploit-log endpoints for both new positive controls returned HTTP 200 with
   empty arrays. The UI's count is not proof of a successful runtime exploit.
4. **Limited precision and source attribution.** Findings also flag the existing
   mitigated download helper and parameterized database adapter sinks. No SQLi
   finding points to `server/store.js`, where the existing intentional SQLi cases
   are reproduced by passing HTTP tests. This report does not treat each of the
   21 alerts as a proven exploitable defect or infer unreported file coverage.

Raw redacted API observations, parsed results, SARIF and the screenshot remain
locally in ignored `test-results/acvis/`. The committed companion JSON records
the scan summary and selected evidence without credentials.

## Provider attribution

The API returned the label `Qwen2.5-7B (Fine-tuned)`. The local ACVIS source at
`src/be/ACVIS.WebAPI.Main/Controllers/SystemController.cs` returns a literal
`aiProvider = "Qwen2.5-7B (Fine-tuned)"`. That system label is not per-scan inference
telemetry. `HybridAiService` can fall back from the primary custom model to Gemini.
Only runtime evidence tied to the scan can establish which provider served it.

All 21 findings have AST or secret-scanning rule IDs; two explanations also
mention `VerifiedRemediationCache`. The results API and SARIF contain no
per-scan model/provider metadata. Browser console output was empty, and the two
fixture exploit-log arrays were empty. No backend inference log was available
through the inspected browser/API surfaces. Therefore **the actual model is
unverified**; static finding provenance does not prove that no LLM was called
elsewhere in the scan pipeline. The local HybridAiService source also delegates
embedding generation to Gemini, so a single displayed provider label would not
describe every possible AI operation even if generation used the custom model.

## Removal

Remove the two review routes and the import in `server/index.js`, then remove
`server/acvis-fixtures.js` and `test/acvis-fixtures.test.js`; or revert the fixture
commit. Existing SQLi/IDOR experiments and the mitigated download route are
independent of these fixtures.
