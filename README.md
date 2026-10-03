# ezeep-msoffice-addin

This is a Microsoft Office add-in which integrates [ezeep.js](https://github.com/ezeep/ezeep-js/).

## Development

```bash
npm ci
npm run start:desktop   # sideload into Word desktop with a local dev server
npm test                # automated tests
npm run build           # production build into dist/
```

See [TESTING.md](TESTING.md) for the automated test suite, CI and the manual end-to-end test plan.
