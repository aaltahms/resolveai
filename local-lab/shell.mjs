export function renderShell(html, section) {
  const items = [
    ['checks', '/', 'Troubleshooting', 'Check this Mac'],
    ['desk', '/desk', 'Incident desk', 'Record an investigation'],
    ['lab', '/lab', 'Repair lab', 'Practice on the sample app'],
    ['guide', '/guide', 'How to use', 'Learn the workflow'],
  ];
  const nav = `<a class="shell-skip" href="#main-content">Skip to content</a><aside class="shell-sidebar"><a class="shell-brand" href="/"><span class="shell-logo" aria-hidden="true">R</span>ResolveAI</a><p class="shell-caption">Your IT workspace</p><nav aria-label="Main navigation">${items.map(([id, url, title, description]) => `<a href="${url}" ${section === id ? 'aria-current="page"' : ''}><strong>${title}</strong><span>${description}</span></a>`).join('')}</nav><p class="shell-local"><span aria-hidden="true">●</span> Local on this Mac</p></aside>`;
  return html
    .replace('</head>', '<link rel="stylesheet" href="/shell.css"></head>')
    .replace('<body>', '<body class="resolve-shell">')
    .replace(/<header[\s\S]*?<\/header>/, nav)
    .replace(
      /<main(?:\s[^>]*)?>/,
      `<main id="main-content" class="shell-main ${section === 'guide' || section === 'lab' ? 'reading-main' : ''}">`,
    );
}
