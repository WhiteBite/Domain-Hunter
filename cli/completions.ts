export type CompletionShell = 'bash' | 'zsh' | 'fish';

const COMMANDS = ['check', 'prices', 'generate', 'find', 'tlds', 'drops', 'watch', 'completions'];

const GLOBAL_FLAGS = ['--help', '--version', '--format'];

const COMMAND_FLAGS = [
  '--tlds',
  '--prices',
  '--no-cache',
  '--currency',
  '--rate-rub',
  '--rate-eur',
  '--query',
  '--tld',
  '--limit',
  '--budget',
  '--max-checks',
  '--roots',
  '--affixes',
  '--mode',
  '--count',
  '--seed',
  '--theme',
  '--infra',
  '--json',
  '--interval',
  '--rounds',
];

export function isCompletionShell(v: string | undefined): v is CompletionShell {
  return v === 'bash' || v === 'zsh' || v === 'fish';
}

export function completionScript(shell: CompletionShell): string {
  const cmds = COMMANDS.join(' ');
  const flags = [...GLOBAL_FLAGS, ...COMMAND_FLAGS].join(' ');

  if (shell === 'bash') {
    return `# bash completions for domain-hunter — source this file or place in bash_completion.d
_domain_hunter() {
  local cur cmds flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  cmds="${cmds}"
  flags="${flags}"
  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  elif [[ "$COMP_CWORD" -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
  fi
}
complete -F _domain_hunter domain-hunter
`;
  }

  if (shell === 'zsh') {
    return `#compdef domain-hunter
_domain_hunter() {
  local -a cmds flags
  cmds=(${COMMANDS.join(' ')})
  flags=(${[...GLOBAL_FLAGS, ...COMMAND_FLAGS].join(' ')})
  if (( CURRENT == 2 )); then
    compadd -a cmds
  elif [[ "$words[CURRENT]" == -* ]]; then
    compadd -a flags
  fi
}
_domain_hunter "$@"
`;
  }

  const cmdLines = COMMANDS.map(
    (c) =>
      `complete -c domain-hunter -f -n '__fish_use_subcommand' -a '${c}'`,
  ).join('\n');
  const flagLines = [...GLOBAL_FLAGS, ...COMMAND_FLAGS]
    .map(
      (f) =>
        `complete -c domain-hunter -f -n '__fish_seen_subcommand_from ${cmds}' -a '${f}'`,
    )
    .join('\n');
  return `# fish completions for domain-hunter — place in ~/.config/fish/completions/domain-hunter.fish
${cmdLines}
${flagLines}
`;
}
