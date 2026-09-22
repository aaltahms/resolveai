#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [[ -x "$runtime/node" ]]; then
    export PATH="$runtime:$PATH"
  else
    print 'Install Node.js 22.13+ and pnpm, then run pnpm install in this folder.'
    read 'reply?Press Return to close.'
    exit 1
  fi
fi
node scripts/start-local.mjs
if [[ $? -ne 0 ]]; then
  read 'reply?Startup failed. Read the error above, then press Return to close.'
fi
