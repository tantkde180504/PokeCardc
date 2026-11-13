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

## Scanner evidence

Pending the hosted scan. A completed job with zero findings must not be treated
as a secure result: these two known vulnerable HTTP paths are the positive controls.
Keep scan ID, commit hash, branch, file coverage, and findings together when
interpreting the outcome. This experiment does not deploy the fixtures to main.

## Provider attribution

The local ACVIS source at
`src/be/ACVIS.WebAPI.Main/Controllers/SystemController.cs` returns a literal
`aiProvider = "Qwen2.5-7B (Fine-tuned)"`. That system label is not per-scan inference
telemetry. `HybridAiService` can fall back from the primary custom model to Gemini.
Only runtime evidence tied to the scan can establish which provider served it.

## Removal

Remove the two review routes and the import in `server/index.js`, then remove
`server/acvis-fixtures.js` and `test/acvis-fixtures.test.js`; or revert the fixture
commit. Existing SQLi/IDOR experiments and the mitigated download route are
independent of these fixtures.
