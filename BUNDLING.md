# Bundling (Optional)

This project is already lightweight and does **not** require bundling because it has zero npm dependencies.

If you still want a single bundled server file, you can use `ncc`:

```bash
npx @vercel/ncc build server.js -o dist
node dist/index.js
```

Notes:
- `yt-dlp` and `ffmpeg` must still be installed on the host.
- `/dist` is ignored by default in `.gitignore`.
