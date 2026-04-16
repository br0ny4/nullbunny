## Contributing

Thanks for considering contributing to NullBunny.

### Development setup

Requirements:

- Node.js 20+
- pnpm 10+

Install dependencies:

```bash
pnpm install
```

Build and test:

```bash
pnpm build
pnpm typecheck
pnpm test
```

### What to contribute

- New attacks and judges (built-in or via manifest packs)
- Provider support (commercial LLMs and local models like Ollama)
- Better reports (markdown, json, sarif)
- Better GitHub Action ergonomics and CI gating patterns
- Documentation and examples

### Pull requests

- Keep PRs focused and small when possible
- Add or update tests when changing core behavior
- Run `pnpm test` before submitting
