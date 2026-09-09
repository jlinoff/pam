# PAM v2.5.1 Release Notes

A fix for a regression in v2.5.0.

> **If you edit exported vaults by hand, v2.5.0 will refuse to load the
> result.** This release fixes that. Encrypted vaults are unaffected in either
> version.

## Plaintext exports could not be loaded back after editing

Saving with an **empty password** writes unencrypted JSON. This has been true
for years: the file is readable, greppable, and editable with `jq` or any text
editor, and PAM loads it straight back. It is PAM's full-fidelity export.

v2.5.0 added an integrity digest to every saved file — including those. So the
round trip that makes the export useful broke:

1. Save with no password to get plaintext JSON.
2. Edit it.
3. Load it back, and PAM refuses the file:
   *"this file has been modified since it was saved"*.

Which was true, and useless. The user modified it deliberately.

## The fix

**The digest is written only for encrypted saves.** A file saved with no
password carries no `meta.integrity`, so an edited copy loads without
complaint.

There is a principled reason as well as a practical one. An unencrypted file is
outside the trust boundary already — anyone who can read it can rewrite it,
digest included — so asserting integrity over it claims something the format
cannot back.

**Encrypted vaults are unchanged and keep full tamper detection.** Nothing about
the v2.5.0 integrity check is weakened for the files it was written for.

## If you hit this on v2.5.0

Remove the field before loading, and the file will open:

```bash
jq 'del(.meta.integrity)' vault-edited.json > vault-loadable.json
```

Upgrading to v2.5.1 removes the need for that on files saved from v2.5.1
onward. A plaintext file *already saved* by v2.5.0 still carries its digest, so
it needs the workaround above once — or simply re-save it from v2.5.1.

## Also in this release

- **The Save dialogue now warns about it.** It said *"Enter a password to
  encrypt the record contents"* and nothing about what happens if you do not.
  Leaving it blank writes every password in the clear, and the only place that
  was written down was the README — which is not what anyone is reading at the
  moment they press Save. The dialogue now says so in the dialogue.
- **Plaintext export is now documented**, under **Save File → Plaintext
  export** in the README. It has existed for years and was never written down.
  The section includes the warning it needs: the file is protected by nothing,
  so treat it like the passwords themselves and delete it when you are done.
