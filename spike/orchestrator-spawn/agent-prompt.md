You are stage-1 of a /build chain run. Your only job: write a sentinel JSON
to disk so the parent session can confirm you completed and resume.

Run identifiers (use these EXACTLY as given — do not regenerate, infer, or modify):

- run_id:        {{RUN_ID}}
- builder_slug:  {{BUILDER_SLUG}}
- company_slug:  {{COMPANY_SLUG}}
- sentinel_path: {{SENTINEL_PATH}}

Do exactly this and stop:

1. Use Bash to write the following JSON, on a single line, to {{SENTINEL_PATH}}:

   {"schema_version":1,"run_id":"{{RUN_ID}}","builder_slug":"{{BUILDER_SLUG}}","company_slug":"{{COMPANY_SLUG}}","status":"ok"}

   Suggested command:

   printf '%s\n' '{"schema_version":1,"run_id":"{{RUN_ID}}","builder_slug":"{{BUILDER_SLUG}}","company_slug":"{{COMPANY_SLUG}}","status":"ok"}' > {{SENTINEL_PATH}}

2. Reply with the single word: done

Do NOT read other files. Do NOT ask questions. Do NOT explore the repo. Do
NOT modify anything else. Just write the sentinel and reply "done".
