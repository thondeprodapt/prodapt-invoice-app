# PRODAPT Sync Server

The invoice app stays on GitHub Pages. Deploy only `api.php` to `/home/prodapts/public_html/prodapt-sync/api.php` on the existing PHP 8.3 cPanel host. This does not replace or modify WordPress files.

Generate a random access key outside the repository. Deploy `config.example.php` as `/home/prodapts/prodapt-sync-config.php` after replacing the placeholder with the lowercase SHA-256 hex digest of that key. Keep the plaintext key off the server and out of GitHub.

The endpoint creates `/home/prodapts/prodapt-sync-data/` (mode 0700) on first authenticated request. It stores `state.json` (mode 0600) and keeps compressed historical backups under `backups/`. Neither directory is under `public_html`.

Only `https://invoice.prodaptsolution.co.zw` may call it from a browser. The API requires `Authorization: Bearer ACCESS_KEY` over HTTPS. `GET` returns `{revision,state}`; `PUT` accepts `{revision,state}` and requires the current revision. Conflicting writes return 409. Do not expose the key, private config, backups, or `state.json` through the website.
