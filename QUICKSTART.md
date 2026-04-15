# PAM Quick Start

Get up and running in five minutes.

---

## What is PAM?

PAM (Personal Account Manager) is a single-page web app that stores your passwords and other sensitive data in an encrypted file that you control. Everything happens in your browser — no data is ever sent to a server.

---

## Step 1 — Open PAM

Visit [https://jlinoff.github.io/pam/www/](https://jlinoff.github.io/pam/www/) in any modern browser, or run it locally:

```bash
git clone https://github.com/jlinoff/pam
cd pam
make run        # starts a local server on port 8081
# open http://localhost:8081 in your browser
```

---

## Step 2 — Create your first record

1. Click the **☰ menu** (top right) and choose **New Record**.
2. Type a title — for example, `GitHub`.
3. Fill in the fields (website, login, password, note). The default fields are all required — if you don't need one, you can delete it with the trash icon on that field row.
4. Click **Save**.

The record now appears in the accordion list. Click it to expand and see the fields.

---

## Step 3 — Copy a password to the clipboard

Expand a record and click the **clipboard icon** next to the field you want. The value is copied silently — nothing is shown on screen.

To reveal a password in place, click the **eye icon** next to the field.

---

## Step 4 — Save your records to a file

1. Click **☰ menu → Save File**.
2. Enter a strong master password. **This is the only password that protects your data — if you lose it, your records cannot be recovered.**
3. Enter a filename (default: `example.txt`).
4. Click **Save**.

Your browser will download an encrypted file. Store it somewhere safe — cloud storage, a USB drive, wherever you keep important files.

---

## Step 5 — Load your records next time

1. Click **☰ menu → Load File**.
2. Click **Choose File** and select your saved file.
3. Enter your master password.
4. Click **Load**.

Your records reappear exactly as you left them.

---

## Searching

Type anything in the search box at the top. PAM filters records in real time by title (and optionally by field names and values — see Preferences → Search).

---

## Generating a strong password

1. In any password field while editing a record, click the **gear icon** to open the password generator.
2. Choose **Cryptic** (random characters) or **Memorable** (word-based).
3. Adjust the length or word count.
4. Click **Copy** or **Use** to apply it.

You can also open the generator from the **key icon** in the toolbar.

---

## A few things worth knowing

**Your master password is never stored.** PAM only keeps it in memory for the current session (by default). If you reload the page you will need to enter it again when saving or loading.

**The file format is plain JSON, encrypted with AES-256-CBC.** You can inspect or migrate it with standard tools if you ever need to leave PAM.

**Records have flexible fields.** The default fields (website, login, password, note) are just a starting point. You can add any field with any type — text, URL, email, date, password, textarea, or HTML — from the edit dialog.

**Inactive records are hidden by default.** To deactivate a record without deleting it, click the **active/inactive toggle** on the record's title row. Inactive records can be shown again from Preferences → Hide Inactive Records.

---

## Where to go next

- **[Full documentation](./index.html)** — complete reference covering every feature
- **[SECURITY.md](./security.html)** — the security model and known limitations
- **[ARCHITECTURE.md](./architecture.html)** — how the code is structured (for contributors)
- **[HISTORY.md](./history.html)** — the lineage of PAM and its predecessors
